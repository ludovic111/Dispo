export interface LegacyNativePreferences {
  groupLastSeen?: Record<string, string> | null;
  groupLastSeenByProfile?: Record<string, Record<string, string>> | null;
  language: string | null;
  notificationsEnabled: boolean | null;
  openedGigIds?: string[] | null;
  pushGroups: boolean | null;
  pushMessages: boolean | null;
  pushSos: boolean | null;
  schoolLastSeen?: Record<string, string> | null;
  sosShowAll: boolean | null;
  theme: string | null;
}
