import { describe, expect, it } from '@jest/globals';

import { groupSongFromJson, groupSongToJson } from '@/features/groups/group-model';
import { copiedGroupSong } from '@/features/groups/group-song-copy';

const payload = {
  id: '00000000-0000-4000-8000-000000000001',
  title: 'Blue Bossa',
  is_approved: true,
  solos: ['00000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000003'],
};

describe('échanges de quatre mesures', () => {
  it('conserve le mode et l’ordre après un aller-retour serveur', () => {
    const song = groupSongFromJson({ ...payload, solo_mode: 'trading_fours' })!;
    const loaded = groupSongFromJson(groupSongToJson(song))!;
    expect(loaded.soloMode).toBe('trading_fours');
    expect(loaded.solos).toEqual(payload.solos);
  });

  it('garde les anciens morceaux en solos successifs sans ajouter de changement implicite', () => {
    const song = groupSongFromJson(payload)!;
    expect(song.soloMode ?? 'successive').toBe('successive');
    expect(groupSongToJson(song)).not.toHaveProperty('solo_mode');
  });

  it('permet de revenir aux solos successifs sans changer les participants', () => {
    const song = groupSongFromJson({ ...payload, solo_mode: 'trading_fours' })!;
    const loaded = groupSongFromJson(groupSongToJson({ ...song, soloMode: 'successive' }))!;
    expect(loaded.soloMode ?? 'successive').toBe('successive');
    expect(loaded.solos).toEqual(payload.solos);
  });

  it('ne confond pas une signature 4/4 avec des échanges et ne copie pas les solos entre groupes', () => {
    expect(groupSongFromJson({ ...payload, solo_mode: '4/4' })!.soloMode).toBeUndefined();
    const song = groupSongFromJson({ ...payload, solo_mode: 'trading_fours' })!;
    const copy = copiedGroupSong(song, { id: 'copy', approved: true, suggestedBy: 'leader' });
    expect(copy.solos).toEqual([]);
    expect(copy.soloMode ?? 'successive').toBe('successive');
  });
});
