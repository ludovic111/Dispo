import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Platform, StyleSheet, View } from 'react-native';

import { subscriptionPlans, type BillingPeriod } from './premium-model';
import { useSubscription } from './subscription-queries';
import {
  loadStoreProducts,
  manageSubscriptions,
  purchaseSubscription,
  redeemSchoolOffer,
  restoreSubscriptions,
  storeProductFor,
} from './subscription-service';

import { AppText } from '@/components/ui/app-text';
import { Card } from '@/components/ui/card';
import { ChoiceChip } from '@/components/ui/choice-chip';
import { LegalLinks } from '@/components/ui/legal-links';
import { DispoButton } from '@/components/ui/pressable';
import { useAuth } from '@/features/auth/auth-context';
import { useDispoTheme } from '@/theme/theme-context';

export function SubscriptionPlans() {
  const { t } = useTranslation();
  const { session } = useAuth();
  const userId = session?.user.id ?? '';
  const { palette } = useDispoTheme();
  const client = useQueryClient();
  const subscription = useSubscription();
  const [period, setPeriod] = useState<BillingPeriod>('monthly');
  const products = useQuery({
    queryKey: ['store-products', userId],
    enabled: Boolean(userId) && Platform.OS === 'ios',
    queryFn: () => loadStoreProducts(userId),
    retry: 1,
  });
  const refresh = async () => {
    await Promise.all([
      client.invalidateQueries({ queryKey: ['subscription', userId] }),
      client.invalidateQueries({ queryKey: ['profiles'] }),
      client.invalidateQueries({ queryKey: ['personal-repertoire', userId] }),
    ]);
  };
  const purchase = useMutation({
    mutationFn: (tier: 'group' | 'premium') => {
      const product = storeProductFor(products.data ?? [], tier, period);
      if (!product) throw new Error('product_unavailable');
      return purchaseSubscription(userId, product);
    },
    onSuccess: refresh,
    onError: (error) => {
      if (
        typeof error === 'object' &&
        error !== null &&
        'userCancelled' in error &&
        error.userCancelled
      )
        return;
      Alert.alert(
        t('Achat non confirmé'),
        t(
          'Si Apple a confirmé ton achat, utilise Restaurer les achats pour actualiser tes droits. Aucun second achat n’est nécessaire.',
        ),
      );
    },
  });
  const restore = useMutation({
    mutationFn: () => restoreSubscriptions(userId),
    onSuccess: async (state) => {
      await refresh();
      Alert.alert(
        t(state.tier === 'free' ? 'Aucun abonnement actif' : 'Achats restaurés'),
        t('Tes droits ont été actualisés.'),
      );
    },
    onError: () => Alert.alert(t('La restauration a échoué. Réessaie dans un instant.')),
  });
  const busy = purchase.isPending || restore.isPending;
  const error =
    products.isError ||
    (Platform.OS === 'ios' && !products.isPending && products.data?.length !== 4);
  return (
    <View style={styles.section}>
      <AppText variant="title2">{t('Choisis ta formule')}</AppText>
      <AppText color={palette.muted} variant="subheadline">
        {t('Rejoindre des groupes, échanger et répondre aux SOS reste gratuit.')}
      </AppText>
      {subscription.data?.tier !== 'free' && subscription.data ? (
        <Card>
          <AppText variant="headline">
            {t('Formule actuelle')} : {subscriptionPlans[subscription.data.tier].name}
          </AppText>
        </Card>
      ) : null}
      <View style={styles.row}>
        {(['monthly', 'annual'] as const).map((value) => (
          <ChoiceChip
            key={value}
            label={t(value === 'monthly' ? 'Mensuel' : 'Annuel')}
            selected={period === value}
            onPress={() => {
              if (!busy) setPeriod(value);
            }}
          />
        ))}
      </View>
      {(['group', 'premium'] as const).map((tier) => {
        const product = storeProductFor(products.data ?? [], tier, period);
        const current = subscription.data?.tier === tier;
        return (
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
              <AppText variant="title2">{product?.priceString ?? '—'}</AppText>
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
            <DispoButton
              disabled={!product || busy || current}
              loading={purchase.isPending && purchase.variables === tier}
              onPress={() => purchase.mutate(tier)}
            >
              {t(current ? 'Formule active' : 'S’abonner')}
            </DispoButton>
          </Card>
        );
      })}
      {error ? (
        <Card style={styles.section}>
          <AppText variant="caption" color={palette.muted}>
            {t(
              'Les tarifs Apple ne sont pas disponibles pour le moment. Aucun achat n’a été lancé.',
            )}
          </AppText>
          <DispoButton variant="secondary" onPress={() => void products.refetch()}>
            {t('Réessayer')}
          </DispoButton>
        </Card>
      ) : null}
      {Platform.OS !== 'ios' ? (
        <AppText color={palette.muted} variant="caption">
          {t(
            'Les achats sont disponibles dans l’app iOS. Tes droits sont partagés entre tes appareils.',
          )}
        </AppText>
      ) : (
        <>
          <DispoButton
            variant="secondary"
            disabled={busy}
            loading={restore.isPending}
            onPress={() => restore.mutate()}
          >
            {t('Restaurer les achats')}
          </DispoButton>
          <DispoButton
            variant="secondary"
            disabled={busy}
            onPress={() =>
              void manageSubscriptions(userId).catch(() =>
                Alert.alert(t('Ce lien n’a pas pu être ouvert.')),
              )
            }
          >
            {t('Gérer mon abonnement')}
          </DispoButton>
          <Card style={styles.section}>
            <AppText variant="headline">{t('Écoles partenaires')}</AppText>
            <AppText color={palette.muted} variant="caption">
              {t(
                'Utilise le code fourni par ton école partenaire. Apple affiche le tarif réduit, sa durée et le prix de renouvellement avant confirmation.',
              )}
            </AppText>
            <DispoButton
              variant="secondary"
              disabled={busy}
              onPress={() =>
                void redeemSchoolOffer(userId).catch(() =>
                  Alert.alert(t('Le code n’a pas pu être ouvert.')),
                )
              }
            >
              {t('Utiliser un code école')}
            </DispoButton>
          </Card>
        </>
      )}
      <AppText color={palette.muted} variant="caption">
        {t(
          'Abonnement renouvelé automatiquement chaque mois ou chaque année. Le paiement est débité de ton compte Apple. Tu peux gérer ou annuler le renouvellement dans les réglages de ton compte App Store avant la fin de la période en cours.',
        )}
      </AppText>
      <LegalLinks />
    </View>
  );
}
const styles = StyleSheet.create({
  section: { gap: 14 },
  row: { flexDirection: 'row', gap: 8 },
  heading: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  plan: { gap: 12 },
  priceRow: { flexDirection: 'row', alignItems: 'baseline', flexWrap: 'wrap', gap: 8 },
});
