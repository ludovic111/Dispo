import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, render, waitFor } from '@testing-library/react-native';

import { SongArtwork, SongStoreBadge } from '@/features/groups/group-song-row';
import { resetHideAlbumCoversCache } from '@/features/groups/use-hide-album-covers';

const mockPreference = { hidden: false, listeners: new Set<() => void>() };
jest.mock('@/features/settings/settings-storage', () => ({
  hideAlbumCoversKey: 'dispo.settings.hide-album-covers',
  loadBooleanPreference: () => Promise.resolve(mockPreference.hidden),
  subscribeToPreference: (_key: string, listener: () => void) => {
    mockPreference.listeners.add(listener);
    return () => mockPreference.listeners.delete(listener);
  },
}));
jest.mock('expo-image', () => ({ Image: () => null }));
jest.mock('react-native-reanimated', () => ({ useReducedMotion: () => true }));
jest.mock('react-i18next', () => ({
  ...jest.requireActual<typeof import('react-i18next')>('react-i18next'),
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'fr' } }),
}));
jest.mock('@/theme/theme-context', () => ({
  useDispoTheme: () => ({
    dark: true,
    palette: jest
      .requireActual<typeof import('@/theme/tokens')>('@/theme/tokens')
      .paletteFor('dark'),
  }),
}));

const song = {
  artist: 'Miles Davis',
  artworkUrl: 'https://is1-ssl.mzstatic.com/image/thumb/cover.jpg',
  platformIds: {},
  platformLinks: { appleMusic: 'https://music.apple.com/ch/album/so-what/1?i=2' },
  title: 'So What',
  trackUrl: null,
};

describe('hide album covers preference', () => {
  beforeEach(() => {
    mockPreference.hidden = false;
    mockPreference.listeners.clear();
    resetHideAlbumCoversCache();
  });

  it('shows the Apple artwork and the iTunes badge when covers are allowed', async () => {
    const screen = await render(
      <>
        <SongArtwork radius={8} size={46} song={song} />
        <SongStoreBadge song={song} />
      </>,
    );
    await waitFor(() => expect(screen.queryByRole('link')).toBeTruthy());
    expect(screen.queryByTestId('song-artwork-fallback')).toBeNull();
  });

  it('falls back to the themed tile without any store badge when covers are hidden', async () => {
    mockPreference.hidden = true;
    const screen = await render(
      <>
        <SongArtwork radius={8} size={46} song={song} />
        <SongStoreBadge song={song} />
      </>,
    );
    await waitFor(() => expect(screen.queryByTestId('song-artwork-fallback')).toBeTruthy());
    expect(screen.queryByRole('link')).toBeNull();
  });

  it('follows a later change of the setting', async () => {
    const screen = await render(<SongStoreBadge song={song} />);
    await waitFor(() => expect(screen.queryByRole('link')).toBeTruthy());
    mockPreference.hidden = true;
    await act(async () => {
      for (const listener of mockPreference.listeners) listener();
      await Promise.resolve();
    });
    await waitFor(() => expect(screen.queryByRole('link')).toBeNull());
  });
});
