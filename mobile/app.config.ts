import type { ConfigContext, ExpoConfig } from 'expo/config';

export default ({ config }: ConfigContext): ExpoConfig => {
  const production = process.env.APP_VARIANT === 'production';
  const googleMapsApiKey = process.env.GOOGLE_MAPS_ANDROID_API_KEY?.trim();
  return {
    ...config,
    extra: {
      ...config.extra,
      googleMapsAndroidEnabled: Boolean(googleMapsApiKey),
    },
    name: production ? 'Dispo' : 'Dispo Dev',
    slug: config.slug ?? 'dispo',
    scheme: production ? 'dispo' : 'dispo-dev',
    ios: {
      ...config.ios,
      bundleIdentifier: production ? 'ch.dispo.app' : 'ch.dispo.app.dev',
    },
    android: {
      ...config.android,
      blockedPermissions: [
        ...(config.android?.blockedPermissions ?? []),
        'android.permission.RECORD_AUDIO',
      ],
      config: {
        ...config.android?.config,
        ...(googleMapsApiKey ? { googleMaps: { apiKey: googleMapsApiKey } } : {}),
      },
      package: production ? 'ch.dispo.app' : 'ch.dispo.app.dev',
    },
  };
};
