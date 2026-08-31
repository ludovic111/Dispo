package ch.dispo.modules.legacypreferences

internal data class LegacyPreferencesValues(
  val groupLastSeen: Map<String, String>?,
  val groupLastSeenByProfile: Map<String, Map<String, String>>?,
  val language: String?,
  val notificationsEnabled: Boolean?,
  val openedGigIds: List<String>?,
  val pushGroups: Boolean?,
  val pushMessages: Boolean?,
  val pushSos: Boolean?,
  val schoolLastSeen: Map<String, String>?,
  val theme: String?,
)

internal object LegacyPreferencesReader {
  const val PREFERENCES_FILE = "dispo.app.preferences"
  const val SUPABASE_PREFERENCES_FILE = "ch.dispo.app_preferences"
  const val SUPABASE_SESSION_KEY =
    "sb-https:--cghmmpcwqzpjwgnbiuuw-supabase-co-session"

  private const val LANGUAGE_KEY = "language"
  private const val NOTIFICATIONS_ENABLED_KEY = "push.enabled"
  private const val PUSH_GROUPS_KEY = "push.groups"
  private const val PUSH_MESSAGES_KEY = "push.messages"
  private const val PUSH_SOS_KEY = "push.sos"
  private const val THEME_KEY = "theme"
  private const val GROUP_LAST_SEEN_PREFIX = "groups.last_seen."

  fun readSupabaseSession(values: Map<String, *>): String? =
    (values[SUPABASE_SESSION_KEY] as? String)?.takeIf { it.isNotBlank() }

  fun read(values: Map<String, *>): LegacyPreferencesValues {
    val hasLegacyApp = values.isNotEmpty()
    val notificationsEnabled = when {
      !hasLegacyApp -> null
      !values.containsKey(NOTIFICATIONS_ENABLED_KEY) -> true
      else -> values[NOTIFICATIONS_ENABLED_KEY] as? Boolean
    }
    return LegacyPreferencesValues(
      groupLastSeen = null,
      groupLastSeenByProfile = groupLastSeenByProfile(values),
      language = values[LANGUAGE_KEY] as? String,
      notificationsEnabled = notificationsEnabled,
      openedGigIds = null,
      pushGroups = values[PUSH_GROUPS_KEY] as? Boolean,
      pushMessages = values[PUSH_MESSAGES_KEY] as? Boolean,
      pushSos = values[PUSH_SOS_KEY] as? Boolean,
      schoolLastSeen = null,
      theme = values[THEME_KEY] as? String,
    )
  }

  private fun groupLastSeenByProfile(
    values: Map<String, *>,
  ): Map<String, Map<String, String>>? {
    val result = sortedMapOf<String, MutableMap<String, String>>()
    values.forEach { (key, rawValue) ->
      if (!key.startsWith(GROUP_LAST_SEEN_PREFIX)) return@forEach
      val suffix = key.removePrefix(GROUP_LAST_SEEN_PREFIX)
      val separator = suffix.indexOf('.')
      if (separator <= 0 || separator == suffix.lastIndex) return@forEach
      val profileId = suffix.substring(0, separator).trim()
      val groupId = suffix.substring(separator + 1).trim()
      val timestamp = (rawValue as? String)?.takeIf { it.isNotBlank() }
        ?: return@forEach
      if (profileId.isEmpty() || groupId.isEmpty()) return@forEach
      result.getOrPut(profileId) { sortedMapOf() }[groupId] = timestamp
    }
    return result.takeIf { it.isNotEmpty() }
  }
}
