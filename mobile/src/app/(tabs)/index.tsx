import { FlashList } from '@shopify/flash-list';
import { router } from 'expo-router';
import { RefreshControl, StyleSheet, View } from 'react-native';

import { EmptyState, ErrorState, LoadingState, Screen, ScreenHeader } from '@/components/ui/screen';
import { useAuth } from '@/features/auth/auth-context';
import { ProfileCard } from '@/features/profiles/profile-card';
import { useDiscoveryProfiles } from '@/features/profiles/profile-queries';
import { useDispoTheme } from '@/theme/theme-context';
import { spacing } from '@/theme/tokens';

export default function DiscoveryScreen() {
  const { session } = useAuth();
  const { palette } = useDispoTheme();
  const query = useDiscoveryProfiles(session?.user.id ?? '');
  const profiles = query.data?.pages.flatMap((page) => page.items) ?? [];

  if (query.isLoading) {
    return (
      <Screen>
        <ScreenHeader eyebrow="Communauté" icon="search" title="Accueil" />
        <LoadingState label="On cherche les musiciens…" />
      </Screen>
    );
  }
  if (query.isError) {
    return (
      <Screen>
        <ScreenHeader eyebrow="Communauté" icon="search" title="Accueil" />
        <ErrorState message={query.error.message} onRetry={() => void query.refetch()} />
      </Screen>
    );
  }

  return (
    <Screen>
      <FlashList
        contentContainerStyle={styles.content}
        data={profiles}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        keyExtractor={(item) => item.id}
        ListEmptyComponent={
          <EmptyState
            icon="people-outline"
            message="De nouveaux profils apparaîtront ici dès qu’ils seront disponibles."
            title="Aucun musicien pour l’instant"
          />
        }
        ListHeaderComponent={<ScreenHeader eyebrow="Communauté" icon="search" title="Accueil" />}
        onEndReached={() => {
          if (query.hasNextPage && !query.isFetchingNextPage) void query.fetchNextPage();
        }}
        onEndReachedThreshold={0.55}
        refreshControl={
          <RefreshControl
            colors={[palette.electric]}
            onRefresh={() => void query.refetch()}
            refreshing={query.isRefetching && !query.isFetchingNextPage}
            tintColor={palette.electric}
          />
        }
        renderItem={({ item }) => (
          <ProfileCard onPress={() => router.push(`/profiles/${item.id}`)} profile={item} />
        )}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { paddingBottom: spacing.xxl, paddingHorizontal: spacing.md },
  separator: { height: spacing.sm },
});
