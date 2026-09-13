import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { formatGrantDate, schoolGrantNotice } from './school-grant-model';
import type { SubscriptionState } from './subscription-service';

import { AppText } from '@/components/ui/app-text';
import { Barcode, TicketCard } from '@/components/ui/ticket-card';
import { billetInk, spacing, tint } from '@/theme/tokens';

const stubWidth = 74;

/**
 * Premium offert par une école partenaire : un billet imprimé (papier fixe,
 * encoches, perforation), avec la souche qui porte l'école et l'échéance.
 * Fenêtre active, ou annoncée avant son ouverture.
 */
export function SchoolGrantCard({ subscription }: { subscription: SubscriptionState }) {
  const { i18n, t } = useTranslation();
  const notice = schoolGrantNotice(subscription);
  if (!notice) return null;
  const locale = i18n.resolvedLanguage ?? i18n.language ?? 'fr';
  const end = formatGrantDate(notice.endsAt, locale);
  const muted = tint(billetInk, 0.62);
  return (
    <TicketCard notchFromTrailing={stubWidth}>
      <View accessible style={styles.ticket}>
        <View style={styles.body}>
          <View style={styles.label}>
            <Ionicons color={muted} name="school" size={12} />
            <AppText color={muted} engraved={false} variant="label">
              {t('Offert')} · {notice.schoolShortName}
            </AppText>
          </View>
          <AppText color={billetInk} numberOfLines={3} variant="title3">
            {notice.kind === 'active'
              ? t('Premium offert par {{school}} jusqu’au {{date}}', {
                  date: end,
                  school: notice.schoolShortName,
                })
              : t('Dès le {{start}}, Premium offert aux membres {{school}} jusqu’au {{end}}', {
                  end,
                  school: notice.schoolShortName,
                  start: formatGrantDate(notice.startsAt, locale),
                })}
          </AppText>
          <AppText color={muted} variant="footnote">
            {t(
              notice.kind === 'active'
                ? 'Tous les avantages Premium sont actifs sans achat tant que ton affiliation reste active.'
                : 'Garde ton affiliation active dans ton profil : Premium s’activera tout seul, sans achat.',
            )}
          </AppText>
        </View>
        <View style={styles.stub}>
          <AppText color={billetInk} engraved={false} variant="label">
            {notice.kind === 'active' ? t('Actif') : t('Bientôt')}
          </AppText>
          <Barcode seed={`${notice.schoolShortName}-${notice.endsAt}`} />
        </View>
      </View>
    </TicketCard>
  );
}

const styles = StyleSheet.create({
  body: { flex: 1, gap: spacing.xs, padding: spacing.md },
  label: { alignItems: 'center', flexDirection: 'row', gap: spacing.tight },
  stub: {
    alignItems: 'center',
    gap: spacing.sm,
    justifyContent: 'center',
    paddingHorizontal: spacing.xs,
    width: stubWidth,
  },
  ticket: { flexDirection: 'row' },
});
