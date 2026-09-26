import { describe, expect, it, jest } from '@jest/globals';
import { render } from '@testing-library/react-native';

import { emptyGroupSong } from '@/features/groups/song-catalog-model';
import { RepertoireSongScreen } from '@/features/repertoire/repertoire-song-screen';

jest.mock('react-i18next', () => ({
  ...jest.requireActual<typeof import('react-i18next')>('react-i18next'),
  useTranslation: () => ({ t: (key: string) => key }),
}));
jest.mock('@tanstack/react-query', () => ({
  useMutation: () => ({ mutate: jest.fn(), isPending: false }),
  useQueryClient: () => ({ invalidateQueries: jest.fn() }),
}));
jest.mock('expo-router', () => ({ router: {}, Stack: { Screen: () => null } }));
jest.mock('@/components/ui/screen', () => ({
  Screen: ({ children }: { children: React.ReactNode }) => children,
}));
jest.mock('@/theme/theme-context', () => ({
  useDispoTheme: () => ({
    dark: true,
    palette: jest
      .requireActual<typeof import('@/theme/tokens')>('@/theme/tokens')
      .paletteFor('dark'),
  }),
}));
jest.mock('@/features/auth/auth-context', () => ({
  useAuth: () => ({ session: { user: { id: 'owner' } } }),
}));
jest.mock('@/features/settings/settings-storage', () => ({
  useBooleanPreference: () => [false],
}));
jest.mock('@/features/groups/group-song-row', () => ({
  SongArtwork: () => null,
  SongStoreBadge: () => null,
  SongListenSheet: () => null,
}));
jest.mock('@/features/repertoire/repertoire-repository', () => ({
  savePersonalArrangement: jest.fn(),
}));
jest.mock('@/features/repertoire/repertoire-queries', () => ({
  usePersonalRepertoire: () => ({ data: { songs: [mockItem], isPublic: true } }),
  usePersonalRepertoireActions: () => ({ update: { mutate: jest.fn(), isPending: false } }),
}));
const mockItem = {
  id: 'song',
  song: {
    ...emptyGroupSong('song', 'owner', true),
    title: 'Back in Black',
    genre: null,
    genres: ['Music', 'Rock'],
  },
  style: '',
  mastery: 1,
  origin: 'group',
};

describe('personal repertoire sheet music', () => {
  it('uses legacy genre metadata when there is no personal style, then honors an explicit style', async () => {
    const screen = await render(<RepertoireSongScreen profileId="owner" songId="song" />);
    expect(screen.getByText('Ouvrir dans Songsterr')).toBeTruthy();
    expect(screen.queryByText('Ouvrir dans iReal Pro')).toBeNull();
    mockItem.style = 'Jazz';
    await screen.rerender(<RepertoireSongScreen profileId="owner" songId="song" />);
    expect(screen.getByText('Ouvrir dans iReal Pro')).toBeTruthy();
    expect(screen.queryByText('Ouvrir dans Songsterr')).toBeNull();
  });
});
