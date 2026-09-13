import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { AppText } from './app-text';

import { readableOn } from '@/theme/color';
import { useDispoTheme } from '@/theme/theme-context';
import { blend, keyEdgeWidth, keyHighlight, onAccent, radii, spacing } from '@/theme/tokens';

/**
 * Bloc de date « billet » : jour en Fraunces, mois en mono gravé, jour de
 * semaine optionnel. Même objet visuel sur l'accueil, les sessions, les
 * événements de groupe et les SOS. La couleur porte le type (concert,
 * répétition, jam, SOS) ; l'encre est choisie pour rester lisible dessus,
 * dans n'importe quel thème.
 */
export function DateTicket({
  color,
  date,
  size = 'regular',
  weekday = false,
}: {
  color: string;
  date: Date | string;
  /** `regular` (52 pt) pour les listes, `large` (64 pt) pour la prochaine date mise en avant. */
  size?: 'regular' | 'large' | undefined;
  weekday?: boolean | undefined;
}) {
  const { i18n } = useTranslation();
  const { palette } = useDispoTheme();
  const locale = i18n.resolvedLanguage ?? i18n.language ?? 'fr';
  const value = typeof date === 'string' ? new Date(date) : date;
  const day = new Intl.DateTimeFormat(locale, { day: '2-digit' }).format(value);
  const month = new Intl.DateTimeFormat(locale, { month: 'short' })
    .format(value)
    .replace('.', '')
    .toUpperCase();
  const weekdayLabel = weekday
    ? new Intl.DateTimeFormat(locale, { weekday: 'short' }).format(value).replace('.', '')
    : null;
  const large = size === 'large';
  const ink = readableOn(color, [palette.ink, palette.paper, onAccent]);
  const edge = blend(color, palette.ink, 0.3);
  return (
    <View
      accessibilityLabel={new Intl.DateTimeFormat(locale, { dateStyle: 'full' }).format(value)}
      style={[
        styles.ticket,
        large && styles.ticketLarge,
        { backgroundColor: color, borderBottomColor: edge },
      ]}
    >
      <View
        pointerEvents="none"
        style={[
          styles.highlight,
          {
            backgroundColor: keyHighlight,
            left: large ? radii.md : radii.sm,
            right: large ? radii.md : radii.sm,
          },
        ]}
      />
      {weekdayLabel ? (
        <AppText color={ink} style={styles.weekday} variant="caption2" weight="semibold">
          {weekdayLabel}
        </AppText>
      ) : null}
      <AppText
        color={ink}
        style={large ? styles.dayLarge : styles.day}
        variant={large ? 'display' : 'title2'}
      >
        {day}
      </AppText>
      <View accessibilityElementsHidden pointerEvents="none" style={styles.perforation}>
        {Array.from({ length: large ? 7 : 5 }, (_, index) => (
          <View key={index} style={[styles.perforationDot, { backgroundColor: ink }]} />
        ))}
      </View>
      <AppText color={ink} engraved={false} style={styles.month} variant="label">
        {month}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  day: { lineHeight: 26 },
  dayLarge: { lineHeight: 32 },
  highlight: { height: 1, position: 'absolute', top: 0 },
  month: { lineHeight: 13 },
  perforation: {
    alignSelf: 'stretch',
    flexDirection: 'row',
    justifyContent: 'space-evenly',
    marginVertical: 2,
    opacity: 0.45,
  },
  perforationDot: { borderRadius: 1, height: 2, width: 2 },
  ticket: {
    alignItems: 'center',
    borderBottomWidth: keyEdgeWidth,
    borderRadius: radii.sm,
    justifyContent: 'center',
    minHeight: 56,
    paddingHorizontal: spacing.xs,
    paddingVertical: spacing.tight,
    width: 52,
  },
  ticketLarge: { borderRadius: radii.md, minHeight: 72, width: 64 },
  weekday: { lineHeight: 13, textTransform: 'capitalize' },
});
