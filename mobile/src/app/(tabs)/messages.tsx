import { FlashList } from '@shopify/flash-list';
import { router } from 'expo-router';
import { RefreshControl, StyleSheet, View } from 'react-native';

import { EmptyState, ErrorState, LoadingState, Screen, ScreenHeader } from '@/components/ui/screen';
import { useAuth } from '@/features/auth/auth-context';
import { ConversationCard } from '@/features/messages/conversation-card';
import { useConversations } from '@/features/messages/message-queries';
import { useDispoTheme } from '@/theme/theme-context';
import { spacing } from '@/theme/tokens';

export default function MessagesScreen() {
  const { session } = useAuth();
  const { palette } = useDispoTheme();
  const query = useConversations(session?.user.id ?? '');
  const conversations = query.data?.pages.flatMap((page) => page.items) ?? [];
  if (query.isLoading)
    return (
      <Screen>
        <ScreenHeader eyebrow="En direct" icon="chatbubbles-outline" title="Messages" />
        <LoadingState label="Chargement des conversations…" />
      </Screen>
    );
  if (query.isError)
    return (
      <Screen>
        <ScreenHeader eyebrow="En direct" icon="chatbubbles-outline" title="Messages" />
        <ErrorState message={query.error.message} onRetry={() => void query.refetch()} />
      </Screen>
    );
  return (
    <Screen>
      <FlashList
        contentContainerStyle={styles.content}
        data={conversations}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        keyExtractor={(item) => item.id}
        ListEmptyComponent={
          <EmptyState
            icon="chatbubble-ellipses-outline"
            message="Contacte un musicien depuis son profil pour commencer à échanger."
            title="Tes conversations"
          />
        }
        ListHeaderComponent={
          <ScreenHeader eyebrow="En direct" icon="chatbubbles-outline" title="Messages" />
        }
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
          <ConversationCard
            conversation={item}
            onPress={() =>
              router.push(`/messages/${item.id}?name=${encodeURIComponent(item.contactName)}`)
            }
          />
        )}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { paddingBottom: spacing.xxl, paddingHorizontal: spacing.md },
  separator: { height: spacing.sm },
});
