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
import { Appearance, useColorScheme } from 'react-native';

import { defaultThemeId, isThemeId, themes, type DispoTheme, type ThemeId } from './themes';
import { paletteFor, type DispoPalette } from './tokens';

export type ThemePreference = 'system' | 'light' | 'dark';

interface ThemeValue {
  dark: boolean;
  palette: DispoPalette;
  preference: ThemePreference;
  setPreference: (preference: ThemePreference) => void;
  setThemeId: (themeId: ThemeId) => void;
  themeId: ThemeId;
  themes: readonly DispoTheme[];
}

const ThemeContext = createContext<ThemeValue | null>(null);
export const themeStorageKey = '@dispo/theme';
export const themeIdStorageKey = '@dispo/theme-id';

function isThemePreference(value: string | null): value is ThemePreference {
  return value === 'system' || value === 'light' || value === 'dark';
}

export function DispoThemeProvider({ children }: PropsWithChildren) {
  const systemScheme = useColorScheme();
  const [preference, setStoredPreference] = useState<ThemePreference>('dark');
  const [themeId, setStoredThemeId] = useState<ThemeId>(defaultThemeId);

  useEffect(() => {
    let active = true;
    void AsyncStorage.multiGet([themeStorageKey, themeIdStorageKey]).then((entries) => {
      if (!active) return;
      const stored = new Map(entries);
      const preferenceValue = stored.get(themeStorageKey) ?? null;
      if (isThemePreference(preferenceValue)) setStoredPreference(preferenceValue);
      const themeValue = stored.get(themeIdStorageKey) ?? null;
      if (isThemeId(themeValue)) setStoredThemeId(themeValue);
    });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    Appearance.setColorScheme(preference === 'system' ? 'unspecified' : preference);
  }, [preference]);

  const setPreference = useCallback((next: ThemePreference) => {
    setStoredPreference(next);
    void AsyncStorage.setItem(themeStorageKey, next);
  }, []);

  const setThemeId = useCallback((next: ThemeId) => {
    setStoredThemeId(isThemeId(next) ? next : defaultThemeId);
    void AsyncStorage.setItem(themeIdStorageKey, next);
  }, []);

  const scheme = preference === 'system' ? (systemScheme ?? 'dark') : preference;
  const value = useMemo(
    () => ({
      dark: scheme !== 'light',
      palette: paletteFor(scheme, themeId),
      preference,
      setPreference,
      setThemeId,
      themeId,
      themes,
    }),
    [preference, scheme, setPreference, setThemeId, themeId],
  );
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useDispoTheme(): ThemeValue {
  const value = useContext(ThemeContext);
  if (!value) throw new Error('useDispoTheme must be used inside DispoThemeProvider');
  return value;
}
