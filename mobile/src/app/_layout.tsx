import { useFonts } from 'expo-font';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';

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
        <Stack.Screen name="profiles/[id]" options={{ title: t('Profil') }} />
        <Stack.Screen name="gigs/[id]" options={{ title: t('Détail SOS') }} />
        <Stack.Screen
          name="gigs/create"
          options={{ presentation: 'modal', title: t('Publier un SOS') }}
        />
        <Stack.Screen name="gigs/matches" options={{ title: t('Matches SOS') }} />
        <Stack.Screen name="gigs/request" options={{ title: t('Demander un dépannage') }} />
        <Stack.Screen name="messages/[id]" options={{ title: t('Conversation') }} />
        <Stack.Screen
          name="whats-new"
          options={{ gestureEnabled: false, headerShown: false, presentation: 'modal' }}
        />
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
