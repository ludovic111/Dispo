import Foundation

@main
enum LegacyPreferencesReaderTests {
  static func main() throws {
    let suiteName = "ch.dispo.tests.legacy-preferences.\(UUID().uuidString)"
    guard let defaults = UserDefaults(suiteName: suiteName) else {
      throw TestError.userDefaultsUnavailable
    }
    defer { defaults.removePersistentDomain(forName: suiteName) }

    precondition(LegacyPreferencesReader.read(defaults).notificationsEnabled == nil)

    defaults.set("fr", forKey: "jamconnect.language")
    defaults.set("dark", forKey: "jamconnect.theme")
    defaults.set(false, forKey: "jamconnect.notifications")
    defaults.set(true, forKey: "dispo.sosShowAll")
    let openedGigId = UUID(uuidString: "12345678-1234-1234-1234-1234567890ab")!
    defaults.set(try JSONEncoder().encode(Set([openedGigId])), forKey: "dispo.openedGigs")
    let lastSeen = Date(timeIntervalSince1970: 1_787_000_000.125)
    defaults.set(["group-1": lastSeen], forKey: "dispo.groups.lastSeen")
    defaults.set(["school-1": lastSeen], forKey: "dispo.schools.lastSeen")
    let pushData = try JSONSerialization.data(withJSONObject: [
      "groups": false,
      "messages": true,
      "sos": false,
    ])
    defaults.set(pushData, forKey: "dispo.pushPreferences")

    let values = LegacyPreferencesReader.read(defaults)
    precondition(values.groupLastSeen?["group-1"] == "2026-08-17T20:53:20.125Z")
    precondition(values.language == "fr")
    precondition(values.notificationsEnabled == false)
    precondition(values.openedGigIds == [openedGigId.uuidString])
    precondition(values.pushGroups == false)
    precondition(values.pushMessages == true)
    precondition(values.pushSos == false)
    precondition(values.schoolLastSeen?["school-1"] == "2026-08-17T20:53:20.125Z")
    precondition(values.sosShowAll == true)
    precondition(values.theme == "dark")
  }

  private enum TestError: Error {
    case userDefaultsUnavailable
  }
}
