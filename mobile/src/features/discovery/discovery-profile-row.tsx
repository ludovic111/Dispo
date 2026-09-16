import { router } from 'expo-router';

import type { ProfileSummary, SchoolAffiliation } from '@/domain/profile';
import { CompactProfileCard } from '@/features/profiles/compact-profile-card';

export function DiscoveryProfileRow({
  filterMatchPercent,
  primarySchool,
  profile,
  referenceProfile,
}: {
  filterMatchPercent?: number | null;
  primarySchool?: SchoolAffiliation | null;
  profile: ProfileSummary;
  referenceProfile?: ProfileSummary | null;
}) {
  return (
    <CompactProfileCard
      filterMatchPercent={filterMatchPercent}
      primarySchool={primarySchool}
      profile={profile}
      referenceProfile={referenceProfile}
      onPress={() => router.push(`/profiles/${profile.id}`)}
    />
  );
}
