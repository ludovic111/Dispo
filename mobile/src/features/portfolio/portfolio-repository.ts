import * as Crypto from 'expo-crypto';
import { File } from 'expo-file-system';

import type { PreparedDemoVideo } from './portfolio-media';
import {
  assertCanAddDemoVideo,
  dayKey,
  DEMO_VIDEO_BUCKET,
  demoThumbnailStoragePath,
  demoVideoStoragePath,
  normalizeDemoTitle,
  parseAvailabilityTrips,
  parseDemoVideos,
  serializeAvailabilityTrips,
  serializeDemoVideos,
  storagePathFromDemoPublicUrl,
  type AvailabilityTrip,
  type DemoVideo,
} from './portfolio-model';

import { getSupabaseClient } from '@/services/supabase/client';
import type { Database } from '@/services/supabase/database.types';

type ProfileRow = Database['public']['Tables']['profiles']['Row'];
type PortfolioProjection = Pick<
  ProfileRow,
  'availability_places' | 'city' | 'country' | 'demo_videos' | 'is_premium' | 'postal_code'
>;

export interface PortfolioState {
  city: string;
  country: string;
  isPremium: boolean;
  postalCode: string;
  trips: AvailabilityTrip[];
  videos: DemoVideo[];
}

export interface UploadedDemoVideo {
  uploadedPaths: string[];
  video: DemoVideo;
}

export async function fetchPortfolio(
  userId: string,
  signal?: AbortSignal,
): Promise<PortfolioState> {
  const query = getSupabaseClient()
    .from('profiles')
    .select('demo_videos,availability_places,is_premium,country,postal_code,city')
    .eq('id', userId);
  const result = await (signal ? query.abortSignal(signal).single() : query.single());
  if (result.error) throw result.error;
  const row = result.data as PortfolioProjection;
  return {
    city: row.city ?? '',
    country: row.country ?? 'CH',
    isPremium: row.is_premium,
    postalCode: row.postal_code ?? '',
    trips: parseAvailabilityTrips(row.availability_places),
    videos: parseDemoVideos(row.demo_videos),
  };
}

async function persistDemoVideos(userId: string, videos: readonly DemoVideo[]): Promise<void> {
  const { data, error } = await getSupabaseClient()
    .from('profiles')
    .update({ demo_videos: serializeDemoVideos(videos) })
    .eq('id', userId)
    .select('id')
    .single();
  if (error) throw error;
  if (!data) throw new Error('profile_not_updated');
}

async function persistAvailabilityTrips(
  userId: string,
  trips: readonly AvailabilityTrip[],
): Promise<void> {
  const { data, error } = await getSupabaseClient()
    .from('profiles')
    .update({ availability_places: serializeAvailabilityTrips(trips) })
    .eq('id', userId)
    .select('id')
    .single();
  if (error) throw error;
  if (!data) throw new Error('profile_not_updated');
}

function ownedStoragePaths(userId: string, paths: readonly (string | null)[]): string[] {
  const prefix = `${userId.toLowerCase()}/`;
  return [...new Set(paths.filter((path): path is string => Boolean(path?.startsWith(prefix))))];
}

export async function deleteDemoMediaFiles(
  userId: string,
  paths: readonly string[],
): Promise<void> {
  const ownedPaths = ownedStoragePaths(userId, paths);
  if (ownedPaths.length === 0) return;
  const { error } = await getSupabaseClient().storage.from(DEMO_VIDEO_BUCKET).remove(ownedPaths);
  if (error) throw error;
}

async function uploadThumbnail(
  userId: string,
  uri: string,
): Promise<{ path: string; url: string }> {
  const thumbnail = new File(uri);
  const path = demoThumbnailStoragePath(userId, Crypto.randomUUID());
  const { error } = await getSupabaseClient()
    .storage.from(DEMO_VIDEO_BUCKET)
    .upload(path, await thumbnail.arrayBuffer(), {
      cacheControl: '86400',
      contentType: 'image/jpeg',
    });
  if (error) throw error;
  const { data } = getSupabaseClient().storage.from(DEMO_VIDEO_BUCKET).getPublicUrl(path);
  return { path, url: data.publicUrl };
}

export async function uploadDemoVideo(
  userId: string,
  prepared: PreparedDemoVideo,
): Promise<UploadedDemoVideo> {
  const source = new File(prepared.uri);
  const path = demoVideoStoragePath(userId, Crypto.randomUUID(), prepared.extension);
  const { error } = await getSupabaseClient()
    .storage.from(DEMO_VIDEO_BUCKET)
    .upload(path, await source.arrayBuffer(), { contentType: prepared.contentType });
  if (error) throw error;

  const uploadedPaths = [path];
  const { data: videoPublicData } = getSupabaseClient()
    .storage.from(DEMO_VIDEO_BUCKET)
    .getPublicUrl(path);
  let thumbUrl: string | null = null;
  if (prepared.thumbnailUri) {
    try {
      const thumbnail = await uploadThumbnail(userId, prepared.thumbnailUri);
      thumbUrl = thumbnail.url;
      uploadedPaths.push(thumbnail.path);
    } catch {
      // La miniature est un confort visuel : comme en Swift, son échec ne
      // doit jamais faire perdre une vidéo valide déjà prête à être publiée.
    }
  }
  return {
    uploadedPaths,
    video: {
      date: dayKey(new Date()),
      id: Crypto.randomUUID(),
      path,
      thumbUrl,
      title: null,
      url: videoPublicData.publicUrl,
    },
  };
}

export async function addDemoVideo(
  userId: string,
  currentVideos: readonly DemoVideo[],
  isPremium: boolean,
  prepared: PreparedDemoVideo,
): Promise<{ video: DemoVideo; videos: DemoVideo[] }> {
  assertCanAddDemoVideo(currentVideos.length, isPremium);
  const uploaded = await uploadDemoVideo(userId, prepared);
  const videos = [...currentVideos, uploaded.video];
  try {
    await persistDemoVideos(userId, videos);
  } catch (error) {
    try {
      await deleteDemoMediaFiles(userId, uploaded.uploadedPaths);
    } catch {
      // L'erreur d'origine (RLS, quota ou réseau) reste la plus utile. Le
      // nettoyage du dossier propriétaire pourra être repris par l'écran.
    }
    throw error;
  }
  return { video: uploaded.video, videos };
}

export async function updateDemoVideoDetails(
  userId: string,
  currentVideos: readonly DemoVideo[],
  videoId: string,
  details: { date: string | null; title: string | null },
): Promise<DemoVideo[]> {
  const videos = currentVideos.map((video) =>
    video.id === videoId
      ? { ...video, date: details.date, title: normalizeDemoTitle(details.title) }
      : video,
  );
  await persistDemoVideos(userId, videos);
  return videos;
}

export async function removeDemoVideo(
  userId: string,
  currentVideos: readonly DemoVideo[],
  video: DemoVideo,
): Promise<DemoVideo[]> {
  const videos = currentVideos.filter((candidate) => candidate.id !== video.id);
  await persistDemoVideos(userId, videos);
  const paths = ownedStoragePaths(userId, [
    video.path,
    storagePathFromDemoPublicUrl(video.thumbUrl),
  ]);
  try {
    await deleteDemoMediaFiles(userId, paths);
  } catch (error) {
    // Une suppression incomplète laisserait un média public orphelin. On
    // restaure donc la ligne JSON pour que l'utilisateur puisse réessayer.
    await persistDemoVideos(userId, currentVideos);
    throw error;
  }
  return videos;
}

export async function saveAvailabilityTrips(
  userId: string,
  trips: readonly AvailabilityTrip[],
): Promise<AvailabilityTrip[]> {
  const sorted = [...trips].sort(
    (a, b) => a.from.localeCompare(b.from) || a.id.localeCompare(b.id),
  );
  await persistAvailabilityTrips(userId, sorted);
  return sorted;
}
