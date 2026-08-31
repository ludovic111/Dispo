import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import {
  countdownLabel,
  pastSessionsSummary,
  type DirectPendingResponse,
  type GroupPendingResponse,
  type SessionItem,
  type SessionsScope,
} from './session-model';

import { AppText } from '@/components/ui/app-text';
import { Card } from '@/components/ui/card';
import { DispoButton } from '@/components/ui/pressable';
import { Tag } from '@/components/ui/tag';
import { useDispoTheme } from '@/theme/theme-context';
import { billetInk, gradients, radii, spacing, type DispoPalette } from '@/theme/tokens';

function dateParts(value: string, locale: string) {
  const date = new Date(value);
  return {
    day: new Intl.DateTimeFormat(locale, { day: '2-digit' }).format(date),
    full: new Intl.DateTimeFormat(locale, {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(date),
    month: new Intl.DateTimeFormat(locale, { month: 'short' })
      .format(date)
      .replace(/\.$/, '')
      .toLocaleUpperCase(locale),
    time: new Intl.DateTimeFormat(locale, {
      hour: '2-digit',
      minute: '2-digit',
    }).format(date),
  };
}

export function sessionMonthLabel(key: string, locale = 'fr'): string {
  const date = new Date(`${key}-01T12:00:00`);
  if (Number.isNaN(date.getTime())) return key;
  const label = new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' }).format(date);
  return label.charAt(0).toLocaleUpperCase(locale) + label.slice(1);
}

function eventColor(kind: string | null, palette: DispoPalette): string {
  switch (kind) {
    case 'Concert':
      return palette.concert;
    case 'Répétition':
      return palette.rehearsal;
    case 'Jam':
      return palette.jam;
    default:
      return palette.electric;
  }
}

function itemGradient(item: SessionItem, palette: DispoPalette): readonly [string, string] {
  if (item.source === 'playing') return gradients.series;
  if (item.source !== 'group') return gradients.hero;
  if (item.lineupState === 'complete') return [palette.jam, palette.jam];
  if (item.lineupState === 'late') return gradients.alert;
  return [eventColor(item.eventKind, palette), palette.electric];
}

function DeadlineBadge({ deadline }: { deadline: string }) {
  const { palette } = useDispoTheme();
  const { i18n, t } = useTranslation();
  const locale = i18n.resolvedLanguage ?? i18n.language ?? 'fr';
  const now = new Date();
  const left = countdownLabel(deadline, now, locale);
  const remainingMilliseconds = new Date(deadline).getTime() - now.getTime();
  const urgent = !left || remainingMilliseconds < 24 * 60 * 60 * 1000;
  const color = urgent ? palette.signal : palette.bronze;
  return (
    <View style={[styles.deadlineBadge, { backgroundColor: `${color}24` }]}>
      <Ionicons color={color} name={left ? 'timer-outline' : 'alert-circle'} size={11} />
      <AppText color={color} style={styles.deadlineText}>
        {left ? t('Réponds sous {{duration}}', { duration: left }) : t('Réponse attendue')}
      </AppText>
    </View>
  );
}

function DateTicket({ item, large = false }: { item: SessionItem; large?: boolean }) {
  const { palette } = useDispoTheme();
  const { i18n } = useTranslation();
  const date = dateParts(item.date, i18n.resolvedLanguage ?? i18n.language ?? 'fr');
  const colors = large
    ? item.source === 'group'
      ? ([eventColor(item.eventKind, palette), palette.electric] as const)
      : gradients.hero
    : itemGradient(item, palette);
  return (
    <LinearGradient colors={colors} style={[styles.ticket, large && styles.ticketLarge]}>
      <AppText color={billetInk} style={[styles.ticketDay, large && styles.ticketDayLarge]}>
        {date.day}
      </AppText>
      <AppText color={billetInk} style={styles.ticketMonth}>
        {date.month}
      </AppText>
    </LinearGradient>
  );
}

function SessionTags({ isPast, item }: { isPast: boolean; item: SessionItem }) {
  const { palette } = useDispoTheme();
  const { t } = useTranslation();
  if (item.source === 'group') {
    return (
      <View style={styles.tags}>
        <AppText color={palette.bronze} numberOfLines={1} style={styles.groupName}>
          {item.groupEmoji} {item.groupName}
        </AppText>
        {item.eventKind ? (
          <Tag color={eventColor(item.eventKind, palette)} label={t(item.eventKind)} />
        ) : null}
        {item.recurrenceLabel ? <Tag color={palette.jam} label={t(item.recurrenceLabel)} /> : null}
        {item.role ? <Tag color={palette.electric} label={item.role} /> : null}
        {isPast && item.approvedSongCount > 0 ? (
          <Tag
            color={palette.bronze}
            label={t('{{count}} morceaux', { count: item.approvedSongCount })}
          />
        ) : null}
        {isPast && item.presentCount > 0 ? (
          <Tag
            color={palette.jam}
            label={t('{{count}} présent·es', { count: item.presentCount })}
          />
        ) : null}
      </View>
    );
  }
  if (item.source === 'playing') {
    return (
      <View style={styles.tags}>
        <Tag color={palette.jam} label={t('Je dépanne')} />
        <AppText color={palette.muted} numberOfLines={1} variant="caption">
          {t('avec {{name}}', { name: item.hostName || t('Organisateur') })}
        </AppText>
        {item.instrument ? <Tag color={palette.bronze} label={t(item.instrument)} /> : null}
      </View>
    );
  }
  if (item.source === 'hosting') {
    return (
      <View style={styles.tags}>
        <Tag color={palette.electric} label={t('J’organise')} />
        {item.pendingApplicantCount > 0 ? (
          <Tag
            color={palette.signal}
            label={t('{{count}} à traiter', { count: item.pendingApplicantCount })}
          />
        ) : item.isFilled ? (
          <Tag color={palette.jam} label={t('Complet')} />
        ) : null}
      </View>
    );
  }
  return (
    <View style={styles.tags}>
      <Tag color={palette.bronze} label={t('Candidature envoyée')} />
    </View>
  );
}

function SessionTrailing({ isPast, item }: { isPast: boolean; item: SessionItem }) {
  const { palette } = useDispoTheme();
  const { i18n, t } = useTranslation();
  if (isPast) return null;
  if (item.source === 'group') {
    if (item.attendanceStatus === 'pending' && item.confirmDeadline) {
      return <DeadlineBadge deadline={item.confirmDeadline} />;
    }
    const available = item.attendanceStatus === 'available';
    return (
      <Ionicons
        color={available ? palette.jam : palette.signal}
        name={available ? 'checkmark-circle' : 'close-circle'}
        size={19}
      />
    );
  }
  const left = countdownLabel(
    item.date,
    new Date(),
    i18n.resolvedLanguage ?? i18n.language ?? 'fr',
  );
  return left ? (
    <AppText color={palette.bronze} style={styles.countdown}>
      {t('dans {{duration}}', { duration: left })}
    </AppText>
  ) : null;
}

export function SessionRow({
  isPast = false,
  item,
  onPress,
}: {
  isPast?: boolean;
  item: SessionItem;
  onPress: (() => void) | undefined;
}) {
  const { palette } = useDispoTheme();
  const { i18n, t } = useTranslation();
  const date = dateParts(item.date, i18n.resolvedLanguage ?? i18n.language ?? 'fr');
  const content = (
    <Card padding={0} style={isPast && styles.pastCard}>
      <View style={styles.row}>
        <View style={styles.rowTicketWrap}>
          <DateTicket item={item} />
        </View>
        <View style={styles.rowContent}>
          <AppText numberOfLines={1} style={styles.rowTitle}>
            {item.title}
          </AppText>
          <AppText color={palette.muted} numberOfLines={1} variant="caption">
            {item.place ? `${date.time} · ${item.place}` : date.time}
          </AppText>
          <SessionTags isPast={isPast} item={item} />
        </View>
        <View style={styles.trailing}>
          <SessionTrailing isPast={isPast} item={item} />
          {onPress ? <Ionicons color={palette.bronze} name="chevron-forward" size={16} /> : null}
        </View>
      </View>
    </Card>
  );
  if (!onPress) return content;
  return (
    <Pressable
      accessibilityLabel={t('Ouvrir {{title}}', { title: item.title })}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => pressed && styles.pressed}
    >
      {content}
    </Pressable>
  );
}

function LineupLine({ item }: { item: SessionItem }) {
  const { palette } = useDispoTheme();
  const { t } = useTranslation();
  if (item.source !== 'group') return null;
  if (item.lineupState === 'complete') {
    return (
      <View style={styles.lineupLine}>
        <Ionicons color={palette.jam} name="checkmark-circle" size={15} />
        <AppText color={palette.jam} style={styles.lineupText}>
          {t('Line-up complet — tout le monde est là')}
        </AppText>
      </View>
    );
  }
  if (item.lineupState === 'late') {
    return (
      <View style={styles.lineupLine}>
        <Ionicons color={palette.signal} name="warning" size={15} />
        <AppText color={palette.signal} numberOfLines={2} style={styles.lineupText}>
          {item.missingRoles.length > 0
            ? t('Il manque : {{roles}}', { roles: item.missingRoles.join(', ') })
            : t('Il manque encore des réponses')}
        </AppText>
      </View>
    );
  }
  return (
    <View style={styles.lineupLine}>
      <Ionicons color={palette.muted} name="people" size={14} />
      <AppText color={palette.muted} style={styles.lineupText}>
        {t('Présence : {{available}}/{{total}}', {
          available: item.availableCount,
          total: item.rosterCount,
        })}
      </AppText>
    </View>
  );
}

export function NextSessionCard({
  item,
  onPress,
}: {
  item: SessionItem;
  onPress: (() => void) | undefined;
}) {
  const { palette } = useDispoTheme();
  const { i18n, t } = useTranslation();
  const locale = i18n.resolvedLanguage ?? i18n.language ?? 'fr';
  const date = dateParts(item.date, locale);
  const left = countdownLabel(item.date, new Date(), locale);
  const content = (
    <Card>
      <View style={styles.nextTop}>
        <DateTicket item={item} large />
        <View style={styles.nextContent}>
          <AppText numberOfLines={2} style={styles.nextTitle}>
            {item.title}
          </AppText>
          <View style={styles.metaLine}>
            <Ionicons color={palette.muted} name="location-outline" size={14} />
            <AppText color={palette.muted} numberOfLines={2} variant="caption">
              {item.place ? `${date.time} · ${item.place}` : date.time}
            </AppText>
          </View>
          {left ? (
            <AppText color={palette.bronze} style={styles.nextCountdown}>
              {t('dans {{duration}}', { duration: left })}
            </AppText>
          ) : null}
        </View>
        {onPress ? <Ionicons color={palette.bronze} name="chevron-forward" size={18} /> : null}
      </View>
      <LineupLine item={item} />
    </Card>
  );
  if (!onPress) return content;
  return (
    <Pressable
      accessibilityLabel={t('Ouvrir {{title}}', { title: item.title })}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => pressed && styles.pressed}
    >
      {content}
    </Pressable>
  );
}

export function AttendanceAnswerCard({
  loading,
  onAnswer,
  response,
}: {
  loading: boolean;
  onAnswer: (available: boolean) => void;
  response: GroupPendingResponse;
}) {
  const { palette } = useDispoTheme();
  const { i18n, t } = useTranslation();
  const date = dateParts(response.date, i18n.resolvedLanguage ?? i18n.language ?? 'fr');
  return (
    <Card>
      <View style={styles.answerTopline}>
        <AppText color={palette.bronze} numberOfLines={1} style={styles.groupName}>
          {response.groupEmoji} {response.groupName}
        </AppText>
        <DeadlineBadge deadline={response.confirmDeadline} />
      </View>
      <View style={styles.answerInfo}>
        <AppText numberOfLines={1} style={styles.answerTitle}>
          {response.title}
        </AppText>
        <AppText color={palette.muted} numberOfLines={1} variant="caption">
          {response.place ? `${date.full} · ${response.place}` : date.full}
        </AppText>
      </View>
      <View style={styles.answerButtons}>
        <View style={styles.answerButton}>
          <DispoButton disabled={loading} onPress={() => onAnswer(false)} variant="secondary">
            {t('Indispo')}
          </DispoButton>
        </View>
        <View style={styles.answerButton}>
          <DispoButton loading={loading} onPress={() => onAnswer(true)}>
            {t('Je suis dispo')}
          </DispoButton>
        </View>
      </View>
    </Card>
  );
}

export function DirectAnswerCard({
  loading,
  onAnswer,
  response,
}: {
  loading: boolean;
  onAnswer: (accept: boolean) => void;
  response: DirectPendingResponse;
}) {
  const { palette } = useDispoTheme();
  const { i18n, t } = useTranslation();
  const locale = i18n.resolvedLanguage ?? i18n.language ?? 'fr';
  const date = dateParts(response.date, locale);
  return (
    <Card>
      <View style={styles.directTitleLine}>
        <Ionicons color={palette.signal} name="flash" size={15} />
        <AppText numberOfLines={2} style={styles.answerTitle}>
          {t('{{name}} te demande de dépanner', {
            name: response.hostName || t('Organisateur'),
          })}
        </AppText>
      </View>
      <View style={styles.directDetails}>
        {response.instrument ? (
          <View style={styles.metaLine}>
            <Ionicons color={palette.muted} name="musical-note" size={14} />
            <AppText color={palette.muted} variant="caption">
              {t(response.instrument)}
            </AppText>
          </View>
        ) : null}
        <View style={styles.metaLine}>
          <Ionicons color={palette.muted} name="calendar-outline" size={14} />
          <AppText color={palette.muted} variant="caption">
            {date.full}
          </AppText>
        </View>
        {response.place ? (
          <View style={styles.metaLine}>
            <Ionicons color={palette.muted} name="location-outline" size={14} />
            <AppText color={palette.muted} numberOfLines={1} variant="caption">
              {response.place}
            </AppText>
          </View>
        ) : null}
        {response.fee !== null ? (
          <View style={styles.metaLine}>
            <Ionicons color={palette.bronze} name="cash-outline" size={14} />
            <AppText color={palette.bronze} variant="caption">
              {t('Cachet')} :{' '}
              {response.fee === 0
                ? t('Sans cachet')
                : new Intl.NumberFormat(locale, {
                    currency: 'CHF',
                    currencyDisplay: 'code',
                    maximumFractionDigits: 2,
                    style: 'currency',
                  }).format(response.fee)}
            </AppText>
          </View>
        ) : null}
      </View>
      {response.description ? (
        <AppText style={styles.description} variant="caption">
          {response.description}
        </AppText>
      ) : null}
      <View style={styles.answerButtons}>
        <View style={styles.answerButton}>
          <DispoButton disabled={loading} onPress={() => onAnswer(false)} variant="secondary">
            {t('Je ne peux pas')}
          </DispoButton>
        </View>
        <View style={styles.answerButton}>
          <DispoButton loading={loading} onPress={() => onAnswer(true)}>
            {t('J’accepte')}
          </DispoButton>
        </View>
      </View>
    </Card>
  );
}

export function PastSummaryCard({ sessions }: { sessions: SessionItem[] }) {
  const { palette } = useDispoTheme();
  const { i18n, t } = useTranslation();
  const locale = i18n.resolvedLanguage ?? i18n.language ?? 'fr';
  const summary = pastSessionsSummary(sessions);
  const metrics = [
    { label: t('dates'), value: summary.dates },
    { label: t('morceaux'), value: summary.songs },
    { label: t('groupes'), value: summary.groups },
  ];
  return (
    <Card>
      <View style={styles.summaryTitle}>
        <Ionicons color={palette.electric} name="time-outline" size={19} />
        <AppText color={palette.electric} variant="title">
          {t('Historique de jeu')}
        </AppText>
      </View>
      <View style={styles.metrics}>
        {metrics.map((metric) => (
          <View key={metric.label} style={[styles.metric, { backgroundColor: palette.inset }]}>
            <AppText style={styles.metricValue}>{metric.value}</AppText>
            <AppText color={palette.muted} style={styles.metricLabel}>
              {metric.label}
            </AppText>
          </View>
        ))}
      </View>
      <View style={styles.tags}>
        {summary.kinds.map((kind) => (
          <Tag
            color={eventColor(kind.label, palette)}
            key={kind.label}
            label={`${kind.count} ${t(kind.label).toLocaleLowerCase(locale)}`}
          />
        ))}
      </View>
    </Card>
  );
}

export function SessionsSegmentedControl({
  onChange,
  value,
}: {
  onChange: (scope: SessionsScope) => void;
  value: SessionsScope;
}) {
  const { palette } = useDispoTheme();
  const { t } = useTranslation();
  return (
    <View
      accessibilityRole="tablist"
      style={[styles.segment, { backgroundColor: palette.inset, borderColor: palette.border }]}
    >
      {(
        [
          ['upcoming', t('À venir')],
          ['past', t('Passés')],
        ] as const
      ).map(([scope, label]) => {
        const selected = value === scope;
        return (
          <Pressable
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            key={scope}
            onPress={() => onChange(scope)}
            style={[
              styles.segmentOption,
              selected && { backgroundColor: palette.card, borderColor: palette.border },
            ]}
          >
            <AppText color={selected ? palette.text : palette.muted} style={styles.segmentText}>
              {label}
            </AppText>
          </Pressable>
        );
      })}
    </View>
  );
}

export function SessionsSectionHeading({ subtitle, title }: { subtitle?: string; title: string }) {
  const { palette } = useDispoTheme();
  const { t } = useTranslation();
  return (
    <View style={styles.sectionHeading}>
      <AppText variant="title">{t(title)}</AppText>
      {subtitle ? (
        <AppText color={palette.muted} variant="caption">
          {t(subtitle)}
        </AppText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  answerButton: { flex: 1 },
  answerButtons: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
  answerInfo: { gap: 3, marginTop: spacing.sm },
  answerTitle: { flex: 1, fontSize: 14, fontWeight: '800', lineHeight: 19 },
  answerTopline: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
    justifyContent: 'space-between',
  },
  countdown: { fontSize: 10, fontWeight: '900', textAlign: 'right' },
  deadlineBadge: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    borderRadius: radii.round,
    flexDirection: 'row',
    gap: 3,
    paddingHorizontal: 7,
    paddingVertical: 4,
  },
  deadlineText: { fontSize: 9, fontWeight: '900' },
  description: { marginTop: spacing.sm },
  directDetails: { gap: 5, marginTop: spacing.sm },
  directTitleLine: { alignItems: 'center', flexDirection: 'row', gap: spacing.xs },
  groupName: { flexShrink: 1, fontSize: 11, fontWeight: '800' },
  lineupLine: { alignItems: 'center', flexDirection: 'row', gap: 6, marginTop: spacing.sm },
  lineupText: { flex: 1, fontSize: 12, fontWeight: '700' },
  metaLine: { alignItems: 'center', flexDirection: 'row', gap: 4 },
  metric: { alignItems: 'center', borderRadius: 11, flex: 1, paddingVertical: spacing.xs },
  metricLabel: { fontSize: 10, fontWeight: '700' },
  metrics: { flexDirection: 'row', gap: spacing.xs, marginTop: spacing.sm },
  metricValue: { fontFamily: 'FrauncesDisplay', fontSize: 22, lineHeight: 26 },
  nextContent: { flex: 1, gap: 4 },
  nextCountdown: { fontSize: 12, fontWeight: '900' },
  nextTitle: { fontFamily: 'FrauncesDisplay', fontSize: 21, lineHeight: 25 },
  nextTop: { alignItems: 'flex-start', flexDirection: 'row', gap: spacing.sm },
  pastCard: { opacity: 0.75 },
  pressed: { opacity: 0.82, transform: [{ scale: 0.985 }] },
  row: { alignItems: 'center', flexDirection: 'row', minHeight: 94 },
  rowContent: { flex: 1, gap: 3, paddingVertical: spacing.sm },
  rowTicketWrap: { paddingLeft: spacing.sm, paddingRight: spacing.sm },
  rowTitle: { fontSize: 14, fontWeight: '800' },
  sectionHeading: { gap: 3 },
  segment: {
    borderRadius: radii.button,
    borderWidth: 1,
    flexDirection: 'row',
    padding: 3,
  },
  segmentOption: {
    alignItems: 'center',
    borderColor: 'transparent',
    borderRadius: 11,
    borderWidth: 1,
    flex: 1,
    paddingVertical: 8,
  },
  segmentText: { fontSize: 13, fontWeight: '800' },
  summaryTitle: { alignItems: 'center', flexDirection: 'row', gap: spacing.xs },
  tags: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: 5 },
  ticket: {
    alignItems: 'center',
    borderRadius: 11,
    justifyContent: 'center',
    minHeight: 58,
    width: 48,
  },
  ticketDay: { fontFamily: 'FrauncesDisplay', fontSize: 21, lineHeight: 23 },
  ticketDayLarge: { fontSize: 30, lineHeight: 33 },
  ticketLarge: { borderRadius: 14, minHeight: 72, width: 62 },
  ticketMonth: { fontFamily: 'SplineSansMonoSemibold', fontSize: 9, letterSpacing: 0.7 },
  trailing: { alignItems: 'flex-end', gap: 4, paddingHorizontal: spacing.sm },
});
