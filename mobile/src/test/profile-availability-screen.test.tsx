import { afterEach, beforeEach, expect, it, jest } from '@jest/globals';
import { fireEvent, render } from '@testing-library/react-native';

import { type ProfileAvailability } from '@/features/profiles/profile-availability-model';
import { ProfileAvailabilityScreen } from '@/features/profiles/profile-availability-screen';
import { saveProfileAvailability } from '@/features/profiles/profile-edit-repository';
import { useDispoTheme } from '@/theme/theme-context';
import { paletteFor } from '@/theme/tokens';

let mockAvailability: ProfileAvailability;
const mockSetQueryData = jest.fn();
const mockInvalidate = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
jest.mock('@tanstack/react-query', () => ({
  useQuery: () => ({ data: mockAvailability }),
  useQueryClient: () => ({ setQueryData: mockSetQueryData, invalidateQueries: mockInvalidate }),
}));
jest.mock('expo-router', () => ({ Stack: { Screen: () => null }, router: { back: jest.fn() } }));
jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { resolvedLanguage: 'fr' } }),
}));
jest.mock('@/theme/theme-context', () => ({
  useDispoTheme: jest.fn(),
}));
jest.mock('@/features/profiles/profile-queries', () => ({ profileKeys: { all: ['profiles'] } }));
jest.mock('@/features/auth/auth-context', () => ({
  useAuth: () => ({ session: { user: { id: 'owner' } } }),
}));
jest.mock('@/features/profiles/profile-edit-repository', () => ({
  fetchProfileAvailability: jest.fn(),
  saveProfileAvailability: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
}));
jest.mock('@/features/profiles/native-date-part-field', () => ({
  NativeDatePartField: ({ label, value }: { label: string; value: Date }) => {
    const { Text } = jest.requireActual<typeof import('react-native')>('react-native');
    return <Text>{`${label}: ${value.getHours()}:${value.getMinutes()}`}</Text>;
  },
}));

beforeEach(() => {
  jest.useFakeTimers({ now: new Date(2026, 8, 20, 12) });
  jest.clearAllMocks();
  jest
    .mocked(useDispoTheme)
    .mockReturnValue({ dark: false, palette: paletteFor('light') } as ReturnType<
      typeof useDispoTheme
    >);
  mockAvailability = { dates: [], timeSlots: {}, weekly: {} };
});
afterEach(() => {
  jest.useRealTimers();
});

it('adds an unavailable day when tapped, saves it and keeps it after reopening', async () => {
  const screen = await render(<ProfileAvailabilityScreen />);
  await fireEvent.press(screen.getByLabelText(/lundi 21 septembre 2026, Indisponible/));
  expect(screen.getByLabelText(/lundi 21 septembre 2026, Date ponctuelle/)).toBeTruthy();
  await fireEvent.press(screen.getByText('Enregistrer mes disponibilités'));
  expect(saveProfileAvailability).toHaveBeenCalledWith('owner', {
    dates: ['2026-09-21'],
    timeSlots: {},
    weekly: {},
  });
  await screen.unmount();
  mockAvailability = { dates: ['2026-09-21'], timeSlots: {}, weekly: {} };
  const reopened = await render(<ProfileAvailabilityScreen />);
  expect(reopened.getByLabelText(/lundi 21 septembre 2026, Date ponctuelle/)).toBeTruthy();
});

it('consults existing dates and recurring days without removing or overriding their windows', async () => {
  mockAvailability = {
    dates: ['2026-09-21'],
    timeSlots: { '2026-09-21': [{ start: '15:00', end: '18:00' }] },
    weekly: { '1': [{ start: '09:00', end: '12:00' }] },
  };
  const screen = await render(<ProfileAvailabilityScreen />);
  await fireEvent.press(screen.getByLabelText(/lundi 21 septembre 2026, Date ponctuelle/));
  expect(screen.getByText('Début: 15:0')).toBeTruthy();
  await fireEvent.press(screen.getByLabelText(/lundi 28 septembre 2026, Disponibilité récurrente/));
  expect(screen.getByText('09:00–12:00')).toBeTruthy();
  expect(screen.queryByText('Enregistrer les modifications')).toBeNull();
});
