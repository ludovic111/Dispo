import { Ionicons } from '@expo/vector-icons';
import { FlashList } from '@shopify/flash-list';
import { router } from 'expo-router';
import { Pressable, RefreshControl, StyleSheet, View } from 'react-native';

import { EmptyState, ErrorState, LoadingState, Screen, ScreenHeader } from '@/components/ui/screen';
import { GigCard } from '@/features/gigs/gig-card';
import { useGigs } from '@/features/gigs/gig-queries';
import { useDispoTheme } from '@/theme/theme-context';
import { radii, spacing } from '@/theme/tokens';

export default function GigsScreen() {
  const { palette } = useDispoTheme();
  const query = useGigs();
  const gigs = query.data?.pages.flatMap((page) => page.items) ?? [];
  const add = (
    <Pressable
      accessibilityLabel="Publier un SOS"
      accessibilityRole="button"
      onPress={() => router.push('/gigs/create')}
      style={({ pressed }) => [
        styles.add,
        { backgroundColor: palette.card, borderColor: palette.border },
        pressed && styles.pressed,
      ]}
    >
      <Ionicons color={palette.electric} name="add" size={24} />
    </Pressable>
  );
  if (query.isLoading)
    return (
      <Screen>
        <ScreenHeader action={add} eyebrow="Dépannage" title="SOS" />
        <LoadingState label="Chargement des annonces…" />
      </Screen>
    );
  if (query.isError)
    return (
      <Screen>
        <ScreenHeader action={add} eyebrow="Dépannage" title="SOS" />
        <ErrorState message={query.error.message} onRetry={() => void query.refetch()} />
      </Screen>
    );
  return (
    <Screen>
      <FlashList
        contentContainerStyle={styles.content}
        data={gigs}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        keyExtractor={(item) => item.id}
        ListEmptyComponent={
          <EmptyState
            icon="flash-outline"
            message="Les prochaines demandes de dépannage apparaîtront ici."
            title="Aucun SOS en cours"
          />
        }
        ListHeaderComponent={<ScreenHeader action={add} eyebrow="Dépannage" title="SOS" />}
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
          <GigCard gig={item} onPress={() => router.push(`/gigs/${item.id}`)} />
        )}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  add: {
    alignItems: 'center',
    borderRadius: radii.button,
    borderWidth: 1,
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  content: { paddingBottom: spacing.xxl, paddingHorizontal: spacing.md },
  pressed: { opacity: 0.75, transform: [{ scale: 0.96 }] },
  separator: { height: spacing.sm },
});
