import { describe, expect, it, jest } from '@jest/globals';
import { fireEvent, render } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

import { Avatar, avatarDuotone } from '@/components/ui/avatar';
import { CountBadge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { ChoiceChip } from '@/components/ui/choice-chip';
import { DateTicket } from '@/components/ui/date-ticket';
import { DispoButton, IconButton } from '@/components/ui/pressable';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { VuMeter } from '@/components/ui/vu-meter';
import { keyEdgeWidth, paletteFor } from '@/theme/tokens';

const palette = paletteFor('dark');

jest.mock('@/theme/theme-context', () => ({
  useDispoTheme: () => ({
    dark: true,
    palette: jest
      .requireActual<typeof import('@/theme/tokens')>('@/theme/tokens')
      .paletteFor('dark'),
    preference: 'dark',
    themeId: 'jazz',
  }),
}));

describe('Backstage primitives', () => {
  it('renders the primary button as a key with a darker bottom edge and readable ink', async () => {
    const { getByRole, getByText } = await render(
      <DispoButton onPress={jest.fn()}>Continuer</DispoButton>,
    );
    expect(getByRole('button')).toHaveStyle({
      backgroundColor: palette.accent,
      borderBottomColor: palette.accentDeep,
      borderBottomWidth: keyEdgeWidth,
    });
    expect(getByText('Continuer')).toHaveStyle({ color: palette.accentInk });
  });

  it('keeps the secondary and signal buttons raised and the ghost button flat', async () => {
    const secondary = await render(
      <DispoButton onPress={jest.fn()} variant="secondary">
        Plus tard
      </DispoButton>,
    );
    expect(secondary.getByRole('button')).toHaveStyle({
      backgroundColor: palette.cardElevated,
      borderBottomWidth: keyEdgeWidth,
    });
    const ghost = await render(
      <DispoButton onPress={jest.fn()} variant="ghost">
        Lien
      </DispoButton>,
    );
    expect(ghost.getByRole('button').props.style.borderBottomWidth).toBeUndefined();
    const signal = await render(
      <DispoButton onPress={jest.fn()} variant="signal">
        SOS
      </DispoButton>,
    );
    expect(signal.getByRole('button')).toHaveStyle({ backgroundColor: palette.signal });
  });

  it('keeps the icon button at the native target and colours the accent variant with the accent ink', async () => {
    const { getByRole } = await render(
      <IconButton
        accessibilityLabel="Envoyer"
        icon="arrow-up"
        onPress={jest.fn()}
        variant="accent"
      />,
    );
    expect(getByRole('button')).toHaveStyle({
      height: 44,
      width: 44,
      backgroundColor: palette.accent,
    });
  });

  it('fills a selected chip with the accent and insets an unselected one', async () => {
    const { getByRole, rerender } = await render(
      <ChoiceChip label="Jazz" onPress={jest.fn()} selected />,
    );
    expect(getByRole('button')).toHaveStyle({ backgroundColor: palette.accent });
    await rerender(<ChoiceChip label="Jazz" onPress={jest.fn()} selected={false} />);
    expect(getByRole('button')).toHaveStyle({ backgroundColor: palette.inset });
  });

  it('slides the segmented key under the chosen option and keeps tabs accessible', async () => {
    const onChange = jest.fn();
    const { getAllByRole } = await render(
      <SegmentedControl
        onChange={onChange}
        options={[
          { label: 'SOS', value: 'feed' },
          { label: 'Mes SOS', value: 'mine' },
        ]}
        value="feed"
      />,
    );
    const tabs = getAllByRole('tab');
    expect(tabs).toHaveLength(2);
    expect(tabs[0]?.props.accessibilityState).toEqual({ selected: true });
    fireEvent.press(tabs[1]!);
    expect(onChange).toHaveBeenCalledWith('mine');
  });

  it('lights VU-meter segments up to the value and exposes a progressbar', async () => {
    const { getByRole } = await render(
      <VuMeter accessibilityLabel="Compatibilité" segments={10} value={0.5} />,
    );
    const rail = getByRole('progressbar');
    expect(rail.props.accessibilityValue).toEqual({ max: 100, min: 0, now: 50 });
    const lit = rail.children.filter(
      (child) =>
        typeof child !== 'string' &&
        [palette.jam, palette.warning, palette.signal].includes(
          String(StyleSheet.flatten(child.props.style).backgroundColor),
        ),
    );
    expect(lit).toHaveLength(5);
  });

  it('derives avatar duotones from the theme accent and renders initials', async () => {
    const duotone = avatarDuotone(palette, 'Marco Silva');
    expect([palette.accent, palette.accentDeep, palette.jazzDeep]).toContain(duotone[0]);
    const { getByText } = await render(<Avatar name="Marco Silva" size={40} />);
    expect(getByText('MS')).toBeTruthy();
  });

  it('picks a readable ink for the date ticket from the palette, never a fixed navy', async () => {
    const { getByText } = await render(
      <DateTicket color={palette.concert} date="2026-09-13T20:00:00Z" />,
    );
    expect([palette.ink, palette.paper, '#FFFFFF']).toContain(
      getByText('13').props.style.at(-2).color,
    );
  });

  it('keeps the card surface tones and the accent badge ink', async () => {
    const { getByTestId } = await render(<Card testID="card" tone="inset" />);
    expect(getByTestId('card')).toHaveStyle({ backgroundColor: palette.inset });
    const { getByLabelText } = await render(<CountBadge count={3} />);
    expect(getByLabelText('3')).toHaveStyle({ backgroundColor: palette.accent });
  });
});
