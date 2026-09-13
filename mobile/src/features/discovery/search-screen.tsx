import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { searchDiscovery } from './discovery-model';
import { DiscoveryProfileRow } from './discovery-profile-row';

import { AppText } from '@/components/ui/app-text';
import { Card } from '@/components/ui/card';
import { IconButton } from '@/components/ui/pressable';
import { EmptyState, ErrorState, LoadingState, Screen } from '@/components/ui/screen';
import { SectionHeader } from '@/components/ui/section';
import { useAuth } from '@/features/auth/auth-context';
import { GigCard } from '@/features/gigs/gig-card';
import { useGigs } from '@/features/gigs/gig-queries';
import { useDiscoveryProfiles, useProfile } from '@/features/profiles/profile-queries';
import { formatSwiftPlaceholders } from '@/i18n/format';
import { useDispoTheme } from '@/theme/theme-context';
import {
  insetStyle,
  minimumTouchTarget,
  pressedStyle,
  radii,
  spacing,
  typography,
} from '@/theme/tokens';

const suggestions = ['pianiste Carouge', 'salsa ce soir', '@marco', 'batteur jazz'] as const;

export function SearchScreen() {
  const { session } = useAuth();
  const { palette } = useDispoTheme();
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const profilesQuery = useDiscoveryProfiles(session?.user.id ?? '');
  const meQuery = useProfile(session?.user.id ?? '', session?.user.id ?? '');
  const gigsQuery = useGigs();

  const profiles = useMemo(
    () => profilesQuery.data?.pages.flatMap((page) => page.items) ?? [],
    [profilesQuery.data?.pages],
  );
  const gigs = useMemo(
    () => gigsQuery.data?.pages.flatMap((page) => page.items) ?? [],
    [gigsQuery.data?.pages],
  );
  const results = useMemo(
    () =>
      searchDiscovery(query, profiles, gigs, {
        referenceProfile: meQuery.data ?? null,
        translate: (value) => t(value),
      }),
    [gigs, meQuery.data, profiles, query, t],
  );
  const hasQuery = query.trim().length > 0;
  const loadingResults = profilesQuery.isLoading || gigsQuery.isLoading || meQuery.isLoading;
  const resultError = profilesQuery.error ?? gigsQuery.error ?? meQuery.error;

  return (
    <Screen nativeHeader>
      <View style={styles.searchWrap}>
        <View style={[styles.search, insetStyle(palette)]}>
          <Ionicons color={palette.muted} name="search" size={17} />
          <TextInput
            autoCapitalize="none"
            autoCorrect={false}
            autoFocus
            onChangeText={setQuery}
            placeholder={t('Musicien, @pseudo, instrument, lieu…')}
            placeholderTextColor={palette.muted}
            returnKeyType="search"
            selectionColor={palette.electric}
            style={[styles.input, { color: palette.text }]}
            value={query}
          />
          {query ? (
            <IconButton
              accessibilityLabel={t('Effacer')}
              icon="close-circle"
              iconColor={palette.muted}
              onPress={() => setQuery('')}
              variant="plain"
            />
          ) : null}
        </View>
      </View>
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardDismissMode="on-drag"
        keyboardShouldPersistTaps="handled"
      >
        {!hasQuery ? (
          <Card style={styles.hints}>
            <View style={styles.hintTitle}>
              <Ionicons color={palette.bronze} name="sparkles" size={17} />
              <AppText style={styles.flex} variant="headline">
                {t('Cherche tout, librement')}
              </AppText>
            </View>
            <AppText color={palette.muted} variant="footnote">
              {t('Combine ce que tu veux : instrument, quartier, genre, nom ou @pseudo.')}
            </AppText>
            <View>
              {suggestions.map((suggestion) => (
                <Pressable
                  accessibilityRole="button"
                  key={suggestion}
                  onPress={() => setQuery(suggestion)}
                  style={({ pressed }) => [styles.suggestion, pressed && pressedStyle]}
                >
                  <Ionicons color={palette.muted} name="return-up-back" size={14} />
                  <AppText
                    color={palette.electric}
                    style={styles.flex}
                    variant="subheadline"
                    weight="semibold"
                  >
                    « {t(suggestion)} »
                  </AppText>
                </Pressable>
              ))}
            </View>
          </Card>
        ) : loadingResults ? (
          <LoadingState label={t('Recherche des musicien·nes compatibles…')} />
        ) : resultError ? (
          <ErrorState
            message={resultError.message}
            onRetry={() =>
              void Promise.all([profilesQuery.refetch(), gigsQuery.refetch(), meQuery.refetch()])
            }
          />
        ) : results.profiles.length === 0 && results.gigs.length === 0 ? (
          <EmptyState
            icon="search"
            message={t('Essaie un instrument (« pianiste »), un quartier, un genre ou un @pseudo.')}
            title={t('Aucun résultat')}
          />
        ) : (
          <>
            {results.profiles.length > 0 ? (
              <View style={styles.section}>
                <SectionHeader
                  subtitle={formatSwiftPlaceholders(t('%lld profils'), results.profiles.length)}
                  title={t('Musiciens')}
                />
                {results.profiles.map((profile) => (
                  <DiscoveryProfileRow
                    key={profile.id}
                    profile={profile}
                    referenceProfile={meQuery.data ?? null}
                  />
                ))}
              </View>
            ) : null}
            {results.gigs.length > 0 ? (
              <View style={styles.section}>
                <SectionHeader
                  subtitle={formatSwiftPlaceholders(t('%lld annonces'), results.gigs.length)}
                  title={t('SOS dépannage')}
                />
                {results.gigs.map((gig) => (
                  <GigCard gig={gig} key={gig.id} onPress={() => router.push(`/gigs/${gig.id}`)} />
                ))}
              </View>
            ) : null}
          </>
        )}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { gap: spacing.gutter, paddingBottom: spacing.xl, paddingHorizontal: spacing.gutter },
  flex: { flex: 1, minWidth: 0 },
  hintTitle: { alignItems: 'center', flexDirection: 'row', gap: spacing.xs },
  hints: { gap: spacing.sm },
  // TextInput n'a pas de variante AppText : même corps que le champ de formulaire (FormField).
  input: { flex: 1, fontFamily: typography.body, fontSize: 16, minHeight: minimumTouchTarget },
  search: {
    alignItems: 'center',
    borderRadius: radii.control,
    flexDirection: 'row',
    gap: spacing.xs,
    minHeight: minimumTouchTarget + spacing.xxs,
    paddingHorizontal: spacing.sm,
  },
  searchWrap: { paddingHorizontal: spacing.gutter, paddingVertical: spacing.sm },
  section: { gap: spacing.sm },
  suggestion: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.xs,
    minHeight: minimumTouchTarget,
  },
});
