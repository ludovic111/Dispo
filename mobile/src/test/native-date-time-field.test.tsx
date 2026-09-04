import { afterEach, expect, it, jest } from '@jest/globals';
import { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { fireEvent, render } from '@testing-library/react-native';
import { Platform } from 'react-native';

import { NativeDateTimeField } from '@/components/ui/native-date-time-field';

jest.mock('@react-native-community/datetimepicker', () => ({
  __esModule: true,
  default: () => null,
  DateTimePickerAndroid: { open: jest.fn() },
}));
jest.mock('@/theme/theme-context', () => ({
  useDispoTheme: () => ({
    dark: false,
    palette: jest
      .requireActual<typeof import('@/theme/tokens')>('@/theme/tokens')
      .paletteFor('light'),
  }),
}));
jest.mock('react-i18next', () => ({ useTranslation: () => ({ i18n: { language: 'fr' } }) }));
const platform = Platform.OS;
afterEach(() => {
  Platform.OS = platform;
  jest.clearAllMocks();
});
it('opens exactly one Android picker only after a tap, preserving the other date part', async () => {
  Platform.OS = 'android';
  const changed = jest.fn();
  const value = new Date(2026, 8, 18, 18, 30);
  const view = await render(
    <NativeDateTimeField dateLabel="Date" timeLabel="Heure" value={value} onChange={changed} />,
  );
  expect(DateTimePickerAndroid.open).not.toHaveBeenCalled();
  await fireEvent.press(view.getByRole('button', { name: /^Date:/ }));
  expect(DateTimePickerAndroid.open).toHaveBeenCalledTimes(1);
  const options = jest.mocked(DateTimePickerAndroid.open).mock.calls[0]?.[0];
  expect(options?.mode).toBe('date');
  options?.onValueChange?.({} as never, new Date(2026, 8, 20, 0, 0));
  expect(changed).toHaveBeenCalledWith(new Date(2026, 8, 20, 18, 30));
});
it('does not open a disabled Android date field', async () => {
  Platform.OS = 'android';
  const view = await render(
    <NativeDateTimeField
      dateLabel="Date"
      timeLabel="Heure"
      disabled
      value={new Date()}
      onChange={jest.fn()}
    />,
  );
  await fireEvent.press(view.getByRole('button', { name: /^Date:/ }));
  expect(DateTimePickerAndroid.open).not.toHaveBeenCalled();
});
