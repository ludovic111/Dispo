import { describe, expect, it, jest } from '@jest/globals';
import { fireEvent, render } from '@testing-library/react-native';

import type { GroupSong } from '@/features/groups/group-model';
import { GroupSongScreen } from '@/features/groups/group-song-screen';

jest.mock('@react-native-async-storage/async-storage', () =>
  jest.requireActual('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
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
let mockUserId = 'leader';
jest.mock('@/features/auth/auth-context', () => ({
  useAuth: () => ({ session: { user: { id: mockUserId } } }),
}));
jest.mock('expo-crypto', () => ({ randomUUID: () => 'unused' }));
jest.mock('react-native-reanimated', () => ({ useReducedMotion: () => true }));
jest.mock('expo-router', () => ({
  router: { back: jest.fn(), push: jest.fn() },
  Stack: {
    Screen: ({ options }: { options: { headerRight: () => React.ReactNode } }) =>
      options.headerRight(),
  },
}));
jest.mock('@/components/ui/screen', () => ({
  Screen: ({ children }: { children: React.ReactNode }) => children,
}));
jest.mock('@/features/groups/group-song-row', () => ({
  SongArtwork: () => null,
  SongListenSheet: () => null,
}));
jest.mock('@/features/messages/message-controls', () => ({ ReceiptChecks: () => null }));
jest.mock('../../modules/dispo-song-analysis', () => ({ analyzeSongPreview: jest.fn() }));
jest.mock('@/features/groups/group-repository', () => ({
  enrichSongCatalogResult: jest.fn(),
  openGroupDocument: jest.fn(),
  searchSongCatalog: jest.fn(),
}));
const mockSave = jest.fn();
const mockMutation = { mutate: mockSave, isPending: false };
jest.mock('@/features/groups/group-queries', () => ({
  useGroup: () => ({
    data: {
      id: 'g',
      name: 'Quartet',
      leaderId: 'leader',
      repertoire: [mockSong('a')],
      members: [{ id: 'leader', name: 'Piano', instruments: ['Piano'], photoUrl: null }],
      events: [],
      documents: [],
      comments: [],
    },
  }),
  useSaveGroupRepertoire: () => mockMutation,
  useSaveEventSetlist: () => mockMutation,
  useDeleteGroupDocument: () => mockMutation,
  useDeleteSongComment: () => mockMutation,
  useSongComment: () => mockMutation,
  useUploadGroupDocument: () => mockMutation,
}));
function mockSong(id: string, isApproved = true): GroupSong {
  return {
    albumTitle: null,
    artist: 'Artiste',
    artworkUrl: null,
    canonicalSongId: null,
    catalogId: null,
    chords: null,
    composer: null,
    durationMilliseconds: null,
    form: null,
    genre: null,
    genres: [],
    id,
    irealDisabled: false,
    irealUrl: null,
    isApproved,
    isrc: null,
    key: null,
    metadataSource: null,
    metadataUpdatedAt: null,
    platformIds: {},
    platformLinks: {},
    previewUrl: null,
    releaseYear: null,
    solos: [],
    suggestedBy: 'member',
    tempoBpm: 120,
    title: id,
    trackUrl: null,
  };
}

describe('song detail tabs', () => {
  it('keeps arrangement, solos and an unsent comment across all four tabs and saves the shared draft', async () => {
    const view = await render(<GroupSongScreen groupId="g" songId="a" sourceEventId={null} />);
    expect(view.getAllByRole('tab').map((tab) => tab.props.accessibilityState.selected)).toEqual([
      true,
      false,
      false,
      false,
    ]);
    await fireEvent.changeText(view.getByDisplayValue('a'), 'Edited title');
    await fireEvent.changeText(view.getByDisplayValue('120'), '132');
    expect(view.getByText('Ouvrir dans iReal Pro')).toBeTruthy();
    await fireEvent.press(view.getByRole('tab', { name: 'Solos' }));
    await fireEvent.press(view.getByText('Ajouter un solo'));
    await fireEvent.press(view.getAllByText('Piano')[0]!);
    await fireEvent.press(view.getByRole('tab', { name: 'Commentaires' }));
    expect(view.queryByText('Enregistrer')).toBeNull();
    expect(view.queryByText('Enregistrer le morceau')).toBeNull();
    await fireEvent.changeText(view.getByPlaceholderText('Intro, fin, consigne…'), 'Unsent note');
    await fireEvent.press(view.getByRole('tab', { name: 'Partitions' }));
    expect(view.queryByText('Enregistrer')).toBeNull();
    expect(view.queryByText('Enregistrer le morceau')).toBeNull();
    expect(view.getByText('Fichier')).toBeTruthy();
    expect(view.getByText('Photo')).toBeTruthy();
    await fireEvent.press(view.getByRole('tab', { name: 'Commentaires' }));
    expect(view.getByDisplayValue('Unsent note')).toBeTruthy();
    await fireEvent.press(view.getByRole('tab', { name: 'Infos' }));
    expect(view.getByDisplayValue('Edited title')).toBeTruthy();
    expect(view.getByDisplayValue('132')).toBeTruthy();
    expect(view.queryByText('Enregistrer le morceau')).toBeNull();
    await fireEvent.press(view.getByText('Enregistrer'));
    expect(mockSave).toHaveBeenCalledWith(
      expect.objectContaining({
        desired: [
          expect.objectContaining({ title: 'Edited title', tempoBpm: 132, solos: ['leader'] }),
        ],
      }),
      expect.any(Object),
    );
  });
  it('keeps read-only access for a member without exposing song save or solo editing', async () => {
    mockUserId = 'member';
    try {
      const view = await render(<GroupSongScreen groupId="g" songId="a" sourceEventId={null} />);
      expect(view.queryByText('Enregistrer le morceau')).toBeNull();
      await fireEvent.press(view.getByRole('tab', { name: 'Solos' }));
      expect(view.getByText('Aucun solo prévu')).toBeTruthy();
      expect(view.queryByText('Ajouter un solo')).toBeNull();
      await fireEvent.press(view.getByRole('tab', { name: 'Commentaires' }));
      expect(view.getByPlaceholderText('Intro, fin, consigne…')).toBeTruthy();
    } finally {
      mockUserId = 'leader';
    }
  });
});
