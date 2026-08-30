import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';

import { AppProviders } from '@/providers/app-providers';
import { useDispoTheme } from '@/theme/theme-context';

void SplashScreen.preventAutoHideAsync();

function Navigation() {
  const { dark, palette } = useDispoTheme();
  return (
    <>
      <Stack
        screenOptions={{
          contentStyle: { backgroundColor: palette.background },
          headerBackTitle: 'Retour',
          headerShadowVisible: false,
          headerStyle: { backgroundColor: palette.background },
          headerTintColor: palette.text,
        }}
      >
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="(auth)/sign-in" options={{ headerShown: false }} />
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="profiles/[id]" options={{ title: 'Profil' }} />
        <Stack.Screen name="gigs/[id]" options={{ title: 'Détail SOS' }} />
        <Stack.Screen
          name="gigs/create"
          options={{ presentation: 'modal', title: 'Publier un SOS' }}
        />
        <Stack.Screen name="messages/[id]" options={{ title: 'Conversation' }} />
      </Stack>
      <StatusBar style={dark ? 'light' : 'dark'} />
    </>
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
