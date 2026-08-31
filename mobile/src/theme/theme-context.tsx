import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  createContext,
  type PropsWithChildren,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { useColorScheme } from 'react-native';

import { paletteFor, type DispoPalette } from './tokens';

export type ThemePreference = 'system' | 'light' | 'dark';

interface ThemeValue {
  dark: boolean;
  palette: DispoPalette;
  preference: ThemePreference;
  setPreference: (preference: ThemePreference) => void;
}

const ThemeContext = createContext<ThemeValue | null>(null);
const themeStorageKey = '@dispo/theme';

function isThemePreference(value: string | null): value is ThemePreference {
  return value === 'system' || value === 'light' || value === 'dark';
}

export function DispoThemeProvider({ children }: PropsWithChildren) {
  const systemScheme = useColorScheme();
  const [preference, setStoredPreference] = useState<ThemePreference>('dark');

  useEffect(() => {
    let active = true;
    void AsyncStorage.getItem(themeStorageKey).then((stored) => {
      if (active && isThemePreference(stored)) setStoredPreference(stored);
    });
    return () => {
      active = false;
    };
  }, []);

  const setPreference = useCallback((next: ThemePreference) => {
    setStoredPreference(next);
    void AsyncStorage.setItem(themeStorageKey, next);
  }, []);

  const scheme = preference === 'system' ? (systemScheme ?? 'dark') : preference;
  const value = useMemo(
    () => ({ dark: scheme !== 'light', palette: paletteFor(scheme), preference, setPreference }),
    [preference, scheme, setPreference],
  );
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useDispoTheme(): ThemeValue {
  const value = useContext(ThemeContext);
  if (!value) throw new Error('useDispoTheme must be used inside DispoThemeProvider');
  return value;
}
