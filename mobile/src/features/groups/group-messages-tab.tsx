import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import * as ImagePicker from 'expo-image-picker';
import type { TFunction } from 'i18next';
import { useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

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
import { radii, spacing } from '@/theme/tokens';

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

function MessageBubble({
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
  const { i18n, t } = useTranslation();
  const own = message.senderId === userId;
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
    <View style={[styles.messageRow, own && styles.messageRowOwn]}>
      {!own ? <Avatar name={message.senderName} size={30} uri={message.senderPhotoUrl} /> : null}
      <View style={[styles.bubbleColumn, own && styles.bubbleColumnOwn]}>
        {!own ? (
          <AppText color={palette.bronze} style={styles.sender} variant="caption2">
            {message.senderName}
          </AppText>
        ) : null}
        <Pressable
          accessible={false}
          onLongPress={message.deletedAt ? undefined : () => onReply(message)}
          style={[
            styles.bubble,
            {
              backgroundColor: own ? `${palette.electric}2E` : palette.card,
              borderColor: own ? `${palette.electric}55` : palette.border,
            },
          ]}
        >
          {message.deletedAt ? (
            <View style={styles.deletedRow}>
              <Ionicons color={palette.muted} name="ban-outline" size={15} />
              <AppText color={palette.muted} style={styles.deleted} variant="caption">
                {t('Message supprimé')}
              </AppText>
            </View>
          ) : (
            <>
              {message.replyToId ? (
                <Pressable
                  accessibilityLabel={t('Afficher le message d’origine')}
                  accessibilityRole="button"
                  onPress={() => onOpenOriginal(message.replyToId!)}
                >
                  <GroupMessageQuote loading={originalLoading} message={original} />
                </Pressable>
              ) : null}
              {attachment ? (
                <MessageAttachmentCard
                  attachment={attachment}
                  isLoading={openingAttachmentPath === attachment.remotePath}
                  onOpen={() => onOpenAttachment(message)}
                />
              ) : null}
              {message.text ? (
                <AppText onPress={() => onReply(message)} variant="subheadline">
                  {message.text}
                </AppText>
              ) : null}
            </>
          )}
        </Pressable>
        {!message.deletedAt ? (
          <View style={[styles.controls, own && styles.controlsOwn]}>
            <Pressable
              accessibilityLabel={t('Répondre')}
              accessibilityRole="button"
              hitSlop={10}
              onPress={() => onReply(message)}
            >
              <Ionicons color={palette.muted} name="arrow-undo-outline" size={17} />
            </Pressable>
            {message.reactions.map((item) => (
              <Pressable
                accessibilityLabel={`${item.emoji}, ${item.count}`}
                accessibilityRole="button"
                disabled={reaction.isPending}
                key={item.emoji}
                onPress={() => react(item.emoji)}
                style={[
                  styles.reaction,
                  {
                    backgroundColor: item.reactedByMe ? `${palette.electric}26` : palette.card,
                    borderColor: item.reactedByMe ? palette.electric : palette.border,
                  },
                ]}
              >
                <AppText variant="caption2">
                  {item.emoji} {item.count}
                </AppText>
              </Pressable>
            ))}
            <Pressable
              accessibilityLabel={t('Réagir')}
              accessibilityRole="button"
              disabled={reaction.isPending}
              hitSlop={10}
              onPress={() => setReactionPickerVisible(true)}
            >
              <Ionicons color={palette.muted} name="happy-outline" size={17} />
            </Pressable>
            {own ? (
              <>
                {message.text ? (
                  <Pressable
                    accessibilityLabel={t('Modifier')}
                    accessibilityRole="button"
                    onPress={() => onEdit(message)}
                  >
                    <Ionicons color={palette.muted} name="pencil-outline" size={16} />
                  </Pressable>
                ) : null}
                <Pressable
                  accessibilityLabel={t('Supprimer')}
                  accessibilityRole="button"
                  onPress={confirmDelete}
                >
                  <Ionicons color={palette.signal} name="trash-outline" size={16} />
                </Pressable>
              </>
            ) : null}
          </View>
        ) : null}
        {reactionPickerVisible && !message.deletedAt ? (
          <Modal
            animationType="fade"
            onRequestClose={() => setReactionPickerVisible(false)}
            transparent
            visible
          >
            <View style={styles.reactionOverlay}>
              <Pressable
                accessibilityLabel={t('Fermer')}
                accessibilityRole="button"
                onPress={() => setReactionPickerVisible(false)}
                style={styles.reactionBackdrop}
              />
              <SafeAreaView
                edges={['bottom']}
                style={[styles.reactionSheet, { backgroundColor: palette.card }]}
              >
                <AppText variant="title">{t('Réagir')}</AppText>
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
                      style={[styles.reactionChoice, { backgroundColor: palette.inset }]}
                    >
                      <AppText style={styles.reactionEmoji}>{emoji}</AppText>
                    </Pressable>
                  ))}
                </View>
              </SafeAreaView>
            </View>
          </Modal>
        ) : null}
        <View style={styles.messageMeta}>
          {message.editedAt && !message.deletedAt ? (
            <AppText color={palette.muted} variant="caption2">
              {t('Modifié')}
            </AppText>
          ) : null}
          <AppText color={palette.muted} variant="caption2">
            {new Intl.DateTimeFormat(i18n.resolvedLanguage ?? i18n.language ?? 'fr', {
              hour: '2-digit',
              minute: '2-digit',
            }).format(new Date(message.createdAt))}
          </AppText>
        </View>
      </View>
    </View>
  );
}

export function GroupMessagesTab({ group, userId }: { group: MusicGroup; userId: string }) {
  const { palette } = useDispoTheme();
  const { t } = useTranslation();
  const query = useGroupMessages(group.id);
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

  if (query.isLoading)
    return (
      <View style={styles.centerState}>
        <ActivityIndicator color={palette.electric} />
        <AppText color={palette.muted}>{t('Chargement des messages…')}</AppText>
      </View>
    );
  if (query.isError)
    return (
      <View style={styles.centerState}>
        <AppText color={palette.error}>{t('Les messages n’ont pas pu être chargés.')}</AppText>
        <Pressable accessibilityRole="button" onPress={() => void query.refetch()}>
          <AppText color={palette.electric}>{t('Réessayer')}</AppText>
        </Pressable>
      </View>
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
            <MessageBubble
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
          <View style={styles.empty}>
            <Ionicons color={palette.bronze} name="chatbubbles-outline" size={36} />
            <AppText variant="title">{t('Lance la discussion')}</AppText>
            <AppText color={palette.muted} style={styles.emptyText}>
              {t('Premier message au groupe — répé, setlist, horaires…')}
            </AppText>
          </View>
        }
        ListFooterComponent={
          query.hasNextPage ? (
            <Pressable
              accessibilityLabel={t('Charger les messages précédents')}
              accessibilityRole="button"
              disabled={query.isFetchingNextPage}
              onPress={() => void query.fetchNextPage()}
              style={[
                styles.pageButton,
                { backgroundColor: palette.card, borderColor: palette.border },
              ]}
            >
              {query.isFetchingNextPage ? (
                <ActivityIndicator color={palette.electric} size="small" />
              ) : (
                <Ionicons color={palette.electric} name="time-outline" size={16} />
              )}
              <AppText color={palette.electric} variant="caption">
                {t('Charger les messages précédents')}
              </AppText>
            </Pressable>
          ) : null
        }
      />
      {localError ? (
        <AppText color={palette.error} style={styles.error} variant="caption">
          {localError}
        </AppText>
      ) : null}
      {editing ? (
        <View style={[styles.editBanner, { backgroundColor: palette.inset }]}>
          <Ionicons color={palette.electric} name="pencil" size={14} />
          <AppText style={styles.editCopy} variant="caption">
            {t('Modification du message')}
          </AppText>
          <Pressable
            accessibilityLabel={t('Annuler')}
            accessibilityRole="button"
            onPress={() => {
              setEditing(null);
              setText('');
            }}
          >
            <Ionicons color={palette.muted} name="close-circle" size={20} />
          </Pressable>
        </View>
      ) : null}
      {selectedReply ? (
        <View style={[styles.replyBanner, { backgroundColor: palette.inset }]}>
          <View style={styles.replyDraft}>
            <AppText color={palette.electric} numberOfLines={1} variant="caption">
              {t('Réponse à {{name}}', { name: selectedReply.senderName })}
            </AppText>
            <GroupMessageQuote message={selectedReply} showSender={false} />
          </View>
          <Pressable
            accessibilityLabel={t('Annuler la réponse')}
            accessibilityRole="button"
            hitSlop={10}
            onPress={() => setReplying(null)}
          >
            <Ionicons color={palette.muted} name="close-circle" size={22} />
          </Pressable>
        </View>
      ) : null}
      {attachment ? (
        <View style={styles.attachmentDraft}>
          <PendingAttachmentChip attachment={attachment} onRemove={() => setAttachment(null)} />
        </View>
      ) : null}
      <View
        style={[
          styles.composer,
          { backgroundColor: palette.background, borderColor: palette.border },
        ]}
      >
        {!editing ? (
          <>
            <Pressable
              accessibilityLabel={t('Joindre une photo ou une vidéo')}
              accessibilityRole="button"
              disabled={preparingAttachment || busy}
              onPress={() => void pickMedia()}
              style={styles.composerButton}
            >
              {preparingAttachment ? (
                <ActivityIndicator color={palette.electric} size="small" />
              ) : (
                <Ionicons color={palette.electric} name="images" size={19} />
              )}
            </Pressable>
            <Pressable
              accessibilityLabel={t('Joindre un fichier')}
              accessibilityRole="button"
              disabled={preparingAttachment || busy}
              onPress={() => void pickDocument()}
              style={styles.composerButton}
            >
              <Ionicons color={palette.electric} name="attach" size={20} />
            </Pressable>
          </>
        ) : null}
        <TextInput
          accessibilityLabel={t('Message au groupe')}
          editable={!busy}
          ref={inputRef}
          maxLength={GROUP_MESSAGE_MAX_LENGTH}
          multiline
          onChangeText={(value) => {
            setText(value);
            if (value) query.pingTyping();
          }}
          placeholder={t('Message au groupe…')}
          placeholderTextColor={palette.muted}
          selectionColor={palette.electric}
          style={[
            styles.input,
            { backgroundColor: palette.card, borderColor: palette.border, color: palette.text },
          ]}
          value={text}
        />
        <Pressable
          accessibilityLabel={editing ? t('Enregistrer') : t('Envoyer')}
          accessibilityRole="button"
          disabled={busy || !isValidGroupMessage(text, attachment !== null)}
          onPress={submit}
          style={[
            styles.send,
            (busy || !isValidGroupMessage(text, attachment !== null)) && styles.disabled,
          ]}
        >
          {busy ? (
            <ActivityIndicator color={palette.electric} size="small" />
          ) : (
            <Ionicons
              color={
                isValidGroupMessage(text, attachment !== null) ? palette.electric : palette.muted
              }
              name={editing ? 'checkmark-circle' : 'arrow-up-circle'}
              size={34}
            />
          )}
        </Pressable>
      </View>
      {originalId ? (
        <Modal animationType="slide" onRequestClose={() => setOriginalId(null)} transparent visible>
          <View style={styles.reactionOverlay}>
            <Pressable
              accessibilityLabel={t('Fermer')}
              accessibilityRole="button"
              onPress={() => setOriginalId(null)}
              style={styles.reactionBackdrop}
            />
            <SafeAreaView
              edges={['bottom']}
              style={[
                styles.reactionSheet,
                styles.originalSheet,
                { backgroundColor: palette.card },
              ]}
            >
              <View style={styles.originalHeader}>
                <AppText style={styles.replyDraft} variant="title">
                  {t('Message d’origine')}
                </AppText>
                <Pressable
                  accessibilityLabel={t('Fermer')}
                  accessibilityRole="button"
                  hitSlop={10}
                  onPress={() => setOriginalId(null)}
                >
                  <Ionicons color={palette.muted} name="close-circle" size={24} />
                </Pressable>
              </View>
              <ScrollView>
                <GroupMessageQuote
                  expanded
                  loading={replies.isLoading}
                  message={originals.get(originalId) ?? null}
                />
              </ScrollView>
            </SafeAreaView>
          </View>
        </Modal>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  originalSheet: { maxHeight: '70%' },
  originalHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  replyBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.control,
  },
  replyDraft: { flex: 1, minWidth: 0 },
  reactionOverlay: { flex: 1, justifyContent: 'flex-end' },
  reactionBackdrop: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  reactionSheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    gap: spacing.sm,
    padding: spacing.gutter,
  },
  reactionChoices: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  reactionChoice: {
    minWidth: 44,
    minHeight: 48,
    flexGrow: 1,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  reactionEmoji: { fontSize: 26, lineHeight: 34 },
  attachmentDraft: { paddingHorizontal: spacing.control, paddingTop: spacing.control },
  bubble: {
    borderRadius: 20,
    borderWidth: 1,
    gap: spacing.xs,
    maxWidth: 292,
    overflow: 'hidden',
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  bubbleColumn: { alignItems: 'flex-start', flexShrink: 1, gap: spacing.xxs },
  bubbleColumnOwn: { alignItems: 'flex-end' },
  centerState: { alignItems: 'center', flex: 1, gap: spacing.sm, justifyContent: 'center' },
  composer: {
    alignItems: 'flex-end',
    borderTopWidth: 1,
    flexDirection: 'row',
    gap: spacing.xs,
    padding: spacing.control,
  },
  composerButton: {
    alignItems: 'center',
    height: 44,
    justifyContent: 'center',
    width: 36,
  },
  controls: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    paddingHorizontal: spacing.xxs,
  },
  controlsOwn: { justifyContent: 'flex-end' },
  deleted: { fontStyle: 'italic' },
  deletedRow: { alignItems: 'center', flexDirection: 'row', gap: 5 },
  disabled: { opacity: 0.4 },
  editBanner: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  editCopy: { flex: 1, fontWeight: '700' },
  empty: { alignItems: 'center', gap: spacing.xs, padding: spacing.xxl },
  emptyText: { textAlign: 'center' },
  error: { paddingHorizontal: spacing.gutter, paddingVertical: spacing.xs, textAlign: 'center' },
  fill: { flex: 1 },
  input: {
    borderRadius: radii.button,
    borderWidth: 1,
    flex: 1,
    fontSize: 16,
    maxHeight: 110,
    minHeight: 44,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.control,
  },
  messageMeta: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.xs,
    justifyContent: 'flex-end',
  },
  messageRow: { alignItems: 'flex-end', flexDirection: 'row', gap: spacing.xs, width: '100%' },
  messageRowOwn: { justifyContent: 'flex-end', paddingLeft: 56 },
  pageButton: {
    alignItems: 'center',
    alignSelf: 'center',
    borderRadius: radii.round,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.xs,
    marginVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  reaction: {
    borderRadius: radii.round,
    borderWidth: 1,
    paddingHorizontal: spacing.xs,
    paddingVertical: 3,
  },
  send: { alignItems: 'center', height: 44, justifyContent: 'center', width: 40 },
  sender: { fontWeight: '800', paddingLeft: spacing.xs },
  separator: { height: spacing.control },
  timeline: { flexGrow: 1, padding: spacing.gutter },
});
