import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Switch, View } from 'react-native';

import { subscriptionPlans, subscriptionPrice, type BillingPeriod } from './premium-model';

import { AppText } from '@/components/ui/app-text';
import { Card } from '@/components/ui/card';
import { ChoiceChip } from '@/components/ui/choice-chip';
import { useDispoTheme } from '@/theme/theme-context';

export function SubscriptionPlans() {
  const { t, i18n } = useTranslation();
  const { palette } = useDispoTheme();
  const [period, setPeriod] = useState<BillingPeriod>('monthly');
  const [schoolPrices, setSchoolPrices] = useState(false);
  const price = (amount: number) =>
    new Intl.NumberFormat(i18n.resolvedLanguage ?? 'fr-CH', {
      style: 'currency',
      currency: 'CHF',
    }).format(amount / 100);
  return (
    <View style={styles.section}>
      <AppText variant="title2">{t('Les formules au lancement')}</AppText>
      <AppText color={palette.muted} variant="subheadline">
        {t(
          'Choisis un groupe ou toutes les possibilités. Tout reste inclus gratuitement pendant la bêta.',
        )}
      </AppText>
      <View style={styles.row}>
        {(['monthly', 'annual'] as const).map((value) => (
          <ChoiceChip
            key={value}
            label={t(value === 'monthly' ? 'Mensuel' : 'Annuel')}
            selected={period === value}
            onPress={() => setPeriod(value)}
          />
        ))}
      </View>
      {(['group', 'premium'] as const).map((tier) => (
        <Card
          key={tier}
          style={[styles.plan, tier === 'premium' && { borderColor: palette.electric }]}
        >
          <View style={styles.heading}>
            <AppText variant="headline">{subscriptionPlans[tier].name}</AppText>
            {tier === 'premium' ? (
              <Ionicons name="sparkles" size={18} color={palette.electric} />
            ) : null}
          </View>
          <View style={styles.priceRow}>
            <AppText variant="title2">
              {price(subscriptionPrice(tier, period, schoolPrices))}
            </AppText>
            <AppText color={palette.muted} variant="caption">
              {t(period === 'monthly' ? 'par mois' : 'par an')}
            </AppText>
          </View>
          <AppText variant="subheadline">
            {t(tier === 'group' ? 'Création d’un seul groupe' : 'Création de groupes illimités')}
          </AppText>
          <AppText color={palette.muted} variant="caption">
            {t(
              tier === 'group'
                ? 'La création d’un groupe, sans les avantages Premium ni le répertoire personnel.'
                : 'Tous les avantages Premium et le répertoire personnel inclus.',
            )}
          </AppText>
        </Card>
      ))}
      <Card style={styles.section}>
        <View style={styles.heading}>
          <View style={styles.flex}>
            <AppText variant="headline">{t('Écoles partenaires : −30 %')}</AppText>
            <AppText color={palette.muted} variant="caption">
              {t('Voir les tarifs partenaires')}
            </AppText>
          </View>
          <Switch
            accessibilityLabel={t('Voir les tarifs partenaires')}
            value={schoolPrices}
            onValueChange={setSchoolPrices}
            trackColor={{ true: palette.electric, false: palette.inset }}
          />
        </View>
        <AppText color={palette.muted} variant="caption">
          {t(
            'Réduction réservée aux membres des écoles de musique partenaires, après validation de leur affiliation.',
          )}
        </AppText>
      </Card>
      <AppText color={palette.muted} variant="caption">
        {t(
          'Rejoindre des groupes reste gratuit. Aucun abonnement ne peut être acheté pendant cette bêta.',
        )}
      </AppText>
    </View>
  );
}
const styles = StyleSheet.create({
  section: { gap: 14 },
  row: { flexDirection: 'row', gap: 8 },
  heading: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  plan: { gap: 12 },
  flex: { flex: 1, gap: 4 },
  priceRow: { flexDirection: 'row', alignItems: 'baseline', flexWrap: 'wrap', gap: 8 },
});
