import { reorderSongs, type MusicGroup } from './group-model';

/**
 * Mirrors the server RPC while the reorder request is in flight. Keeping this
 * transform pure makes the optimistic state and its rollback easy to reason
 * about and test independently from React Query.
 */
export function applyOptimisticGroupRepertoireOrder(
  groups: readonly MusicGroup[],
  groupId: string,
  songIds: readonly string[],
): MusicGroup[] {
  return groups.map((group) =>
    group.id === groupId
      ? { ...group, repertoire: reorderSongs(group.repertoire, songIds) }
      : group,
  );
}

export function applyOptimisticEventSetlistOrder(
  groups: readonly MusicGroup[],
  eventId: string,
  songIds: readonly string[],
): MusicGroup[] {
  return groups.map((group) => {
    if (!group.events.some((event) => event.id === eventId)) return group;
    return {
      ...group,
      events: group.events.map((event) =>
        event.id === eventId ? { ...event, setlist: reorderSongs(event.setlist, songIds) } : event,
      ),
    };
  });
}
