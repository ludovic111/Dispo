import { NativeModule, requireOptionalNativeModule } from 'expo';

import type { LegacyNativePreferences } from './DispoLegacyPreferences.types';

declare class DispoLegacyPreferencesModule extends NativeModule {
  readAsync(): LegacyNativePreferences;
  readSupabaseSessionAsync?(): string | null;
}

export default requireOptionalNativeModule<DispoLegacyPreferencesModule>('DispoLegacyPreferences');
