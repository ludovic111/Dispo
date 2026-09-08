import { router } from 'expo-router';

import type { ProfileSummary, SchoolAffiliation } from '@/domain/profile';
import { CompactProfileCard } from '@/features/profiles/compact-profile-card';

export function DiscoveryProfileRow({
  primarySchool,
  profile,
  referenceProfile,
}: {
  primarySchool?: SchoolAffiliation | null;
  scopeDate?: string | null;
  profile: ProfileSummary;
  referenceProfile?: ProfileSummary | null;
}) {
  return (
    <CompactProfileCard
      primarySchool={primarySchool}
      profile={profile}
      referenceProfile={referenceProfile}
      onPress={() => router.push(`/profiles/${profile.id}`)}
    />
  );
}
