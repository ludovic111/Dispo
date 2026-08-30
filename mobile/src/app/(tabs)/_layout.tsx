import { Ionicons } from '@expo/vector-icons';
import { Redirect, Tabs } from 'expo-router';

import { LoadingState, Screen } from '@/components/ui/screen';
import { useAuth } from '@/features/auth/auth-context';
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
  const { palette } = useDispoTheme();
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
        tabBarStyle: { backgroundColor: palette.card, borderTopColor: palette.border },
        tabBarLabelStyle: { fontSize: 10, fontWeight: '700' },
        tabBarIcon: ({ color, focused, size }) => {
          const pair = icons[route.name as keyof typeof icons] ?? icons.index;
          return <Ionicons color={color} name={focused ? pair[0] : pair[1]} size={size} />;
        },
      })}
    >
      <Tabs.Screen name="index" options={{ title: 'Accueil' }} />
      <Tabs.Screen name="sessions" options={{ title: 'Sessions' }} />
      <Tabs.Screen name="sos" options={{ title: 'SOS' }} />
      <Tabs.Screen name="messages" options={{ title: 'Messages' }} />
      <Tabs.Screen name="profile" options={{ title: 'Profil' }} />
    </Tabs>
  );
}
