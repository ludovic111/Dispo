import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, fireEvent, render } from '@testing-library/react-native';
import { createRef } from 'react';
import { Alert, type TextInput } from 'react-native';

import {
  removeSongCommentFromGroups,
  resolveSongSuggester,
  threadSongComments,
  updateSongCommentInGroups,
  withOptimisticCommentReaction,
  type GroupMember,
  type GroupSongComment,
  type MusicGroup,
} from '@/features/groups/group-model';
import { SongCommentsPanel } from '@/features/groups/song-comments-panel';
import i18n from '@/i18n';

jest.mock('react-i18next', () => ({
  ...jest.requireActual<typeof import('react-i18next')>('react-i18next'),
  useTranslation: () => ({
    i18n: { language: 'fr', resolvedLanguage: 'fr' },
    t: (key: string, options?: { name?: string }) =>
      options?.name ? key.replace('{{name}}', options.name) : key,
  }),
}));
jest.mock('@/theme/theme-context', () => ({
  useDispoTheme: () => ({
    dark: true,
    palette: jest
      .requireActual<typeof import('@/theme/tokens')>('@/theme/tokens')
      .paletteFor('dark'),
  }),
}));
const mockAdd = jest.fn();
const mockEdit = jest.fn();
const mockDelete = jest.fn();
const mockReact = jest.fn();
jest.mock('@/features/groups/group-queries', () => ({
  useDeleteSongComment: () => ({ isPending: false, mutate: mockDelete }),
  useEditSongComment: () => ({ isPending: false, mutate: mockEdit }),
  useSongComment: () => ({ isPending: false, mutate: mockAdd }),
  useSongCommentReaction: () => ({ isPending: false, mutate: mockReact }),
}));
jest.mock('@/features/groups/group-repository', () => ({
  isValidSongComment: (text: string) => text.trim().length > 0 && text.trim().length <= 1000,
}));

function comment(
  id: string,
  overrides: Partial<GroupSongComment> = {},
  createdAt = `2026-09-13T10:0${id.length}:00.000Z`,
): GroupSongComment {
  return {
    authorId: 'leader',
    authorName: 'Léa',
    authorPhotoUrl: null,
    createdAt,
    editedAt: null,
    groupId: 'g',
    id,
    myReaction: null,
    parentId: null,
    reactions: [],
    songId: 's',
    text: `Texte ${id}`,
    ...overrides,
  };
}

function member(id: string, name: string, photoUrl: string | null = null): GroupMember {
  return {
    id,
    instruments: [],
    isLeader: id === 'leader',
    kind: 'permanent',
    name,
    photoUrl,
    role: null,
  };
}

describe('song comment threads model', () => {
  it('nests replies under their root in arrival order and promotes orphans', () => {
    const root = comment('root', {}, '2026-09-13T10:00:00.000Z');
    const late = comment('late', { parentId: 'root' }, '2026-09-13T10:05:00.000Z');
    const early = comment('early', { parentId: 'root' }, '2026-09-13T10:01:00.000Z');
    const orphan = comment('orphan', { parentId: 'gone' }, '2026-09-13T09:00:00.000Z');
    const threads = threadSongComments([late, orphan, root, early]);
    expect(threads.map((thread) => thread.root.id)).toEqual(['orphan', 'root']);
    expect(threads[1]?.replies.map((reply) => reply.id)).toEqual(['early', 'late']);
  });

  it('toggles my reaction optimistically and replaces a different one', () => {
    const base = comment('c', {
      myReaction: '👍',
      reactions: [{ count: 2, emoji: '👍', reactedByMe: true }],
    });
    const replaced = withOptimisticCommentReaction(base, '❤️');
    expect(replaced.myReaction).toBe('❤️');
    expect(replaced.reactions).toEqual([
      { count: 1, emoji: '👍', reactedByMe: false },
      { count: 1, emoji: '❤️', reactedByMe: true },
    ]);
    const removed = withOptimisticCommentReaction(replaced, '❤️');
    expect(removed.myReaction).toBeNull();
    expect(removed.reactions).toEqual([{ count: 1, emoji: '👍', reactedByMe: false }]);
  });

  it('patches one comment in the group cache and cascades a root deletion to its replies', () => {
    const groups = [
      {
        comments: [comment('root'), comment('reply', { parentId: 'root' }), comment('other')],
        id: 'g',
      },
      { comments: [comment('elsewhere')], id: 'h' },
    ] as unknown as MusicGroup[];
    const edited = updateSongCommentInGroups(groups, 'g', 'root', (item) => ({
      ...item,
      text: 'Modifié',
    }));
    expect(edited[0]?.comments.map((item) => item.text)).toEqual([
      'Modifié',
      'Texte reply',
      'Texte other',
    ]);
    expect(edited[1]).toBe(groups[1]);
    const removed = removeSongCommentFromGroups(groups, 'g', 'root');
    expect(removed[0]?.comments.map((item) => item.id)).toEqual(['other']);
  });

  it('resolves the suggester by id, then by legacy name, then falls back', () => {
    const members = [
      member('leader', 'Léa'),
      member('AAAA1111-0000-4000-8000-000000000002', 'Marco', 'https://x/m.jpg'),
    ];
    expect(resolveSongSuggester('aaaa1111-0000-4000-8000-000000000002', members)).toEqual({
      id: 'AAAA1111-0000-4000-8000-000000000002',
      name: 'Marco',
      photoUrl: 'https://x/m.jpg',
    });
    expect(resolveSongSuggester('  léa ', members)).toEqual({
      id: 'leader',
      name: 'Léa',
      photoUrl: null,
    });
    expect(resolveSongSuggester('Ancien Nom', members)).toEqual({
      id: null,
      name: 'Ancien Nom',
      photoUrl: null,
    });
    expect(resolveSongSuggester('bbbb1111-0000-4000-8000-000000000009', members)).toEqual({
      id: 'bbbb1111-0000-4000-8000-000000000009',
      name: i18n.t('Membre'),
      photoUrl: null,
    });
    expect(resolveSongSuggester('   ', members)).toBeNull();
  });
});

describe('song comments panel', () => {
  beforeEach(() => {
    mockAdd.mockClear();
    mockEdit.mockClear();
    mockDelete.mockClear();
    mockReact.mockClear();
  });

  function renderPanel(isLeader: boolean, userId: string, comments: GroupSongComment[]) {
    return render(
      <SongCommentsPanel
        comments={comments}
        groupId="g"
        inputRef={createRef<TextInput>()}
        isLeader={isLeader}
        songId="s"
        userId={userId}
      />,
    );
  }

  it('lets the leader open a discussion from the composer', async () => {
    const view = await renderPanel(true, 'leader', []);
    expect(view.getByText('Aucun commentaire pour l’instant.')).toBeTruthy();
    await fireEvent.changeText(view.getByPlaceholderText('Intro, fin, consigne…'), ' Intro ');
    await fireEvent.press(view.getByText('Envoyer'));
    expect(mockAdd).toHaveBeenCalledWith(
      { groupId: 'g', parentId: null, songId: 's', text: ' Intro ' },
      expect.any(Object),
    );
  });

  it('hides the composer for a member until a reply target is chosen, then replies to the root', async () => {
    const root = comment('root');
    const reply = comment('reply', { authorId: 'marco', authorName: 'Marco', parentId: 'root' });
    const view = await renderPanel(false, 'member', [root, reply]);
    expect(view.queryByPlaceholderText('Intro, fin, consigne…')).toBeNull();
    expect(
      view.getByText('Seul le leader peut ouvrir une discussion. Tu peux répondre et réagir.'),
    ).toBeTruthy();
    await fireEvent.press(view.getByRole('button', { name: 'Options du commentaire · Marco' }));
    expect(view.queryByText('Modifier')).toBeNull();
    expect(view.queryByText('Supprimer')).toBeNull();
    await fireEvent.press(view.getByText('Répondre'));
    expect(view.getByText('Réponse à Marco')).toBeTruthy();
    await fireEvent.changeText(view.getByPlaceholderText('Intro, fin, consigne…'), 'Oui');
    await fireEvent.press(view.getByText('Envoyer'));
    expect(mockAdd).toHaveBeenCalledWith(
      { groupId: 'g', parentId: 'root', songId: 's', text: 'Oui' },
      expect.any(Object),
    );
    await fireEvent.press(view.getByRole('button', { name: 'Annuler' }));
    expect(view.queryByPlaceholderText('Intro, fin, consigne…')).toBeNull();
  });

  it('toggles a reaction from the chip and the picker', async () => {
    const root = comment('root', {
      myReaction: '👍',
      reactions: [{ count: 3, emoji: '👍', reactedByMe: true }],
    });
    const view = await renderPanel(false, 'member', [root]);
    await fireEvent.press(view.getByRole('button', { name: '👍, 3' }));
    expect(mockReact).toHaveBeenCalledWith({ comment: root, emoji: '👍' }, expect.any(Object));
    await fireEvent.press(view.getByRole('button', { name: 'Options du commentaire · Léa' }));
    await fireEvent.press(view.getByText('Réagir'));
    await fireEvent.press(view.getByRole('button', { name: 'Réagir ❤️' }));
    expect(mockReact).toHaveBeenLastCalledWith({ comment: root, emoji: '❤️' }, expect.any(Object));
  });

  it('edits my own comment through the composer and lets the leader delete after confirmation', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    const mine = comment('mine', { authorId: 'leader', editedAt: '2026-09-13T11:00:00.000Z' });
    const view = await renderPanel(true, 'leader', [mine]);
    expect(view.getByText(/· modifié/)).toBeTruthy();
    await fireEvent.press(view.getByRole('button', { name: 'Options du commentaire · Léa' }));
    await fireEvent.press(view.getByText('Modifier'));
    expect(view.getByDisplayValue('Texte mine')).toBeTruthy();
    await fireEvent.changeText(view.getByDisplayValue('Texte mine'), 'Texte corrigé');
    await fireEvent.press(view.getByText('Enregistrer'));
    expect(mockEdit).toHaveBeenCalledWith(
      { comment: mine, text: 'Texte corrigé' },
      expect.any(Object),
    );
    await fireEvent.press(view.getByRole('button', { name: 'Options du commentaire · Léa' }));
    await fireEvent.press(view.getByText('Supprimer'));
    expect(alertSpy).toHaveBeenCalledWith(
      'Supprimer ce commentaire ?',
      'Cette action est définitive.',
      expect.any(Array),
    );
    const buttons = alertSpy.mock.calls[0]?.[2] as { onPress?: () => void }[];
    await act(async () => {
      buttons[1]?.onPress?.();
    });
    expect(mockDelete).toHaveBeenCalledWith(mine, expect.any(Object));
    alertSpy.mockRestore();
  });
});
