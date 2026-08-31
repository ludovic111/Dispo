import Foundation

struct LegacyPreferencesValues {
  let groupLastSeen: [String: String]?
  let language: String?
  let notificationsEnabled: Bool?
  let openedGigIds: [String]?
  let pushGroups: Bool?
  let pushMessages: Bool?
  let pushSos: Bool?
  let schoolLastSeen: [String: String]?
  let sosShowAll: Bool?
  let theme: String?
}

enum LegacyPreferencesReader {
  private static let groupLastSeenKey = "dispo.groups.lastSeen"
  private static let languageKey = "jamconnect.language"
  private static let lastSeenVersionKey = "jamconnect.lastSeenVersion"
  private static let notificationsKey = "jamconnect.notifications"
  private static let onboardedKey = "jamconnect.onboarded"
  private static let openedGigsKey = "dispo.openedGigs"
  private static let pushPreferencesKey = "dispo.pushPreferences"
  private static let schoolLastSeenKey = "dispo.schools.lastSeen"
  private static let sosShowAllKey = "dispo.sosShowAll"
  private static let themeKey = "jamconnect.theme"

  static func read(_ defaults: UserDefaults) -> LegacyPreferencesValues {
    let hasLegacyApp = defaults.object(forKey: lastSeenVersionKey) != nil
      || defaults.object(forKey: onboardedKey) != nil
      || defaults.object(forKey: themeKey) != nil
      || defaults.object(forKey: languageKey) != nil

    var push: [String: Any] = [:]
    if let data = defaults.data(forKey: pushPreferencesKey),
       let decoded = try? JSONSerialization.jsonObject(with: data) as? [String: Any] {
      push = decoded
    }

    let openedGigIds: [String]?
    if let data = defaults.data(forKey: openedGigsKey),
       let decoded = try? JSONDecoder().decode(Set<UUID>.self, from: data) {
      openedGigIds = decoded.map(\.uuidString).sorted()
    } else {
      openedGigIds = nil
    }

    let groupLastSeen = iso8601Dates(defaults.dictionary(forKey: groupLastSeenKey))
    let schoolLastSeen = iso8601Dates(defaults.dictionary(forKey: schoolLastSeenKey))

    return LegacyPreferencesValues(
      groupLastSeen: groupLastSeen,
      language: defaults.string(forKey: languageKey),
      notificationsEnabled: hasLegacyApp ? defaults.bool(forKey: notificationsKey) : nil,
      openedGigIds: openedGigIds,
      pushGroups: push["groups"] as? Bool,
      pushMessages: push["messages"] as? Bool,
      pushSos: push["sos"] as? Bool,
      schoolLastSeen: schoolLastSeen,
      sosShowAll: defaults.object(forKey: sosShowAllKey) == nil
        ? nil
        : defaults.bool(forKey: sosShowAllKey),
      theme: defaults.string(forKey: themeKey)
    )
  }

  private static func iso8601Dates(_ dictionary: [String: Any]?) -> [String: String]? {
    guard let dates = dictionary as? [String: Date] else { return nil }
    let formatter = ISO8601DateFormatter()
    formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    return dates.mapValues(formatter.string(from:))
  }
}
