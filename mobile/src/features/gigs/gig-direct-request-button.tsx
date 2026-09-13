import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { useMyPendingDirectTargets } from './gig-queries';

import { DispoButton } from '@/components/ui/pressable';

/**
 * « Demander un dépannage » depuis une fiche : désactivé tant qu'une demande
 * directe envoyée à cette personne est encore en attente.
 */
export function GigDirectRequestButton({ profileId }: { profileId: string }) {
  const { t } = useTranslation();
  const pending = useMyPendingDirectTargets();
  const alreadyPending = pending.data?.includes(profileId) ?? false;
  return (
    <DispoButton
      disabled={alreadyPending}
      icon="flash"
      onPress={() => router.push(`/gigs/request?profileId=${profileId}` as never)}
      variant="signal"
    >
      {alreadyPending ? t('Demande en attente') : t('Demander un dépannage')}
    </DispoButton>
  );
}
