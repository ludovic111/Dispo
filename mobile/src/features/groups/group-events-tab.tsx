import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { unseenEventStyleFor, useEventHasUnseenChange } from './group-event-changes';
import { groupEventColor } from './group-event-presentation';
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
import { DateTicket } from '@/components/ui/date-ticket';
import { EmptyState } from '@/components/ui/screen';
import { SectionHeader } from '@/components/ui/section';
import { Tag } from '@/components/ui/tag';
import { VuMeter } from '@/components/ui/vu-meter';
import { formatSwiftPlaceholders } from '@/i18n/format';
import { useDispoTheme } from '@/theme/theme-context';
import { pressedStyle, spacing } from '@/theme/tokens';

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
  const changed = useEventHasUnseenChange(userId, event.id, event.scheduleChangedAt);
  const unseenStyle = unseenEventStyleFor(palette);
  const summary = eventAttendanceSummary(event);
  const status = attendanceFor(event, userId);
  const lineup = groupLineupState(event, group.members);
  const approvedCount = event.setlist.filter((song) => song.isApproved).length;
  const date = new Intl.DateTimeFormat(i18n.resolvedLanguage ?? i18n.language ?? 'fr', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(event.date));
  const lineColor =
    lineup === 'complete' ? palette.jam : lineup === 'late' ? palette.signal : palette.bronze;
  const memberCount = Math.max(group.members.length, 1);
  const attendanceLabel = t('{{count}} présent·es sur {{total}}', {
    count: summary.available,
    total: group.members.length,
  });
  return (
    <Pressable
      accessibilityLabel={`${t('Ouvrir')} ${t(event.kind)}${changed ? ` · ${t('Date, heure ou lieu modifié')}` : ''}`}
      accessibilityRole="button"
      onPress={() => router.push(`/groups/${group.id}/events/${event.id}` as never)}
      style={({ pressed }) => pressed && pressedStyle}
    >
      <Card padding={spacing.sm} style={changed && unseenStyle} tone="elevated">
        <View style={styles.eventRow}>
          <DateTicket
            color={groupEventColor(event.kind, palette) ?? palette.rehearsal}
            date={event.date}
            weekday
          />
          <View style={styles.eventCopy}>
            <View style={styles.titleLine}>
              <AppText numberOfLines={2} style={styles.eventTitle} variant="headline">
                {t(event.kind)}
              </AppText>
              {changed ? (
                <Ionicons
                  accessibilityLabel={t('Date, heure ou lieu modifié')}
                  color={unseenStyle.borderColor}
                  name="alert-circle"
                  size={20}
                />
              ) : null}
            </View>
            <AppText color={palette.muted} numberOfLines={1} variant="caption">
              {date}
              {event.publicLocationLabel ? ` · ${event.publicLocationLabel}` : ''}
            </AppText>
            <View style={styles.tags}>
              {event.recurrence && event.recurrence !== 'Ponctuel' ? (
                <Tag color={palette.rehearsal} label={t(event.recurrence)} />
              ) : null}
              {approvedCount ? (
                <Tag
                  color={palette.bronze}
                  label={formatSwiftPlaceholders(t('%lld morceaux'), approvedCount)}
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
          </View>
          <Ionicons color={palette.muted} name="chevron-forward" size={16} />
        </View>
        <View style={styles.lineup}>
          <VuMeter
            accessibilityLabel={attendanceLabel}
            segments={Math.min(12, Math.max(4, memberCount))}
            size="compact"
            tone={lineup === 'complete' ? 'accent' : 'level'}
            value={summary.available / memberCount}
          />
          <View style={styles.lineupCopy}>
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
      <SectionHeader
        {...(isLeader
          ? {
              action: {
                icon: 'add-circle' as const,
                label: t('Nouvelle date'),
                onPress: () => router.push(`/groups/${group.id}/events/new` as never),
              },
            }
          : {})}
        subtitle={t('{{count}} prochaines dates', { count: upcoming.length })}
        title={t('Événements')}
      />
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
          <SectionHeader title={t('Dates passées')} />
          {past.slice(0, 6).map((event) => (
            <EventCard event={event} group={group} key={event.id} userId={userId} />
          ))}
        </View>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { gap: spacing.sm, padding: spacing.gutter, paddingBottom: spacing.xxl },
  eventCopy: { flex: 1, gap: spacing.xxs },
  eventRow: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm },
  eventTitle: { flexShrink: 1 },
  lineup: { gap: spacing.xxs, marginTop: spacing.xs },
  lineupCopy: { alignItems: 'center', flexDirection: 'row', gap: spacing.xxs },
  pastSection: { gap: spacing.sm, marginTop: spacing.md },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xxs },
  titleLine: { alignItems: 'center', flexDirection: 'row', gap: spacing.tight },
});
