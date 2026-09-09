import { directStreamingDestinations, type StreamingSong } from './song';

export type ArtworkSong = StreamingSong & { artworkUrl: string | null };

/** Apple promotional artwork is displayed only beside its direct store badge. */
export function appleArtworkPromotion(
  song: ArtworkSong,
): { artworkUrl: string; storeUrl: string } | null {
  if (!song.artworkUrl) return null;
  try {
    const artwork = new URL(song.artworkUrl);
    if (
      artwork.protocol !== 'https:' ||
      artwork.username ||
      artwork.password ||
      !/^[a-z0-9-]+\.mzstatic\.com$/i.test(artwork.hostname)
    )
      return null;
    const destination = directStreamingDestinations(song).find(
      (item) => item.platform === 'appleMusic',
    );
    if (!destination) return null;
    const store = new URL(destination.url);
    if (store.username || store.password) return null;
    store.hostname = 'itunes.apple.com';
    store.searchParams.set('app', 'itunes');
    return { artworkUrl: artwork.toString(), storeUrl: store.toString() };
  } catch {
    return null;
  }
}
