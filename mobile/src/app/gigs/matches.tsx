import { router, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui/app-text';
import { Avatar } from '@/components/ui/avatar';
import { Card } from '@/components/ui/card';
import { DispoButton, IconButton } from '@/components/ui/pressable';
import { EmptyState, ErrorState, LoadingState, Screen, ScreenHeader } from '@/components/ui/screen';
import { SectionHeader } from '@/components/ui/section';
import { Tag } from '@/components/ui/tag';
import { shortProfileLevel } from '@/domain/profile';
import { matchProfilesToGig, type GigMatch, type GigSummary } from '@/features/gigs/gig-model';
import { useGigMatches } from '@/features/gigs/gig-queries';
import { useDispoTheme } from '@/theme/theme-context';
import { pressedStyle, spacing } from '@/theme/tokens';

function MatchRow({ gig, match }: { gig: GigSummary; match: GigMatch }) {
  const { palette } = useDispoTheme();
  const { t } = useTranslation();
  return (
    <View style={[styles.match, { borderColor: palette.border }]}>
      <Pressable
        accessibilityRole="button"
        onPress={() => router.push(`/profiles/${match.id}`)}
        style={({ pressed }) => [styles.profilePressable, pressed && pressedStyle]}
      >
        <Avatar name={match.name} size={46} uri={match.photoUrl} />
        <View style={styles.matchText}>
          <AppText numberOfLines={2} variant="title3">
            {match.name}
          </AppText>
          <AppText color={palette.muted} numberOfLines={2} variant="caption">
            {match.matchingInstruments.map((instrument) => t(instrument)).join(', ')} ·{' '}
            {t(shortProfileLevel(match.level))}
          </AppText>
          {match.isDemo ? <Tag color={palette.bronze} label={t('Démo')} /> : null}
        </View>
        <Tag
          color={match.dateConfirmed ? palette.jam : palette.bronze}
          label={match.dateConfirmed ? t('Dispo ✓') : t('Sur demande')}
        />
      </Pressable>
      <View style={styles.request}>
        <DispoButton
          accessibilityLabel={t('Demander un dépannage à {{name}}', { name: match.name })}
          icon="paper-plane"
          onPress={() =>
            router.push(`/gigs/request?profileId=${match.id}&gigId=${gig.id}` as never)
          }
          size="compact"
          variant="secondary"
        >
          {t('Demander')}
        </DispoButton>
      </View>
    </View>
  );
}

export default function GigMatchesScreen() {
  const { id = '' } = useLocalSearchParams<{ id?: string }>();
  const { i18n, t } = useTranslation();
  const query = useGigMatches(id);
  const back = (
    <IconButton
      accessibilityLabel={t('Retour')}
      icon="chevron-back"
      onPress={() => router.back()}
    />
  );

  if (query.isLoading) {
    return (
      <Screen>
        <ScreenHeader leadingAction={back} title={t('Matches SOS')} />
        <LoadingState label={t('Recherche des musicien·nes compatibles…')} />
      </Screen>
    );
  }
  if (query.isExhaustiveError) {
    return (
      <Screen>
        <ScreenHeader leadingAction={back} title={t('Matches SOS')} />
        <ErrorState
          message={query.error?.message ?? t('Chargement impossible.')}
          onRetry={() => void query.refetch()}
        />
      </Screen>
    );
  }
  if (!query.data) {
    return (
      <Screen>
        <ScreenHeader leadingAction={back} title={t('Matches SOS')} />
        <ErrorState message={t('SOS introuvable.')} />
      </Screen>
    );
  }

  const firstPage = query.data.pages[0];
  if (!firstPage) {
    return (
      <Screen>
        <ScreenHeader leadingAction={back} title={t('Matches SOS')} />
        <ErrorState message={t('SOS introuvable.')} />
      </Screen>
    );
  }
  const gig = firstPage.gig;
  const matches = matchProfilesToGig(
    gig,
    query.data.pages.flatMap((page) => page.items),
  );
  const confirmed = matches.filter((match) => match.dateConfirmed);
  const onRequest = matches.filter((match) => !match.dateConfirmed);
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

        {matches.length === 0 ? (
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
              subtitle={t('Bon instrument et date confirmée.')}
              title={t('🎯 Dispo ce jour-là : {{count}}', { count: confirmed.length })}
            />
            {confirmed.map((match) => (
              <MatchRow gig={gig} key={match.id} match={match} />
            ))}
          </Card>
        ) : null}

        {onRequest.length > 0 ? (
          <Card style={styles.section}>
            <SectionHeader
              subtitle={t('Bon instrument, mais cette date n’est pas cochée.')}
              title={t('🤙 À tenter au cas où')}
            />
            {onRequest.map((match) => (
              <MatchRow gig={gig} key={match.id} match={match} />
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
  match: { borderTopWidth: StyleSheet.hairlineWidth, gap: spacing.xs, paddingTop: spacing.sm },
  matchText: { flex: 1, gap: spacing.xxs },
  profilePressable: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm },
  request: { alignSelf: 'flex-end' },
  section: { gap: spacing.sm },
});
