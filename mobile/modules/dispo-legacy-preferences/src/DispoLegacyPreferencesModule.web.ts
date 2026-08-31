import { NativeModule, registerWebModule } from 'expo';

import type { LegacyNativePreferences } from './DispoLegacyPreferences.types';

// DispoLegacyPreferencesModule is not available on the web platform.
class DispoLegacyPreferencesModule extends NativeModule {
  readAsync(): LegacyNativePreferences {
    return {
      groupLastSeen: null,
      groupLastSeenByProfile: null,
      language: null,
      notificationsEnabled: null,
      openedGigIds: null,
      pushGroups: null,
      pushMessages: null,
      pushSos: null,
      schoolLastSeen: null,
      sosShowAll: null,
      theme: null,
    };
  }
}

export default registerWebModule(DispoLegacyPreferencesModule, 'DispoLegacyPreferences');
