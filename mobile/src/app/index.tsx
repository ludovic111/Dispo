import { Redirect } from 'expo-router';

import { LoadingState, Screen } from '@/components/ui/screen';
import { useAuth } from '@/features/auth/auth-context';

export default function IndexRoute() {
  const { isLoading, session } = useAuth();
  if (isLoading) {
    return (
      <Screen>
        <LoadingState label="Restauration de la session…" />
      </Screen>
    );
  }
  return <Redirect href={session ? '/(tabs)' : '/(auth)/sign-in'} />;
}
