import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Alert, Platform, StyleSheet, View } from 'react-native';

import { subscriptionPlans } from './premium-model';
import { SchoolGrantCard } from './school-grant-card';
import { useSubscription } from './subscription-queries';
import {
  loadStoreProducts,
  manageSubscriptions,
  purchaseSubscription,
  redeemSchoolOffer,
  restoreSubscriptions,
  storefrontProductIds,
  storeProductFor,
} from './subscription-service';

import { AppText } from '@/components/ui/app-text';
import { Card } from '@/components/ui/card';
import { LegalLinks } from '@/components/ui/legal-links';
import { DispoButton } from '@/components/ui/pressable';
import { SectionHeader } from '@/components/ui/section';
import { Tag } from '@/components/ui/tag';
import { useAuth } from '@/features/auth/auth-context';
import { useDispoTheme } from '@/theme/theme-context';
import { spacing } from '@/theme/tokens';

export function SubscriptionPlans() {
  const { t } = useTranslation();
  const { session } = useAuth();
  const userId = session?.user.id ?? '';
  const { palette } = useDispoTheme();
  const client = useQueryClient();
  const subscription = useSubscription();
  const grantActive = subscription.data?.source === 'school_grant';
  const products = useQuery({
    queryKey: ['store-products', userId],
    enabled: Boolean(userId) && Platform.OS === 'ios' && !grantActive,
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
      const product = storeProductFor(products.data ?? [], tier);
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
    !grantActive &&
    (products.isError ||
      (Platform.OS === 'ios' &&
        !products.isPending &&
        products.data?.length !== storefrontProductIds.length));
  return (
    <View style={styles.section}>
      <SectionHeader
        subtitle={t('Rejoindre des groupes, échanger et répondre aux SOS reste gratuit.')}
        title={t('Choisis ta formule')}
      />
      {subscription.data ? <SchoolGrantCard subscription={subscription.data} /> : null}
      {subscription.data?.tier !== 'free' && subscription.data && !grantActive ? (
        <Card>
          <AppText variant="headline">
            {t('Formule actuelle')} : {subscriptionPlans[subscription.data.tier].name}
          </AppText>
        </Card>
      ) : null}
      {grantActive
        ? null
        : (['group', 'premium'] as const).map((tier) => {
            const product = storeProductFor(products.data ?? [], tier);
            const current = subscription.data?.tier === tier;
            return (
              <Card
                key={tier}
                style={[
                  styles.plan,
                  tier === 'premium' && { borderColor: palette.accent, borderWidth: 1 },
                ]}
                tone={tier === 'premium' ? 'elevated' : 'default'}
              >
                <View style={styles.heading}>
                  <AppText style={styles.planName} variant="title3">
                    {subscriptionPlans[tier].name}
                  </AppText>
                  {tier === 'premium' ? (
                    <Tag color={palette.accent} icon="star" label={t('Conseillé')} tone="solid" />
                  ) : current ? (
                    <Tag color={palette.jam} icon="checkmark-circle" label={t('Formule active')} />
                  ) : null}
                </View>
                <View style={styles.priceRow}>
                  <AppText variant="display">{product?.priceString ?? '—'}</AppText>
                  <AppText color={palette.bronze} variant="label">
                    {t('par mois')}
                  </AppText>
                </View>
                <AppText variant="subheadline">
                  {t(
                    tier === 'group'
                      ? 'Création d’un seul groupe'
                      : 'Jusqu’à 6 groupes, répertoire personnel et 6 vidéos',
                  )}
                </AppText>
                <AppText color={palette.muted} variant="footnote">
                  {t(
                    tier === 'group'
                      ? 'La création d’un groupe, sans le répertoire personnel ni les vidéos supplémentaires.'
                      : 'Dirige jusqu’à 6 groupes, garde ton répertoire personnel et présente jusqu’à 6 vidéos de 1 min 30.',
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
          <AppText color={palette.muted} variant="footnote">
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
          {grantActive ? null : (
            <Card style={styles.section}>
              <SectionHeader
                subtitle={t(
                  'Utilise le code fourni par ton école partenaire. Apple affiche le tarif réduit, sa durée et le prix de renouvellement avant confirmation.',
                )}
                title={t('Écoles partenaires')}
              />
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
          )}
        </>
      )}
      <AppText color={palette.muted} variant="caption">
        {t(
          'Abonnement renouvelé automatiquement chaque mois. Le paiement est débité de ton compte Apple. Tu peux gérer ou annuler le renouvellement dans les réglages de ton compte App Store avant la fin de la période en cours.',
        )}
      </AppText>
      <LegalLinks />
    </View>
  );
}
const styles = StyleSheet.create({
  heading: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
    justifyContent: 'space-between',
  },
  plan: { gap: spacing.sm },
  planName: { flexShrink: 1 },
  priceRow: { alignItems: 'baseline', flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  section: { gap: spacing.md },
});
