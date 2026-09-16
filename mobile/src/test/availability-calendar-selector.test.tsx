import { describe, expect, it, jest } from '@jest/globals';
import { fireEvent, render } from '@testing-library/react-native';
import { useState } from 'react';

import { OptionSelector } from '@/components/ui/option-selector';
import {
  AvailabilityCalendar,
  availabilityForDay,
  calendarMonthDays,
} from '@/features/profiles/availability-calendar';
import type { ProfileAvailability } from '@/features/profiles/profile-availability-model';
import { useDispoTheme } from '@/theme/theme-context';
import { paletteFor } from '@/theme/tokens';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { resolvedLanguage: 'fr' } }),
}));
jest.mock('@/theme/theme-context', () => ({ useDispoTheme: jest.fn() }));
const theme = jest.mocked(useDispoTheme);
const availability: ProfileAvailability = {
  dates: ['2026-09-18'],
  timeSlots: { '2026-09-18': [{ start: '15:00', end: '18:00' }] },
  weekly: { '5': [{ start: '09:00', end: '12:00' }] },
};

describe('availability month calendar', () => {
  it('pads Monday-first weeks and handles leap years', () => {
    const days = calendarMonthDays(new Date(2024, 1, 1));
    expect(days.slice(0, 4)).toEqual([null, null, null, '2024-02-01']);
    expect(days.filter(Boolean)).toHaveLength(29);
    expect(days.length % 7).toBe(0);
  });
  it('keeps explicit slots ahead of recurring slots and preserves all-day availability', () => {
    expect(availabilityForDay(availability, '2026-09-18')).toEqual({
      kind: 'explicit',
      slots: [{ start: '15:00', end: '18:00' }],
    });
    expect(availabilityForDay(availability, '2026-09-25').kind).toBe('weekly');
    expect(availabilityForDay({ ...availability, weekly: { '5': [] } }, '2026-09-25')).toEqual({
      kind: 'weekly',
      slots: [],
    });
    expect(availabilityForDay(availability, '2026-09-19').kind).toBe('none');
  });
  it.each(['light', 'dark'] as const)(
    'selects accessible dates and navigates months in %s',
    async (mode) => {
      theme.mockReturnValue({ palette: paletteFor(mode) } as ReturnType<typeof useDispoTheme>);
      const onSelect = jest.fn();
      const screen = await render(
        <AvailabilityCalendar
          availability={availability}
          selectedDay="2026-09-18"
          onSelect={onSelect}
        />,
      );
      expect(
        screen.getByLabelText(/vendredi 18 septembre 2026, Date ponctuelle/).props
          .accessibilityState.selected,
      ).toBe(true);
      await fireEvent.press(
        screen.getByLabelText(/vendredi 25 septembre 2026, Disponibilité récurrente/),
      );
      expect(onSelect).toHaveBeenCalledWith('2026-09-25');
      await fireEvent.press(screen.getByLabelText('Mois suivant'));
      expect(screen.getByText('octobre 2026')).toBeTruthy();
      await fireEvent.press(screen.getByLabelText('Mois précédent'));
      expect(screen.getByText('septembre 2026')).toBeTruthy();
    },
  );
});

it('searches localized options while preserving stored values, clears and closes', async () => {
  theme.mockReturnValue({ palette: paletteFor('dark') } as ReturnType<typeof useDispoTheme>);
  let saved: string[] = [];
  function Selector() {
    const [value, setValue] = useState<string[]>([]);
    return (
      <OptionSelector
        label="Styles"
        sections={[
          {
            label: 'Musique',
            options: [
              { value: 'Electronic', label: 'Électronique' },
              { value: 'Jazz', label: 'Jazz' },
            ],
          },
        ]}
        value={value}
        onChange={(next) => {
          saved = next;
          setValue(next);
        }}
      />
    );
  }
  const screen = await render(<Selector />);
  await fireEvent.press(screen.getByLabelText('Styles: Choisir'));
  await fireEvent.changeText(screen.getByLabelText('Rechercher'), 'electro');
  expect(screen.queryByRole('checkbox', { name: 'Jazz' })).toBeNull();
  await fireEvent.press(screen.getByRole('checkbox', { name: 'Électronique' }));
  expect(saved).toEqual(['Electronic']);
  expect(
    screen.getByRole('checkbox', { name: 'Électronique' }).props.accessibilityState.checked,
  ).toBe(true);
  await fireEvent.press(screen.getByText('Terminé'));
  expect(screen.queryByRole('checkbox')).toBeNull();
  await fireEvent.press(screen.getByLabelText('Styles: Électronique'));
  expect(screen.getByRole('checkbox', { name: 'Jazz' })).toBeTruthy();
  await fireEvent.press(screen.getByText('Tout effacer'));
  expect(saved).toEqual([]);
});
