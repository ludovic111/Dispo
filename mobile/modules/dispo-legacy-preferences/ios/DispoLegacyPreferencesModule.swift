import ExpoModulesCore

private struct LegacyPreferencesResult: Record {
  @Field var groupLastSeen: [String: String]?
  @Field var language: String?
  @Field var notificationsEnabled: Bool?
  @Field var openedGigIds: [String]?
  @Field var pushGroups: Bool?
  @Field var pushMessages: Bool?
  @Field var pushSos: Bool?
  @Field var schoolLastSeen: [String: String]?
  @Field var sosShowAll: Bool?
  @Field var theme: String?
}

public final class DispoLegacyPreferencesModule: Module {
  public func definition() -> ModuleDefinition {
    Name("DispoLegacyPreferences")

    Function("readAsync") { () -> LegacyPreferencesResult in
      let values = LegacyPreferencesReader.read(UserDefaults.standard)
      let result = LegacyPreferencesResult()
      result.groupLastSeen = values.groupLastSeen
      result.language = values.language
      result.notificationsEnabled = values.notificationsEnabled
      result.openedGigIds = values.openedGigIds
      result.pushGroups = values.pushGroups
      result.pushMessages = values.pushMessages
      result.pushSos = values.pushSos
      result.schoolLastSeen = values.schoolLastSeen
      result.sosShowAll = values.sosShowAll
      result.theme = values.theme
      return result
    }
  }
}
