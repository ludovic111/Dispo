import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { useState } from 'react';
import { Alert } from 'react-native';

import type { GroupSong } from '@/features/groups/group-model';
import { SongReorderList } from '@/features/groups/song-reorder-list';

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
jest.mock('@/features/groups/group-song-row', () => ({
  GroupSongRow: ({ song }: { song: GroupSong }) => {
    const { Text } = jest.requireActual<typeof import('react-native')>('react-native');
    return <Text>{song.title}</Text>;
  },
}));
let mockDragEnd: (input: { data: GroupSong[]; from: number; to: number }) => void;
jest.mock('react-native-draggable-flatlist', () => ({
  __esModule: true,
  default: (props: {
    data: GroupSong[];
    renderItem: (item: unknown) => React.ReactNode;
    onDragEnd: typeof mockDragEnd;
  }) => {
    mockDragEnd = props.onDragEnd;
    const { View } = jest.requireActual<typeof import('react-native')>('react-native');
    return (
      <View testID="order">
        {props.data.map((item) => (
          <View key={item.id}>{props.renderItem({ item, drag: jest.fn(), isActive: false })}</View>
        ))}
      </View>
    );
  },
  ScaleDecorator: ({ children }: { children: React.ReactNode }) => children,
}));

function song(id: string, isApproved = true): GroupSong {
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
    tempoBpm: null,
    title: id,
    trackUrl: null,
  };
}

describe('song reorder interactions', () => {
  beforeEach(() => {
    jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  });
  it('moves repeatedly without menus, persists the exact order and reopens with it', async () => {
    let persisted = [song('a'), song('b'), song('c')];
    const save = jest.fn<(ids: string[]) => Promise<void>>();
    function Harness() {
      const [songs, setSongs] = useState(persisted);
      return (
        <SongReorderList
          songs={songs}
          title="Setlist"
          onDone={jest.fn()}
          onSave={async (ids) => {
            await save(ids);
            persisted = ids.map((id) => songs.find((item) => item.id === id)!);
            setSongs(persisted);
          }}
        />
      );
    }
    save.mockResolvedValue(undefined);
    const view = await render(<Harness />);
    await fireEvent.press(view.getByRole('button', { name: 'Descendre · a' }));
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(view.getByRole('button', { name: 'Descendre · a' })).toBeEnabled());
    await fireEvent.press(view.getByRole('button', { name: 'Descendre · a' }));
    await waitFor(() => expect(persisted.map((s) => s.id)).toEqual(['b', 'c', 'a']));
    expect(save).toHaveBeenNthCalledWith(2, ['b', 'c', 'a']);
    await view.unmount();
    const reopened = await render(<Harness />);
    expect(reopened.getByRole('button', { name: 'Descendre · a' })).toBeDisabled();
    expect(reopened.getByRole('button', { name: 'Monter · b' })).toBeDisabled();
    expect(Alert.alert).not.toHaveBeenCalled();
  });
  it('blocks repeated inputs while saving and rolls back a failed move', async () => {
    let reject!: (e: Error) => void;
    const save = jest.fn<(ids: string[]) => Promise<void>>(
      () =>
        new Promise((_resolve, fail) => {
          reject = fail;
        }),
    );
    const view = await render(
      <SongReorderList
        songs={[song('a'), song('b')]}
        title="Setlist"
        onDone={jest.fn()}
        onSave={save}
      />,
    );
    await fireEvent.press(view.getByRole('button', { name: 'Descendre · a' }));
    expect(view.getByRole('button', { name: 'Terminé' })).toBeDisabled();
    await fireEvent.press(view.getByRole('button', { name: 'Monter · a' }));
    expect(save).toHaveBeenCalledTimes(1);
    await act(async () => reject(new Error('offline')));
    expect(Alert.alert).toHaveBeenCalledWith('L’ordre n’a pas pu être enregistré.');
    expect(view.getByRole('button', { name: 'Monter · a' })).toBeDisabled();
    expect(view.getByRole('button', { name: 'Descendre · a' })).toBeEnabled();
    expect(view.getByRole('button', { name: 'Terminé' })).toBeEnabled();
  });
  it('rejects a stale drag after a concurrent list membership change', async () => {
    const save = jest.fn<(ids: string[]) => Promise<void>>();
    const view = await render(
      <SongReorderList
        songs={[song('a'), song('b')]}
        title="Setlist"
        onDone={jest.fn()}
        onSave={save}
      />,
    );
    await view.rerender(
      <SongReorderList
        songs={[song('a'), song('c')]}
        title="Setlist"
        onDone={jest.fn()}
        onSave={save}
      />,
    );
    await act(async () => mockDragEnd({ data: [song('b'), song('a')], from: 0, to: 1 }));
    expect(save).not.toHaveBeenCalled();
    expect(Alert.alert).toHaveBeenCalled();
  });
  it('accepts a distant drop in a long list and ignores a cancelled drag', async () => {
    const songs = Array.from({ length: 50 }, (_, i) => song(String(i)));
    const save = jest.fn<(ids: string[]) => Promise<void>>().mockResolvedValue(undefined);
    await render(
      <SongReorderList songs={songs} title="Setlist" onDone={jest.fn()} onSave={save} />,
    );
    await act(async () => mockDragEnd({ data: songs, from: 0, to: 0 }));
    expect(save).not.toHaveBeenCalled();
    const next = [...songs.slice(1), songs[0]!];
    await act(async () => mockDragEnd({ data: next, from: 0, to: 49 }));
    expect(save).toHaveBeenCalledWith(next.map((s) => s.id));
  });
});
