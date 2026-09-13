import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import * as ImagePicker from 'expo-image-picker';
import { useIsFocused } from 'expo-router';
import type { TFunction } from 'i18next';
import { useMemo, useRef, useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  AppState,
  Alert,
  FlatList,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';

import { GroupMessageQuote } from './group-message-quote';
import {
  buildGroupMessageTimeline,
  GROUP_MESSAGE_MAX_LENGTH,
  GROUP_REACTION_EMOJIS,
  groupMessageAttachment,
  isValidGroupMessage,
  mergeGroupMessagesNewestFirst,
  type GroupMessage,
  type GroupMessageTimelineItem,
  type MusicGroup,
} from './group-model';
import {
  useDeleteGroupMessage,
  useEditGroupMessage,
  useGroupMessageReaction,
  useGroupMessages,
  useGroupReplyMessages,
  useSendGroupMessage,
} from './group-queries';

import { AppText } from '@/components/ui/app-text';
import { Avatar } from '@/components/ui/avatar';
import { ChatBubble, ChatInlineAction } from '@/components/ui/chat/chat-bubble';
import { ChatComposer, ChatComposerNotice } from '@/components/ui/chat/chat-composer';
import { DispoButton } from '@/components/ui/pressable';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/screen';
import { BottomSheet } from '@/components/ui/sheet';
import {
  MessageAttachmentCard,
  PendingAttachmentChip,
} from '@/features/messages/message-attachments';
import { MessageDayDivider, TypingBubble } from '@/features/messages/message-controls';
import {
  createPendingMessageAttachment,
  MESSAGE_VIDEO_MAX_DURATION_MS,
  type PendingMessageAttachment,
} from '@/features/messages/message-model';
import { openMessageAttachment } from '@/features/messages/message-repository';
import { useDispoTheme } from '@/theme/theme-context';
import { minimumTouchTarget, pressedStyle, radii, spacing } from '@/theme/tokens';

function pickedByteCount(uri: string, advertised?: number | null): number {
  if (advertised && advertised > 0) return advertised;
  try {
    return new File(uri).size;
  } catch {
    return 0;
  }
}

function attachmentErrorMessage(error: unknown, t: TFunction): string {
  const code = error instanceof Error ? error.message : '';
  if (code === 'message_attachment_too_large' || code === 'group_attachment_too_large')
    return t('Fichier trop lourd — 20 Mo maximum.');
  if (code === 'message_video_too_long') return t('Vidéo trop longue — 2 minutes maximum.');
  if (code === 'message_attachment_unreadable' || code === 'group_attachment_unreadable')
    return t('Le fichier n’a pas pu être importé.');
  if (
    typeof error === 'object' &&
    error !== null &&
    'message' in error &&
    String(error.message).includes('group_reply_unavailable')
  )
    return t('Ce message n’est plus disponible pour une réponse.');
  return t('Le message n’a pas pu être envoyé.');
}

function GroupMessageBubble({
  message,
  onEdit,
  onError,
  onOpenAttachment,
  onReply,
  onOpenOriginal,
  original,
  originalLoading,
  openingAttachmentPath,
  userId,
}: {
  message: GroupMessage;
  onEdit: (message: GroupMessage) => void;
  onError: (message: string) => void;
  onOpenAttachment: (message: GroupMessage) => void;
  onReply: (message: GroupMessage) => void;
  onOpenOriginal: (id: string) => void;
  original: GroupMessage | null;
  originalLoading: boolean;
  openingAttachmentPath: string | null;
  userId: string;
}) {
  const { palette } = useDispoTheme();
  const { t } = useTranslation();
  const own = message.senderId === userId;
  const deleted = Boolean(message.deletedAt);
  const attachment = groupMessageAttachment(message);
  const reaction = useGroupMessageReaction();
  const [reactionPickerVisible, setReactionPickerVisible] = useState(false);
  const remove = useDeleteGroupMessage();
  const confirmDelete = () => {
    const type = attachment?.contentType;
    const title = type?.startsWith('video/')
      ? t('Supprimer cette vidéo ?')
      : type?.startsWith('image/')
        ? t('Supprimer cette photo ?')
        : attachment
          ? t('Supprimer ce fichier ?')
          : t('Supprimer le message ?');
    Alert.alert(title, t('Le contenu disparaîtra chez tous les participants.'), [
      { style: 'cancel', text: t('Annuler') },
      {
        onPress: () =>
          remove.mutate(
            { groupId: message.groupId, messageId: message.id },
            { onError: () => onError(t('Le message n’a pas pu être supprimé.')) },
          ),
        style: 'destructive',
        text: t('Supprimer'),
      },
    ]);
  };
  const react = (emoji: (typeof GROUP_REACTION_EMOJIS)[number]) => {
    if (reaction.isPending) return;
    reaction.mutate(
      { emoji, groupId: message.groupId, message },
      { onError: () => onError(t('La réaction n’a pas pu être envoyée.')) },
    );
  };
  return (
    <>
      <ChatBubble
        actions={
          <>
            <ChatInlineAction
              accessibilityLabel={t('Répondre')}
              icon="arrow-undo-outline"
              onPress={() => onReply(message)}
            />
            <ChatInlineAction
              accessibilityLabel={t('Réagir')}
              disabled={reaction.isPending}
              icon="happy-outline"
              onPress={() => setReactionPickerVisible(true)}
            />
            {own && message.text ? (
              <ChatInlineAction
                accessibilityLabel={t('Modifier')}
                icon="pencil-outline"
                onPress={() => onEdit(message)}
              />
            ) : null}
            {own ? (
              <ChatInlineAction
                accessibilityLabel={t('Supprimer')}
                color={palette.error}
                icon="trash-outline"
                onPress={confirmDelete}
              />
            ) : null}
          </>
        }
        attachment={
          attachment ? (
            <MessageAttachmentCard
              attachment={attachment}
              isLoading={openingAttachmentPath === attachment.remotePath}
              onOpen={() => onOpenAttachment(message)}
            />
          ) : null
        }
        avatar={<Avatar name={message.senderName} size={30} uri={message.senderPhotoUrl} />}
        deleted={deleted}
        edited={Boolean(message.editedAt)}
        mine={own}
        onLongPress={deleted ? undefined : () => onReply(message)}
        onPress={deleted ? undefined : () => onReply(message)}
        onReactionPress={(emoji) => react(emoji as (typeof GROUP_REACTION_EMOJIS)[number])}
        quote={
          message.replyToId ? (
            <Pressable
              accessibilityLabel={t('Afficher le message d’origine')}
              accessibilityRole="button"
              onPress={() => onOpenOriginal(message.replyToId!)}
              style={({ pressed }) => pressed && pressedStyle}
            >
              <GroupMessageQuote loading={originalLoading} message={original} />
            </Pressable>
          ) : null
        }
        reactions={message.reactions.map((item) => ({
          count: item.count,
          emoji: item.emoji,
          mine: item.reactedByMe,
        }))}
        reactionsDisabled={reaction.isPending}
        senderName={message.senderName}
        text={message.text}
        timestamp={message.createdAt}
      />
      {reactionPickerVisible && !deleted ? (
        <BottomSheet onClose={() => setReactionPickerVisible(false)} title={t('Réagir')} visible>
          <View style={styles.reactionChoices}>
            {GROUP_REACTION_EMOJIS.map((emoji) => (
              <Pressable
                accessibilityLabel={`${t('Réagir')} ${emoji}`}
                accessibilityRole="button"
                accessibilityState={{
                  selected: message.reactions.some(
                    (item) => item.emoji === emoji && item.reactedByMe,
                  ),
                }}
                key={emoji}
                onPress={() => {
                  setReactionPickerVisible(false);
                  react(emoji);
                }}
                style={({ pressed }) => [
                  styles.reactionChoice,
                  { backgroundColor: palette.cardMuted },
                  pressed && pressedStyle,
                ]}
              >
                <AppText style={styles.reactionEmoji} variant="title2">
                  {emoji}
                </AppText>
              </Pressable>
            ))}
          </View>
        </BottomSheet>
      ) : null}
    </>
  );
}

export function GroupMessagesTab({ group, userId }: { group: MusicGroup; userId: string }) {
  const { t } = useTranslation();
  const isFocused = useIsFocused();
  const [appIsActive, setAppIsActive] = useState(AppState.currentState === 'active');
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) =>
      setAppIsActive(state === 'active'),
    );
    return () => subscription.remove();
  }, []);
  const query = useGroupMessages(group.id, isFocused && appIsActive);
  const send = useSendGroupMessage();
  const edit = useEditGroupMessage();
  const [text, setText] = useState('');
  const [attachment, setAttachment] = useState<PendingMessageAttachment | null>(null);
  const [editing, setEditing] = useState<GroupMessage | null>(null);
  const [replying, setReplying] = useState<GroupMessage | null>(null);
  const [originalId, setOriginalId] = useState<string | null>(null);
  const inputRef = useRef<TextInput>(null);
  const listRef = useRef<FlatList<GroupMessageTimelineItem>>(null);
  const [preparingAttachment, setPreparingAttachment] = useState(false);
  const [openingAttachmentPath, setOpeningAttachmentPath] = useState<string | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const messages = useMemo(
    () => mergeGroupMessagesNewestFirst(query.data?.pages.flatMap((page) => page.items) ?? []),
    [query.data],
  );
  const timeline = useMemo(
    () => buildGroupMessageTimeline(messages, query.someoneIsTyping),
    [messages, query.someoneIsTyping],
  );
  const replyIds = useMemo(
    () =>
      messages.flatMap((message) =>
        message.replyToId && !message.deletedAt ? [message.replyToId] : [],
      ),
    [messages],
  );
  const replies = useGroupReplyMessages(group.id, replyIds);
  const originals = useMemo(
    () =>
      new Map(
        mergeGroupMessagesNewestFirst([...messages, ...(replies.data ?? [])]).map((message) => [
          message.id,
          message,
        ]),
      ),
    [messages, replies.data],
  );
  const selectedReply = replying ? (originals.get(replying.id) ?? replying) : null;
  const beginReply = (message: GroupMessage) => {
    if (send.isPending || edit.isPending || message.deletedAt) return;
    if (editing) setText('');
    setEditing(null);
    setReplying(message);
    setLocalError(null);
    inputRef.current?.focus();
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
      setAttachment(
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
      setAttachment(
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

  const submit = () => {
    const clean = text.trim();
    if (editing) {
      if (!clean || edit.isPending) return;
      setLocalError(null);
      edit.mutate(
        { groupId: group.id, messageId: editing.id, text: clean },
        {
          onError: () => setLocalError(t('Le message n’a pas pu être modifié.')),
          onSuccess: () => {
            setEditing(null);
            setText('');
          },
        },
      );
      return;
    }
    const selectedAttachment = attachment;
    if ((!clean && !selectedAttachment) || send.isPending) return;
    if (selectedReply?.deletedAt) {
      setLocalError(t('Ce message n’est plus disponible pour une réponse.'));
      return;
    }
    setText('');
    setAttachment(null);
    setReplying(null);
    setLocalError(null);
    send.mutate(
      {
        attachment: selectedAttachment,
        groupId: group.id,
        text: clean,
        replyToId: selectedReply?.id ?? null,
      },
      {
        onSuccess: () =>
          requestAnimationFrame(() =>
            listRef.current?.scrollToOffset({ offset: 0, animated: true }),
          ),
        onError: (error) => {
          setText((current) => current || clean);
          setAttachment((current) => current ?? selectedAttachment);
          setReplying(selectedReply);
          setLocalError(attachmentErrorMessage(error, t));
        },
      },
    );
  };

  const openAttachment = async (message: GroupMessage) => {
    const selected = groupMessageAttachment(message);
    if (!selected || openingAttachmentPath) return;
    setOpeningAttachmentPath(selected.remotePath);
    setLocalError(null);
    try {
      await openMessageAttachment(selected);
    } catch {
      setLocalError(t('Le fichier n’a pas pu être ouvert.'));
    } finally {
      setOpeningAttachmentPath(null);
    }
  };

  if (query.isLoading) return <LoadingState label={t('Chargement des messages…')} />;
  if (query.isError)
    return (
      <ErrorState
        message={t('Les messages n’ont pas pu être chargés.')}
        onRetry={() => void query.refetch()}
      />
    );

  const busy = send.isPending || edit.isPending;
  return (
    <View style={styles.fill}>
      <FlatList
        ref={listRef}
        contentContainerStyle={styles.timeline}
        data={timeline}
        inverted
        keyboardDismissMode="interactive"
        keyboardShouldPersistTaps="handled"
        keyExtractor={(item) => item.id}
        maintainVisibleContentPosition={{ minIndexForVisible: 0 }}
        renderItem={({ item }) => {
          if (item.kind === 'day') return <MessageDayDivider date={item.date} />;
          if (item.kind === 'typing') return <TypingBubble />;
          return (
            <GroupMessageBubble
              message={item.message}
              onEdit={(message) => {
                if (busy) return;
                setEditing(message);
                setReplying(null);
                setAttachment(null);
                setText(message.text);
              }}
              onError={setLocalError}
              onOpenAttachment={(message) => void openAttachment(message)}
              onReply={beginReply}
              onOpenOriginal={setOriginalId}
              original={
                item.message.replyToId ? (originals.get(item.message.replyToId) ?? null) : null
              }
              originalLoading={replies.isLoading}
              openingAttachmentPath={openingAttachmentPath}
              userId={userId}
            />
          );
        }}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        ListEmptyComponent={
          <View style={styles.invertedEmpty}>
            <EmptyState
              icon="chatbubbles-outline"
              message={t('Premier message au groupe — répé, setlist, horaires…')}
              title={t('Lance la discussion')}
            />
          </View>
        }
        ListFooterComponent={
          query.hasNextPage ? (
            <View style={styles.pageAction}>
              <DispoButton
                icon="time-outline"
                loading={query.isFetchingNextPage}
                onPress={() => void query.fetchNextPage()}
                size="compact"
                variant="ghost"
              >
                {t('Charger les messages précédents')}
              </DispoButton>
            </View>
          ) : null
        }
      />
      <ChatComposer
        accessibilityLabel={t('Message au groupe')}
        attachDisabled={preparingAttachment || busy}
        editable={!busy}
        error={localError}
        inputRef={inputRef}
        maxLength={GROUP_MESSAGE_MAX_LENGTH}
        onAttachFile={
          editing
            ? undefined
            : { label: t('Joindre un fichier'), onPress: () => void pickDocument() }
        }
        onAttachMedia={
          editing
            ? undefined
            : { label: t('Joindre une photo ou une vidéo'), onPress: () => void pickMedia() }
        }
        onChangeText={(value) => {
          setText(value);
          if (value) query.pingTyping();
        }}
        onSend={submit}
        placeholder={t('Message au groupe…')}
        preparingAttachment={preparingAttachment}
        sendDisabled={busy || !isValidGroupMessage(text, attachment !== null)}
        sendIcon={editing ? 'checkmark' : 'arrow-up'}
        sendLabel={editing ? t('Enregistrer') : t('Envoyer')}
        sending={busy}
        value={text}
      >
        {editing ? (
          <ChatComposerNotice
            dismissLabel={t('Annuler')}
            icon="pencil"
            onDismiss={() => {
              setEditing(null);
              setText('');
            }}
            title={t('Modification du message')}
          />
        ) : null}
        {selectedReply ? (
          <ChatComposerNotice
            dismissLabel={t('Annuler la réponse')}
            onDismiss={() => setReplying(null)}
            title={t('Réponse à {{name}}', { name: selectedReply.senderName })}
          >
            <GroupMessageQuote message={selectedReply} showSender={false} />
          </ChatComposerNotice>
        ) : null}
        {attachment ? (
          <PendingAttachmentChip attachment={attachment} onRemove={() => setAttachment(null)} />
        ) : null}
      </ChatComposer>
      {originalId ? (
        <BottomSheet onClose={() => setOriginalId(null)} title={t('Message d’origine')} visible>
          <ScrollView>
            <GroupMessageQuote
              expanded
              loading={replies.isLoading}
              message={originals.get(originalId) ?? null}
            />
          </ScrollView>
        </BottomSheet>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  // Compense le retournement d'une liste `inverted` (les deux axes sur Android).
  invertedEmpty: { transform: Platform.OS === 'android' ? [{ scale: -1 }] : [{ scaleY: -1 }] },
  fill: { flex: 1 },
  pageAction: { alignSelf: 'center', marginVertical: spacing.sm },
  reactionChoice: {
    alignItems: 'center',
    borderRadius: radii.round,
    height: minimumTouchTarget,
    justifyContent: 'center',
    width: minimumTouchTarget,
  },
  reactionChoices: { flexDirection: 'row', gap: spacing.xxs, justifyContent: 'space-between' },
  reactionEmoji: { textAlign: 'center' },
  separator: { height: spacing.sm },
  timeline: { flexGrow: 1, padding: spacing.gutter },
});
