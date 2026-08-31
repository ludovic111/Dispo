package ch.dispo.modules.legacypreferences

import android.content.Context
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class DispoLegacyPreferencesModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("DispoLegacyPreferences")

    Function("readAsync") {
      val context = requireNotNull(appContext.reactContext)
      val preferences = context.getSharedPreferences(
        LegacyPreferencesReader.PREFERENCES_FILE,
        Context.MODE_PRIVATE,
      )
      val values = LegacyPreferencesReader.read(preferences.all)
      mapOf(
        "groupLastSeen" to values.groupLastSeen,
        "groupLastSeenByProfile" to values.groupLastSeenByProfile,
        "language" to values.language,
        "notificationsEnabled" to values.notificationsEnabled,
        "openedGigIds" to values.openedGigIds,
        "pushGroups" to values.pushGroups,
        "pushMessages" to values.pushMessages,
        "pushSos" to values.pushSos,
        "schoolLastSeen" to values.schoolLastSeen,
        "sosShowAll" to null,
        "theme" to values.theme,
      )
    }

    Function("readSupabaseSessionAsync") {
      val context = requireNotNull(appContext.reactContext)
      val preferences = context.getSharedPreferences(
        LegacyPreferencesReader.SUPABASE_PREFERENCES_FILE,
        Context.MODE_PRIVATE,
      )
      LegacyPreferencesReader.readSupabaseSession(preferences.all)
    }
  }
}
