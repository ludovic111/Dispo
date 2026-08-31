import { useSchoolCommunities, useSchoolRealtimeSync } from './school-queries';

/** Keeps school message summaries and memberships current outside their screens. */
export function SchoolRealtimeBridge() {
  const communities = useSchoolCommunities();
  useSchoolRealtimeSync(communities.data);
  return null;
}
