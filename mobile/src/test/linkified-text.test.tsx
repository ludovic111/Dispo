import { describe, expect, it, jest } from '@jest/globals';
import { fireEvent, render } from '@testing-library/react-native';
import { Linking } from 'react-native';

import { LinkifiedText } from '@/components/ui/linkified-text';

jest.mock('@/theme/theme-context', () => ({
  useDispoTheme: () => ({ palette: { text: '#ffffff', electric: '#00d2ff' } }),
}));

describe('liens interactifs dans un message', () => {
  it('ouvre le lien HTTPS sans déclencher la réponse à la bulle', async () => {
    const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
    const reply = jest.fn();
    const stopPropagation = jest.fn();
    const { getByRole } = await render(
      <LinkifiedText onPress={reply}>{'Écoute youtu.be/abc?t=30.'}</LinkifiedText>,
    );
    await fireEvent.press(getByRole('link'), { stopPropagation });
    expect(open).toHaveBeenCalledWith('https://youtu.be/abc?t=30');
    expect(stopPropagation).toHaveBeenCalledTimes(1);
    expect(reply).not.toHaveBeenCalled();
    open.mockRestore();
  });

  it('garde le contraste des bulles envoyées et l’appui long existant', async () => {
    const longPress = jest.fn();
    const { getByRole } = await render(
      <LinkifiedText linkColor="#050814" onLongPress={longPress}>
        {'https://youtube.com/watch?v=abc'}
      </LinkifiedText>,
    );
    const link = getByRole('link');
    expect(link).toHaveStyle({ color: '#050814', textDecorationLine: 'underline' });
    await fireEvent(link, 'longPress', {});
    expect(longPress).toHaveBeenCalledTimes(1);
  });
});
