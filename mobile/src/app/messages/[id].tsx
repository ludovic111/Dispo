import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useNavigation } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import {
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';

import { AppText } from '@/components/ui/app-text';
import { ErrorState, LoadingState, Screen } from '@/components/ui/screen';
import { useAuth } from '@/features/auth/auth-context';
import { MessageBubble } from '@/features/messages/message-bubble';
import { useMessages, useSendMessage } from '@/features/messages/message-queries';
import { useDispoTheme } from '@/theme/theme-context';
import { radii, spacing } from '@/theme/tokens';

export default function ChatScreen() {
  const { id, name } = useLocalSearchParams<{ id: string; name?: string }>();
  const navigation = useNavigation();
  const { session } = useAuth();
  const { palette } = useDispoTheme();
  const query = useMessages(id);
  const send = useSendMessage(id, session?.user.id ?? '');
  const [draft, setDraft] = useState('');
  const messages = useMemo(
    () => query.data?.pages.flatMap((page) => page.items) ?? [],
    [query.data],
  );

  useEffect(() => {
    navigation.setOptions({ title: name || 'Conversation' });
  }, [name, navigation]);

  const submit = () => {
    const text = draft.trim();
    if (!text) return;
    setDraft('');
    send.mutate(text, { onError: () => setDraft(text) });
  };

  if (query.isLoading)
    return (
      <Screen>
        <LoadingState label="Chargement des messages…" />
      </Screen>
    );
  if (query.isError)
    return (
      <Screen>
        <ErrorState message={query.error.message} onRetry={() => void query.refetch()} />
      </Screen>
    );
  return (
    <Screen>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={90}
        style={styles.flex}
      >
        <FlatList
          contentContainerStyle={styles.messages}
          data={messages}
          inverted
          keyExtractor={(item) => item.id}
          onEndReached={() => {
            if (query.hasNextPage && !query.isFetchingNextPage) void query.fetchNextPage();
          }}
          onEndReachedThreshold={0.4}
          renderItem={({ item }) => (
            <MessageBubble message={item} mine={item.senderId === session?.user.id} />
          )}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
        />
        {send.error ? (
          <AppText color={palette.error} style={styles.error}>
            {send.error.message}
          </AppText>
        ) : null}
        <View
          style={[
            styles.composer,
            { backgroundColor: palette.card, borderTopColor: palette.border },
          ]}
        >
          <TextInput
            accessibilityLabel="Ton message"
            maxLength={4000}
            multiline
            onChangeText={setDraft}
            placeholder="Ton message…"
            placeholderTextColor={palette.muted}
            selectionColor={palette.electric}
            style={[
              styles.input,
              { backgroundColor: palette.inset, borderColor: palette.border, color: palette.text },
            ]}
            value={draft}
          />
          <Pressable
            accessibilityLabel="Envoyer"
            accessibilityRole="button"
            disabled={!draft.trim() || send.isPending}
            onPress={submit}
            style={({ pressed }) => [
              styles.send,
              pressed && styles.pressed,
              (!draft.trim() || send.isPending) && styles.disabled,
            ]}
          >
            <Ionicons color={palette.electric} name="arrow-up-circle" size={36} />
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  composer: {
    alignItems: 'flex-end',
    borderTopWidth: 1,
    flexDirection: 'row',
    gap: spacing.xs,
    padding: spacing.sm,
  },
  disabled: { opacity: 0.4 },
  error: { paddingHorizontal: spacing.md, paddingVertical: spacing.xs },
  flex: { flex: 1 },
  input: {
    borderRadius: radii.ticket,
    borderWidth: 1,
    flex: 1,
    maxHeight: 112,
    minHeight: 42,
    paddingHorizontal: spacing.sm,
    paddingVertical: 10,
  },
  messages: { padding: spacing.md },
  pressed: { opacity: 0.72, transform: [{ scale: 0.94 }] },
  send: { alignItems: 'center', height: 42, justifyContent: 'center', width: 42 },
  separator: { height: 8 },
});
