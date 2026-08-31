package ch.dispo.modules.legacypreferences

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class LegacyPreferencesReaderTest {
  @Test
  fun readsNativeAndroidKeys() {
    assertEquals("dispo.app.preferences", LegacyPreferencesReader.PREFERENCES_FILE)
    val values = LegacyPreferencesReader.read(
      mapOf(
        "language" to "fr",
        "theme" to "dark",
        "push.enabled" to false,
        "push.groups" to false,
        "push.messages" to true,
        "push.sos" to false,
        "groups.last_seen.profile-a.group-2" to "2026-08-31T20:00:00Z",
        "groups.last_seen.profile-a.group-1" to "2026-08-31T19:00:00Z",
        "groups.last_seen.profile-b.group-3" to "2026-08-31T18:00:00Z",
        "groups.last_seen..invalid" to "2026-08-31T17:00:00Z",
        "groups.last_seen.profile-a." to "2026-08-31T17:00:00Z",
        "groups.last_seen.profile-a.invalid-type" to 123L,
      ),
    )

    assertEquals("fr", values.language)
    assertEquals("dark", values.theme)
    assertEquals(false, values.notificationsEnabled)
    assertEquals(false, values.pushGroups)
    assertEquals(true, values.pushMessages)
    assertEquals(false, values.pushSos)
    assertNull(values.openedGigIds)
    assertNull(values.groupLastSeen)
    assertEquals(
      mapOf(
        "profile-a" to mapOf(
          "group-1" to "2026-08-31T19:00:00Z",
          "group-2" to "2026-08-31T20:00:00Z",
        ),
        "profile-b" to mapOf("group-3" to "2026-08-31T18:00:00Z"),
      ),
      values.groupLastSeenByProfile,
    )
    assertNull(values.schoolLastSeen)
  }

  @Test
  fun readsTheExactSupabaseKtSessionWithoutConsumingIt() {
    assertEquals("ch.dispo.app_preferences", LegacyPreferencesReader.SUPABASE_PREFERENCES_FILE)
    assertEquals(
      "sb-https:--cghmmpcwqzpjwgnbiuuw-supabase-co-session",
      LegacyPreferencesReader.SUPABASE_SESSION_KEY,
    )
    val session = "{\"access_token\":\"access\",\"refresh_token\":\"refresh\"}"
    assertEquals(
      session,
      LegacyPreferencesReader.readSupabaseSession(
        mapOf(LegacyPreferencesReader.SUPABASE_SESSION_KEY to session),
      ),
    )
    assertNull(
      LegacyPreferencesReader.readSupabaseSession(
        mapOf(LegacyPreferencesReader.SUPABASE_SESSION_KEY to 42),
      ),
    )
  }

  @Test
  fun keepsNativeDefaultsWithoutCrashingOnCorruptValues() {
    assertNull(
      LegacyPreferencesReader.read(emptyMap<String, Any?>()).notificationsEnabled,
    )
    assertEquals(true, LegacyPreferencesReader.read(mapOf("language" to "fr")).notificationsEnabled)
    assertNull(LegacyPreferencesReader.read(mapOf("push.enabled" to "invalid")).notificationsEnabled)
  }
}
