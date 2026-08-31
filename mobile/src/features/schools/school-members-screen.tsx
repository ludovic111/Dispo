import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { FlatList, RefreshControl, StyleSheet, View } from 'react-native';

import { SchoolMemberCard } from './school-components';
import { useMySchoolAffiliations, useSchool, useSchoolMembers } from './school-queries';

import { AppText } from '@/components/ui/app-text';
import { EmptyState, ErrorState, LoadingState, Screen } from '@/components/ui/screen';
import { useDispoTheme } from '@/theme/theme-context';
import { radii, spacing } from '@/theme/tokens';

export function SchoolMembersScreen({ schoolId }: { schoolId: string }) {
  const { palette } = useDispoTheme();
  const { t } = useTranslation();
  const school = useSchool(schoolId);
  const mine = useMySchoolAffiliations();
  const affiliation = mine.data?.find((item) => item.school.id === schoolId) ?? null;
  const members = useSchoolMembers(schoolId, Boolean(affiliation));
  const visibleMembers = members.data?.pages.flatMap((page) => page.items) ?? [];

  if (school.isLoading || mine.isLoading) {
    return (
      <Screen nativeHeader>
        <LoadingState label={t('Chargement des membres…')} />
      </Screen>
    );
  }
  const loadError = school.error ?? mine.error;
  if (loadError) {
    return (
      <Screen nativeHeader>
        <ErrorState
          message={loadError.message}
          onRetry={() => void Promise.all([school.refetch(), mine.refetch()])}
        />
      </Screen>
    );
  }
  if (!school.data) {
    return (
      <Screen nativeHeader>
        <ErrorState message={t('École introuvable.')} />
      </Screen>
    );
  }
  if (!affiliation) {
    return (
      <Screen nativeHeader>
        <ErrorState message={t('La liste des membres est réservée aux affiliations actives.')} />
      </Screen>
    );
  }
  if (members.isLoading) {
    return (
      <Screen nativeHeader>
        <LoadingState label={t('Chargement des membres…')} />
      </Screen>
    );
  }
  if (members.isError) {
    return (
      <Screen nativeHeader>
        <ErrorState message={members.error.message} onRetry={() => void members.refetch()} />
      </Screen>
    );
  }

  return (
    <Screen nativeHeader>
      <FlatList
        contentContainerStyle={styles.content}
        data={visibleMembers}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        keyExtractor={(member) => member.profileId}
        ListEmptyComponent={
          <EmptyState
            icon="people-outline"
            message={t('Aucun membre visible pour le moment.')}
            title={t('Liste vide')}
          />
        }
        ListHeaderComponent={
          <View style={[styles.notice, { backgroundColor: `${palette.bronze}14` }]}>
            <Ionicons color={palette.bronze} name="information-circle" size={17} />
            <AppText color={palette.muted} style={styles.noticeCopy} variant="caption">
              {t('Les rôles marqués « déclaré » n’ont pas encore été validés par l’école.')}
            </AppText>
          </View>
        }
        ListFooterComponent={
          members.isFetchingNextPage ? <LoadingState label={t('Chargement de la suite…')} /> : null
        }
        onEndReached={() => {
          if (members.hasNextPage && !members.isFetchingNextPage) void members.fetchNextPage();
        }}
        onEndReachedThreshold={0.55}
        refreshControl={
          <RefreshControl
            onRefresh={() => void members.refetch()}
            refreshing={members.isRefetching && !members.isFetchingNextPage}
            tintColor={palette.bronze}
          />
        }
        renderItem={({ item }) => (
          <SchoolMemberCard
            member={item}
            onPress={() => router.push(`/profiles/${item.profileId}` as never)}
          />
        )}
        showsVerticalScrollIndicator={false}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.gutter, paddingBottom: spacing.xxl },
  notice: {
    alignItems: 'flex-start',
    borderRadius: radii.button,
    flexDirection: 'row',
    gap: spacing.xs,
    marginBottom: spacing.sm,
    padding: spacing.sm,
  },
  noticeCopy: { flex: 1 },
  separator: { height: spacing.control },
});
