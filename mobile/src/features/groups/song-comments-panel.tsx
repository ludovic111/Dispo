import { useEffect, useMemo, useState, type RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Pressable, StyleSheet, View, type TextInput } from 'react-native';

import {
  GROUP_REACTION_EMOJIS,
  threadSongComments,
  type GroupReactionEmoji,
  type GroupSongComment,
} from './group-model';
import {
  useDeleteSongComment,
  useEditSongComment,
  useSongComment,
  useSongCommentReaction,
} from './group-queries';
import { isValidSongComment } from './group-repository';

import { AppText } from '@/components/ui/app-text';
import { Avatar } from '@/components/ui/avatar';
import { Card } from '@/components/ui/card';
import { FormField } from '@/components/ui/form-field';
import { LinkifiedText } from '@/components/ui/linkified-text';
import { ListRow } from '@/components/ui/list-row';
import { DispoButton, IconButton } from '@/components/ui/pressable';
import { SectionHeader } from '@/components/ui/section';
import { BottomSheet } from '@/components/ui/sheet';
import { reportSendFailure } from '@/features/messages/moderated-message';
import { useDispoTheme } from '@/theme/theme-context';
import {
  disabledStyle,
  minimumTouchTarget,
  pressedStyle,
  radii,
  spacing,
  tint,
} from '@/theme/tokens';

interface ReplyTarget {
  name: string;
  rootId: string;
}

export function formatSongCommentTimestamp(createdAt: string, language: string): string | null {
  const date = new Date(createdAt);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat(language || 'fr', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

function CommentItem({
  comment,
  isReply,
  onOpenActions,
  onReact,
  reactionsDisabled,
}: {
  comment: GroupSongComment;
  isReply: boolean;
  onOpenActions: () => void;
  onReact: (emoji: GroupReactionEmoji) => void;
  reactionsDisabled: boolean;
}) {
  const { i18n, t } = useTranslation();
  const { palette } = useDispoTheme();
  const timestamp = formatSongCommentTimestamp(
    comment.createdAt,
    i18n.resolvedLanguage || i18n.language,
  );
  const meta = [timestamp, comment.editedAt ? t('· modifié') : null].filter(Boolean).join(' ');
  return (
    <Pressable
      accessibilityHint={t('Options du commentaire')}
      accessibilityLabel={`${comment.authorName} · ${comment.text}`}
      accessibilityRole="button"
      onLongPress={onOpenActions}
      style={({ pressed }) => [
        styles.commentRow,
        isReply && styles.replyRow,
        pressed && pressedStyle,
      ]}
    >
      <Avatar name={comment.authorName} size={isReply ? 24 : 30} uri={comment.authorPhotoUrl} />
      <View style={styles.commentCopy}>
        <View style={styles.metaRow}>
          <AppText numberOfLines={1} style={styles.author} variant="caption" weight="bold">
            {comment.authorName}
          </AppText>
          {meta ? (
            <AppText color={palette.muted} numberOfLines={1} variant="caption2">
              {meta}
            </AppText>
          ) : null}
        </View>
        <LinkifiedText>{comment.text}</LinkifiedText>
        {comment.reactions.length ? (
          <View style={styles.reactions}>
            {comment.reactions.map((reaction) => (
              <Pressable
                accessibilityLabel={`${reaction.emoji}, ${reaction.count}`}
                accessibilityRole="button"
                accessibilityState={{ disabled: reactionsDisabled, selected: reaction.reactedByMe }}
                disabled={reactionsDisabled}
                key={reaction.emoji}
                onPress={() => onReact(reaction.emoji)}
                style={({ pressed }) => [
                  styles.reactionChip,
                  {
                    backgroundColor: reaction.reactedByMe
                      ? tint(palette.electric, 0.18)
                      : palette.card,
                    borderColor: reaction.reactedByMe ? palette.electric : palette.edge,
                  },
                  pressed && pressedStyle,
                  reactionsDisabled && disabledStyle,
                ]}
              >
                <AppText style={styles.reactionText} variant="caption2">
                  {reaction.count > 1 ? `${reaction.emoji} ${reaction.count}` : reaction.emoji}
                </AppText>
              </Pressable>
            ))}
          </View>
        ) : null}
      </View>
      <IconButton
        accessibilityLabel={`${t('Options du commentaire')} · ${comment.authorName}`}
        icon="ellipsis-horizontal"
        iconColor={palette.muted}
        onPress={onOpenActions}
        variant="plain"
      />
    </Pressable>
  );
}

/**
 * Fil de commentaires d'un morceau : le leader ouvre les discussions, tout le
 * groupe répond et réagit. Un seul niveau de réponses, comme sur Instagram.
 */
export function SongCommentsPanel({
  comments,
  draft,
  groupId,
  inputRef,
  isLeader,
  onComposerBlur,
  onComposerFocus,
  onDraftChange,
  songId,
  userId,
}: {
  comments: readonly GroupSongComment[];
  /** Brouillon tenu par l'écran parent pour survivre aux changements d'onglet. */
  draft?: string | undefined;
  groupId: string;
  inputRef: RefObject<TextInput | null>;
  isLeader: boolean;
  onComposerBlur?: (() => void) | undefined;
  onComposerFocus?: (() => void) | undefined;
  onDraftChange?: ((text: string) => void) | undefined;
  songId: string;
  userId: string;
}) {
  const { t } = useTranslation();
  const { palette } = useDispoTheme();
  const add = useSongComment();
  const edit = useEditSongComment();
  const remove = useDeleteSongComment();
  const react = useSongCommentReaction();
  const [localText, setLocalText] = useState('');
  const text = draft ?? localText;
  const setText = onDraftChange ?? setLocalText;
  const [error, setError] = useState<string | null>(null);
  const [replyTarget, setReplyTo] = useState<ReplyTarget | null>(null);
  const [editTarget, setEditing] = useState<GroupSongComment | null>(null);
  const [actionTarget, setActionTarget] = useState<GroupSongComment | null>(null);
  const [reactionTarget, setReactionTarget] = useState<GroupSongComment | null>(null);
  const threads = useMemo(() => threadSongComments(comments), [comments]);
  const commentIds = useMemo(() => new Set(comments.map((comment) => comment.id)), [comments]);
  // Un commentaire supprimé ailleurs ne reste jamais une cible fantôme.
  const replyTo = replyTarget && commentIds.has(replyTarget.rootId) ? replyTarget : null;
  const editing = editTarget && commentIds.has(editTarget.id) ? editTarget : null;

  const contextActive = replyTo !== null || editing !== null;
  useEffect(() => {
    if (!contextActive) return;
    const frame = requestAnimationFrame(() => inputRef.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [contextActive, inputRef]);

  const composerVisible = isLeader || contextActive;
  const pending = add.isPending || edit.isPending;
  const cancelContext = () => {
    setReplyTo(null);
    if (editing) setText('');
    setEditing(null);
  };
  const submit = () => {
    setError(null);
    if (editing) {
      edit.mutate(
        { comment: editing, text },
        {
          onError: (error) =>
            reportSendFailure(
              error,
              t,
              t("Le commentaire n'a pas pu être modifié. Réessaie."),
              setError,
            ),
          onSuccess: () => {
            setEditing(null);
            setText('');
          },
        },
      );
      return;
    }
    add.mutate(
      { groupId, parentId: replyTo?.rootId ?? null, songId, text },
      {
        onError: (error) =>
          reportSendFailure(
            error,
            t,
            t("Le commentaire n'a pas pu être enregistré. Réessaie."),
            setError,
          ),
        onSuccess: () => {
          setText('');
          setReplyTo(null);
        },
      },
    );
  };
  const startReply = (comment: GroupSongComment) => {
    setEditing(null);
    setReplyTo({ name: comment.authorName, rootId: comment.parentId ?? comment.id });
  };
  const startEdit = (comment: GroupSongComment) => {
    setReplyTo(null);
    setEditing(comment);
    setText(comment.text);
  };
  const confirmDeletion = (comment: GroupSongComment) =>
    Alert.alert(t('Supprimer ce commentaire ?'), t('Cette action est définitive.'), [
      { style: 'cancel', text: t('Annuler') },
      {
        onPress: () => {
          setError(null);
          if (editing?.id === comment.id) cancelContext();
          remove.mutate(comment, {
            onError: () => setError(t("Le commentaire n'a pas pu être supprimé. Réessaie.")),
          });
        },
        style: 'destructive',
        text: t('Supprimer'),
      },
    ]);
  const toggleReaction = (comment: GroupSongComment, emoji: GroupReactionEmoji) => {
    setError(null);
    react.mutate(
      { comment, emoji },
      { onError: () => setError(t("La réaction n'a pas pu être enregistrée.")) },
    );
  };
  const renderComment = (comment: GroupSongComment, isReply: boolean) => (
    <CommentItem
      comment={comment}
      isReply={isReply}
      key={comment.id}
      onOpenActions={() => setActionTarget(comment)}
      onReact={(emoji) => toggleReaction(comment, emoji)}
      reactionsDisabled={react.isPending}
    />
  );
  const canEditTarget = actionTarget?.authorId === userId;
  const canDeleteTarget = isLeader || canEditTarget;

  return (
    <Card style={styles.card}>
      <SectionHeader title={t('Commentaires')} />
      {threads.length === 0 ? (
        <AppText color={palette.muted} variant="caption">
          {t('Aucun commentaire pour l’instant.')}
        </AppText>
      ) : null}
      {threads.map((thread) => (
        <View key={thread.root.id} style={styles.thread}>
          {renderComment(thread.root, false)}
          {thread.replies.map((reply) => renderComment(reply, true))}
        </View>
      ))}
      {composerVisible ? (
        <View style={styles.composerBlock}>
          {contextActive ? (
            <View style={styles.composerContext}>
              <AppText
                color={palette.muted}
                numberOfLines={1}
                style={styles.flex}
                variant="caption"
              >
                {editing
                  ? t('Modifier le commentaire')
                  : t('Réponse à {{name}}', { name: replyTo?.name ?? '' })}
              </AppText>
              <IconButton
                accessibilityLabel={t('Annuler')}
                icon="close"
                iconColor={palette.muted}
                onPress={cancelContext}
                variant="plain"
              />
            </View>
          ) : null}
          <View style={styles.composer}>
            <View style={styles.flex}>
              <FormField
                ref={inputRef}
                label={editing ? t('Modifier le commentaire') : t('Ajouter une note')}
                multiline
                numberOfLines={3}
                onBlur={onComposerBlur}
                onChangeText={setText}
                onFocus={onComposerFocus}
                onPressIn={onComposerFocus}
                placeholder={t('Intro, fin, consigne…')}
                style={styles.input}
                value={text}
              />
            </View>
            <DispoButton
              disabled={!isValidSongComment(text) || pending}
              icon={editing ? 'checkmark' : 'arrow-up'}
              loading={pending}
              onPress={submit}
              size="compact"
            >
              {editing ? t('Enregistrer') : t('Envoyer')}
            </DispoButton>
          </View>
        </View>
      ) : (
        <AppText color={palette.muted} variant="caption">
          {t('Seul le leader peut ouvrir une discussion. Tu peux répondre et réagir.')}
        </AppText>
      )}
      {error ? (
        <AppText accessibilityLiveRegion="polite" color={palette.error} variant="caption">
          {error}
        </AppText>
      ) : null}
      {actionTarget ? (
        <BottomSheet onClose={() => setActionTarget(null)} title={actionTarget.authorName} visible>
          <ListRow
            accessory={<View />}
            leadingIcon="arrow-undo-outline"
            onPress={() => {
              setActionTarget(null);
              startReply(actionTarget);
            }}
            title={t('Répondre')}
            tone="plain"
          />
          <ListRow
            accessory={<View />}
            leadingIcon="happy-outline"
            onPress={() => {
              setActionTarget(null);
              setReactionTarget(actionTarget);
            }}
            title={t('Réagir')}
            tone="plain"
          />
          {canEditTarget ? (
            <ListRow
              accessory={<View />}
              leadingIcon="create-outline"
              onPress={() => {
                setActionTarget(null);
                startEdit(actionTarget);
              }}
              title={t('Modifier')}
              tone="plain"
            />
          ) : null}
          {canDeleteTarget ? (
            <ListRow
              accessory={<View />}
              leadingIcon="trash-outline"
              leadingIconColor={palette.error}
              onPress={() => {
                setActionTarget(null);
                confirmDeletion(actionTarget);
              }}
              title={t('Supprimer')}
              tone="plain"
            />
          ) : null}
        </BottomSheet>
      ) : null}
      {reactionTarget ? (
        <BottomSheet onClose={() => setReactionTarget(null)} title={t('Réagir')} visible>
          <View style={styles.reactionChoices}>
            {GROUP_REACTION_EMOJIS.map((emoji) => (
              <Pressable
                accessibilityLabel={`${t('Réagir')} ${emoji}`}
                accessibilityRole="button"
                accessibilityState={{ selected: reactionTarget.myReaction === emoji }}
                key={emoji}
                onPress={() => {
                  const target = reactionTarget;
                  setReactionTarget(null);
                  toggleReaction(target, emoji);
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
    </Card>
  );
}

const replyIndent = 30 + spacing.xs;

const styles = StyleSheet.create({
  author: { flexShrink: 1 },
  card: { gap: spacing.sm },
  commentCopy: { flex: 1, gap: spacing.xxs, minWidth: 0 },
  commentRow: { alignItems: 'flex-start', flexDirection: 'row', gap: spacing.xs },
  composer: { alignItems: 'flex-end', flexDirection: 'row', gap: spacing.xs },
  composerBlock: { gap: spacing.xxs },
  composerContext: { alignItems: 'center', flexDirection: 'row', gap: spacing.xs },
  flex: { flex: 1, minWidth: 0 },
  input: { minHeight: 84, textAlignVertical: 'top' },
  metaRow: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  reactionChip: {
    borderRadius: radii.round,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: spacing.xs,
    paddingVertical: spacing.xxs,
  },
  reactionChoice: {
    alignItems: 'center',
    borderRadius: radii.round,
    height: minimumTouchTarget,
    justifyContent: 'center',
    width: minimumTouchTarget,
  },
  reactionChoices: { flexDirection: 'row', gap: spacing.xxs, justifyContent: 'space-between' },
  reactionEmoji: { textAlign: 'center' },
  reactionText: { fontVariant: ['tabular-nums'] },
  reactions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xxs },
  replyRow: { paddingLeft: replyIndent },
  thread: { gap: spacing.xs },
});
