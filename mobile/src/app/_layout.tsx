import { useFonts } from 'expo-font';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import {
  headerlessModalStackRoutes,
  headerlessStackRoutes,
  lockedHeaderlessModalStackRoutes,
} from '@/features/navigation/stack-header-policy';
import { AppProviders } from '@/providers/app-providers';
import { useDispoTheme } from '@/theme/theme-context';

void SplashScreen.preventAutoHideAsync();

function Navigation() {
  const { dark, palette } = useDispoTheme();
  const { t } = useTranslation();
  const navigationTheme = useMemo(() => {
    const systemTheme = dark ? DarkTheme : DefaultTheme;
    return {
      ...systemTheme,
      colors: {
        ...systemTheme.colors,
        background: palette.background,
        border: palette.border,
        card: palette.card,
        notification: palette.signal,
        primary: palette.electric,
        text: palette.text,
      },
    };
  }, [dark, palette]);
  return (
    <ThemeProvider value={navigationTheme}>
      <Stack
        screenOptions={{
          contentStyle: { backgroundColor: palette.background },
          headerBackTitle: t('Retour'),
          headerShadowVisible: false,
          headerStyle: { backgroundColor: palette.background },
          headerTintColor: palette.text,
        }}
      >
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="welcome" options={{ gestureEnabled: false, headerShown: false }} />
        <Stack.Screen name="(auth)/sign-in" options={{ headerShown: false }} />
        <Stack.Screen name="(auth)/update-password" options={{ headerShown: false }} />
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        {headerlessStackRoutes.map((name) => (
          <Stack.Screen key={name} name={name} options={{ headerShown: false }} />
        ))}
        {headerlessModalStackRoutes.map((name) => (
          <Stack.Screen
            key={name}
            name={name}
            options={{ headerShown: false, presentation: 'modal' }}
          />
        ))}
        {lockedHeaderlessModalStackRoutes.map((name) => (
          <Stack.Screen
            key={name}
            name={name}
            options={{ gestureEnabled: false, headerShown: false, presentation: 'modal' }}
          />
        ))}
        <Stack.Screen
          name="notification-center"
          options={{ headerShown: true, presentation: 'modal', title: t('Notifications') }}
        />
        <Stack.Screen name="groups/new" options={{ title: t('Nouveau groupe') }} />
        <Stack.Screen
          name="groups/[id]/songs/[songId]/copy"
          options={{ gestureEnabled: false, presentation: 'modal', title: t('Copier le morceau') }}
        />
        <Stack.Screen name="profiles/[id]" options={{ title: t('Profil') }} />
        <Stack.Screen name="gigs/[id]" options={{ title: t('Détail SOS') }} />
        <Stack.Screen name="messages/[id]" options={{ title: t('Conversation') }} />
      </Stack>
      <StatusBar style={dark ? 'light' : 'dark'} />
    </ThemeProvider>
  );
}

export default function RootLayout() {
  const [loaded, error] = useFonts({
    FrauncesDisplay: require('../../assets/fonts/Fraunces-Display.ttf'),
    FrauncesDisplayItalic: require('../../assets/fonts/Fraunces-DisplayItalic.ttf'),
    SplineSansMonoMedium: require('../../assets/fonts/SplineSansMono-Medium.ttf'),
    SplineSansMonoSemibold: require('../../assets/fonts/SplineSansMono-SemiBold.ttf'),
  });

  useEffect(() => {
    if (loaded || error) void SplashScreen.hideAsync();
  }, [error, loaded]);

  if (!loaded && !error) return null;
  return (
    <AppProviders>
      <Navigation />
    </AppProviders>
  );
}
