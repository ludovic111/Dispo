import type { ConfigContext, ExpoConfig } from 'expo/config';
import { withAndroidManifest, withInfoPlist, type ConfigPlugin } from 'expo/config-plugins';

const irealSchemes = ['irealb', 'irealbook'] as const;

/** Configuration CNG requise pour que `Linking.canOpenURL` voie iReal Pro. */
const withIRealProQueries: ConfigPlugin = (config) => {
  const withIosQueries = withInfoPlist(config, (iosConfig) => {
    const existing = Array.isArray(iosConfig.modResults.LSApplicationQueriesSchemes)
      ? iosConfig.modResults.LSApplicationQueriesSchemes.filter(
          (value): value is string => typeof value === 'string',
        )
      : [];
    iosConfig.modResults.LSApplicationQueriesSchemes = [...new Set([...existing, ...irealSchemes])];
    return iosConfig;
  });

  return withAndroidManifest(withIosQueries, (androidConfig) => {
    const manifest = androidConfig.modResults.manifest;
    const queries = manifest.queries ?? [];
    const primary = queries[0] ?? {};
    const intents = primary.intent ?? [];
    const missing = irealSchemes.filter(
      (scheme) =>
        !intents.some((intent) => intent.data?.some((data) => data.$['android:scheme'] === scheme)),
    );
    primary.intent = [
      ...intents,
      ...missing.map((scheme) => ({
        action: [{ $: { 'android:name': 'android.intent.action.VIEW' } }],
        category: [{ $: { 'android:name': 'android.intent.category.BROWSABLE' } }],
        data: [{ $: { 'android:scheme': scheme } }],
      })),
    ];
    manifest.queries = [primary, ...queries.slice(1)];
    return androidConfig;
  });
};

export default ({ config }: ConfigContext): ExpoConfig => {
  const production = process.env.APP_VARIANT === 'production';
  const googleMapsApiKey = process.env.GOOGLE_MAPS_ANDROID_API_KEY?.trim();
  return withIRealProQueries({
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
      entitlements: {
        ...config.ios?.entitlements,
        'aps-environment': production ? 'production' : 'development',
      },
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
  });
};
