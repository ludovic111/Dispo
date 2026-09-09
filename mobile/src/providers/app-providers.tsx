import { focusManager, onlineManager } from '@tanstack/react-query';
import * as Network from 'expo-network';
import { type PropsWithChildren, useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { SessionQueryProvider } from './session-query-provider';

import { AuthProvider, useAuth } from '@/features/auth/auth-context';
import { NetworkBanner } from '@/features/connectivity/network-banner';
import { DiscoveryProvider } from '@/features/discovery/discovery-context';
import { GigRealtimeBridge } from '@/features/gigs/gig-realtime-bridge';
import { SosAcceptanceCelebrationProvider } from '@/features/gigs/sos-acceptance-celebration';
import { GroupEventReminderBridge } from '@/features/groups/group-event-reminder-bridge';
import { NativeNotificationBridge } from '@/features/notifications/native-notification-bridge';
import { SubscriptionSyncBridge } from '@/features/premium/subscription-queries';
import { SchoolRealtimeBridge } from '@/features/schools/school-realtime-bridge';
import { NativeDeviceSyncBridge } from '@/features/settings/native-device-sync-bridge';
import { hydrateAppLanguage } from '@/i18n';
import { migrateLegacyNativePreferences } from '@/services/storage/legacy-native-preferences';
import { DispoThemeProvider } from '@/theme/theme-context';

function SessionScopedProviders({ children }: PropsWithChildren) {
  const { session } = useAuth();
  const userId = session?.user.id ?? null;

  return (
    <SessionQueryProvider userId={userId}>
      <QueryLifecycleBridge />
      <DiscoveryProvider>
        <GigRealtimeBridge />
        <GroupEventReminderBridge />
        <SchoolRealtimeBridge />
        <NativeNotificationBridge />
        <NativeDeviceSyncBridge />
        <SubscriptionSyncBridge />
        <SosAcceptanceCelebrationProvider>{children}</SosAcceptanceCelebrationProvider>
        <NetworkBanner />
      </DiscoveryProvider>
    </SessionQueryProvider>
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

  useEffect(() => {
    void migrateLegacyNativePreferences()
      .then(hydrateAppLanguage)
      .finally(() => setLanguageReady(true));
  }, []);

  if (!languageReady) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <DispoThemeProvider>
        <AuthProvider>
          <SessionScopedProviders>{children}</SessionScopedProviders>
        </AuthProvider>
      </DispoThemeProvider>
    </GestureHandlerRootView>
  );
}
