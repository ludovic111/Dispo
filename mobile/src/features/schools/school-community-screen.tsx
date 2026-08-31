import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';

import { SchoolAvatar, VerifiedSchoolSeal } from './school-components';
import {
  affiliationRoleLabel,
  buildSchoolMessageTimeline,
  isValidSchoolMessage,
  mergeSchoolMessagesNewestFirst,
  SCHOOL_MESSAGE_MAX_LENGTH,
  type SchoolCommunity,
  type SchoolMessage,
} from './school-model';
import {
  useBlockSchoolMember,
  useDeleteSchoolMessage,
  useEditSchoolMessage,
  useMarkSchoolSeen,
  useReportSchoolMessage,
  useSchoolCommunity,
  useSchoolMessages,
  useSendSchoolMessage,
} from './school-queries';

import { AppText } from '@/components/ui/app-text';
import { Avatar } from '@/components/ui/avatar';
import { DispoButton } from '@/components/ui/pressable';
import { ErrorState, LoadingState, Screen } from '@/components/ui/screen';
import { useAuth } from '@/features/auth/auth-context';
import { MessageDayDivider } from '@/features/messages/message-controls';
import { formatSwiftPlaceholders } from '@/i18n/format';
import { useDispoTheme } from '@/theme/theme-context';
import { billetInk, gradients, radii, spacing } from '@/theme/tokens';

function SchoolMessageBubble({
  message,
  onAction,
  userId,
}: {
  message: SchoolMessage;
  onAction: (message: SchoolMessage) => void;
  userId: string;
}) {
  const { palette } = useDispoTheme();
  const { i18n, t } = useTranslation();
  const own = message.senderId === userId;
  const actionLabel = own
    ? `${t('Modifier')} / ${t('Supprimer')}`
    : `${t('Signaler')} / ${t('Bloquer')}`;
  const actionName = own ? 'edit' : 'activate';
  return (
    <View style={[styles.messageRow, own && styles.messageRowOwn]}>
      {!own ? <Avatar name={message.senderName} size={28} uri={message.senderPhotoUrl} /> : null}
      <View style={[styles.bubbleColumn, own && styles.bubbleColumnOwn]}>
        {!own ? (
          <AppText color={palette.bronze} style={styles.senderName} variant="caption2">
            {message.senderName || t('Membre')}
          </AppText>
        ) : null}
        <Pressable
          accessibilityActions={[{ label: actionLabel, name: actionName }]}
          accessibilityHint={actionLabel}
          accessibilityLabel={message.deletedAt ? t('Message supprimé') : message.text}
          accessibilityRole="button"
          delayLongPress={260}
          disabled={Boolean(message.deletedAt && own)}
          onAccessibilityAction={() => onAction(message)}
          onLongPress={() => onAction(message)}
          style={({ pressed }) => pressed && !message.deletedAt && styles.messagePressed}
        >
          {own ? (
            <LinearGradient colors={gradients.hero} style={styles.bubble}>
              <AppText
                color={message.deletedAt ? palette.muted : billetInk}
                style={message.deletedAt && styles.deleted}
                variant="subheadline"
              >
                {message.deletedAt ? t('Message supprimé') : message.text}
              </AppText>
            </LinearGradient>
          ) : (
            <View
              style={[
                styles.bubble,
                { backgroundColor: palette.card, borderColor: palette.border },
              ]}
            >
              <AppText
                color={message.deletedAt ? palette.muted : palette.text}
                style={message.deletedAt && styles.deleted}
                variant="subheadline"
              >
                {message.deletedAt ? t('Message supprimé') : message.text}
              </AppText>
            </View>
          )}
        </Pressable>
        <View style={[styles.messageMeta, own && styles.messageMetaOwn]}>
          <AppText color={palette.muted} variant="caption2">
            {new Intl.DateTimeFormat(i18n.resolvedLanguage ?? i18n.language ?? 'fr', {
              hour: '2-digit',
              minute: '2-digit',
            }).format(new Date(message.createdAt))}
            {message.editedAt && !message.deletedAt ? ` ${t('· modifié')}` : ''}
          </AppText>
          {!message.deletedAt ? (
            <Pressable
              accessibilityLabel={actionLabel}
              accessibilityRole="button"
              hitSlop={8}
              onPress={() => onAction(message)}
            >
              <Ionicons color={palette.muted} name="ellipsis-horizontal" size={16} />
            </Pressable>
          ) : null}
        </View>
      </View>
    </View>
  );
}

function CommunityHeader({ community }: { community: SchoolCommunity }) {
  const { palette } = useDispoTheme();
  const { t } = useTranslation();
  const affiliation = community.affiliation;
  const role = affiliation.roleLabel?.trim()
    ? affiliationRoleLabel(affiliation)
    : t(affiliationRoleLabel(affiliation));
  return (
    <Pressable
      accessibilityLabel={t('Voir les membres')}
      accessibilityRole="button"
      onPress={() => router.push(`/schools/${affiliation.school.id}/members` as never)}
      style={({ pressed }) => [
        styles.communityHeader,
        { backgroundColor: palette.card, borderColor: palette.border },
        pressed && styles.messagePressed,
      ]}
    >
      <SchoolAvatar school={affiliation.school} size={42} />
      <View style={styles.communityHeaderCopy}>
        <View style={styles.communityTitleRow}>
          <AppText numberOfLines={1} style={styles.communityTitle} variant="subheadline">
            {affiliation.school.name}
          </AppText>
          {affiliation.school.isVerified ? <VerifiedSchoolSeal compact /> : null}
        </View>
        <AppText color={palette.muted} numberOfLines={1} variant="caption2">
          {formatSwiftPlaceholders(t('%lld membres'), affiliation.memberCount)} · {role}
        </AppText>
      </View>
      <Ionicons color={palette.muted} name="chevron-forward" size={16} />
    </Pressable>
  );
}

export function SchoolCommunityScreen({ schoolId }: { schoolId: string }) {
  const { session } = useAuth();
  const userId = session?.user.id ?? '';
  const { dark, palette } = useDispoTheme();
  const { t } = useTranslation();
  const communityQuery = useSchoolCommunity(schoolId);
  const community = communityQuery.data;
  const query = useSchoolMessages(community?.channelId ?? '', schoolId, Boolean(community));
  const markSeen = useMarkSchoolSeen();
  const send = useSendSchoolMessage();
  const edit = useEditSchoolMessage();
  const remove = useDeleteSchoolMessage();
  const report = useReportSchoolMessage();
  const block = useBlockSchoolMember();
  const [text, setText] = useState('');
  const [editing, setEditing] = useState<SchoolMessage | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const messages = useMemo(
    () => mergeSchoolMessagesNewestFirst(query.data?.pages.flatMap((page) => page.items) ?? []),
    [query.data],
  );
  const timeline = useMemo(() => buildSchoolMessageTimeline(messages), [messages]);

  useFocusEffect(
    useCallback(() => {
      if (!schoolId) return undefined;
      markSeen(schoolId);
      return () => markSeen(schoolId);
    }, [markSeen, schoolId]),
  );

  const confirmBlock = (message: SchoolMessage) => {
    Alert.alert(
      t('Bloquer ce membre ?'),
      t('Vous ne verrez plus ses messages. Cette personne ne sera pas avertie.'),
      [
        { style: 'cancel', text: t('Annuler') },
        {
          onPress: () =>
            block.mutate(message.senderId, {
              onError: () => Alert.alert(t('Sécurité'), t("Le blocage n'a pas pu etre applique.")),
            }),
          style: 'destructive',
          text: t('Bloquer'),
        },
      ],
    );
  };

  const openMessageActions = (message: SchoolMessage) => {
    if (message.senderId === userId) {
      if (message.deletedAt) return;
      Alert.alert(t('Modifier'), undefined, [
        { style: 'cancel', text: t('Annuler') },
        {
          onPress: () => {
            setEditing(message);
            setText(message.text);
          },
          text: t('Modifier'),
        },
        {
          onPress: () =>
            Alert.alert(
              t('Supprimer ce message ?'),
              t('Le contenu disparaîtra chez tous les participants.'),
              [
                { style: 'cancel', text: t('Annuler') },
                {
                  onPress: () =>
                    remove.mutate(
                      { channelId: message.channelId, messageId: message.id },
                      {
                        onError: () =>
                          Alert.alert(t('Erreur'), t('Le message n’a pas pu être supprimé.')),
                      },
                    ),
                  style: 'destructive',
                  text: t('Supprimer'),
                },
              ],
            ),
          style: 'destructive',
          text: t('Supprimer pour tout le monde'),
        },
      ]);
      return;
    }
    Alert.alert(message.senderName || t('Membre'), undefined, [
      { style: 'cancel', text: t('Annuler') },
      {
        onPress: () =>
          report.mutate(message, {
            onError: () => Alert.alert(t('Sécurité'), t("Le signalement n'a pas pu etre envoye.")),
            onSuccess: () =>
              Alert.alert(
                t('Signalement envoyé'),
                t('Signalement envoyé. Merci de nous aider à protéger la communauté.'),
              ),
          }),
        text: t('Signaler'),
      },
      { onPress: () => confirmBlock(message), style: 'destructive', text: t('Bloquer') },
    ]);
  };

  const submit = () => {
    if (!community || !isValidSchoolMessage(text)) return;
    const clean = text.trim();
    setLocalError(null);
    if (editing) {
      edit.mutate(
        { channelId: community.channelId, messageId: editing.id, text: clean },
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
    setText('');
    send.mutate(
      { channelId: community.channelId, text: clean },
      {
        onError: () => {
          setText((current) => current || clean);
          setLocalError(t('Le message n’a pas pu être envoyé.'));
        },
      },
    );
  };

  if (communityQuery.isLoading) {
    return (
      <Screen nativeHeader>
        <LoadingState label={t('Ouverture de la communauté…')} />
      </Screen>
    );
  }
  if (communityQuery.isError) {
    return (
      <Screen nativeHeader>
        <ErrorState
          message={communityQuery.error.message}
          onRetry={() => void communityQuery.refetch()}
        />
      </Screen>
    );
  }
  if (!community) {
    return (
      <Screen nativeHeader>
        <View style={styles.gated}>
          <Ionicons color={palette.bronze} name="lock-closed-outline" size={36} />
          <AppText style={styles.gatedTitle} variant="title">
            {t('Ajouter mon école de musique')}
          </AppText>
          <AppText color={palette.muted} style={styles.gatedCopy}>
            {t('Retrouve les membres de ton école et échange dans sa conversation réservée')}
          </AppText>
          <DispoButton onPress={() => router.replace(`/schools/${schoolId}/join` as never)}>
            {t('Ajouter mon école')}
          </DispoButton>
        </View>
      </Screen>
    );
  }
  if (query.isLoading) {
    return (
      <Screen nativeHeader>
        <CommunityHeader community={community} />
        <LoadingState label={t('Chargement des messages…')} />
      </Screen>
    );
  }
  if (query.isError) {
    return (
      <Screen nativeHeader>
        <CommunityHeader community={community} />
        <ErrorState
          message={t('Les messages n’ont pas pu être chargés.')}
          onRetry={() => void query.refetch()}
        />
      </Screen>
    );
  }

  const busy = send.isPending || edit.isPending;
  return (
    <Screen nativeHeader>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={90}
        style={styles.fill}
      >
        <CommunityHeader community={community} />
        <FlatList
          contentContainerStyle={styles.timeline}
          data={timeline}
          inverted
          keyboardDismissMode="interactive"
          keyboardShouldPersistTaps="handled"
          keyExtractor={(item) => item.id}
          maintainVisibleContentPosition={{ minIndexForVisible: 0 }}
          renderItem={({ item }) =>
            item.kind === 'day' ? (
              <MessageDayDivider date={item.date} />
            ) : (
              <SchoolMessageBubble
                message={item.message}
                onAction={openMessageActions}
                userId={userId}
              />
            )
          }
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons color={palette.bronze} name="chatbubbles-outline" size={38} />
              <AppText variant="title">{t('La conversation commence ici')}</AppText>
              <AppText color={palette.muted} style={styles.emptyCopy}>
                {t(
                  'Présente-toi, retrouve une classe ou monte un ensemble avec les autres membres.',
                )}
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
        <View style={[styles.composerShell, { borderTopColor: palette.border }]}>
          <BlurView intensity={72} style={StyleSheet.absoluteFill} tint={dark ? 'dark' : 'light'} />
          <View style={styles.composer}>
            <TextInput
              accessibilityLabel={t('Message à la communauté')}
              maxLength={SCHOOL_MESSAGE_MAX_LENGTH}
              multiline
              onChangeText={setText}
              placeholder={t('Message à la communauté')}
              placeholderTextColor={palette.muted}
              selectionColor={palette.electric}
              style={[
                styles.input,
                { backgroundColor: palette.card, borderColor: palette.border, color: palette.text },
              ]}
              value={text}
            />
            {text.length > 3_600 ? (
              <AppText color={palette.muted} style={styles.characterCount} variant="caption2">
                {text.length}/{SCHOOL_MESSAGE_MAX_LENGTH}
              </AppText>
            ) : null}
            <Pressable
              accessibilityLabel={editing ? t('Enregistrer') : t('Envoyer le message')}
              accessibilityRole="button"
              accessibilityState={{ disabled: busy || !isValidSchoolMessage(text) }}
              disabled={busy || !isValidSchoolMessage(text)}
              onPress={submit}
              style={[styles.send, (busy || !isValidSchoolMessage(text)) && styles.disabled]}
            >
              {busy ? (
                <ActivityIndicator color={palette.electric} size="small" />
              ) : (
                <Ionicons
                  color={isValidSchoolMessage(text) ? palette.electric : palette.muted}
                  name={editing ? 'checkmark-circle' : 'arrow-up-circle'}
                  size={36}
                />
              )}
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  bubble: {
    borderRadius: 15,
    borderWidth: 1,
    maxWidth: 292,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  bubbleColumn: { alignItems: 'flex-start', flexShrink: 1, gap: 3 },
  bubbleColumnOwn: { alignItems: 'flex-end' },
  characterCount: { marginBottom: 4 },
  communityHeader: {
    alignItems: 'center',
    borderBottomWidth: 1,
    flexDirection: 'row',
    gap: 11,
    minHeight: 64,
    paddingHorizontal: spacing.gutter,
    paddingVertical: spacing.control,
  },
  communityHeaderCopy: { flex: 1, gap: 2 },
  communityTitle: { flexShrink: 1, fontWeight: '800' },
  communityTitleRow: { alignItems: 'center', flexDirection: 'row', gap: spacing.tight },
  composer: {
    alignItems: 'flex-end',
    flexDirection: 'row',
    gap: spacing.xs,
  },
  composerShell: {
    borderTopWidth: 1,
    overflow: 'hidden',
    padding: spacing.control,
  },
  deleted: { fontStyle: 'italic' },
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
  emptyCopy: { maxWidth: 330, textAlign: 'center' },
  error: { paddingHorizontal: spacing.gutter, paddingVertical: spacing.xs, textAlign: 'center' },
  fill: { flex: 1 },
  gated: {
    alignItems: 'center',
    flex: 1,
    gap: spacing.sm,
    justifyContent: 'center',
    padding: spacing.xxl,
  },
  gatedCopy: { maxWidth: 340, textAlign: 'center' },
  gatedTitle: { textAlign: 'center' },
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
  messageMeta: { alignItems: 'center', flexDirection: 'row', gap: spacing.xs },
  messageMetaOwn: { justifyContent: 'flex-end' },
  messagePressed: { opacity: 0.75 },
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
  send: { alignItems: 'center', height: 44, justifyContent: 'center', width: 42 },
  senderName: { fontWeight: '800', paddingLeft: spacing.xs },
  separator: { height: spacing.control },
  timeline: { flexGrow: 1, padding: spacing.gutter },
});
