import { Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { ProfileAvailabilityScreen } from '@/features/profiles/profile-availability-screen';

export default function ProfileAvailabilityRoute() {
  const { t } = useTranslation();
  return (
    <>
      <Stack.Screen
        options={{ headerShown: true, presentation: 'modal', title: t('Mes disponibilités') }}
      />
      <ProfileAvailabilityScreen />
    </>
  );
}
