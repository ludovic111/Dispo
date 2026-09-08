import type { Session } from '@supabase/supabase-js';
import * as AppleAuthentication from 'expo-apple-authentication';
import { useLinkingURL } from 'expo-linking';
import {
  createContext,
  useCallback,
  type PropsWithChildren,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useTranslation } from 'react-i18next';
import { AppState, Platform } from 'react-native';

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
  const linkingUrl = useLinkingURL();
  const handledCallback = useRef<string | null>(null);
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

  useEffect(() => {
    if (
      !configurationReady ||
      !linkingUrl ||
      !isAuthCallbackUrl(linkingUrl) ||
      handledCallback.current === linkingUrl
    )
      return;
    // Expo's native event also covers URLs handled by another app-delegate subscriber.
    // Consume the original URL once, before routing discards its auth parameters.
    handledCallback.current = linkingUrl;
    let active = true;
    setAuthCallbackError(null);
    void handleAuthCallbackUrl(linkingUrl)
      .then((result) => {
        if (active && result.recovery) setIsPasswordRecovery(true);
      })
      .catch(() => {
        if (active) setAuthCallbackError(t('Lien de connexion invalide ou expiré.'));
      });
    return () => {
      active = false;
    };
  }, [configurationReady, linkingUrl, t]);

  const appleSubject = session?.user.identities?.find((identity) => identity.provider === 'apple')
    ?.identity_data?.sub;
  useEffect(() => {
    if (Platform.OS !== 'ios' || typeof appleSubject !== 'string') return;
    let active = true;
    const signOutRevoked = () => {
      if (active)
        void getSupabaseClient()
          .auth.signOut({ scope: 'local' })
          .catch(() => undefined);
    };
    const check = async () => {
      try {
        const state = await AppleAuthentication.getCredentialStateAsync(appleSubject);
        if (state === AppleAuthentication.AppleAuthenticationCredentialState.REVOKED)
          signOutRevoked();
      } catch {
        // The system may be offline; a failed check must not revoke a valid session.
      }
    };
    const revoked = AppleAuthentication.addRevokeListener(signOutRevoked);
    const foreground = AppState.addEventListener('change', (state) => {
      if (state === 'active') void check();
    });
    void check();
    return () => {
      active = false;
      revoked.remove();
      foreground.remove();
    };
  }, [appleSubject]);

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
