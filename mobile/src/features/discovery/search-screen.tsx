import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { searchDiscovery } from './discovery-model';
import { DiscoveryProfileRow } from './discovery-profile-row';

import { AppText } from '@/components/ui/app-text';
import { Card } from '@/components/ui/card';
import { DispoButton } from '@/components/ui/pressable';
import { EmptyState, Screen } from '@/components/ui/screen';
import { SectionHeader } from '@/components/ui/section';
import { useAuth } from '@/features/auth/auth-context';
import { GigCard } from '@/features/gigs/gig-card';
import { useGigs } from '@/features/gigs/gig-queries';
import { useDiscoveryProfiles } from '@/features/profiles/profile-queries';
import { formatSwiftPlaceholders } from '@/i18n/format';
import { useDispoTheme } from '@/theme/theme-context';
import { spacing } from '@/theme/tokens';

const suggestions = ['pianiste Carouge', 'salsa ce soir', '@marco', 'batteur jazz'] as const;

export function SearchScreen() {
  const { session } = useAuth();
  const { palette } = useDispoTheme();
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const profilesQuery = useDiscoveryProfiles(session?.user.id ?? '');
  const gigsQuery = useGigs();
  const {
    fetchNextPage: fetchNextProfiles,
    hasNextPage: hasNextProfiles,
    isFetchingNextPage: isFetchingNextProfiles,
  } = profilesQuery;
  const {
    fetchNextPage: fetchNextGigs,
    hasNextPage: hasNextGigs,
    isFetchingNextPage: isFetchingNextGigs,
  } = gigsQuery;

  const profiles = useMemo(
    () => profilesQuery.data?.pages.flatMap((page) => page.items) ?? [],
    [profilesQuery.data?.pages],
  );
  const gigs = useMemo(
    () => gigsQuery.data?.pages.flatMap((page) => page.items) ?? [],
    [gigsQuery.data?.pages],
  );
  const results = useMemo(() => searchDiscovery(query, profiles, gigs), [gigs, profiles, query]);
  const hasQuery = query.trim().length > 0;

  return (
    <Screen nativeHeader>
      <View style={styles.searchWrap}>
        <View
          style={[styles.search, { backgroundColor: palette.card, borderColor: palette.border }]}
        >
          <Ionicons color={palette.muted} name="search" size={17} />
          <TextInput
            autoCapitalize="none"
            autoCorrect={false}
            autoFocus
            onChangeText={setQuery}
            placeholder={t('Musicien, @pseudo, instrument, lieu…')}
            placeholderTextColor={palette.muted}
            returnKeyType="search"
            style={[styles.input, { color: palette.text }]}
            value={query}
          />
          {query ? (
            <Pressable accessibilityLabel={t('Effacer')} hitSlop={8} onPress={() => setQuery('')}>
              <Ionicons color={palette.muted} name="close-circle" size={18} />
            </Pressable>
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
              <AppText style={styles.hintHeading} variant="subheadline">
                {t('Cherche tout, librement')}
              </AppText>
            </View>
            <AppText color={palette.muted} variant="caption">
              {t('Combine ce que tu veux : instrument, quartier, genre, nom ou @pseudo.')}
            </AppText>
            <View style={styles.suggestions}>
              {suggestions.map((suggestion) => (
                <Pressable
                  accessibilityRole="button"
                  key={suggestion}
                  onPress={() => setQuery(suggestion)}
                  style={({ pressed }) => [styles.suggestion, pressed && styles.pressed]}
                >
                  <Ionicons color={palette.muted} name="return-up-back" size={12} />
                  <AppText color={palette.electric} style={styles.suggestionText} variant="caption">
                    « {t(suggestion)} »
                  </AppText>
                </Pressable>
              ))}
            </View>
          </Card>
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
                  <DiscoveryProfileRow key={profile.id} profile={profile} />
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
        {hasQuery && (hasNextProfiles || hasNextGigs) ? (
          <DispoButton
            loading={isFetchingNextProfiles || isFetchingNextGigs}
            onPress={() => {
              if (hasNextProfiles && !isFetchingNextProfiles) void fetchNextProfiles();
              if (hasNextGigs && !isFetchingNextGigs) void fetchNextGigs();
            }}
            variant="secondary"
          >
            {t('Chercher dans la suite')}
          </DispoButton>
        ) : null}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { gap: spacing.gutter, paddingBottom: spacing.xl, paddingHorizontal: spacing.gutter },
  hintHeading: { fontWeight: '800' },
  hints: { gap: spacing.control },
  hintTitle: { alignItems: 'center', flexDirection: 'row', gap: spacing.xs },
  input: { flex: 1, fontSize: 15, minHeight: 44 },
  pressed: { opacity: 0.94, transform: [{ scale: 0.97 }] },
  search: {
    alignItems: 'center',
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.chip,
    minHeight: 46,
    paddingHorizontal: spacing.cluster,
  },
  searchWrap: { paddingHorizontal: spacing.gutter, paddingVertical: spacing.control },
  section: { gap: spacing.sm },
  suggestion: { alignItems: 'center', flexDirection: 'row', gap: spacing.xs, minHeight: 28 },
  suggestionText: { fontWeight: '700' },
  suggestions: { gap: spacing.tight },
});
