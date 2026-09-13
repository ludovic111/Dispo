import { Ionicons } from '@expo/vector-icons';
import { useIsFocused } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui/app-text';
import { DateTicket } from '@/components/ui/date-ticket';
import { Tag } from '@/components/ui/tag';
import { Barcode, TicketCard } from '@/components/ui/ticket-card';
import { useAuth } from '@/features/auth/auth-context';
import { openGigInstruments, type GigSummary } from '@/features/gigs/gig-model';
import { useGigMatches } from '@/features/gigs/gig-queries';
import { useDispoTheme } from '@/theme/theme-context';
import { billetInk, lightPalette, pressedStyle, radii, spacing, tint } from '@/theme/tokens';

/** Le billet SOS est une surface claire fixe dans les deux thèmes : encre `billetInk`, accents clairs. */
const billet = lightPalette;

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
  const { palette } = useDispoTheme();
  const { i18n, t } = useTranslation();
  const locale = i18n.resolvedLanguage ?? i18n.language ?? 'fr';
  const date = formatGigDate(gig.date, locale);
  const openInstruments = openGigInstruments(gig);
  const { session } = useAuth();
  const focused = useIsFocused();
  const canFindMatch =
    focused &&
    gig.hostId === session?.user.id &&
    !gig.targetId &&
    openInstruments.length > 0 &&
    Date.parse(gig.date) > new Date().getTime();
  const matches = useGigMatches(canFindMatch ? gig.id : '', canFindMatch ? 30_000 : false);
  const hasMatch =
    canFindMatch &&
    !matches.isError &&
    Boolean(
      matches.data?.pages.some((page) =>
        page.items.some((match) =>
          match.matchingInstruments.some((instrument) => openInstruments.includes(instrument)),
        ),
      ),
    );
  const visibleInstruments = openInstruments.slice(0, 3);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${gig.title} · ${date.day} ${date.month} ${date.time} · ${gig.place} · ${openInstruments.map((instrument) => t(instrument)).join(', ')}${hasMatch ? ` · ${t('Musicien compatible')}` : ''}`}
      accessibilityHint={
        hasMatch ? t('Musicien compatible : ouvre le SOS pour envoyer une demande') : undefined
      }
      onPress={onPress}
      style={({ pressed }) => pressed && pressedStyle}
    >
      <TicketCard>
        <View style={styles.row}>
          <View style={styles.content}>
            <View style={styles.topline}>
              <View style={[styles.signalDot, { backgroundColor: billet.signal }]} />
              <AppText color={billet.signal} numberOfLines={1} variant="label">
                {t(gig.genre)}
              </AppText>
              {gig.isFresh ? <Tag color={billet.signal} label={t('Nouveau')} /> : null}
              {(gig.pendingApplicantCount ?? 0) > 0 ? (
                <Tag
                  color={billet.signal}
                  label={t('{{count}} à traiter', { count: gig.pendingApplicantCount })}
                />
              ) : null}
              {gig.targetId ? (
                <Tag
                  color={billet.bronze}
                  label={
                    gig.targetStatus === 'accepted'
                      ? t('Demande acceptée')
                      : gig.targetStatus === 'declined'
                        ? t('Demande refusée')
                        : t('Réponse en attente')
                  }
                />
              ) : null}
            </View>
            <AppText color={billetInk} numberOfLines={2} variant="title">
              {gig.title}
            </AppText>
            <View style={styles.meta}>
              <Ionicons color={billet.muted} name="location-outline" size={13} />
              <AppText color={billet.muted} numberOfLines={1} variant="caption">
                {gig.place}
              </AppText>
            </View>
            <View style={styles.instruments}>
              <AppText color={billet.muted} variant="label">
                {t('Cherche')}
              </AppText>
              {visibleInstruments.map((instrument) => (
                <Tag color={billet.bronze} key={instrument} label={t(instrument)} />
              ))}
              {openInstruments.length > 3 ? (
                <Tag color={billet.bronze} label={`+${openInstruments.length - 3}`} />
              ) : null}
              {openInstruments.length === 0 ? (
                <Tag color={billet.jam} label={t('Complet')} />
              ) : null}
            </View>
          </View>
          <View style={[styles.stub, hasMatch && { backgroundColor: tint(billet.jam, 0.18) }]}>
            {hasMatch ? (
              <View
                pointerEvents="none"
                style={[styles.matchBorder, { backgroundColor: billet.jam }]}
              />
            ) : null}
            <View
              style={[
                styles.perforation,
                { borderColor: hasMatch ? billet.jam : tint(billetInk, 0.28) },
              ]}
            />
            <DateTicket color={palette.signal} date={gig.date} />
            <AppText color={billet.muted} variant="label">
              {date.time}
            </AppText>
            <Barcode seed={gig.title} />
            {hasMatch ? (
              <Ionicons
                accessibilityLabel={t('Musicien compatible')}
                color={billet.jam}
                name="person-add"
                size={16}
              />
            ) : null}
          </View>
        </View>
      </TicketCard>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  content: { flex: 1, gap: spacing.xs, padding: spacing.sm },
  instruments: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xxs },
  matchBorder: {
    bottom: 0,
    position: 'absolute',
    right: 0,
    top: 0,
    width: spacing.xxs,
  },
  meta: { alignItems: 'center', flexDirection: 'row', gap: spacing.xxs },
  perforation: {
    borderLeftWidth: 1.5,
    borderStyle: 'dashed',
    bottom: spacing.xxs,
    left: 0,
    position: 'absolute',
    top: spacing.xxs,
  },
  row: { alignItems: 'stretch', flexDirection: 'row' },
  signalDot: { borderRadius: radii.round, height: 7, width: 7 },
  stub: {
    alignItems: 'center',
    gap: spacing.xxs,
    justifyContent: 'center',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  topline: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: spacing.tight },
});
