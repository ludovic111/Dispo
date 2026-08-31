import { describe, expect, it, jest } from '@jest/globals';
import { render } from '@testing-library/react-native';
import { View } from 'react-native';

import { ScreenHeader, screenSafeAreaEdges } from '@/components/ui/screen';
import { HeaderAction } from '@/components/ui/section';

jest.mock('@/theme/theme-context', () => ({
  useDispoTheme: () => ({
    palette: {
      border: '#202640',
      card: '#11172b',
      electric: '#00d4ff',
      muted: '#8a8a8a',
      text: '#ffffff',
    },
  }),
}));

describe('ScreenHeader', () => {
  it('keeps header navigation actions at the native 44-point target', async () => {
    const { getByRole } = await render(
      <HeaderAction icon="chevron-back" label="Retour" onPress={jest.fn()} />,
    );

    expect(getByRole('button')).toHaveStyle({ height: 44, width: 44 });
  });

  it('exposes and dims a disabled header action', async () => {
    const { getByRole } = await render(
      <HeaderAction disabled icon="close" label="Fermer" onPress={jest.fn()} />,
    );

    expect(getByRole('button').props.accessibilityState).toEqual({ disabled: true });
    expect(getByRole('button')).toHaveStyle({ opacity: 0.45 });
  });

  it('keeps the leading action first and the trailing action last', async () => {
    const { getByTestId } = await render(
      <ScreenHeader
        action={<View testID="trailing-action" />}
        icon="calendar"
        leadingAction={<View testID="leading-action" />}
        title="Session"
      />,
    );

    const leadingAction = getByTestId('leading-action');
    const trailingAction = getByTestId('trailing-action');
    const header = leadingAction.parent;

    expect(header).toBe(trailingAction.parent);
    expect(header?.children[0]).toBe(leadingAction);
    expect(header?.children[header.children.length - 1]).toBe(trailingAction);
  });

  it('does not add a second top inset below a native Stack header', () => {
    expect(screenSafeAreaEdges({ nativeHeader: true })).toEqual(['bottom']);
    expect(screenSafeAreaEdges()).toEqual(['top', 'bottom']);
  });
});
