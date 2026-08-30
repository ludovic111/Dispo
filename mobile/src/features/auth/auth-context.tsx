import type { Session } from '@supabase/supabase-js';
import {
  createContext,
  type PropsWithChildren,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { AppState } from 'react-native';

import { restoreSession } from './auth-service';

import { getSupabaseClient, hasSupabaseConfiguration } from '@/services/supabase/client';

interface AuthState {
  configurationReady: boolean;
  isLoading: boolean;
  session: Session | null;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: PropsWithChildren) {
  const configurationReady = hasSupabaseConfiguration();
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(configurationReady);

  useEffect(() => {
    if (!configurationReady) return;

    const supabase = getSupabaseClient();
    let active = true;
    let authEventSeen = false;

    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!active) return;
      authEventSeen = true;
      setSession(nextSession);
      setIsLoading(false);
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
      appState.remove();
      supabase.auth.stopAutoRefresh();
    };
  }, [configurationReady]);

  const value = useMemo(
    () => ({ configurationReady, isLoading, session }),
    [configurationReady, isLoading, session],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside AuthProvider');
  return value;
}
