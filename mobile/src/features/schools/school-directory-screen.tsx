import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FlatList, RefreshControl, StyleSheet, View } from 'react-native';

import { SchoolDirectoryCard } from './school-components';
import { filterSchools, sortSchools, type MusicSchool } from './school-model';
import { useMySchoolAffiliations, useSchoolDirectory } from './school-queries';

import { AppText } from '@/components/ui/app-text';
import { Card } from '@/components/ui/card';
import { FormField } from '@/components/ui/form-field';
import { DispoButton } from '@/components/ui/pressable';
import { EmptyState, ErrorState, LoadingState, Screen } from '@/components/ui/screen';
import { useDispoTheme } from '@/theme/theme-context';
import { radii, spacing, tint } from '@/theme/tokens';

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
            <LoadingState />
          ) : directory.hasNextPage ? (
            <View style={styles.footer}>
              <DispoButton
                onPress={() => void directory.fetchNextPage()}
                size="compact"
                variant="secondary"
              >
                {t('Chercher dans la suite')}
              </DispoButton>
            </View>
          ) : null
        }
        ListHeaderComponent={
          <View style={styles.header}>
            <Card>
              <View style={styles.introRow}>
                <View style={[styles.introIcon, { backgroundColor: tint(palette.bronze, 0.14) }]}>
                  <Ionicons color={palette.bronze} name="people" size={21} />
                </View>
                <View style={styles.introCopy}>
                  <AppText variant="headline">{t('Retrouve les musiciens de ton école')}</AppText>
                  <AppText color={palette.muted} variant="caption">
                    {t(
                      'Les affiliations restent déclaratives tant que l’établissement ne les a pas vérifiées.',
                    )}
                  </AppText>
                </View>
              </View>
            </Card>
            <FormField
              autoCapitalize="words"
              autoCorrect={false}
              clearButtonMode="while-editing"
              label={t('Rechercher une école')}
              onChangeText={setQuery}
              placeholder={t('AMR, EPI, EMA…')}
              returnKeyType="search"
              value={query}
            />
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
            tintColor={palette.electric}
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
  footer: { paddingTop: spacing.md },
  header: { gap: spacing.sm, paddingBottom: spacing.sm },
  introCopy: { flex: 1, gap: spacing.xxs },
  introIcon: {
    alignItems: 'center',
    borderRadius: radii.button,
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  introRow: { alignItems: 'flex-start', flexDirection: 'row', gap: spacing.sm },
  separator: { height: spacing.sm },
});
