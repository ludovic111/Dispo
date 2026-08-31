import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { Redirect, Tabs } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { StyleSheet } from 'react-native';

import { LoadingState, Screen } from '@/components/ui/screen';
import { useAuth } from '@/features/auth/auth-context';
import { tabBadgeValue, useTabBadgeCounts } from '@/features/navigation/tab-badge-queries';
import { useDispoTheme } from '@/theme/theme-context';

const icons = {
  index: ['home', 'home-outline'],
  messages: ['chatbubbles', 'chatbubbles-outline'],
  profile: ['person-circle', 'person-circle-outline'],
  sessions: ['calendar', 'calendar-outline'],
  sos: ['flash', 'flash-outline'],
} as const;

export default function TabsLayout() {
  const { isLoading, session } = useAuth();
  const { dark, palette } = useDispoTheme();
  const { t } = useTranslation();
  const badges = useTabBadgeCounts();
  const messagesBadge = tabBadgeValue(badges.messages);
  const sessionsBadge = tabBadgeValue(badges.sessions);
  const sosBadge = tabBadgeValue(badges.sos);
  if (isLoading)
    return (
      <Screen>
        <LoadingState />
      </Screen>
    );
  if (!session) return <Redirect href="/(auth)/sign-in" />;

  return (
    <Tabs
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: palette.electric,
        tabBarInactiveTintColor: palette.muted,
        tabBarBackground: () => (
          <BlurView intensity={84} style={StyleSheet.absoluteFill} tint={dark ? 'dark' : 'light'} />
        ),
        tabBarHideOnKeyboard: true,
        tabBarStyle: {
          backgroundColor: 'transparent',
          borderTopColor: palette.border,
          position: 'absolute',
        },
        tabBarLabelStyle: { fontSize: 10, fontWeight: '700' },
        tabBarIcon: ({ color, focused, size }) => {
          const pair = icons[route.name as keyof typeof icons] ?? icons.index;
          return <Ionicons color={color} name={focused ? pair[0] : pair[1]} size={size} />;
        },
      })}
    >
      <Tabs.Screen name="index" options={{ title: t('Accueil') }} />
      <Tabs.Screen
        name="sessions"
        options={{
          ...(sessionsBadge === undefined ? {} : { tabBarBadge: sessionsBadge }),
          title: t('Sessions'),
        }}
      />
      <Tabs.Screen
        name="sos"
        options={{
          ...(sosBadge === undefined ? {} : { tabBarBadge: sosBadge }),
          title: t('SOS'),
        }}
      />
      <Tabs.Screen
        name="messages"
        options={{
          ...(messagesBadge === undefined ? {} : { tabBarBadge: messagesBadge }),
          title: t('Messages'),
        }}
      />
      <Tabs.Screen name="profile" options={{ title: t('Profil') }} />
    </Tabs>
  );
}
