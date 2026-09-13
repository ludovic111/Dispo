import { router } from 'expo-router';
import { useHeaderHeight } from 'expo-router/react-navigation';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';

import { GroupAvatar } from './group-avatar';
import type { GroupMember, GroupMemberKind } from './group-model';
import {
  useAddManualGroupMember,
  useUpdateManualGroupMember,
  useRemoveManualGroupMember,
  useCancelGroupInvitation,
  useGroup,
  useGroupProfileCandidates,
  useInviteGroupMember,
  useRemoveGroupMember,
  useTransferGroupLeadership,
  useUpdateGroupMember,
} from './group-queries';

import { AppText } from '@/components/ui/app-text';
import { Card } from '@/components/ui/card';
import { ChoiceChip } from '@/components/ui/choice-chip';
import { FormField } from '@/components/ui/form-field';
import { ListRow } from '@/components/ui/list-row';
import { DispoButton, IconButton } from '@/components/ui/pressable';
import { EmptyState, ErrorState, LoadingState, Screen } from '@/components/ui/screen';
import { SectionHeader } from '@/components/ui/section';
import { BottomSheet } from '@/components/ui/sheet';
import { Tag } from '@/components/ui/tag';
import { useAuth } from '@/features/auth/auth-context';
import { useDispoTheme } from '@/theme/theme-context';
import { pressedStyle, spacing, tint } from '@/theme/tokens';

interface MemberAction {
  destructive?: boolean;
  icon: 'person-remove-outline' | 'trophy-outline';
  label: string;
  onPress: () => void;
}

/** Feuille d'actions secondaires d'un membre : une seule action reste visible sur la carte. */
function MemberActionsSheet({
  actions,
  onClose,
  title,
  visible,
}: {
  actions: MemberAction[];
  onClose: () => void;
  title: string;
  visible: boolean;
}) {
  const { palette } = useDispoTheme();
  return (
    <BottomSheet onClose={onClose} title={title} visible={visible}>
      {actions.map((action) => (
        <ListRow
          accessory={<View />}
          key={action.label}
          leadingIcon={action.icon}
          leadingIconColor={action.destructive ? palette.error : palette.electric}
          onPress={() => {
            onClose();
            action.onPress();
          }}
          title={action.label}
          tone="plain"
        />
      ))}
    </BottomSheet>
  );
}

function MemberHeader({
  member,
  onOpenActions,
  userId,
}: {
  member: GroupMember;
  onOpenActions?: () => void;
  userId: string;
}) {
  const { palette } = useDispoTheme();
  const { t } = useTranslation();
  const isMe = member.id === userId;
  return (
    <View style={styles.memberTop}>
      <Pressable
        accessibilityLabel={`${t('Voir le profil')} · ${member.name}`}
        accessibilityRole="button"
        accessibilityState={{ disabled: isMe }}
        disabled={isMe}
        onPress={() => router.push(`/profiles/${member.id}` as never)}
        style={({ pressed }) => [styles.profileButton, pressed && pressedStyle]}
      >
        <GroupAvatar emoji="🎵" name={member.name} photoUrl={member.photoUrl} size={42} />
        <View style={styles.memberCopy}>
          <View style={styles.memberNameLine}>
            <AppText numberOfLines={2} style={styles.memberName} variant="headline">
              {isMe ? t('Toi') : member.name}
            </AppText>
            {member.isLeader ? <Tag color={palette.bronze} label={t('👑 Leader')} /> : null}
            {!member.isLeader && member.kind === 'guest' ? (
              <Tag color={palette.rehearsal} label={`🌠 ${t('Special guest')}`} />
            ) : null}
          </View>
          <View style={styles.instruments}>
            {member.role ? <Tag color={palette.electric} label={member.role} /> : null}
            {member.instruments
              .filter((instrument) => instrument !== member.role)
              .slice(0, 3)
              .map((instrument) => (
                <Tag color={palette.bronze} key={instrument} label={t(instrument)} />
              ))}
          </View>
        </View>
      </Pressable>
      {onOpenActions ? (
        <IconButton
          accessibilityLabel={`${t('Gérer')} · ${member.name}`}
          icon="ellipsis-horizontal"
          onPress={onOpenActions}
          variant="plain"
        />
      ) : null}
    </View>
  );
}

function MemberCard({
  groupId,
  isCurrentLeader,
  member,
  userId,
}: {
  groupId: string;
  isCurrentLeader: boolean;
  member: GroupMember;
  userId: string;
}) {
  const { palette } = useDispoTheme();
  const { t } = useTranslation();
  const update = useUpdateGroupMember();
  const remove = useRemoveGroupMember();
  const transfer = useTransferGroupLeadership();
  const [role, setRole] = useState(member.role ?? '');
  const [actionsOpen, setActionsOpen] = useState(false);
  const isMe = member.id === userId;
  const canManage = isCurrentLeader && !isMe && !member.isLeader;
  const roleDirty = role.trim() !== (member.role ?? '');
  const actions: MemberAction[] = [
    ...(member.kind === 'permanent'
      ? [
          {
            icon: 'trophy-outline' as const,
            label: t('Nommer leader'),
            onPress: () =>
              Alert.alert(
                t('Nommer {{name}} leader ?', { name: member.name }),
                t('Tu perdras la gestion du groupe.'),
                [
                  { style: 'cancel', text: t('Annuler') },
                  {
                    onPress: () => transfer.mutate({ groupId, profileId: member.id }),
                    text: t('Nommer leader'),
                  },
                ],
              ),
          },
        ]
      : []),
    {
      destructive: true,
      icon: 'person-remove-outline' as const,
      label: t('Exclure'),
      onPress: () =>
        Alert.alert(t('Exclure {{name}} ?', { name: member.name }), undefined, [
          { style: 'cancel', text: t('Annuler') },
          {
            onPress: () => remove.mutate({ groupId, profileId: member.id }),
            style: 'destructive',
            text: t('Exclure'),
          },
        ]),
    },
  ];
  return (
    <Card padding={spacing.sm}>
      <MemberHeader
        member={member}
        {...(canManage ? { onOpenActions: () => setActionsOpen(true) } : {})}
        userId={userId}
      />
      {canManage ? (
        <View style={[styles.manage, { borderTopColor: tint(palette.bronze, 0.2) }]}>
          <View style={styles.kindRow}>
            <View style={styles.flex}>
              <ChoiceChip
                label={t('Permanent')}
                onPress={() => update.mutate({ groupId, kind: 'permanent', profileId: member.id })}
                selected={member.kind === 'permanent'}
              />
            </View>
            <View style={styles.flex}>
              <ChoiceChip
                label={`🌠 ${t('Special guest')}`}
                onPress={() => update.mutate({ groupId, kind: 'guest', profileId: member.id })}
                selected={member.kind === 'guest'}
              />
            </View>
          </View>
          <FormField
            label={t('Rôle dans le groupe')}
            onChangeText={setRole}
            placeholder={t('Piano, Batterie…')}
            value={role}
          />
          {roleDirty ? (
            <DispoButton
              accessibilityLabel={t('Enregistrer le rôle')}
              icon="checkmark"
              loading={update.isPending}
              onPress={() =>
                update.mutate({ groupId, profileId: member.id, role: role.trim() || null })
              }
              size="compact"
            >
              {t('Enregistrer le rôle')}
            </DispoButton>
          ) : null}
          {actionsOpen ? (
            <MemberActionsSheet
              actions={actions}
              onClose={() => setActionsOpen(false)}
              title={member.name}
              visible
            />
          ) : null}
        </View>
      ) : null}
    </Card>
  );
}

function ManualMemberCard({
  member,
  groupId,
  isLeader,
}: {
  member: GroupMember;
  groupId: string;
  isLeader: boolean;
}) {
  const { t } = useTranslation();
  const { palette } = useDispoTheme();
  const update = useUpdateManualGroupMember();
  const remove = useRemoveManualGroupMember();
  const [editing, setEditing] = useState(false);
  const [actionsOpen, setActionsOpen] = useState(false);
  const [name, setName] = useState(member.name);
  const [role, setRole] = useState(member.role ?? '');
  const [kind, setKind] = useState(member.kind);
  return (
    <Card padding={spacing.sm}>
      <View style={styles.memberTop}>
        <View style={styles.profileButton}>
          <GroupAvatar emoji="🎵" name={member.name} photoUrl={null} size={42} />
          <View style={styles.memberCopy}>
            <AppText numberOfLines={2} variant="headline">
              {member.name}
            </AppText>
            <View style={styles.instruments}>
              <Tag color={palette.muted} label={t('Sans compte Dispo')} />
              {member.role ? <Tag color={palette.electric} label={member.role} /> : null}
              {member.kind === 'guest' ? (
                <Tag color={palette.rehearsal} label={t('Special guest')} />
              ) : null}
            </View>
          </View>
        </View>
        {isLeader && !editing ? (
          <IconButton
            accessibilityLabel={`${t('Gérer')} · ${member.name}`}
            icon="ellipsis-horizontal"
            onPress={() => setActionsOpen(true)}
            variant="plain"
          />
        ) : null}
      </View>
      {isLeader && !editing ? (
        <>
          <View style={styles.inlineAction}>
            <DispoButton
              icon="create-outline"
              onPress={() => {
                setName(member.name);
                setRole(member.role ?? '');
                setKind(member.kind);
                setEditing(true);
              }}
              size="compact"
              variant="ghost"
            >
              {t('Modifier')}
            </DispoButton>
          </View>
          {actionsOpen ? (
            <MemberActionsSheet
              actions={[
                {
                  destructive: true,
                  icon: 'person-remove-outline',
                  label: t('Exclure'),
                  onPress: () =>
                    Alert.alert(
                      t('Exclure {{name}} ?', { name: member.name }),
                      t('Ses solos seront retirés du répertoire et des événements.'),
                      [
                        { style: 'cancel', text: t('Annuler') },
                        {
                          onPress: () => remove.mutate({ groupId, memberId: member.id }),
                          style: 'destructive',
                          text: t('Exclure'),
                        },
                      ],
                    ),
                },
              ]}
              onClose={() => setActionsOpen(false)}
              title={member.name}
              visible
            />
          ) : null}
        </>
      ) : null}
      {isLeader && editing ? (
        <View style={[styles.manage, { borderTopColor: tint(palette.bronze, 0.2) }]}>
          <FormField
            accessibilityLabel={t('Nom')}
            label={t('Nom')}
            maxLength={120}
            onChangeText={setName}
            value={name}
          />
          <FormField
            accessibilityLabel={t('Rôle dans le groupe')}
            label={t('Rôle dans le groupe')}
            maxLength={120}
            onChangeText={setRole}
            value={role}
          />
          <MemberKindPicker kind={kind} onChange={setKind} />
          <DispoButton
            disabled={!name.trim()}
            loading={update.isPending}
            onPress={() =>
              update.mutate(
                { groupId, memberId: member.id, name, role: role.trim() || null, kind },
                { onSuccess: () => setEditing(false) },
              )
            }
            size="compact"
          >
            {t('Enregistrer')}
          </DispoButton>
          <DispoButton
            disabled={update.isPending}
            onPress={() => setEditing(false)}
            size="compact"
            variant="secondary"
          >
            {t('Annuler')}
          </DispoButton>
          {update.isError ? (
            <AppText color={palette.error} variant="caption">
              {t('Le membre n’a pas pu être enregistré.')}
            </AppText>
          ) : null}
        </View>
      ) : null}
      {remove.isError ? (
        <AppText color={palette.error} variant="caption">
          {t('Le membre n’a pas pu être retiré.')}
        </AppText>
      ) : null}
    </Card>
  );
}

function MemberKindPicker({
  kind,
  onChange,
}: {
  kind: GroupMemberKind;
  onChange: (kind: GroupMemberKind) => void;
}) {
  const { t } = useTranslation();
  return (
    <View style={styles.kindRow}>
      <View style={styles.flex}>
        <ChoiceChip
          label={t('Permanent')}
          onPress={() => onChange('permanent')}
          selected={kind === 'permanent'}
        />
      </View>
      <View style={styles.flex}>
        <ChoiceChip
          label={t('Special guest')}
          onPress={() => onChange('guest')}
          selected={kind === 'guest'}
        />
      </View>
    </View>
  );
}

function AddManualMemberCard({ groupId, onClose }: { groupId: string; onClose: () => void }) {
  const { t } = useTranslation();
  const { palette } = useDispoTheme();
  const add = useAddManualGroupMember();
  const [name, setName] = useState('');
  const [role, setRole] = useState('');
  const [kind, setKind] = useState<GroupMemberKind>('permanent');
  return (
    <Card style={styles.inviteCard}>
      <SectionHeader
        subtitle={t('Ce membre apparaîtra dans le groupe et pourra être choisi pour les solos.')}
        title={t('Ajouter sans compte Dispo')}
      />
      <FormField
        accessibilityLabel={t('Nom du membre')}
        autoCapitalize="words"
        label={t('Nom')}
        maxLength={120}
        onChangeText={setName}
        value={name}
      />
      <FormField
        accessibilityLabel={t('Rôle du membre')}
        label={t('Rôle dans le groupe')}
        maxLength={120}
        onChangeText={setRole}
        placeholder={t('Piano, Batterie…')}
        value={role}
      />
      <MemberKindPicker kind={kind} onChange={setKind} />
      <DispoButton
        accessibilityLabel={t('Ajouter au groupe')}
        disabled={!name.trim()}
        icon="person-add"
        loading={add.isPending}
        onPress={() =>
          add.mutate(
            { groupId, name, role: role.trim() || null, kind },
            {
              onSuccess: () => {
                setName('');
                setRole('');
                onClose();
              },
            },
          )
        }
      >
        {t('Ajouter au groupe')}
      </DispoButton>
      <DispoButton disabled={add.isPending} onPress={onClose} variant="secondary">
        {t('Annuler')}
      </DispoButton>
      {add.isError ? (
        <AppText color={palette.error} variant="caption">
          {t('Le membre n’a pas pu être ajouté. Réessaie.')}
        </AppText>
      ) : null}
    </Card>
  );
}

export function GroupMembersScreen({ groupId }: { groupId: string }) {
  const headerHeight = useHeaderHeight();
  const { session } = useAuth();
  const { i18n, t } = useTranslation();
  const { palette } = useDispoTheme();
  const groupQuery = useGroup(groupId);
  const candidates = useGroupProfileCandidates();
  const invite = useInviteGroupMember();
  const cancel = useCancelGroupInvitation();
  const [search, setSearch] = useState('');
  const [showManualForm, setShowManualForm] = useState(false);
  const [kind, setKind] = useState<GroupMemberKind>('permanent');
  const group = groupQuery.data;
  const userId = session?.user.id ?? '';
  const isLeader = group?.leaderId === userId;
  const inviteCandidates = useMemo(() => {
    if (!group) return [];
    const excluded = new Set([
      ...group.members.map((member) => member.id),
      ...group.pendingInvitations.map((item) => item.profileId),
    ]);
    const locale = i18n.resolvedLanguage ?? i18n.language ?? 'fr';
    const needle = search.trim().toLocaleLowerCase(locale);
    return (candidates.data ?? []).filter(
      (profile) =>
        !excluded.has(profile.id) &&
        (!needle ||
          `${profile.name} ${profile.instruments.join(' ')}`
            .toLocaleLowerCase(locale)
            .includes(needle)),
    );
  }, [candidates.data, group, i18n.language, i18n.resolvedLanguage, search]);
  if (groupQuery.isLoading || candidates.isLoading)
    return (
      <Screen nativeHeader>
        <LoadingState label={t('Chargement des membres…')} />
      </Screen>
    );
  if (groupQuery.error || candidates.error)
    return (
      <Screen nativeHeader>
        <ErrorState
          message={t('Les membres n’ont pas pu être chargés.')}
          onRetry={() => {
            void groupQuery.refetch();
            void candidates.refetch();
          }}
        />
      </Screen>
    );
  if (!group)
    return (
      <Screen nativeHeader>
        <ErrorState message={t('Ce groupe n’est plus accessible.')} />
      </Screen>
    );
  return (
    <Screen nativeHeader>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={headerHeight}
        style={styles.flex}
      >
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          {isLeader ? (
            showManualForm ? (
              <AddManualMemberCard groupId={group.id} onClose={() => setShowManualForm(false)} />
            ) : (
              <DispoButton
                accessibilityLabel={t('Ajouter sans compte Dispo')}
                icon="person-add"
                onPress={() => setShowManualForm(true)}
                variant="secondary"
              >
                {t('Ajouter sans compte Dispo')}
              </DispoButton>
            )
          ) : null}
          {group.members.map((member) =>
            member.isManual ? (
              <ManualMemberCard
                groupId={group.id}
                isLeader={isLeader}
                key={member.id}
                member={member}
              />
            ) : (
              <MemberCard
                groupId={group.id}
                isCurrentLeader={isLeader}
                key={member.id}
                member={member}
                userId={userId}
              />
            ),
          )}
          {group.pendingInvitations.map((pending) => (
            <ListRow
              accessory={
                isLeader ? (
                  <IconButton
                    accessibilityLabel={`${t('Annuler l’invitation')} · ${pending.name}`}
                    disabled={cancel.isPending}
                    icon="close-circle"
                    iconColor={palette.muted}
                    onPress={() => cancel.mutate(pending.id)}
                    variant="plain"
                  />
                ) : (
                  <View />
                )
              }
              key={pending.id}
              leading={
                <View style={styles.dimmed}>
                  <GroupAvatar
                    emoji="🎵"
                    name={pending.name}
                    photoUrl={pending.photoUrl}
                    size={42}
                  />
                </View>
              }
              subtitle={`⏳ ${t('Invitation en attente')}${pending.kind === 'guest' ? ` · 🌠 ${t('Special guest')}` : ''}`}
              title={pending.name}
            />
          ))}
          {isLeader ? (
            <Card style={styles.inviteCard}>
              <SectionHeader title={t('Inviter un musicien')} />
              <FormField
                label={t('Rechercher')}
                onChangeText={setSearch}
                placeholder={t('Nom ou instrument')}
                value={search}
              />
              <View style={styles.kindRow}>
                <View style={styles.flex}>
                  <ChoiceChip
                    label={t('Permanent')}
                    onPress={() => setKind('permanent')}
                    selected={kind === 'permanent'}
                  />
                </View>
                <View style={styles.flex}>
                  <ChoiceChip
                    label={`🌠 ${t('Special guest')}`}
                    onPress={() => setKind('guest')}
                    selected={kind === 'guest'}
                  />
                </View>
              </View>
              {inviteCandidates.slice(0, 20).map((profile) => (
                <ListRow
                  accessory={
                    <IconButton
                      accessibilityLabel={t('Inviter {{name}}', { name: profile.name })}
                      disabled={invite.isPending}
                      icon="person-add"
                      onPress={() =>
                        invite.mutate({ groupId: group.id, kind, profileId: profile.id })
                      }
                    />
                  }
                  key={profile.id}
                  leading={
                    <GroupAvatar
                      emoji="🎵"
                      name={profile.name}
                      photoUrl={profile.photoUrl}
                      size={38}
                    />
                  }
                  subtitle={
                    profile.instruments.map((instrument) => t(instrument)).join(' · ') ||
                    t('Musicien')
                  }
                  title={profile.name}
                  tone="plain"
                />
              ))}
              {!inviteCandidates.length ? (
                <EmptyState
                  icon="search-outline"
                  message={t('Aucun autre profil visible ne correspond.')}
                  title={t('Personne à inviter')}
                />
              ) : null}
            </Card>
          ) : (
            <AppText color={palette.muted} style={styles.note} variant="caption">
              {t('Seul le leader peut inviter, changer les rôles ou retirer un membre.')}
            </AppText>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { gap: spacing.sm, padding: spacing.gutter, paddingBottom: spacing.xxl },
  dimmed: { opacity: 0.55 },
  flex: { flex: 1 },
  inlineAction: { alignSelf: 'flex-start', marginTop: spacing.xs },
  instruments: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xxs },
  inviteCard: { gap: spacing.sm, marginTop: spacing.sm },
  kindRow: { flexDirection: 'row', gap: spacing.xs },
  manage: {
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: spacing.sm,
    marginTop: spacing.sm,
    paddingTop: spacing.sm,
  },
  memberCopy: { flex: 1, gap: spacing.xxs },
  memberName: { flexShrink: 1 },
  memberNameLine: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.tight,
  },
  memberTop: { alignItems: 'center', flexDirection: 'row', gap: spacing.xs },
  note: { padding: spacing.sm, textAlign: 'center' },
  profileButton: { alignItems: 'center', flex: 1, flexDirection: 'row', gap: spacing.sm },
});
