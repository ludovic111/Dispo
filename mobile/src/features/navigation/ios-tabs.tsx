import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { Tabs } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useDispoTheme } from '@/theme/theme-context';

const destinations = [
  { name: 'index', label: 'Accueil', icon: 'home-outline', selected: 'home' },
  { name: 'sessions', label: 'Sessions', icon: 'calendar-outline', selected: 'calendar' },
  { name: 'sos', label: 'SOS', icon: 'flash-outline', selected: 'flash' },
  { name: 'messages', label: 'Messages', icon: 'chatbubbles-outline', selected: 'chatbubbles' },
  { name: 'profile', label: 'Profil', icon: 'person-circle-outline', selected: 'person-circle' },
] as const;

/** Keep labels measurable on iOS 26, including before a tab's first selection. */
export function IosTabs({
  badges,
}: {
  badges: Partial<Record<(typeof destinations)[number]['name'], string | undefined>>;
}) {
  const { palette, dark } = useDispoTheme();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarHideOnKeyboard: true,
        tabBarActiveTintColor: palette.electric,
        tabBarInactiveTintColor: palette.muted,
        tabBarActiveBackgroundColor: palette.inset,
        tabBarLabelPosition: 'below-icon',
        tabBarLabelStyle: { fontSize: 10, fontWeight: '600' },
        tabBarItemStyle: {
          marginHorizontal: 3,
          marginVertical: 5,
          borderRadius: 26,
          overflow: 'hidden',
        },
        tabBarBadgeStyle: { backgroundColor: palette.error, color: '#FFFFFF' },
        tabBarStyle: {
          height: 64,
          marginHorizontal: 16,
          marginBottom: Math.max(12, insets.bottom - 8),
          paddingBottom: 0,
          paddingTop: 0,
          borderRadius: 32,
          borderWidth: 1,
          borderColor: palette.border,
          backgroundColor: palette.card,
          overflow: 'hidden',
        },
        tabBarBackground: () => (
          <BlurView intensity={45} tint={dark ? 'dark' : 'light'} style={StyleSheet.absoluteFill} />
        ),
      }}
    >
      {destinations.map(({ name, label, icon, selected }) => {
        const badge = badges[name];
        return (
          <Tabs.Screen
            key={name}
            name={name}
            options={{
              title: t(label),
              tabBarAccessibilityLabel: t(label),
              ...(badge === undefined ? {} : { tabBarBadge: badge }),
              tabBarIcon: ({ color, focused }) => (
                <Ionicons name={focused ? selected : icon} color={color} size={26} />
              ),
            }}
          />
        );
      })}
    </Tabs>
  );
}
