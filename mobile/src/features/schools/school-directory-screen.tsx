import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';

import { SchoolDirectoryCard } from './school-components';
import { filterSchools, sortSchools, type MusicSchool } from './school-model';
import { useMySchoolAffiliations, useSchoolDirectory } from './school-queries';

import { AppText } from '@/components/ui/app-text';
import { Card } from '@/components/ui/card';
import { EmptyState, ErrorState, LoadingState, Screen } from '@/components/ui/screen';
import { useDispoTheme } from '@/theme/theme-context';
import { radii, spacing } from '@/theme/tokens';

export function SchoolDirectoryScreen() {
  const { palette } = useDispoTheme();
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const directory = useSchoolDirectory();
  const mine = useMySchoolAffiliations();
  const affiliationsBySchool = useMemo(
    () => new Map((mine.data ?? []).map((affiliation) => [affiliation.school.id, affiliation])),
    [mine.data],
  );
  const schools = useMemo(() => {
    const unique = new Map<string, MusicSchool>();
    for (const page of directory.data?.pages ?? []) {
      for (const school of page.items) unique.set(school.id, school);
    }
    return sortSchools([...unique.values()], new Set(affiliationsBySchool.keys()));
  }, [affiliationsBySchool, directory.data?.pages]);
  const filtered = useMemo(() => filterSchools(schools, query), [query, schools]);

  if (directory.isLoading || mine.isLoading) {
    return (
      <Screen nativeHeader>
        <LoadingState label={t('Chargement des écoles…')} />
      </Screen>
    );
  }
  const error = directory.error ?? mine.error;
  if (error) {
    return (
      <Screen nativeHeader>
        <ErrorState
          message={error.message}
          onRetry={() => void Promise.all([directory.refetch(), mine.refetch()])}
        />
      </Screen>
    );
  }

  const refresh = () => void Promise.all([directory.refetch(), mine.refetch()]);
  return (
    <Screen nativeHeader>
      <FlatList
        contentContainerStyle={styles.content}
        data={filtered}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        keyboardDismissMode="on-drag"
        keyboardShouldPersistTaps="handled"
        keyExtractor={(school) => school.id}
        ListEmptyComponent={
          <EmptyState
            icon="business-outline"
            message={t('Essaie le nom complet. L’annuaire grandira avec la communauté.')}
            title={t('École introuvable')}
          />
        }
        ListFooterComponent={
          directory.isFetchingNextPage ? (
            <ActivityIndicator color={palette.bronze} style={styles.footer} />
          ) : directory.hasNextPage ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => void directory.fetchNextPage()}
              style={[styles.loadMore, { borderColor: palette.border }]}
            >
              <AppText style={styles.loadMoreText}>{t('Chercher dans la suite')}</AppText>
            </Pressable>
          ) : null
        }
        ListHeaderComponent={
          <View style={styles.header}>
            <Card>
              <View style={styles.introRow}>
                <View style={[styles.introIcon, { backgroundColor: `${palette.bronze}24` }]}>
                  <Ionicons color={palette.bronze} name="people" size={21} />
                </View>
                <View style={styles.introCopy}>
                  <AppText style={styles.introTitle} variant="subheadline">
                    {t('Retrouve les musiciens de ton école')}
                  </AppText>
                  <AppText color={palette.muted} variant="caption">
                    {t(
                      'Les affiliations restent déclaratives tant que l’établissement ne les a pas vérifiées.',
                    )}
                  </AppText>
                </View>
              </View>
            </Card>
            <View
              style={[
                styles.search,
                { backgroundColor: palette.card, borderColor: palette.border },
              ]}
            >
              <Ionicons color={palette.muted} name="search" size={18} />
              <TextInput
                accessibilityLabel={t('Rechercher une école')}
                autoCapitalize="words"
                autoCorrect={false}
                onChangeText={setQuery}
                placeholder={t('AMR, EPI, HEM…')}
                placeholderTextColor={palette.muted}
                returnKeyType="search"
                selectionColor={palette.electric}
                style={[styles.searchInput, { color: palette.text }]}
                value={query}
              />
              {query ? (
                <Pressable
                  accessibilityLabel={t('Effacer la recherche')}
                  accessibilityRole="button"
                  hitSlop={10}
                  onPress={() => setQuery('')}
                >
                  <Ionicons color={palette.muted} name="close-circle" size={19} />
                </Pressable>
              ) : null}
            </View>
          </View>
        }
        onEndReached={() => {
          if (directory.hasNextPage && !directory.isFetchingNextPage) {
            void directory.fetchNextPage();
          }
        }}
        onEndReachedThreshold={0.35}
        refreshControl={
          <RefreshControl
            onRefresh={refresh}
            refreshing={directory.isRefetching || mine.isRefetching}
            tintColor={palette.bronze}
          />
        }
        renderItem={({ item }) => (
          <SchoolDirectoryCard
            affiliation={affiliationsBySchool.get(item.id) ?? null}
            onPress={() => router.push(`/schools/${item.id}` as never)}
            school={item}
          />
        )}
        showsVerticalScrollIndicator={false}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.gutter, paddingBottom: spacing.xxl },
  footer: { padding: spacing.lg },
  header: { gap: spacing.cluster, paddingBottom: spacing.cluster },
  introCopy: { flex: 1, gap: 5 },
  introIcon: {
    alignItems: 'center',
    borderRadius: 13,
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  loadMore: {
    alignItems: 'center',
    borderRadius: radii.button,
    borderWidth: 1,
    marginTop: spacing.md,
    minHeight: 44,
    padding: spacing.sm,
  },
  loadMoreText: { fontWeight: '800' },
  introRow: { alignItems: 'flex-start', flexDirection: 'row', gap: 13 },
  introTitle: { fontWeight: '800' },
  search: {
    alignItems: 'center',
    borderRadius: radii.button,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 9,
    paddingHorizontal: spacing.cluster,
  },
  searchInput: { flex: 1, fontSize: 16, minHeight: 48, paddingVertical: spacing.sm },
  separator: { height: spacing.cluster },
});
