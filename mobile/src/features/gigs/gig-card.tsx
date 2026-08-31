import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui/app-text';
import { Tag } from '@/components/ui/tag';
import { Barcode, TicketCard } from '@/components/ui/ticket-card';
import { openGigInstruments, type GigSummary } from '@/features/gigs/gig-model';
import { billetInk, spacing, typography } from '@/theme/tokens';

function formatGigDate(
  value: string,
  locale: string,
): { day: string; month: string; time: string } {
  const date = new Date(value);
  return {
    day: new Intl.DateTimeFormat(locale, { day: '2-digit' }).format(date),
    month: new Intl.DateTimeFormat(locale, { month: 'short' })
      .format(date)
      .replace(/\.$/, '')
      .toLocaleUpperCase(locale),
    time: new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit' }).format(date),
  };
}

export function GigCard({ gig, onPress }: { gig: GigSummary; onPress: () => void }) {
  const { i18n, t } = useTranslation();
  const locale = i18n.resolvedLanguage ?? i18n.language ?? 'fr';
  const date = formatGigDate(gig.date, locale);
  const openInstruments = openGigInstruments(gig);
  const visibleInstruments = openInstruments.slice(0, 3);
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => pressed && styles.pressed}
    >
      <TicketCard>
        <View style={styles.row}>
          <View style={styles.content}>
            <View style={styles.topline}>
              <View style={styles.signalDot} />
              <AppText color="#B33D17" numberOfLines={1} style={styles.genre}>
                {t(gig.genre)}
              </AppText>
              {gig.isFresh ? <Tag color="#B33D17" label={t('Nouveau')} /> : null}
            </View>
            <AppText color={billetInk} numberOfLines={2} variant="title">
              {gig.title}
            </AppText>
            <View style={styles.meta}>
              <Ionicons color="rgba(5,8,20,0.62)" name="location-outline" size={13} />
              <AppText color="rgba(5,8,20,0.62)" numberOfLines={1} variant="caption">
                {gig.place}
              </AppText>
            </View>
            <View style={styles.instruments}>
              <AppText color="rgba(5,8,20,0.45)" style={styles.seek}>
                {t('CHERCHE')}
              </AppText>
              {visibleInstruments.map((instrument) => (
                <Tag color="#475569" key={instrument} label={t(instrument)} />
              ))}
              {openInstruments.length > 3 ? (
                <Tag color="#475569" label={`+${openInstruments.length - 3}`} />
              ) : null}
              {openInstruments.length === 0 ? <Tag color="#05856E" label={t('Complet')} /> : null}
            </View>
          </View>
          <View style={styles.stub}>
            <View style={styles.perforation} />
            <AppText color={billetInk} style={styles.day}>
              {date.day}
            </AppText>
            <AppText color={billetInk} style={styles.month}>
              {date.month}
            </AppText>
            <AppText color="rgba(5,8,20,0.60)" style={styles.time}>
              {date.time}
            </AppText>
            <Barcode seed={gig.title} />
          </View>
        </View>
      </TicketCard>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  content: { flex: 1, gap: 7, padding: 13 },
  day: { fontFamily: typography.display, fontSize: 24, lineHeight: 28 },
  genre: {
    fontFamily: typography.monoSemibold,
    fontSize: 9,
    letterSpacing: 1.4,
    textTransform: 'uppercase',
  },
  instruments: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: 5 },
  meta: { alignItems: 'center', flexDirection: 'row', gap: 3 },
  month: {
    fontFamily: typography.monoSemibold,
    fontSize: 10,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  perforation: {
    borderColor: 'rgba(5,8,20,0.28)',
    borderLeftWidth: 1.5,
    borderStyle: 'dashed',
    bottom: 4,
    left: 0,
    position: 'absolute',
    top: 4,
  },
  pressed: { opacity: 0.94, transform: [{ scale: 0.97 }] },
  row: { alignItems: 'stretch', flexDirection: 'row', minHeight: 126 },
  seek: {
    fontFamily: typography.mono,
    fontSize: 9,
    letterSpacing: 1,
  },
  signalDot: { backgroundColor: '#B33D17', borderRadius: 4, height: 7, width: 7 },
  stub: {
    alignItems: 'center',
    gap: 2,
    justifyContent: 'center',
    paddingHorizontal: spacing.xs,
    width: 74,
  },
  time: { fontFamily: typography.mono, fontSize: 10, marginBottom: 4 },
  topline: { alignItems: 'center', flexDirection: 'row', gap: 6 },
});
