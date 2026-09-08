import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { AppText } from '@/components/ui/app-text';
import { Card } from '@/components/ui/card';
import { DispoButton } from '@/components/ui/pressable';
import { useDispoTheme } from '@/theme/theme-context';

export function SubscriptionAccessCard({ groupCreation = false }: { groupCreation?: boolean }) {
  const { t } = useTranslation();
  const { palette } = useDispoTheme();
  return (
    <Card style={{ gap: 12 }}>
      <AppText variant="headline">
        {t(groupCreation ? 'Crée ton groupe' : 'Inclus avec Premium')}
      </AppText>
      <AppText color={palette.muted}>
        {t(
          groupCreation
            ? 'Groupe permet de diriger un groupe. Premium permet d’en diriger autant que tu veux.'
            : 'Ton contenu reste conservé. Premium débloque les ajouts, les modifications et le partage.',
        )}
      </AppText>
      <DispoButton onPress={() => router.push('/premium')}>{t('Voir les abonnements')}</DispoButton>
    </Card>
  );
}
