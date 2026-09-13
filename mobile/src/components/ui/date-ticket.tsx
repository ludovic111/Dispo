import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { AppText } from './app-text';

import { billetInk, radii, spacing } from '@/theme/tokens';

/**
 * Bloc de date « billet » : jour en Fraunces, mois en mono, jour de semaine
 * optionnel. Même objet visuel sur l'accueil, les sessions, les événements de
 * groupe et les SOS. La couleur porte le type (concert, répétition, jam, SOS).
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
  return (
    <View
      accessibilityLabel={new Intl.DateTimeFormat(locale, { dateStyle: 'full' }).format(value)}
      style={[styles.ticket, large && styles.ticketLarge, { backgroundColor: color }]}
    >
      {weekdayLabel ? (
        <AppText color={billetInk} style={styles.weekday} variant="caption2" weight="semibold">
          {weekdayLabel}
        </AppText>
      ) : null}
      <AppText
        color={billetInk}
        style={large ? styles.dayLarge : styles.day}
        variant={large ? 'display' : 'title2'}
      >
        {day}
      </AppText>
      <AppText color={billetInk} style={styles.month} variant="label">
        {month}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  day: { lineHeight: 26 },
  dayLarge: { lineHeight: 32 },
  month: { lineHeight: 13 },
  ticket: {
    alignItems: 'center',
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
