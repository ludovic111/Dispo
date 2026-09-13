import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { StyleSheet } from 'react-native';

import { AppText } from '@/components/ui/app-text';
import { Card } from '@/components/ui/card';
import { DispoButton } from '@/components/ui/pressable';
import { useDispoTheme } from '@/theme/theme-context';
import { spacing } from '@/theme/tokens';

export function SubscriptionAccessCard({ groupCreation = false }: { groupCreation?: boolean }) {
  const { t } = useTranslation();
  const { palette } = useDispoTheme();
  return (
    <Card style={styles.card} tone="elevated">
      <AppText variant="headline">
        {t(groupCreation ? 'Crée ton groupe' : 'Inclus avec Premium')}
      </AppText>
      <AppText color={palette.muted}>
        {t(
          groupCreation
            ? 'Groupe permet de diriger un groupe. Premium permet d’en diriger jusqu’à 6.'
            : 'Ton contenu reste conservé. Premium débloque les ajouts, les modifications et le partage.',
        )}
      </AppText>
      <DispoButton onPress={() => router.push('/premium')}>{t('Voir les abonnements')}</DispoButton>
    </Card>
  );
}

const styles = StyleSheet.create({ card: { gap: spacing.sm } });
