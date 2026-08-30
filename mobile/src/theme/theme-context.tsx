import { createContext, type PropsWithChildren, useContext, useMemo } from 'react';
import { useColorScheme } from 'react-native';

import { paletteFor, type DispoPalette } from './tokens';

interface ThemeValue {
  dark: boolean;
  palette: DispoPalette;
}

const ThemeContext = createContext<ThemeValue | null>(null);

export function DispoThemeProvider({ children }: PropsWithChildren) {
  const scheme = useColorScheme();
  const value = useMemo(
    () => ({ dark: scheme !== 'light', palette: paletteFor(scheme) }),
    [scheme],
  );
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useDispoTheme(): ThemeValue {
  const value = useContext(ThemeContext);
  if (!value) throw new Error('useDispoTheme must be used inside DispoThemeProvider');
  return value;
}
