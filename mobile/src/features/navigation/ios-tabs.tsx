import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Tabs } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useDispoTheme } from '@/theme/theme-context';
import { elevation, fontWeights, onAccent, radii, spacing, surfaceStyle } from '@/theme/tokens';

const destinations = [
  { name: 'index', label: 'Accueil', icon: 'home-outline', selected: 'home' },
  { name: 'sessions', label: 'Sessions', icon: 'calendar-outline', selected: 'calendar' },
  { name: 'sos', label: 'SOS', icon: 'flash-outline', selected: 'flash' },
  { name: 'messages', label: 'Messages', icon: 'chatbubbles-outline', selected: 'chatbubbles' },
  { name: 'profile', label: 'Profil', icon: 'person-circle-outline', selected: 'person-circle' },
] as const;

const tabBarHeight = 64;
/** Libellé de la barre d'onglets : taille minimale lisible (≥ `caption2`), graisse semibold. */
const tabLabelFontSize = 11;

/**
 * Barre d'onglets iOS : un plateau flottant relevé (surface dégradée, liseré
 * clair, arête sombre, ombre) ; l'onglet courant porte une pastille accent
 * au-dessus de son icône. Les libellés restent mesurables sur iOS 26,
 * y compris avant la première sélection d'un onglet.
 */
export function IosTabs({
  badges,
}: {
  badges: Partial<Record<(typeof destinations)[number]['name'], string | undefined>>;
}) {
  const { palette } = useDispoTheme();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const surface = surfaceStyle(palette, 'elevated');
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarHideOnKeyboard: true,
        tabBarActiveTintColor: palette.electric,
        tabBarInactiveTintColor: palette.muted,
        tabBarActiveBackgroundColor: 'transparent',
        tabBarLabelPosition: 'below-icon',
        tabBarLabelStyle: { fontSize: tabLabelFontSize, fontWeight: fontWeights.semibold },
        tabBarItemStyle: {
          marginHorizontal: spacing.xxs,
          marginVertical: spacing.xxs,
          borderRadius: radii.xl,
        },
        tabBarBadgeStyle: { backgroundColor: palette.signal, color: onAccent },
        tabBarStyle: {
          height: tabBarHeight,
          marginHorizontal: spacing.md,
          marginBottom: Math.max(spacing.sm, insets.bottom - spacing.xs),
          paddingBottom: 0,
          paddingTop: 0,
          borderRadius: radii.round,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: palette.edge,
          borderTopWidth: StyleSheet.hairlineWidth,
          borderTopColor: palette.edge,
          backgroundColor: palette.cardElevated,
          ...elevation(2, palette),
        },
        tabBarBackground: () => (
          <View pointerEvents="none" style={styles.tray}>
            <LinearGradient
              colors={surface.gradient ?? [palette.cardElevated, palette.cardElevated]}
              style={StyleSheet.absoluteFill}
            />
            <View style={[styles.trayHighlight, { backgroundColor: palette.highlight }]} />
          </View>
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
                <View style={styles.icon}>
                  <Ionicons name={focused ? selected : icon} color={color} size={26} />
                  {focused ? (
                    <View style={[styles.dot, { backgroundColor: palette.accent }]} />
                  ) : null}
                </View>
              ),
            }}
          />
        );
      })}
    </Tabs>
  );
}

const styles = StyleSheet.create({
  dot: { borderRadius: radii.round, height: 4, position: 'absolute', top: -7, width: 12 },
  icon: { alignItems: 'center', justifyContent: 'center' },
  tray: {
    borderRadius: radii.round,
    bottom: 0,
    left: 0,
    overflow: 'hidden',
    position: 'absolute',
    right: 0,
    top: 0,
  },
  trayHighlight: { height: 1, left: radii.xl, position: 'absolute', right: radii.xl, top: 0 },
});
