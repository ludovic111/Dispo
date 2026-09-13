import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import * as ImagePicker from 'expo-image-picker';
import { router, useIsFocused, useLocalSearchParams, useNavigation } from 'expo-router';
import { useHeaderHeight } from 'expo-router/react-navigation';
import type { TFunction } from 'i18next';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Alert,
  AppState,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/components/ui/app-text';
import { Avatar } from '@/components/ui/avatar';
import { ChatComposer } from '@/components/ui/chat/chat-composer';
import { ErrorState, LoadingState, Screen } from '@/components/ui/screen';
import { VerifiedBadge } from '@/components/ui/verified-badge';
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
import { reportSendFailure } from '@/features/messages/moderated-message';
import { useDispoTheme } from '@/theme/theme-context';
import { pressedStyle, spacing } from '@/theme/tokens';

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
  const headerHeight = useHeaderHeight();
  const { id = '', name } = useLocalSearchParams<{ id?: string; name?: string }>();
  const navigation = useNavigation();
  const isFocused = useIsFocused();
  const insets = useSafeAreaInsets();
  const { session } = useAuth();
  const userId = session?.user.id ?? '';
  const { palette } = useDispoTheme();
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
          style={({ pressed }) => [styles.headerPrincipal, pressed && pressedStyle]}
        >
          <Avatar name={contactName} size={28} uri={profile.photoUrl} />
          <View style={styles.headerCopy}>
            <View style={styles.headerName}>
              <AppText numberOfLines={1} style={styles.headerTitle} variant="headline">
                {contactName}
              </AppText>
              {profile.isPremium ? <VerifiedBadge size="sm" /> : null}
            </View>
            <AppText color={palette.muted} numberOfLines={1} variant="caption">
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
          reportSendFailure(
            error,
            t,
            attachment ? attachmentErrorMessage(error, t) : t('Le message n’a pas pu être envoyé.'),
            setLocalError,
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
      <Screen nativeHeader>
        <LoadingState label={t('Chargement des messages…')} />
      </Screen>
    );
  if (query.isError)
    return (
      <Screen nativeHeader>
        <ErrorState message={query.error.message} onRetry={() => void query.refetch()} />
      </Screen>
    );

  return (
    <Screen nativeHeader>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={headerHeight}
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
          ListFooterComponent={query.isFetchingNextPage ? <LoadingState /> : null}
        />
        <ChatComposer
          accessibilityLabel={t('Ton message')}
          attachDisabled={preparingAttachment || send.isPending}
          error={localError}
          maxLength={MESSAGE_MAX_LENGTH}
          onAttachFile={{ label: t('Joindre un fichier'), onPress: () => void pickDocument() }}
          onAttachMedia={{
            label: t('Joindre une photo ou une vidéo'),
            onPress: () => void pickMedia(),
          }}
          onChangeText={(value) => {
            setDraft(value);
            if (value) typing.ping();
          }}
          onSend={submit}
          paddingBottom={Math.max(insets.bottom, spacing.sm)}
          placeholder={t('Ton message…')}
          preparingAttachment={preparingAttachment}
          sendDisabled={!canSend || send.isPending}
          sendLabel={t('Envoyer')}
          sending={send.isPending}
          value={draft}
        >
          {pendingAttachment ? (
            <PendingAttachmentChip
              attachment={pendingAttachment}
              onRemove={() => setPendingAttachment(null)}
            />
          ) : null}
        </ChatComposer>
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
  flex: { flex: 1 },
  headerCopy: { alignItems: 'flex-start', flexShrink: 1 },
  headerName: { alignItems: 'center', flexDirection: 'row', gap: spacing.xxs },
  headerPrincipal: { alignItems: 'center', flexDirection: 'row', gap: spacing.xs },
  headerTitle: { flexShrink: 1 },
  messages: { padding: spacing.md },
  separator: { height: spacing.xs },
});
