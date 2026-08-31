import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import * as ImagePicker from 'expo-image-picker';
import { router, useIsFocused, useLocalSearchParams, useNavigation } from 'expo-router';
import type { TFunction } from 'i18next';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  Alert,
  AppState,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/components/ui/app-text';
import { Avatar } from '@/components/ui/avatar';
import { ErrorState, LoadingState, Screen } from '@/components/ui/screen';
import { useAuth } from '@/features/auth/auth-context';
import { PendingAttachmentChip } from '@/features/messages/message-attachments';
import { MessageBubble } from '@/features/messages/message-bubble';
import {
  MessageActionsModal,
  MessageDayDivider,
  MessageEditModal,
  TypingBubble,
} from '@/features/messages/message-controls';
import {
  buildMessageTimeline,
  createPendingMessageAttachment,
  MESSAGE_MAX_LENGTH,
  MESSAGE_VIDEO_MAX_DURATION_MS,
  type DirectMessage,
  type MessageReactionEmoji,
  type PendingMessageAttachment,
} from '@/features/messages/message-model';
import {
  useDeleteMessage,
  useEditMessage,
  useConversationContact,
  useMessages,
  useSendMessage,
  useSetMessageReaction,
  useTypingPresence,
} from '@/features/messages/message-queries';
import { openMessageAttachment } from '@/features/messages/message-repository';
import { useDispoTheme } from '@/theme/theme-context';
import { radii, spacing } from '@/theme/tokens';

function pickedByteCount(uri: string, advertised?: number): number {
  if (advertised && advertised > 0) return advertised;
  try {
    return new File(uri).size;
  } catch {
    return 0;
  }
}

function attachmentErrorMessage(error: unknown, t: TFunction): string {
  const code = error instanceof Error ? error.message : '';
  if (code === 'message_attachment_too_large') return t('Fichier trop lourd — 20 Mo maximum.');
  if (code === 'message_video_too_long') return t('Vidéo trop longue — 2 minutes maximum.');
  return t('Le fichier n’a pas pu être importé.');
}

export default function ChatScreen() {
  const { id = '', name } = useLocalSearchParams<{ id?: string; name?: string }>();
  const navigation = useNavigation();
  const isFocused = useIsFocused();
  const insets = useSafeAreaInsets();
  const { session } = useAuth();
  const userId = session?.user.id ?? '';
  const { dark, palette } = useDispoTheme();
  const { t } = useTranslation();
  const [appIsActive, setAppIsActive] = useState(AppState.currentState === 'active');
  const conversationIsActive = isFocused && appIsActive;
  const contact = useConversationContact(id, userId);
  const query = useMessages(id, conversationIsActive);
  const send = useSendMessage(id, userId);
  const edit = useEditMessage(id, userId);
  const remove = useDeleteMessage(id, userId);
  const reaction = useSetMessageReaction(id, userId);
  const typing = useTypingPresence(id, userId, conversationIsActive);
  const [draft, setDraft] = useState('');
  const [pendingAttachment, setPendingAttachment] = useState<PendingMessageAttachment | null>(null);
  const [preparingAttachment, setPreparingAttachment] = useState(false);
  const [openingAttachmentPath, setOpeningAttachmentPath] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<DirectMessage | null>(null);
  const [editingMessage, setEditingMessage] = useState<DirectMessage | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);

  const messages = useMemo(() => {
    const unique = new Map<string, DirectMessage>();
    for (const message of query.data?.pages.flatMap((page) => page.items) ?? []) {
      if (!unique.has(message.id)) unique.set(message.id, message);
    }
    return [...unique.values()];
  }, [query.data]);
  const timeline = useMemo(
    () => buildMessageTimeline(messages, typing.contactIsTyping),
    [messages, typing.contactIsTyping],
  );
  const canSend = Boolean(draft.trim() || pendingAttachment);

  useEffect(() => {
    navigation.setOptions({ title: name || t('Conversation') });
  }, [name, navigation, t]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      setAppIsActive(state === 'active');
    });
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    if (!contact.data) return;
    const profile = contact.data;
    const contactName = profile.name || t('Musicien');
    navigation.setOptions({
      headerTitle: () => (
        <Pressable
          accessibilityLabel={t('Voir le profil')}
          accessibilityRole="button"
          onPress={() => router.push(`/profiles/${profile.id}`)}
          style={({ pressed }) => [styles.headerPrincipal, pressed && styles.pressed]}
        >
          <Avatar name={contactName} size={28} uri={profile.photoUrl} />
          <View style={styles.headerCopy}>
            <AppText numberOfLines={1} style={styles.headerName} variant="subheadline">
              {contactName}
            </AppText>
            <AppText color={palette.muted} style={styles.headerSubtitle} variant="caption2">
              {t('Voir le profil')}
            </AppText>
          </View>
        </Pressable>
      ),
      title: contactName,
    });
  }, [contact.data, navigation, palette.muted, t]);

  const submit = () => {
    const text = draft.trim();
    const attachment = pendingAttachment;
    if ((!text && !attachment) || send.isPending) return;
    setDraft('');
    setPendingAttachment(null);
    setLocalError(null);
    send.mutate(
      { attachment, text },
      {
        onError: (error) => {
          setDraft((current) => current || text);
          setPendingAttachment((current) => current ?? attachment);
          setLocalError(
            attachment ? attachmentErrorMessage(error, t) : t('Le message n’a pas pu être envoyé.'),
          );
        },
      },
    );
  };

  const pickDocument = async () => {
    setPreparingAttachment(true);
    setLocalError(null);
    try {
      const result = await DocumentPicker.getDocumentAsync({
        copyToCacheDirectory: true,
        multiple: false,
        type: '*/*',
      });
      if (result.canceled) return;
      const asset = result.assets[0];
      if (!asset) return;
      setPendingAttachment(
        createPendingMessageAttachment({
          byteCount: pickedByteCount(asset.uri, asset.size),
          contentType: asset.mimeType ?? null,
          fileName: asset.name,
          uri: asset.uri,
        }),
      );
    } catch (error) {
      setLocalError(attachmentErrorMessage(error, t));
    } finally {
      setPreparingAttachment(false);
    }
  };

  const pickMedia = async () => {
    setPreparingAttachment(true);
    setLocalError(null);
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        allowsMultipleSelection: false,
        mediaTypes: ['images', 'videos'],
        preferredAssetRepresentationMode:
          ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Compatible,
        quality: 0.72,
        videoExportPreset: ImagePicker.VideoExportPreset.MediumQuality,
        videoQuality: ImagePicker.UIImagePickerControllerQualityType.Medium,
      });
      if (result.canceled) return;
      const asset = result.assets[0];
      if (!asset) return;
      if (asset.type === 'video' && (asset.duration ?? 0) > MESSAGE_VIDEO_MAX_DURATION_MS)
        throw new Error('message_video_too_long');
      setPendingAttachment(
        createPendingMessageAttachment({
          byteCount: pickedByteCount(asset.uri, asset.fileSize),
          contentType: asset.mimeType ?? (asset.type === 'video' ? 'video/mp4' : 'image/jpeg'),
          fileName:
            asset.fileName ?? (asset.type === 'video' ? `${t('Vidéo')}.mp4` : `${t('Photo')}.jpg`),
          uri: asset.uri,
        }),
      );
    } catch (error) {
      setLocalError(attachmentErrorMessage(error, t));
    } finally {
      setPreparingAttachment(false);
    }
  };

  const openAttachment = async (message: DirectMessage) => {
    if (!message.attachment || openingAttachmentPath) return;
    setOpeningAttachmentPath(message.attachment.remotePath);
    setLocalError(null);
    try {
      await openMessageAttachment(message.attachment);
    } catch {
      setLocalError(t('Le fichier n’a pas pu être ouvert.'));
    } finally {
      setOpeningAttachmentPath(null);
    }
  };

  const reactToMessage = (message: DirectMessage, emoji: MessageReactionEmoji) => {
    setLocalError(null);
    reaction.mutate(
      { emoji, message },
      { onError: () => setLocalError(t('La réaction n’a pas pu être envoyée.')) },
    );
  };

  const confirmDelete = (message: DirectMessage) => {
    const type = message.attachment?.contentType;
    const title = type?.startsWith('video/')
      ? t('Supprimer cette vidéo ?')
      : type?.startsWith('image/')
        ? t('Supprimer cette photo ?')
        : message.attachment
          ? t('Supprimer ce fichier ?')
          : t('Supprimer ce message ?');
    Alert.alert(title, t('Le contenu disparaîtra chez tous les participants.'), [
      { style: 'cancel', text: t('Annuler') },
      {
        onPress: () => {
          setLocalError(null);
          remove.mutate(message.id, {
            onError: () => setLocalError(t('Le message n’a pas pu être supprimé.')),
          });
        },
        style: 'destructive',
        text: t('Supprimer'),
      },
    ]);
  };

  if (query.isLoading)
    return (
      <Screen>
        <LoadingState label={t('Chargement des messages…')} />
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
          data={timeline}
          inverted
          keyboardDismissMode="interactive"
          keyboardShouldPersistTaps="handled"
          keyExtractor={(item) => item.id}
          maintainVisibleContentPosition={{ minIndexForVisible: 0 }}
          onEndReached={() => {
            if (query.hasNextPage && !query.isFetchingNextPage) void query.fetchNextPage();
          }}
          onEndReachedThreshold={0.4}
          renderItem={({ item }) => {
            if (item.kind === 'day') return <MessageDayDivider date={item.date} />;
            if (item.kind === 'typing') return <TypingBubble />;
            const mine = item.message.senderId === userId;
            return (
              <MessageBubble
                attachmentIsLoading={item.message.attachment?.remotePath === openingAttachmentPath}
                message={item.message}
                mine={mine}
                onLongPress={() => setActionMessage(item.message)}
                onOpenAttachment={() => void openAttachment(item.message)}
                onReactionPress={(emoji) => reactToMessage(item.message, emoji)}
              />
            );
          }}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          ListFooterComponent={
            query.isFetchingNextPage ? (
              <ActivityIndicator color={palette.electric} style={styles.pageLoader} />
            ) : null
          }
        />
        {localError ? (
          <AppText color={palette.error} style={styles.error} variant="caption">
            {localError}
          </AppText>
        ) : null}
        <View
          style={[
            styles.composerShell,
            { borderTopColor: palette.border, paddingBottom: Math.max(insets.bottom, spacing.sm) },
          ]}
        >
          <BlurView intensity={72} style={StyleSheet.absoluteFill} tint={dark ? 'dark' : 'light'} />
          {pendingAttachment ? (
            <PendingAttachmentChip
              attachment={pendingAttachment}
              onRemove={() => setPendingAttachment(null)}
            />
          ) : null}
          <View style={styles.composer}>
            <Pressable
              accessibilityLabel={t('Joindre une photo ou une vidéo')}
              accessibilityRole="button"
              disabled={preparingAttachment || send.isPending}
              onPress={() => void pickMedia()}
              style={({ pressed }) => [
                styles.attach,
                { backgroundColor: palette.card },
                pressed && styles.pressed,
                (preparingAttachment || send.isPending) && styles.disabled,
              ]}
            >
              {preparingAttachment ? (
                <ActivityIndicator color={palette.electric} size="small" />
              ) : (
                <Ionicons color={palette.electric} name="images" size={18} />
              )}
            </Pressable>
            <Pressable
              accessibilityLabel={t('Joindre un fichier')}
              accessibilityRole="button"
              disabled={preparingAttachment || send.isPending}
              onPress={() => void pickDocument()}
              style={({ pressed }) => [
                styles.attach,
                { backgroundColor: palette.card },
                pressed && styles.pressed,
                (preparingAttachment || send.isPending) && styles.disabled,
              ]}
            >
              <Ionicons color={palette.electric} name="attach" size={19} />
            </Pressable>
            <TextInput
              accessibilityLabel={t('Ton message')}
              maxLength={MESSAGE_MAX_LENGTH}
              multiline
              onChangeText={(value) => {
                setDraft(value);
                if (value) typing.ping();
              }}
              placeholder={t('Ton message…')}
              placeholderTextColor={palette.muted}
              selectionColor={palette.electric}
              style={[
                styles.input,
                { backgroundColor: palette.card, borderColor: palette.border, color: palette.text },
              ]}
              value={draft}
            />
            <Pressable
              accessibilityLabel={t('Envoyer')}
              accessibilityRole="button"
              disabled={!canSend || send.isPending}
              onPress={submit}
              style={({ pressed }) => [
                styles.send,
                pressed && styles.pressed,
                (!canSend || send.isPending) && styles.disabled,
              ]}
            >
              {send.isPending ? (
                <ActivityIndicator color={palette.electric} size="small" />
              ) : (
                <Ionicons
                  color={canSend ? palette.electric : palette.muted}
                  name="arrow-up-circle"
                  size={34}
                />
              )}
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
      {actionMessage ? (
        <MessageActionsModal
          message={actionMessage}
          onClose={() => setActionMessage(null)}
          onDelete={confirmDelete}
          onEdit={setEditingMessage}
          onReact={reactToMessage}
          userId={userId}
        />
      ) : null}
      {editingMessage ? (
        <MessageEditModal
          key={editingMessage.id}
          message={editingMessage}
          onClose={() => setEditingMessage(null)}
          onSave={(message, text) => {
            setLocalError(null);
            edit.mutate(
              { messageId: message.id, text },
              { onError: () => setLocalError(t('Le message n’a pas pu être modifié.')) },
            );
          }}
        />
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  attach: {
    alignItems: 'center',
    borderRadius: radii.round,
    height: 36,
    justifyContent: 'center',
    width: 36,
  },
  composer: { alignItems: 'flex-end', flexDirection: 'row', gap: spacing.control },
  composerShell: {
    borderTopWidth: 1,
    gap: spacing.xs,
    overflow: 'hidden',
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
  },
  disabled: { opacity: 0.4 },
  error: { paddingHorizontal: spacing.md, paddingVertical: spacing.xs },
  flex: { flex: 1 },
  headerCopy: { alignItems: 'flex-start' },
  headerName: { fontWeight: '700', lineHeight: 18 },
  headerPrincipal: { alignItems: 'center', flexDirection: 'row', gap: spacing.xs },
  headerSubtitle: { fontSize: 10, lineHeight: 12 },
  input: {
    borderRadius: 20,
    borderWidth: 1,
    flex: 1,
    fontSize: 16,
    maxHeight: 104,
    minHeight: 40,
    paddingHorizontal: 14,
    paddingVertical: 10,
    textAlignVertical: 'center',
  },
  messages: { padding: spacing.md },
  pageLoader: { paddingVertical: spacing.md },
  pressed: { opacity: 0.72, transform: [{ scale: 0.94 }] },
  send: { alignItems: 'center', height: 40, justifyContent: 'center', width: 36 },
  separator: { height: 10 },
});
