import type { ConfigContext, ExpoConfig } from 'expo/config';

export default ({ config }: ConfigContext): ExpoConfig => {
  const production = process.env.APP_VARIANT === 'production';
  return {
    ...config,
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
      package: production ? 'ch.dispo.app' : 'ch.dispo.app.dev',
    },
  };
};
