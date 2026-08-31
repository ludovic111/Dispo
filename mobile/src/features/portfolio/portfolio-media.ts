import { File } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import type { ImagePickerAsset } from 'expo-image-picker';
import { createVideoPlayer, type VideoPlayer } from 'expo-video';

import {
  transcodePortfolioVideo,
  type VideoTranscodeOptions,
} from '../../../modules/dispo-video-transcoder';

import {
  assertDemoVideoSelection,
  assertDemoVideoSource,
  DEMO_THUMBNAIL_MAX_BYTES,
  PortfolioValidationError,
} from './portfolio-model';

export interface PreparedDemoVideo {
  contentType: 'video/mp4';
  durationMs: number;
  extension: 'mp4';
  fileSize: number;
  thumbnailUri: string | null;
  uri: string;
}

type SourceVideoContentType = 'video/mp4' | 'video/quicktime';

function waitForVideoReady(player: VideoPlayer): Promise<void> {
  if (player.status === 'readyToPlay') return Promise.resolve();
  if (player.status === 'error') return Promise.reject(new Error('video_analysis_failed'));
  return new Promise((resolve, reject) => {
    let settled = false;
    let subscription: ReturnType<VideoPlayer['addListener']> | null = null;
    let timeout: ReturnType<typeof setTimeout> | null = null;
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      if (timeout) clearTimeout(timeout);
      subscription?.remove();
      if (error) reject(error);
      else resolve();
    };
    subscription = player.addListener('statusChange', ({ error, status }) => {
      if (status === 'readyToPlay') finish();
      else if (status === 'error') finish(new Error(error?.message ?? 'video_analysis_failed'));
    });
    timeout = setTimeout(() => finish(new Error('video_analysis_timeout')), 20_000);
    if (player.status === 'readyToPlay') finish();
  });
}

async function saveThumbnail(player: VideoPlayer): Promise<string | null> {
  let thumbnail: Awaited<ReturnType<VideoPlayer['generateThumbnailsAsync']>>[number] | undefined;
  try {
    [thumbnail] = await player.generateThumbnailsAsync(1, { maxHeight: 480, maxWidth: 480 });
    if (!thumbnail) return null;
    const context = ImageManipulator.manipulate(thumbnail);
    try {
      const image = await context.renderAsync();
      try {
        const saved = await image.saveAsync({ compress: 0.72, format: SaveFormat.JPEG });
        const file = new File(saved.uri);
        if (!file.exists || file.size <= 0 || file.size > DEMO_THUMBNAIL_MAX_BYTES) {
          if (file.exists) file.delete();
          return null;
        }
        return saved.uri;
      } finally {
        image.release();
      }
    } finally {
      context.release();
    }
  } catch {
    return null;
  } finally {
    thumbnail?.release();
  }
}

function resolvedContentType(asset: ImagePickerAsset, file: File): SourceVideoContentType {
  const candidate = (asset.mimeType || file.type || '').toLocaleLowerCase('en');
  if (candidate === 'video/quicktime') return 'video/quicktime';
  if (candidate === 'video/mp4') return 'video/mp4';
  const lowerUri = asset.uri.toLocaleLowerCase('en').split('?')[0] ?? '';
  if (lowerUri.endsWith('.mov')) return 'video/quicktime';
  if (lowerUri.endsWith('.mp4')) return 'video/mp4';
  throw new PortfolioValidationError('demo_video_unsupported_type');
}

export async function prepareDemoVideo(
  asset: ImagePickerAsset,
  options: VideoTranscodeOptions = {},
): Promise<PreparedDemoVideo> {
  const file = new File(asset.uri);
  if (!file.exists) throw new PortfolioValidationError('demo_video_invalid_file');
  const contentType = resolvedContentType(asset, file);
  const player = createVideoPlayer({ uri: asset.uri });
  let thumbnailUri: string | null = null;
  let durationMs = asset.duration ?? 0;
  try {
    try {
      await waitForVideoReady(player);
      if (durationMs <= 0 && Number.isFinite(player.duration)) {
        durationMs = Math.round(player.duration * 1000);
      }
      thumbnailUri = await saveThumbnail(player);
    } catch (error) {
      if (durationMs <= 0) throw error;
    }
  } finally {
    player.release();
  }
  let transcodedUri: string | null = null;
  try {
    assertDemoVideoSource({ durationMs, mimeType: contentType });
    const transcoded = await transcodePortfolioVideo(asset.uri, options);
    transcodedUri = transcoded.uri;
    const output = new File(transcoded.uri);
    if (!output.exists || output.size !== transcoded.fileSize) {
      throw new PortfolioValidationError('demo_video_invalid_file');
    }
    assertDemoVideoSelection({
      durationMs: transcoded.durationMs,
      fileSize: transcoded.fileSize,
      mimeType: transcoded.mimeType,
    });
    return {
      contentType: 'video/mp4',
      durationMs: transcoded.durationMs,
      extension: 'mp4',
      fileSize: transcoded.fileSize,
      thumbnailUri,
      uri: transcoded.uri,
    };
  } catch (error) {
    removeTemporaryFile(transcodedUri);
    removeTemporaryFile(thumbnailUri);
    throw error;
  }
}

function removeTemporaryFile(uri: string | null): void {
  if (!uri) return;
  try {
    const file = new File(uri);
    if (file.exists) file.delete();
  } catch {
    // Le cache temporaire sera purgé par le système ; cela ne doit pas
    // transformer un envoi déjà réussi en erreur visible.
  }
}

export function removePreparedDemoMedia(prepared: PreparedDemoVideo | null): void {
  if (!prepared) return;
  removeTemporaryFile(prepared.thumbnailUri);
  removeTemporaryFile(prepared.uri);
}
