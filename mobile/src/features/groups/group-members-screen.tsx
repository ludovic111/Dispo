import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { GroupAvatar } from './group-avatar';
import type { GroupMember, GroupMemberKind } from './group-model';
import {
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
import { EmptyState, ErrorState, LoadingState, Screen, ScreenHeader } from '@/components/ui/screen';
import { Tag } from '@/components/ui/tag';
import { useAuth } from '@/features/auth/auth-context';
import { formatSwiftPlaceholders } from '@/i18n/format';
import { useDispoTheme } from '@/theme/theme-context';
import { spacing } from '@/theme/tokens';

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
  const isMe = member.id === userId;
  const canManage = isCurrentLeader && !isMe && !member.isLeader;
  return (
    <Card padding={11}>
      <View style={styles.memberTop}>
        <Pressable
          disabled={isMe}
          onPress={() => router.push(`/profiles/${member.id}` as never)}
          style={styles.profileButton}
        >
          <GroupAvatar emoji="🎵" name={member.name} photoUrl={member.photoUrl} size={42} />
          <View style={styles.memberCopy}>
            <View style={styles.memberNameLine}>
              <AppText numberOfLines={1} style={styles.memberName}>
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
      </View>
      {canManage ? (
        <View style={styles.manage}>
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
          <View style={styles.roleRow}>
            <View style={styles.flex}>
              <FormField
                label={t('Rôle dans le groupe')}
                onChangeText={setRole}
                placeholder={t('Piano, Batterie…')}
                value={role}
              />
            </View>
            <Pressable
              accessibilityLabel={t('Enregistrer le rôle')}
              onPress={() =>
                update.mutate({ groupId, profileId: member.id, role: role.trim() || null })
              }
              style={[styles.saveRole, { backgroundColor: `${palette.electric}22` }]}
            >
              <Ionicons color={palette.electric} name="checkmark" size={21} />
            </Pressable>
          </View>
          <View style={styles.memberActions}>
            {member.kind === 'permanent' ? (
              <Pressable
                onPress={() =>
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
                  )
                }
                style={styles.inlineButton}
              >
                <Ionicons color={palette.bronze} name="trophy-outline" size={15} />
                <AppText color={palette.bronze} variant="caption">
                  {t('Nommer leader')}
                </AppText>
              </Pressable>
            ) : null}
            <Pressable
              onPress={() =>
                Alert.alert(t('Exclure {{name}} ?', { name: member.name }), undefined, [
                  { style: 'cancel', text: t('Annuler') },
                  {
                    onPress: () => remove.mutate({ groupId, profileId: member.id }),
                    style: 'destructive',
                    text: t('Exclure'),
                  },
                ])
              }
              style={styles.inlineButton}
            >
              <Ionicons color={palette.signal} name="person-remove-outline" size={15} />
              <AppText color={palette.signal} variant="caption">
                {t('Exclure')}
              </AppText>
            </Pressable>
          </View>
        </View>
      ) : null}
    </Card>
  );
}

export function GroupMembersScreen({ groupId }: { groupId: string }) {
  const { session } = useAuth();
  const { i18n, t } = useTranslation();
  const { palette } = useDispoTheme();
  const groupQuery = useGroup(groupId);
  const candidates = useGroupProfileCandidates();
  const invite = useInviteGroupMember();
  const cancel = useCancelGroupInvitation();
  const [search, setSearch] = useState('');
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
      <Screen>
        <LoadingState label={t('Chargement des membres…')} />
      </Screen>
    );
  if (groupQuery.error || candidates.error)
    return (
      <Screen>
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
      <Screen>
        <ErrorState message={t('Ce groupe n’est plus accessible.')} />
      </Screen>
    );
  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <ScreenHeader
          icon="people"
          subtitle={formatSwiftPlaceholders(t('%lld membres'), group.members.length)}
          title={t('Membres')}
        />
        {group.members.map((member) => (
          <MemberCard
            groupId={group.id}
            isCurrentLeader={isLeader}
            key={member.id}
            member={member}
            userId={userId}
          />
        ))}
        {group.pendingInvitations.map((pending) => (
          <Card key={pending.id} padding={11}>
            <View style={styles.pendingRow}>
              <View style={styles.dimmed}>
                <GroupAvatar emoji="🎵" name={pending.name} photoUrl={pending.photoUrl} size={42} />
              </View>
              <View style={styles.memberCopy}>
                <AppText color={palette.muted} style={styles.memberName}>
                  {pending.name}
                </AppText>
                <AppText color={palette.bronze} variant="caption2">
                  ⏳ {t('Invitation en attente')}
                  {pending.kind === 'guest' ? ` · 🌠 ${t('Special guest')}` : ''}
                </AppText>
              </View>
              {isLeader ? (
                <Pressable
                  accessibilityLabel={t('Annuler l’invitation')}
                  onPress={() => cancel.mutate(pending.id)}
                >
                  <Ionicons color={palette.muted} name="close-circle" size={23} />
                </Pressable>
              ) : null}
            </View>
          </Card>
        ))}
        {isLeader ? (
          <Card style={styles.inviteCard}>
            <AppText variant="title">{t('Inviter un musicien')}</AppText>
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
              <View
                key={profile.id}
                style={[styles.pendingRow, { borderBottomColor: palette.border }]}
              >
                <GroupAvatar emoji="🎵" name={profile.name} photoUrl={profile.photoUrl} size={38} />
                <View style={styles.memberCopy}>
                  <AppText style={styles.memberName}>{profile.name}</AppText>
                  <AppText color={palette.muted} numberOfLines={1} variant="caption2">
                    {profile.instruments.map((instrument) => t(instrument)).join(' · ') ||
                      t('Musicien')}
                  </AppText>
                </View>
                <Pressable
                  accessibilityLabel={t('Inviter {{name}}', { name: profile.name })}
                  onPress={() => invite.mutate({ groupId: group.id, kind, profileId: profile.id })}
                  style={[styles.inviteButton, { backgroundColor: `${palette.electric}22` }]}
                >
                  <Ionicons color={palette.electric} name="person-add" size={18} />
                </Pressable>
              </View>
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
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { gap: spacing.sm, padding: spacing.gutter, paddingBottom: spacing.xxl },
  dimmed: { opacity: 0.55 },
  flex: { flex: 1 },
  inlineButton: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.xxs,
    paddingVertical: spacing.xs,
  },
  instruments: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xxs },
  inviteButton: {
    alignItems: 'center',
    borderRadius: 18,
    height: 36,
    justifyContent: 'center',
    width: 36,
  },
  inviteCard: { gap: spacing.sm, marginTop: spacing.sm },
  kindRow: { flexDirection: 'row', gap: spacing.xs },
  manage: {
    borderTopColor: 'rgba(142,154,175,0.2)',
    borderTopWidth: 1,
    gap: spacing.sm,
    marginTop: spacing.sm,
    paddingTop: spacing.sm,
  },
  memberActions: { flexDirection: 'row', justifyContent: 'space-between' },
  memberCopy: { flex: 1, gap: spacing.xxs },
  memberName: { fontWeight: '800' },
  memberNameLine: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.tight,
  },
  memberTop: { gap: spacing.sm },
  note: { padding: spacing.sm, textAlign: 'center' },
  pendingRow: {
    alignItems: 'center',
    borderBottomWidth: 0,
    flexDirection: 'row',
    gap: spacing.control,
    paddingVertical: spacing.xs,
  },
  profileButton: { alignItems: 'center', flexDirection: 'row', gap: spacing.control },
  roleRow: { alignItems: 'flex-end', flexDirection: 'row', gap: spacing.xs },
  saveRole: {
    alignItems: 'center',
    borderRadius: 20,
    height: 40,
    justifyContent: 'center',
    marginBottom: 3,
    width: 40,
  },
});
