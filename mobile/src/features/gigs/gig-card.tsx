import { Ionicons } from '@expo/vector-icons';
import { useIsFocused } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui/app-text';
import { DateTicket } from '@/components/ui/date-ticket';
import { Tag } from '@/components/ui/tag';
import { Barcode, TicketCard } from '@/components/ui/ticket-card';
import { useAuth } from '@/features/auth/auth-context';
import { GigMatchSummaryLine } from '@/features/gigs/gig-match-chips';
import { openGigInstruments, type GigMatchInfo, type GigSummary } from '@/features/gigs/gig-model';
import { useGigCandidateCount } from '@/features/gigs/gig-queries';
import { readableOn } from '@/theme/color';
import { useDispoTheme } from '@/theme/theme-context';
import { blend, onAccent, pressedStyle, spacing, tint } from '@/theme/tokens';

/** Largeur de la souche : le billet de date (52 pt) et sa marge, alignée sur la perforation. */
const stubWidth = 52 + spacing.sm * 2;

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

/**
 * Billet SOS du fil : papier clair du thème (`palette.paper`, fixe en clair
 * comme en sombre), encre choisie par contraste, perforation et code-barres
 * du `TicketCard`, VU-mètre de compatibilité quand l'annonce correspond.
 */
export function GigCard({
  gig,
  match,
  onPress,
}: {
  gig: GigSummary;
  /** Compatibilité du viewer avec cette annonce (fil « SOS »). */
  match?: GigMatchInfo | undefined;
  onPress: () => void;
}) {
  const { palette } = useDispoTheme();
  const { i18n, t } = useTranslation();
  const locale = i18n.resolvedLanguage ?? i18n.language ?? 'fr';
  const paper = palette.paper;
  const ink = readableOn(paper, [palette.ink, palette.paper, onAccent]);
  const inkMuted = blend(ink, paper, 0.42);
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
  const candidates = useGigCandidateCount(gig.id, canFindMatch);
  const hasMatch = canFindMatch && !candidates.isError && (candidates.data ?? 0) > 0;
  const viewerMatch = match && match.instruments.length > 0 ? match : null;
  const visibleInstruments = openInstruments.slice(0, 3);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${gig.title} · ${date.day} ${date.month} ${date.time} · ${gig.place} · ${openInstruments.map((instrument) => t(instrument)).join(', ')}${hasMatch ? ` · ${t('Musicien compatible')}` : ''}${viewerMatch ? ` · ${t('Match {{score}} %', { score: viewerMatch.score })}` : ''}`}
      accessibilityHint={
        hasMatch ? t('Musicien compatible : ouvre le SOS pour envoyer une demande') : undefined
      }
      onPress={onPress}
      style={({ pressed }) => pressed && pressedStyle}
    >
      <TicketCard backgroundColor={paper} notchFromTrailing={stubWidth}>
        <View style={styles.row}>
          <View style={styles.content}>
            <View style={styles.topline}>
              <Ionicons color={palette.signal} name="flash" size={12} />
              <AppText color={palette.signal} engraved={false} numberOfLines={1} variant="label">
                {t(gig.genre)}
              </AppText>
              {gig.isFresh ? <Tag color={palette.signal} label={t('Nouveau')} /> : null}
              {(gig.pendingApplicantCount ?? 0) > 0 ? (
                <Tag
                  color={palette.signal}
                  label={t('{{count}} à traiter', { count: gig.pendingApplicantCount })}
                />
              ) : null}
              {gig.targetId ? (
                <Tag
                  color={inkMuted}
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
            <AppText color={ink} numberOfLines={2} variant="title">
              {gig.title}
            </AppText>
            <View style={styles.meta}>
              <Ionicons color={inkMuted} name="location-outline" size={13} />
              <AppText color={inkMuted} numberOfLines={1} variant="caption">
                {gig.place}
              </AppText>
            </View>
            <View style={styles.instruments}>
              <AppText color={inkMuted} engraved={false} variant="label">
                {t('Cherche')}
              </AppText>
              {visibleInstruments.map((instrument) => (
                <Tag color={inkMuted} key={instrument} label={t(instrument)} />
              ))}
              {openInstruments.length > 3 ? (
                <Tag color={inkMuted} label={`+${openInstruments.length - 3}`} />
              ) : null}
              {openInstruments.length === 0 ? (
                <Tag color={palette.jam} label={t('Complet')} />
              ) : null}
            </View>
            {viewerMatch ? (
              <GigMatchSummaryLine color={palette.jam} ink={ink} match={viewerMatch} />
            ) : null}
          </View>
          <View style={[styles.stub, hasMatch && { backgroundColor: tint(palette.jam, 0.18) }]}>
            {hasMatch ? (
              <View
                pointerEvents="none"
                style={[styles.matchBorder, { backgroundColor: palette.jam }]}
              />
            ) : null}
            <DateTicket color={palette.signal} date={gig.date} />
            <AppText color={inkMuted} engraved={false} variant="label">
              {date.time}
            </AppText>
            <Barcode seed={gig.title} />
            {hasMatch ? (
              <Ionicons
                accessibilityLabel={t('Musicien compatible')}
                color={palette.jam}
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
  row: { alignItems: 'stretch', flexDirection: 'row' },
  stub: {
    alignItems: 'center',
    gap: spacing.xxs,
    justifyContent: 'center',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    width: stubWidth,
  },
  topline: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: spacing.tight },
});
