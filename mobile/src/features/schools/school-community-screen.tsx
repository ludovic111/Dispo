import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useHeaderHeight } from 'expo-router/react-navigation';
import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, FlatList, KeyboardAvoidingView, Platform, StyleSheet, View } from 'react-native';

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
import { ChatBubble, ChatInlineAction } from '@/components/ui/chat/chat-bubble';
import { ChatComposer, ChatComposerNotice } from '@/components/ui/chat/chat-composer';
import { ListRow } from '@/components/ui/list-row';
import { DispoButton } from '@/components/ui/pressable';
import { EmptyState, ErrorState, LoadingState, Screen } from '@/components/ui/screen';
import { communityContentMessage } from '@/domain/community-content';
import { useAuth } from '@/features/auth/auth-context';
import { MessageDayDivider } from '@/features/messages/message-controls';
import { formatSwiftPlaceholders } from '@/i18n/format';
import { useDispoTheme } from '@/theme/theme-context';
import { spacing } from '@/theme/tokens';

function SchoolMessageBubble({
  message,
  onAction,
  userId,
}: {
  message: SchoolMessage;
  onAction: (message: SchoolMessage) => void;
  userId: string;
}) {
  const { t } = useTranslation();
  const own = message.senderId === userId;
  const deleted = Boolean(message.deletedAt);
  const actionLabel = own
    ? `${t('Modifier')} / ${t('Supprimer')}`
    : `${t('Signaler')} / ${t('Bloquer')}`;
  const actionName = own ? 'edit' : 'activate';
  const canAct = !(deleted && own);
  return (
    <ChatBubble
      accessibilityActions={[{ label: actionLabel, name: actionName }]}
      accessibilityHint={actionLabel}
      accessibilityLabel={deleted ? t('Message supprimé') : message.text}
      accessibilityRole="button"
      actions={
        deleted ? null : (
          <ChatInlineAction
            accessibilityLabel={actionLabel}
            icon="ellipsis-horizontal"
            onPress={() => onAction(message)}
          />
        )
      }
      avatar={<Avatar name={message.senderName} size={28} uri={message.senderPhotoUrl} />}
      deleted={deleted}
      edited={Boolean(message.editedAt)}
      mine={own}
      onAccessibilityAction={() => onAction(message)}
      onLongPress={canAct ? () => onAction(message) : undefined}
      senderName={message.senderName || t('Membre')}
      text={message.text}
      timestamp={message.createdAt}
    />
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
    <View style={[styles.communityHeader, { borderBottomColor: palette.border }]}>
      <ListRow
        accessibilityLabel={t('Voir les membres')}
        accessory={
          <View style={styles.communityAccessory}>
            {affiliation.school.isVerified ? <VerifiedSchoolSeal compact /> : null}
            <Ionicons color={palette.muted} name="chevron-forward" size={18} />
          </View>
        }
        leading={<SchoolAvatar school={affiliation.school} size={42} />}
        onPress={() => router.push(`/schools/${affiliation.school.id}/members` as never)}
        subtitle={`${formatSwiftPlaceholders(t('%lld membres'), affiliation.memberCount)} · ${role}`}
        title={affiliation.school.name}
        tone="plain"
      />
    </View>
  );
}

export function SchoolCommunityScreen({ schoolId }: { schoolId: string }) {
  const headerHeight = useHeaderHeight();
  const { session } = useAuth();
  const userId = session?.user.id ?? '';
  const { palette } = useDispoTheme();
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
          onError: (error) =>
            setLocalError(t(communityContentMessage(error, 'Le message n’a pas pu être modifié.'))),
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
        onError: (error) => {
          setText((current) => current || clean);
          setLocalError(t(communityContentMessage(error, 'Le message n’a pas pu être envoyé.')));
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
          <EmptyState
            action={{
              label: t('Ajouter mon école'),
              onPress: () => router.replace(`/schools/${schoolId}/join` as never),
            }}
            icon="lock-closed-outline"
            message={t(
              'Retrouve les membres de ton école et échange dans sa conversation réservée',
            )}
            title={t('Ajouter mon école de musique')}
          />
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
        keyboardVerticalOffset={headerHeight}
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
            <View style={styles.invertedEmpty}>
              <EmptyState
                icon="chatbubbles-outline"
                message={t(
                  'Présente-toi, retrouve une classe ou monte un ensemble avec les autres membres.',
                )}
                title={t('La conversation commence ici')}
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
          accessibilityLabel={t('Message à la communauté')}
          error={localError}
          maxLength={SCHOOL_MESSAGE_MAX_LENGTH}
          onChangeText={setText}
          onSend={submit}
          placeholder={t('Message à la communauté')}
          sendDisabled={busy || !isValidSchoolMessage(text)}
          sendIcon={editing ? 'checkmark' : 'arrow-up'}
          sendLabel={editing ? t('Enregistrer') : t('Envoyer le message')}
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
          {text.length > 3_600 ? (
            <AppText color={palette.muted} style={styles.characterCount} variant="caption2">
              {text.length}/{SCHOOL_MESSAGE_MAX_LENGTH}
            </AppText>
          ) : null}
        </ChatComposer>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  // Compense le retournement d'une liste `inverted` (les deux axes sur Android).
  invertedEmpty: { transform: Platform.OS === 'android' ? [{ scale: -1 }] : [{ scaleY: -1 }] },
  characterCount: { textAlign: 'right' },
  communityAccessory: { alignItems: 'center', flexDirection: 'row', gap: spacing.xs },
  communityHeader: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: spacing.gutter,
  },
  fill: { flex: 1 },
  gated: { flex: 1, justifyContent: 'center', padding: spacing.gutter },
  pageAction: { alignSelf: 'center', marginVertical: spacing.sm },
  separator: { height: spacing.sm },
  timeline: { flexGrow: 1, padding: spacing.gutter },
});
