import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import {
  attendanceFor,
  eventAttendanceSummary,
  groupLineupState,
  upcomingGroupEvents,
  type GroupEvent,
  type MusicGroup,
} from './group-model';

import { AppText } from '@/components/ui/app-text';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/screen';
import { SectionHeader } from '@/components/ui/section';
import { Tag } from '@/components/ui/tag';
import { formatSwiftPlaceholders } from '@/i18n/format';
import { useDispoTheme } from '@/theme/theme-context';
import { billetInk, gradients, radii, spacing, type DispoPalette } from '@/theme/tokens';

function colorFor(kind: GroupEvent['kind'], palette: DispoPalette) {
  if (kind === 'Concert') return palette.concert;
  if (kind === 'Jam') return palette.jam;
  return palette.rehearsal;
}

function DateTicket({ event }: { event: GroupEvent }) {
  const { i18n } = useTranslation();
  const locale = i18n.resolvedLanguage ?? i18n.language ?? 'fr';
  const date = new Date(event.date);
  const day = new Intl.DateTimeFormat(locale, { day: '2-digit' }).format(date);
  const month = new Intl.DateTimeFormat(locale, { month: 'short' })
    .format(date)
    .replace('.', '')
    .toUpperCase();
  return (
    <LinearGradient colors={gradients.hero} style={styles.ticket}>
      <AppText color={billetInk} style={styles.ticketDay}>
        {day}
      </AppText>
      <AppText color={billetInk} style={styles.ticketMonth}>
        {month}
      </AppText>
    </LinearGradient>
  );
}

function EventCard({
  event,
  group,
  userId,
}: {
  event: GroupEvent;
  group: MusicGroup;
  userId: string;
}) {
  const { palette } = useDispoTheme();
  const { i18n, t } = useTranslation();
  const summary = eventAttendanceSummary(event);
  const status = attendanceFor(event, userId);
  const lineup = groupLineupState(event, group.members);
  const date = new Intl.DateTimeFormat(i18n.resolvedLanguage ?? i18n.language ?? 'fr', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(event.date));
  const lineColor =
    lineup === 'complete' ? palette.jam : lineup === 'late' ? palette.signal : palette.bronze;
  return (
    <Pressable
      accessibilityLabel={`${t('Ouvrir')} ${event.title}`}
      accessibilityRole="button"
      onPress={() => router.push(`/groups/${group.id}/events/${event.id}` as never)}
      style={({ pressed }) => pressed && styles.pressed}
    >
      <Card padding={0}>
        <View style={styles.eventRow}>
          <DateTicket event={event} />
          <View style={styles.eventCopy}>
            <View style={styles.titleLine}>
              <AppText numberOfLines={1} style={styles.eventTitle}>
                {event.title}
              </AppText>
              <Tag color={colorFor(event.kind, palette)} label={t(event.kind)} />
            </View>
            <AppText color={palette.muted} numberOfLines={1} variant="caption">
              {date}
              {event.publicLocationLabel ? ` · ${event.publicLocationLabel}` : ''}
            </AppText>
            <View style={styles.tags}>
              {event.recurrence && event.recurrence !== 'Ponctuel' ? (
                <Tag color={palette.rehearsal} label={t(event.recurrence)} />
              ) : null}
              {event.setlist.filter((song) => song.isApproved).length ? (
                <Tag
                  color={palette.bronze}
                  label={formatSwiftPlaceholders(
                    t('%lld morceaux'),
                    event.setlist.filter((song) => song.isApproved).length,
                  )}
                />
              ) : null}
              <Tag
                color={
                  status === 'available'
                    ? palette.jam
                    : status === 'unavailable'
                      ? palette.signal
                      : palette.bronze
                }
                label={
                  status === 'available'
                    ? t('Présent·e')
                    : status === 'unavailable'
                      ? t('Absent·e')
                      : t('À confirmer')
                }
              />
            </View>
            <View style={styles.lineup}>
              <Ionicons
                color={lineColor}
                name={
                  lineup === 'complete'
                    ? 'checkmark-circle'
                    : lineup === 'late'
                      ? 'alert-circle'
                      : 'people-circle'
                }
                size={14}
              />
              <AppText color={lineColor} numberOfLines={1} variant="caption2">
                {lineup === 'complete'
                  ? t('Line-up complet')
                  : lineup === 'late'
                    ? t('Réponses urgentes')
                    : t('{{available}} présent·es · {{pending}} en attente', {
                        available: summary.available,
                        pending: summary.pending,
                      })}
              </AppText>
            </View>
          </View>
          <Ionicons color={palette.muted} name="chevron-forward" size={16} />
        </View>
      </Card>
    </Pressable>
  );
}

export function GroupEventsTab({ group, userId }: { group: MusicGroup; userId: string }) {
  const { palette } = useDispoTheme();
  const { t } = useTranslation();
  const upcoming = upcomingGroupEvents(group.events);
  const past = group.events
    .filter((event) => !upcoming.some((item) => item.id === event.id))
    .sort((left, right) => right.date.localeCompare(left.date));
  const isLeader = group.leaderId === userId;
  return (
    <ScrollView contentContainerStyle={styles.content}>
      <View style={styles.sectionHeading}>
        <SectionHeader
          subtitle={t('{{count}} prochaines dates', { count: upcoming.length })}
          title={t('Événements')}
        />
        {isLeader ? (
          <Pressable
            accessibilityLabel={t('Créer un événement')}
            onPress={() => router.push(`/groups/${group.id}/events/new` as never)}
            style={[styles.addButton, { backgroundColor: `${palette.electric}20` }]}
          >
            <Ionicons color={palette.electric} name="add-circle" size={18} />
            <AppText color={palette.electric} style={styles.addText}>
              {t('Nouvelle date')}
            </AppText>
          </Pressable>
        ) : null}
      </View>
      {!isLeader ? (
        <AppText color={palette.muted} variant="caption">
          {t('Le leader crée les dates; chaque membre confirme ensuite sa présence.')}
        </AppText>
      ) : null}
      {upcoming.length ? (
        upcoming.map((event) => (
          <EventCard event={event} group={group} key={event.id} userId={userId} />
        ))
      ) : (
        <EmptyState
          icon="calendar-outline"
          message={t('Le prochain concert, jam ou répétition apparaîtra ici.')}
          title={t('Aucune date prévue')}
        />
      )}
      {past.length ? (
        <View style={styles.pastSection}>
          <AppText color={palette.muted} variant="label">
            {t('Dates passées')}
          </AppText>
          {past.slice(0, 6).map((event) => (
            <EventCard event={event} group={group} key={event.id} userId={userId} />
          ))}
        </View>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  addButton: {
    alignItems: 'center',
    borderRadius: radii.round,
    flexDirection: 'row',
    gap: spacing.tight,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  addText: { fontSize: 13, fontWeight: '800' },
  content: { gap: spacing.sm, padding: spacing.gutter, paddingBottom: spacing.xxl },
  eventCopy: { flex: 1, gap: spacing.xxs, paddingVertical: spacing.sm },
  eventRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
    paddingRight: spacing.sm,
  },
  eventTitle: { flexShrink: 1, fontWeight: '800' },
  lineup: { alignItems: 'center', flexDirection: 'row', gap: spacing.xxs },
  pastSection: { gap: spacing.sm, marginTop: spacing.md, opacity: 0.82 },
  pressed: { opacity: 0.76 },
  sectionHeading: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xxs },
  ticket: {
    alignItems: 'center',
    alignSelf: 'stretch',
    justifyContent: 'center',
    minHeight: 104,
    width: 68,
  },
  ticketDay: { fontFamily: 'FrauncesDisplay', fontSize: 26, lineHeight: 28 },
  ticketMonth: { fontFamily: 'SplineSansMonoSemibold', fontSize: 10, letterSpacing: 0.7 },
  titleLine: { alignItems: 'center', flexDirection: 'row', gap: spacing.tight },
});
