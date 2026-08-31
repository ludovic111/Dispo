import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui/app-text';
import { Card } from '@/components/ui/card';
import { EmptyState, ErrorState, LoadingState, Screen, ScreenHeader } from '@/components/ui/screen';
import {
  AttendanceAnswerCard,
  DirectAnswerCard,
  NextSessionCard,
  PastSummaryCard,
  SessionRow,
  SessionsSectionHeading,
  SessionsSegmentedControl,
  sessionMonthLabel,
} from '@/features/sessions/session-cards';
import {
  groupSessionsByMonth,
  sessionDestination,
  sessionsPresentation,
  type SessionItem,
  type SessionsScope,
} from '@/features/sessions/session-model';
import {
  useRespondToDirectSession,
  useSessions,
  useSetSessionAttendance,
} from '@/features/sessions/session-queries';
import { formatSwiftPlaceholders } from '@/i18n/format';
import { useDispoTheme } from '@/theme/theme-context';
import { spacing } from '@/theme/tokens';

function openSession(item: SessionItem): (() => void) | undefined {
  const destination = sessionDestination(item);
  return destination ? () => router.push(destination as never) : undefined;
}

export default function SessionsScreen() {
  const { palette } = useDispoTheme();
  const { i18n, t } = useTranslation();
  const [scope, setScope] = useState<SessionsScope>('upcoming');
  const query = useSessions();
  const attendanceMutation = useSetSessionAttendance();
  const directMutation = useRespondToDirectSession();
  const data = query.data;
  const presentation = useMemo(
    () => sessionsPresentation(data?.upcoming ?? [], data?.pendingResponses ?? []),
    [data],
  );
  const months = useMemo(
    () =>
      groupSessionsByMonth(scope === 'upcoming' ? presentation.listed : (data?.past ?? []), scope),
    [data?.past, presentation.listed, scope],
  );

  if (query.isLoading) {
    return (
      <Screen nativeTabRoot>
        <ScreenHeader icon="calendar-outline" title={t('Sessions')} />
        <LoadingState label={t('Chargement de ton agenda…')} />
      </Screen>
    );
  }
  if (query.isError) {
    return (
      <Screen nativeTabRoot>
        <ScreenHeader icon="calendar-outline" title={t('Sessions')} />
        <ErrorState message={t('Chargement impossible.')} onRetry={() => void query.refetch()} />
      </Screen>
    );
  }

  const sessions = scope === 'upcoming' ? (data?.upcoming ?? []) : (data?.past ?? []);
  const waiting = data?.pendingResponses.length ?? 0;
  const subtitle =
    scope === 'past'
      ? formatSwiftPlaceholders(t('%lld date·s jouée·s'), sessions.length)
      : waiting > 0
        ? formatSwiftPlaceholders(t('%lld réponse·s attendue·s'), waiting)
        : formatSwiftPlaceholders(t('%lld date·s à venir'), sessions.length);
  const mutationError = attendanceMutation.error ?? directMutation.error;

  return (
    <Screen nativeTabRoot>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            colors={[palette.electric]}
            onRefresh={() => void query.refetch()}
            refreshing={query.isRefetching}
            tintColor={palette.electric}
          />
        }
      >
        <ScreenHeader
          icon="calendar-outline"
          inset={false}
          subtitle={subtitle}
          title={t('Sessions')}
        />

        <SessionsSegmentedControl onChange={setScope} value={scope} />

        {scope === 'upcoming' && (data?.pendingResponses.length ?? 0) > 0 ? (
          <View style={styles.section}>
            <SessionsSectionHeading
              subtitle={t(
                'Un tap suffit — en face, on sait tout de suite s’il faut chercher quelqu’un d’autre',
              )}
              title={t('On attend ta réponse')}
            />
            {mutationError ? (
              <Card>
                <AppText color={palette.signal} style={styles.mutationError} variant="caption">
                  {t('La réponse n’a pas pu être envoyée.')}
                </AppText>
              </Card>
            ) : null}
            {data?.pendingResponses.map((response) =>
              response.kind === 'direct' ? (
                <DirectAnswerCard
                  key={response.id}
                  loading={
                    directMutation.isPending && directMutation.variables?.gigId === response.gigId
                  }
                  onAnswer={(accept) => directMutation.mutate({ accept, gigId: response.gigId })}
                  response={response}
                />
              ) : (
                <AttendanceAnswerCard
                  key={response.id}
                  loading={
                    attendanceMutation.isPending &&
                    attendanceMutation.variables?.eventId === response.eventId
                  }
                  onAnswer={(available) =>
                    attendanceMutation.mutate({
                      eventId: response.eventId,
                      status: available ? 'available' : 'unavailable',
                    })
                  }
                  response={response}
                />
              ),
            )}
          </View>
        ) : null}

        {scope === 'upcoming' && presentation.featured ? (
          <View style={styles.section}>
            <SessionsSectionHeading title={t('Prochaine date')} />
            <NextSessionCard
              item={presentation.featured}
              onPress={openSession(presentation.featured)}
            />
          </View>
        ) : null}

        {scope === 'past' && sessions.length > 0 ? <PastSummaryCard sessions={sessions} /> : null}

        {sessions.length === 0 ? (
          <EmptyState
            icon={scope === 'upcoming' ? 'calendar-outline' : 'time-outline'}
            message={
              scope === 'upcoming'
                ? t(
                    'Tes concerts de groupe, les dépannages qu’on te confie, tes candidatures et les SOS que tu publies apparaissent ici.',
                  )
                : t('Les dates que tu auras jouées se rangent ici, mois par mois.')
            }
            title={scope === 'upcoming' ? t('Rien de prévu') : t('Aucune date passée')}
          />
        ) : null}

        {months.map((month) => (
          <View key={month.key} style={styles.month}>
            <AppText color={palette.muted} style={styles.monthLabel} variant="label">
              {sessionMonthLabel(month.key, i18n.resolvedLanguage ?? i18n.language ?? 'fr')}
            </AppText>
            {month.sessions.map((item) => (
              <SessionRow
                isPast={scope === 'past'}
                item={item}
                key={item.id}
                onPress={openSession(item)}
              />
            ))}
          </View>
        ))}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: spacing.lg,
    paddingBottom: spacing.xxl,
    paddingHorizontal: spacing.md,
  },
  month: { gap: spacing.sm },
  monthLabel: { letterSpacing: 1.3 },
  mutationError: { fontWeight: '700', textAlign: 'center' },
  section: { gap: spacing.sm },
});
