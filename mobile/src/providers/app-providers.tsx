import {
  focusManager,
  onlineManager,
  QueryClient,
  QueryClientProvider,
  useQueryClient,
} from '@tanstack/react-query';
import * as Network from 'expo-network';
import { type PropsWithChildren, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { AuthProvider, useAuth } from '@/features/auth/auth-context';
import { NetworkBanner } from '@/features/connectivity/network-banner';
import { DiscoveryProvider } from '@/features/discovery/discovery-context';
import { GroupEventReminderBridge } from '@/features/groups/group-event-reminder-bridge';
import { NativeNotificationBridge } from '@/features/notifications/native-notification-bridge';
import { hydrateAppLanguage } from '@/i18n';
import { DispoThemeProvider } from '@/theme/theme-context';

function SessionScopedProviders({ children }: PropsWithChildren) {
  const { session } = useAuth();
  const queryClient = useQueryClient();
  const userId = session?.user.id ?? null;
  const previousUserId = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    if (previousUserId.current === undefined) {
      previousUserId.current = userId;
      return;
    }
    if (previousUserId.current !== userId) {
      queryClient.clear();
      previousUserId.current = userId;
    }
  }, [queryClient, userId]);

  return (
    <DiscoveryProvider key={userId ?? 'signed-out'}>
      <GroupEventReminderBridge />
      <NativeNotificationBridge />
      {children}
      <NetworkBanner />
    </DiscoveryProvider>
  );
}

function QueryLifecycleBridge() {
  useEffect(() => {
    focusManager.setFocused(AppState.currentState === 'active');
    const subscription = AppState.addEventListener('change', (state) => {
      focusManager.setFocused(state === 'active');
    });
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    const update = (state: Network.NetworkState) => {
      onlineManager.setOnline(state.isConnected !== false && state.isInternetReachable !== false);
    };
    void Network.getNetworkStateAsync()
      .then(update)
      .catch(() => undefined);
    const subscription = Network.addNetworkStateListener(update);
    return () => subscription.remove();
  }, []);

  return null;
}

export function AppProviders({ children }: PropsWithChildren) {
  const [languageReady, setLanguageReady] = useState(false);
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { staleTime: 30_000, retry: 2, refetchOnWindowFocus: false },
          mutations: { retry: 0 },
        },
      }),
  );

  useEffect(() => {
    void hydrateAppLanguage().finally(() => setLanguageReady(true));
  }, []);

  if (!languageReady) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <DispoThemeProvider>
        <QueryClientProvider client={queryClient}>
          <QueryLifecycleBridge />
          <AuthProvider>
            <SessionScopedProviders>{children}</SessionScopedProviders>
          </AuthProvider>
        </QueryClientProvider>
      </DispoThemeProvider>
    </GestureHandlerRootView>
  );
}
