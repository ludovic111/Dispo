import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui/app-text';
import { Card } from '@/components/ui/card';
import { Tag } from '@/components/ui/tag';
import type { GigSummary } from '@/domain/gig';
import { useDispoTheme } from '@/theme/theme-context';
import { billetInk, gradients, spacing } from '@/theme/tokens';

function formatGigDate(value: string): { day: string; month: string; time: string } {
  const date = new Date(value);
  return {
    day: new Intl.DateTimeFormat('fr-CH', { day: '2-digit' }).format(date),
    month: new Intl.DateTimeFormat('fr-CH', { month: 'short' })
      .format(date)
      .replace('.', '')
      .toUpperCase(),
    time: new Intl.DateTimeFormat('fr-CH', { hour: '2-digit', minute: '2-digit' }).format(date),
  };
}

export function GigCard({ gig, onPress }: { gig: GigSummary; onPress: () => void }) {
  const { palette } = useDispoTheme();
  const date = formatGigDate(gig.date);
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => pressed && styles.pressed}
    >
      <Card padding={0}>
        <View style={styles.row}>
          <LinearGradient
            colors={gig.isLocked ? gradients.series : gradients.alert}
            style={styles.dateTicket}
          >
            <AppText color={billetInk} style={styles.month}>
              {date.month}
            </AppText>
            <AppText color={billetInk} style={styles.day}>
              {date.day}
            </AppText>
            <AppText color={billetInk} variant="caption">
              {date.time}
            </AppText>
          </LinearGradient>
          <View style={styles.content}>
            <View style={styles.topline}>
              <Tag
                color={gig.isLocked ? palette.bronze : palette.signal}
                label={gig.isLocked ? 'Premium' : 'SOS'}
              />
              <AppText color={palette.muted} numberOfLines={1} variant="caption">
                {gig.genre}
              </AppText>
            </View>
            <AppText numberOfLines={2} variant="title">
              {gig.title}
            </AppText>
            <AppText color={palette.electric} numberOfLines={1} style={styles.instruments}>
              {gig.wantedInstruments.join(' · ')}
            </AppText>
            <View style={styles.meta}>
              <Ionicons color={palette.muted} name="location-outline" size={13} />
              <AppText color={palette.muted} numberOfLines={1} variant="caption">
                {gig.place}
              </AppText>
            </View>
          </View>
          <Ionicons
            color={palette.bronze}
            name="chevron-forward"
            size={18}
            style={styles.chevron}
          />
        </View>
      </Card>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chevron: { marginRight: spacing.sm },
  content: { flex: 1, gap: 5, paddingVertical: spacing.sm },
  dateTicket: {
    alignItems: 'center',
    alignSelf: 'stretch',
    justifyContent: 'center',
    minWidth: 76,
    padding: spacing.sm,
  },
  day: { fontFamily: 'FrauncesDisplay', fontSize: 28, lineHeight: 30 },
  instruments: { fontSize: 12, fontWeight: '800' },
  meta: { alignItems: 'center', flexDirection: 'row', gap: 3 },
  month: { fontSize: 10, fontWeight: '900', letterSpacing: 1 },
  pressed: { opacity: 0.82, transform: [{ scale: 0.98 }] },
  row: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm, minHeight: 118 },
  topline: { alignItems: 'center', flexDirection: 'row', gap: spacing.xs },
});
