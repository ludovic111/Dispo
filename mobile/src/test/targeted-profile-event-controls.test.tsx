import { describe, expect, it, jest } from '@jest/globals';
import { fireEvent, render } from '@testing-library/react-native';
import { useState } from 'react';

import { groupSongFromJson } from '@/features/groups/group-model';
import { GroupSongRow } from '@/features/groups/group-song-row';
import type { WeeklyAvailability } from '@/features/profiles/profile-availability-model';
import { WeeklyAvailabilityEditor } from '@/features/profiles/weekly-availability-editor';

jest.mock('react-i18next', () => ({
  ...jest.requireActual<typeof import('react-i18next')>('react-i18next'),
  useTranslation: () => ({ t: (key: string) => key, i18n: { resolvedLanguage: 'fr' } }),
}));
jest.mock('@/theme/theme-context', () => ({
  useDispoTheme: () => ({
    dark: true,
    palette: jest
      .requireActual<typeof import('@/theme/tokens')>('@/theme/tokens')
      .paletteFor('dark'),
  }),
}));
jest.mock('react-native-reanimated', () => ({ useReducedMotion: () => true }));
jest.mock('@/features/groups/use-hide-album-covers', () => ({ useHideAlbumCovers: () => true }));
jest.mock('@/features/profiles/native-date-part-field', () => ({
  NativeDatePartField: () => null,
}));

describe('contrôles de disponibilités et solos', () => {
  it('ouvre les solos sans déclencher l’ouverture du morceau et conserve le passage 4-4', async () => {
    const openSong = jest.fn();
    const song = groupSongFromJson({
      id: 'song',
      title: 'Blue Bossa',
      solos: ['4-4'],
      is_approved: true,
    });
    if (!song) throw new Error('Invalid fixture');
    const screen = await render(<GroupSongRow song={song} showSoloButton onPress={openSong} />);
    expect(screen.queryByText('4-4')).toBeNull();
    await fireEvent.press(screen.getByLabelText('Ordre des solos · Blue Bossa'));
    expect(screen.getByText('4-4')).toBeTruthy();
    expect(openSong).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByLabelText('Fermer'));
    expect(screen.queryByText('4-4')).toBeNull();
    await fireEvent.press(screen.getByLabelText('Ouvrir Blue Bossa'));
    expect(openSong).toHaveBeenCalledTimes(1);
  });

  it('permet de choisir un vendredi, ajouter un créneau puis retirer la récurrence', async () => {
    let saved: WeeklyAvailability = {};
    function Editor() {
      const [value, setValue] = useState<WeeklyAvailability>({});
      return (
        <WeeklyAvailabilityEditor
          value={value}
          onChange={(next) => {
            saved = next;
            setValue(next);
          }}
        />
      );
    }
    const screen = await render(<Editor />);
    await fireEvent.press(screen.getByText('vendredi'));
    expect(screen.queryByText('Toute la journée')).toBeNull();
    expect(saved).toEqual({ '5': [{ start: '09:00', end: '12:00' }] });
    await fireEvent.press(screen.getByLabelText('Supprimer ce créneau'));
    expect(saved).toEqual({ '5': [] });
    await fireEvent.press(screen.getAllByText('vendredi')[0]!);
    expect(saved).toEqual({});
  });
});
