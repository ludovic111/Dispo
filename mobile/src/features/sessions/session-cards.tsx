import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import {
  countdownLabel,
  pastSessionsSummary,
  type DirectPendingResponse,
  type GroupPendingResponse,
  type SessionItem,
} from './session-model';

import { AppText } from '@/components/ui/app-text';
import { Card } from '@/components/ui/card';
import { DateTicket } from '@/components/ui/date-ticket';
import { DispoButton } from '@/components/ui/pressable';
import { Tag } from '@/components/ui/tag';
import { useAuth } from '@/features/auth/auth-context';
import {
  unseenEventStyleFor,
  useEventHasUnseenChange,
} from '@/features/groups/group-event-changes';
import { groupEventColor } from '@/features/groups/group-event-presentation';
import { useDispoTheme } from '@/theme/theme-context';
import { pressedStyle, radii, spacing, type DispoPalette } from '@/theme/tokens';

function useSessionChange(item: SessionItem) {
  const { session } = useAuth();
  return useEventHasUnseenChange(
    session?.user.id ?? '',
    item.eventId ?? '',
    item.scheduleChangedAt,
  );
}

function dateParts(value: string, locale: string) {
  const date = new Date(value);
  return {
    full: new Intl.DateTimeFormat(locale, {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(date),
    time: new Intl.DateTimeFormat(locale, {
      hour: '2-digit',
      minute: '2-digit',
    }).format(date),
  };
}

function sessionPlaceLabel(place: string, translate: (key: string) => string) {
  if (place === 'Lieu communique apres confirmation') {
    return translate('Lieu communiqué après confirmation');
  }
  if (place === 'Lieu communiqué aux participants') {
    return translate('Lieu communiqué aux participants');
  }
  return place;
}

export function sessionMonthLabel(key: string, locale = 'fr'): string {
  const date = new Date(`${key}-01T12:00:00`);
  if (Number.isNaN(date.getTime())) return key;
  const label = new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' }).format(date);
  return label.charAt(0).toLocaleUpperCase(locale) + label.slice(1);
}

function eventColor(kind: string | null, palette: DispoPalette): string {
  return groupEventColor(kind, palette) ?? palette.electric;
}

/** Couleur du billet de date : le type de session d'abord, l'état du line-up ensuite. */
function ticketColor(item: SessionItem, palette: DispoPalette, withLineup: boolean): string {
  if (item.source === 'playing') return withLineup ? palette.bronze : palette.electric;
  if (item.source !== 'group') return palette.electric;
  if (['Concert', 'Jam', 'Répétition'].includes(item.eventKind ?? '')) {
    const color = eventColor(item.eventKind, palette);
    return color;
  }
  if (withLineup && item.lineupState === 'complete') return palette.jam;
  if (withLineup && item.lineupState === 'late') return palette.signal;
  return palette.electric;
}

function DeadlineBadge({ deadline }: { deadline: string }) {
  const { palette } = useDispoTheme();
  const { i18n, t } = useTranslation();
  const locale = i18n.resolvedLanguage ?? i18n.language ?? 'fr';
  const now = new Date();
  const left = countdownLabel(deadline, now, locale);
  const remainingMilliseconds = new Date(deadline).getTime() - now.getTime();
  const urgent = !left || remainingMilliseconds < 24 * 60 * 60 * 1000;
  return (
    <Tag
      color={urgent ? palette.signal : palette.bronze}
      icon={left ? 'timer-outline' : 'alert-circle'}
      label={left ? t('Réponds sous {{duration}}', { duration: left }) : t('Réponse attendue')}
    />
  );
}

function SessionTags({ isPast, item }: { isPast: boolean; item: SessionItem }) {
  const { palette } = useDispoTheme();
  const { t } = useTranslation();
  if (item.source === 'group') {
    return (
      <View style={styles.tags}>
        <AppText
          color={palette.bronze}
          numberOfLines={1}
          style={styles.groupName}
          variant="caption"
          weight="semibold"
        >
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
    <AppText color={palette.bronze} style={styles.countdown} variant="caption2" weight="bold">
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
  const changed = useSessionChange(item);
  const date = dateParts(item.date, i18n.resolvedLanguage ?? i18n.language ?? 'fr');
  const content = (
    <Card padding={0} style={[isPast && styles.pastCard, changed && unseenEventStyleFor(palette)]}>
      <View style={styles.row}>
        <View style={styles.rowTicketWrap}>
          <DateTicket color={ticketColor(item, palette, true)} date={item.date} />
        </View>
        <View style={styles.rowContent}>
          <AppText numberOfLines={2} variant="headline">
            {item.title}
          </AppText>
          <AppText color={palette.muted} numberOfLines={1} variant="caption">
            {item.place ? `${date.time} · ${sessionPlaceLabel(item.place, t)}` : date.time}
          </AppText>
          <SessionTags isPast={isPast} item={item} />
        </View>
        <View style={styles.trailing}>
          <SessionTrailing isPast={isPast} item={item} />
          {onPress ? <Ionicons color={palette.muted} name="chevron-forward" size={16} /> : null}
        </View>
      </View>
    </Card>
  );
  if (!onPress) return content;
  return (
    <Pressable
      accessibilityLabel={`${t('Ouvrir {{title}}', { title: item.title })}${changed ? ` · ${t('Date, heure ou lieu modifié')}` : ''}`}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => pressed && pressedStyle}
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
        <AppText color={palette.jam} style={styles.flex} variant="caption" weight="semibold">
          {t('Line-up complet — tout le monde est là')}
        </AppText>
      </View>
    );
  }
  if (item.lineupState === 'late') {
    return (
      <View style={styles.lineupLine}>
        <Ionicons color={palette.signal} name="warning" size={15} />
        <AppText
          color={palette.signal}
          numberOfLines={2}
          style={styles.flex}
          variant="caption"
          weight="semibold"
        >
          {item.missingRoles.length > 0
            ? t('Il manque : {{roles}}', {
                roles: item.missingRoles.map((role) => t(role)).join(', '),
              })
            : t('Il manque encore des réponses')}
        </AppText>
      </View>
    );
  }
  return (
    <View style={styles.lineupLine}>
      <Ionicons color={palette.muted} name="people" size={14} />
      <AppText color={palette.muted} style={styles.flex} variant="caption" weight="semibold">
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
  const changed = useSessionChange(item);
  const left = countdownLabel(item.date, new Date(), locale);
  const content = (
    <Card style={changed && unseenEventStyleFor(palette)}>
      <View style={styles.nextTop}>
        <DateTicket color={ticketColor(item, palette, false)} date={item.date} size="large" />
        <View style={styles.nextContent}>
          <AppText numberOfLines={2} variant="title2">
            {item.title}
          </AppText>
          <View style={styles.metaLine}>
            <Ionicons color={palette.muted} name="location-outline" size={14} />
            <AppText color={palette.muted} numberOfLines={2} variant="caption">
              {item.place ? `${date.time} · ${sessionPlaceLabel(item.place, t)}` : date.time}
            </AppText>
          </View>
          {left ? (
            <AppText color={palette.bronze} variant="caption" weight="bold">
              {t('dans {{duration}}', { duration: left })}
            </AppText>
          ) : null}
        </View>
        {onPress ? <Ionicons color={palette.muted} name="chevron-forward" size={18} /> : null}
      </View>
      <LineupLine item={item} />
    </Card>
  );
  if (!onPress) return content;
  return (
    <Pressable
      accessibilityLabel={`${t('Ouvrir {{title}}', { title: item.title })}${changed ? ` · ${t('Date, heure ou lieu modifié')}` : ''}`}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => pressed && pressedStyle}
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
        <AppText
          color={palette.bronze}
          numberOfLines={1}
          style={styles.groupName}
          variant="caption"
          weight="semibold"
        >
          {response.groupEmoji} {response.groupName}
        </AppText>
        <DeadlineBadge deadline={response.confirmDeadline} />
      </View>
      <View style={styles.answerInfo}>
        <AppText numberOfLines={2} variant="headline">
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
        <AppText numberOfLines={2} style={styles.flex} variant="headline">
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
            <AppText variant="title2">{metric.value}</AppText>
            <AppText color={palette.muted} variant="caption2" weight="semibold">
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

const styles = StyleSheet.create({
  answerButton: { flex: 1 },
  answerButtons: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
  answerInfo: { gap: spacing.xxs, marginTop: spacing.sm },
  answerTopline: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
    justifyContent: 'space-between',
  },
  countdown: { textAlign: 'right' },
  description: { marginTop: spacing.sm },
  directDetails: { gap: spacing.xxs, marginTop: spacing.sm },
  directTitleLine: { alignItems: 'center', flexDirection: 'row', gap: spacing.xs },
  flex: { flex: 1 },
  groupName: { flexShrink: 1 },
  lineupLine: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.tight,
    marginTop: spacing.sm,
  },
  metaLine: { alignItems: 'center', flexDirection: 'row', gap: spacing.xxs },
  metric: { alignItems: 'center', borderRadius: radii.sm, flex: 1, paddingVertical: spacing.xs },
  metrics: { flexDirection: 'row', gap: spacing.xs, marginTop: spacing.sm },
  nextContent: { flex: 1, gap: spacing.xxs },
  nextTop: { alignItems: 'flex-start', flexDirection: 'row', gap: spacing.sm },
  pastCard: { opacity: 0.75 },
  row: { alignItems: 'center', flexDirection: 'row', minHeight: 94 },
  rowContent: { flex: 1, gap: spacing.xxs, paddingVertical: spacing.sm },
  rowTicketWrap: { paddingLeft: spacing.sm, paddingRight: spacing.sm },
  summaryTitle: { alignItems: 'center', flexDirection: 'row', gap: spacing.xs },
  tags: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xxs },
  trailing: { alignItems: 'flex-end', gap: spacing.xxs, paddingHorizontal: spacing.sm },
});
