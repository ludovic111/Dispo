import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { Alert, Linking } from 'react-native';

import { emptyGroupSong } from '@/features/groups/song-catalog-model';
import { SongInfoPanel } from '@/features/groups/song-info-panel';

jest.mock('@/features/groups/group-song-row', () => ({
  SongArtwork: () => null,
  SongStoreBadge: () => null,
  SongListenSheet: () => null,
}));
jest.mock('react-i18next', () => ({
  ...jest.requireActual<typeof import('react-i18next')>('react-i18next'),
  useTranslation: () => ({ t: (key: string) => key }),
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
  ...emptyGroupSong('song', 'owner', true),
  title: 'So What',
  artist: 'Miles Davis',
  genre: 'Jazz',
};
const props = { canEdit: false, patch: jest.fn(), subtitle: 'Test', arrangementSubtitle: 'Test' };
afterEach(() => {
  jest.restoreAllMocks();
});

describe('song info external buttons', () => {
  it('switches from iReal to Songsterr and opens the matching search', async () => {
    const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
    jest.spyOn(Linking, 'canOpenURL').mockResolvedValue(true);
    const screen = await render(<SongInfoPanel {...props} draft={song} />);
    expect(screen.queryByText('Ouvrir dans Songsterr')).toBeNull();
    await fireEvent.press(screen.getByText('Ouvrir dans iReal Pro'));
    await waitFor(() => expect(open).toHaveBeenCalledWith('irealb://search?So%20What'));
    await screen.rerender(
      <SongInfoPanel
        {...props}
        draft={{ ...song, genre: 'Rock', title: 'Back in Black', artist: 'AC/DC' }}
      />,
    );
    expect(screen.queryByText('Ouvrir dans iReal Pro')).toBeNull();
    await fireEvent.press(screen.getByText('Ouvrir dans Songsterr'));
    await waitFor(() =>
      expect(open).toHaveBeenCalledWith(
        'https://www.songsterr.com/?pattern=AC%2FDC%20Back%20in%20Black',
      ),
    );
  });
  it('uses the personal style and shows an error if opening fails', async () => {
    jest.spyOn(Linking, 'openURL').mockRejectedValue(new Error('offline'));
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    const screen = await render(<SongInfoPanel {...props} draft={song} songStyle="Rock" />);
    expect(screen.queryByText('Ouvrir dans iReal Pro')).toBeNull();
    await fireEvent.press(screen.getByText('Ouvrir dans Songsterr'));
    await waitFor(() => expect(alert).toHaveBeenCalledWith('Ce lien n’a pas pu être ouvert.'));
    await screen.rerender(<SongInfoPanel {...props} draft={song} songStyle="Pop" />);
    expect(screen.queryByText('Ouvrir dans Songsterr')).toBeNull();
    expect(screen.queryByText('Ouvrir dans iReal Pro')).toBeNull();
  });
  it('retains the iReal installation fallback', async () => {
    jest.spyOn(Linking, 'canOpenURL').mockResolvedValue(false);
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    const screen = await render(<SongInfoPanel {...props} draft={song} />);
    await fireEvent.press(screen.getByText('Ouvrir dans iReal Pro'));
    await waitFor(() =>
      expect(alert).toHaveBeenCalledWith('iReal Pro', undefined, expect.any(Array)),
    );
  });
});
