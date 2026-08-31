import type { Session } from '@supabase/supabase-js';
import {
  createContext,
  useCallback,
  type PropsWithChildren,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { useTranslation } from 'react-i18next';
import { AppState, Linking } from 'react-native';

import { handleAuthCallbackUrl, isAuthCallbackUrl, restoreSession } from './auth-service';

import { getSupabaseClient, hasSupabaseConfiguration } from '@/services/supabase/client';

interface AuthState {
  authCallbackError: string | null;
  clearPasswordRecovery: () => void;
  configurationReady: boolean;
  isPasswordRecovery: boolean;
  isLoading: boolean;
  session: Session | null;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: PropsWithChildren) {
  const { t } = useTranslation();
  const configurationReady = hasSupabaseConfiguration();
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(configurationReady);
  const [isPasswordRecovery, setIsPasswordRecovery] = useState(false);
  const [authCallbackError, setAuthCallbackError] = useState<string | null>(null);
  const clearPasswordRecovery = useCallback(() => setIsPasswordRecovery(false), []);

  useEffect(() => {
    if (!configurationReady) return;

    const supabase = getSupabaseClient();
    let active = true;
    let authEventSeen = false;

    const { data } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (!active) return;
      authEventSeen = true;
      setSession(nextSession);
      if (event === 'PASSWORD_RECOVERY') setIsPasswordRecovery(true);
      setIsLoading(false);
    });

    const openAuthCallback = async (url: string | null) => {
      if (!active || !url || !isAuthCallbackUrl(url)) return;
      setAuthCallbackError(null);
      try {
        const result = await handleAuthCallbackUrl(url);
        if (active && result.recovery) setIsPasswordRecovery(true);
      } catch {
        if (active) setAuthCallbackError(t('Lien de connexion invalide ou expiré.'));
      }
    };

    void Linking.getInitialURL().then(openAuthCallback);
    const linking = Linking.addEventListener('url', ({ url }) => {
      void openAuthCallback(url);
    });

    void restoreSession(supabase.auth)
      .then((restored) => {
        if (active && !authEventSeen) setSession(restored);
      })
      .catch(() => {
        if (active && !authEventSeen) setSession(null);
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });

    if (AppState.currentState === 'active') supabase.auth.startAutoRefresh();
    else supabase.auth.stopAutoRefresh();

    const appState = AppState.addEventListener('change', (state) => {
      if (state === 'active') supabase.auth.startAutoRefresh();
      else supabase.auth.stopAutoRefresh();
    });

    return () => {
      active = false;
      data.subscription.unsubscribe();
      linking.remove();
      appState.remove();
      supabase.auth.stopAutoRefresh();
    };
  }, [configurationReady, t]);

  const value = useMemo(
    () => ({
      authCallbackError,
      clearPasswordRecovery,
      configurationReady,
      isLoading,
      isPasswordRecovery,
      session,
    }),
    [
      authCallbackError,
      clearPasswordRecovery,
      configurationReady,
      isLoading,
      isPasswordRecovery,
      session,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside AuthProvider');
  return value;
}
