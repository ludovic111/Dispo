import { router, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui/app-text';
import { Avatar } from '@/components/ui/avatar';
import { Card } from '@/components/ui/card';
import { DispoButton, IconButton } from '@/components/ui/pressable';
import { EmptyState, ErrorState, LoadingState, Screen, ScreenHeader } from '@/components/ui/screen';
import { SectionHeader } from '@/components/ui/section';
import { VerifiedBadge } from '@/components/ui/verified-badge';
import { shortProfileLevel } from '@/domain/profile';
import { GigMatchChips, GigMatchScore } from '@/features/gigs/gig-match-chips';
import type { GigCandidate, GigDetail } from '@/features/gigs/gig-model';
import { useGig, useGigCandidates, useMyPendingDirectTargets } from '@/features/gigs/gig-queries';
import { useDispoTheme } from '@/theme/theme-context';
import { pressedStyle, spacing } from '@/theme/tokens';

function CandidateRow({
  candidate,
  gig,
  requestPending,
}: {
  candidate: GigCandidate;
  gig: GigDetail;
  requestPending: boolean;
}) {
  const { palette } = useDispoTheme();
  const { t } = useTranslation();
  const { match, profile } = candidate;
  return (
    <Card padding={spacing.sm} style={styles.match} tone="inset">
      <Pressable
        accessibilityHint={t('Ouvre le profil')}
        accessibilityLabel={profile.name}
        accessibilityRole="button"
        onPress={() => router.push(`/profiles/${profile.id}`)}
        style={({ pressed }) => [styles.profilePressable, pressed && pressedStyle]}
      >
        <Avatar name={profile.name} size={46} uri={profile.photoUrl} />
        <View style={styles.matchText}>
          <View style={styles.nameRow}>
            <AppText numberOfLines={2} style={styles.name} variant="title3">
              {profile.name}
            </AppText>
            {profile.isPremium ? <VerifiedBadge size="sm" /> : null}
          </View>
          <AppText color={palette.muted} numberOfLines={2} variant="caption">
            {match.instruments.map((instrument) => t(instrument)).join(', ')} ·{' '}
            {t(shortProfileLevel(profile.level))}
            {profile.city ? ` · ${profile.city}` : ''}
          </AppText>
        </View>
        <GigMatchScore score={match.score} />
      </Pressable>
      <GigMatchChips
        gigDate={gig.date}
        levelWanted={gig.wantedLevels.length > 0}
        match={match}
        musicianLevel={profile.level}
        perspective="host"
        schoolWanted={(gig.wantedSchoolIds ?? []).length > 0}
      />
      {match.commonSongs.titles.length > 0 ? (
        <AppText color={palette.muted} numberOfLines={2} variant="caption">
          {match.commonSongs.titles.join(' · ')}
        </AppText>
      ) : null}
      <View style={styles.request}>
        <DispoButton
          accessibilityLabel={
            requestPending
              ? t('Demande en attente')
              : t('Demander un dépannage à {{name}}', { name: profile.name })
          }
          disabled={requestPending}
          icon={requestPending ? 'time-outline' : 'paper-plane'}
          onPress={() =>
            router.push(`/gigs/request?profileId=${profile.id}&gigId=${gig.id}` as never)
          }
          size="compact"
          variant="secondary"
        >
          {requestPending ? t('Demande en attente') : t('Demander')}
        </DispoButton>
      </View>
    </Card>
  );
}

export default function GigMatchesScreen() {
  const { id = '' } = useLocalSearchParams<{ id?: string }>();
  const { i18n, t } = useTranslation();
  const gigQuery = useGig(id);
  const query = useGigCandidates(id);
  const pending = useMyPendingDirectTargets();
  const back = (
    <IconButton
      accessibilityLabel={t('Retour')}
      icon="chevron-back"
      onPress={() => router.back()}
    />
  );

  if (query.isLoading || gigQuery.isLoading) {
    return (
      <Screen>
        <ScreenHeader leadingAction={back} title={t('Matches SOS')} />
        <LoadingState label={t('Recherche des musicien·nes compatibles…')} />
      </Screen>
    );
  }
  if (query.isError || gigQuery.isError) {
    return (
      <Screen>
        <ScreenHeader leadingAction={back} title={t('Matches SOS')} />
        <ErrorState
          message={query.error?.message ?? gigQuery.error?.message ?? t('Chargement impossible.')}
          onRetry={() => void Promise.all([query.refetch(), gigQuery.refetch()])}
        />
      </Screen>
    );
  }
  const gig = gigQuery.data;
  if (!gig || !query.data) {
    return (
      <Screen>
        <ScreenHeader leadingAction={back} title={t('Matches SOS')} />
        <ErrorState message={t('SOS introuvable.')} />
      </Screen>
    );
  }

  const candidates = query.data;
  const confirmed = candidates.filter((candidate) => candidate.match.availableOnDate);
  const onRequest = candidates.filter((candidate) => !candidate.match.availableOnDate);
  const pendingTargets = new Set(pending.data ?? []);
  const dateLabel = new Intl.DateTimeFormat(i18n.resolvedLanguage ?? i18n.language ?? 'fr', {
    dateStyle: 'full',
  }).format(new Date(gig.date));

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content}>
        <ScreenHeader
          leadingAction={back}
          subtitle={`${gig.wantedInstruments.map((instrument) => t(instrument)).join(' / ')} · ${dateLabel}`}
          title={t('SOS publié !')}
        />

        {candidates.length === 0 ? (
          <EmptyState
            icon="hourglass-outline"
            message={t(
              'L’annonce reste en ligne. Elle remontera chez les musicien·nes qui jouent ces instruments dès qu’une disponibilité correspond.',
            )}
            title={t('Personne de compatible… pour l’instant')}
          />
        ) : null}

        {confirmed.length === 0 && onRequest.length > 0 ? (
          <Card style={styles.section}>
            <SectionHeader
              subtitle={t(
                'Les profils compatibles ci-dessous ont d’autres disponibilités futures. Une demande directe peut débloquer la situation.',
              )}
              title={t('Personne n’a coché cette date')}
            />
          </Card>
        ) : null}

        {confirmed.length > 0 ? (
          <Card style={styles.section}>
            <SectionHeader
              subtitle={t('Bon instrument et date confirmée, du plus compatible au moins.')}
              title={t('🎯 Dispo ce jour-là : {{count}}', { count: confirmed.length })}
            />
            {confirmed.map((candidate) => (
              <CandidateRow
                candidate={candidate}
                gig={gig}
                key={candidate.profile.id}
                requestPending={pendingTargets.has(candidate.profile.id)}
              />
            ))}
          </Card>
        ) : null}

        {onRequest.length > 0 ? (
          <Card style={styles.section}>
            <SectionHeader
              subtitle={t('Bon instrument, mais cette date n’est pas cochée.')}
              title={t('🤙 À tenter au cas où')}
            />
            {onRequest.map((candidate) => (
              <CandidateRow
                candidate={candidate}
                gig={gig}
                key={candidate.profile.id}
                requestPending={pendingTargets.has(candidate.profile.id)}
              />
            ))}
          </Card>
        ) : null}

        <DispoButton onPress={() => router.replace(`/gigs/${gig.id}`)}>{t('Terminé')}</DispoButton>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { gap: spacing.md, padding: spacing.gutter, paddingBottom: spacing.xxl },
  match: { gap: spacing.xs },
  matchText: { flex: 1, gap: spacing.xxs },
  name: { flexShrink: 1 },
  nameRow: { alignItems: 'center', flexDirection: 'row', gap: spacing.xxs },
  profilePressable: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm },
  request: { alignSelf: 'flex-end' },
  section: { gap: spacing.sm },
});
