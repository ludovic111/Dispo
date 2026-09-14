import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useHeaderHeight } from 'expo-router/react-navigation';
import { useRef, useState } from 'react';
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
import {
  acquireGroupCreationLock,
  groupCreationDiagnostic,
  groupCreationErrorMessage,
  releaseGroupCreationLock,
} from './group-creation-model';
import { useCreateGroup, useGroupProfileCandidates } from './group-queries';

import { AppText } from '@/components/ui/app-text';
import { CountBadge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { ChoiceChip } from '@/components/ui/choice-chip';
import { FormField } from '@/components/ui/form-field';
import { DispoButton } from '@/components/ui/pressable';
import { ErrorState, LoadingState, Screen } from '@/components/ui/screen';
import { SectionHeader } from '@/components/ui/section';
import { Tag } from '@/components/ui/tag';
import { useAuth } from '@/features/auth/auth-context';
import { canLeadAnotherGroup } from '@/features/premium/premium-model';
import { SubscriptionAccessCard } from '@/features/premium/subscription-access-card';
import { useSubscription } from '@/features/premium/subscription-queries';
import { useCreateWorkshopGroup } from '@/features/premium/workshop-group-queries';
import { selectedWorkshopSchool } from '@/features/premium/workshop-groups';
import { useDispoTheme } from '@/theme/theme-context';
import { minimumTouchTarget, pressedStyle, radii, spacing, tint } from '@/theme/tokens';

const emojis = ['🎶', '🎷', '🪘', '🎸', '🎹', '🎺', '🥁', '🎻', '🎤', '⚡'];

export function GroupNewScreen() {
  const { session } = useAuth();
  const headerHeight = useHeaderHeight();
  const { i18n, t } = useTranslation();
  const { palette } = useDispoTheme();
  const candidates = useGroupProfileCandidates();
  const create = useCreateGroup();
  const createWorkshop = useCreateWorkshopGroup();
  const subscription = useSubscription();
  const [name, setName] = useState('');
  const [workshopSchoolId, setWorkshopSchoolId] = useState<string | null>(null);
  const [emoji, setEmoji] = useState('🎶');
  const [search, setSearch] = useState('');
  const [memberIds, setMemberIds] = useState<Set<string>>(new Set());
  const submitLock = useRef(false);
  const locale = i18n.resolvedLanguage ?? i18n.language ?? 'fr';
  const needle = search.trim().toLocaleLowerCase(locale);
  const visible = (candidates.data ?? []).filter(
    (profile) =>
      profile.id !== session?.user.id &&
      (!needle ||
        profile.name.toLocaleLowerCase(locale).includes(needle) ||
        profile.instruments.some((instrument) =>
          instrument.toLocaleLowerCase(locale).includes(needle),
        )),
  );

  if (subscription.isLoading)
    return (
      <Screen nativeHeader>
        <LoadingState />
      </Screen>
    );
  if (subscription.isError)
    return (
      <Screen nativeHeader>
        <ErrorState
          message={t('Les abonnements n’ont pas pu être chargés.')}
          onRetry={() => void subscription.refetch()}
        />
      </Screen>
    );
  const workshopSchools = subscription.data?.workshopSchools ?? [];
  const canLeadRegularGroup =
    !!subscription.data &&
    canLeadAnotherGroup(subscription.data.tier, subscription.data.groupCount);
  // Without a paid slot, the only possible group is a workshop group: preselect it.
  const workshopSchool = selectedWorkshopSchool(
    workshopSchools,
    workshopSchoolId ?? (canLeadRegularGroup ? null : (workshopSchools[0]?.schoolId ?? null)),
  );
  // A workshop group of the member's school skips the paid tier entirely.
  if (!subscription.data || (!canLeadRegularGroup && workshopSchools.length === 0))
    return (
      <Screen nativeHeader>
        <View style={styles.gate}>
          <SubscriptionAccessCard groupCreation />
        </View>
      </Screen>
    );

  if (candidates.isLoading)
    return (
      <Screen nativeHeader>
        <LoadingState label={t('Chargement des musiciens…')} />
      </Screen>
    );
  if (candidates.error)
    return (
      <Screen nativeHeader>
        <ErrorState
          message={t('Les musiciens n’ont pas pu être chargés.')}
          onRetry={() => void candidates.refetch()}
        />
      </Screen>
    );

  const toggle = (profileId: string) => {
    setMemberIds((current) => {
      const next = new Set(current);
      if (next.has(profileId)) next.delete(profileId);
      else next.add(profileId);
      return next;
    });
  };
  const pending = create.isPending || createWorkshop.isPending;
  const creationError = workshopSchool ? createWorkshop.error : create.error;
  const submit = () => {
    if (!acquireGroupCreationLock(submitLock)) return;
    const input = { emoji, memberIds: [...memberIds], name };
    const mutate = workshopSchool
      ? (options: Parameters<typeof create.mutate>[1]) =>
          createWorkshop.mutate({ ...input, schoolId: workshopSchool.schoolId }, options)
      : (options: Parameters<typeof create.mutate>[1]) => create.mutate(input, options);
    mutate({
      onError: (error) => {
        if (__DEV__) console.warn('[group-create]', groupCreationDiagnostic(error));
      },
      onSettled: () => releaseGroupCreationLock(submitLock),
      onSuccess: ({ failedInvitationCount, groupId }) => {
        if (failedInvitationCount > 0) {
          Alert.alert(
            t('Groupe créé'),
            failedInvitationCount === 1
              ? t("Une invitation n'a pas pu partir. Tu peux la renvoyer depuis les membres.")
              : t(
                  "{{count}} invitations n'ont pas pu partir. Tu peux les renvoyer depuis les membres.",
                  { count: failedInvitationCount },
                ),
          );
        }
        router.replace(`/groups/${groupId}` as never);
      },
    });
  };

  return (
    <Screen nativeHeader>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={headerHeight}
        style={styles.body}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardDismissMode="on-drag"
          keyboardShouldPersistTaps="handled"
        >
          <Card style={styles.section}>
            <FormField
              autoCapitalize="words"
              error={!name.trim() && creationError ? t('Donne un nom au groupe.') : undefined}
              hint={t('Membres, répertoire et événements passeront par toi.')}
              label={t('Le groupe')}
              onChangeText={setName}
              placeholder={t('Latin Vibes Quartet')}
              value={name}
            />
            <ScrollView
              horizontal
              keyboardShouldPersistTaps="handled"
              showsHorizontalScrollIndicator={false}
            >
              <View style={styles.emojis}>
                {emojis.map((option) => (
                  <Pressable
                    accessibilityLabel={t('Choisir {{emoji}}', { emoji: option })}
                    accessibilityRole="button"
                    accessibilityState={{ selected: emoji === option }}
                    key={option}
                    onPress={() => setEmoji(option)}
                    style={({ pressed }) => [
                      styles.emoji,
                      emoji === option && { backgroundColor: tint(palette.bronze, 0.2) },
                      pressed && pressedStyle,
                    ]}
                  >
                    <AppText variant="title2">{option}</AppText>
                  </Pressable>
                ))}
              </View>
            </ScrollView>
          </Card>

          {workshopSchools.length > 0 ? (
            <Card style={styles.section}>
              <SectionHeader
                subtitle={t('Ce groupe est lié à un atelier de ton école.')}
                title={t('Type de groupe')}
              />
              <View style={styles.wrap}>
                {canLeadRegularGroup ? (
                  <ChoiceChip
                    label={t('Mon groupe')}
                    onPress={() => setWorkshopSchoolId(null)}
                    selected={workshopSchool === null}
                  />
                ) : null}
                {workshopSchools.map((school) => (
                  <ChoiceChip
                    icon="school"
                    key={school.schoolId}
                    label={t("Groupe d'atelier de {{school}}", { school: school.schoolShortName })}
                    onPress={() => setWorkshopSchoolId(school.schoolId)}
                    selected={workshopSchool?.schoolId === school.schoolId}
                  />
                ))}
              </View>
              {workshopSchool ? (
                <Tag
                  color={palette.electric}
                  icon="school"
                  label={t('Atelier {{school}}', { school: workshopSchool.schoolShortName })}
                />
              ) : null}
            </Card>
          ) : null}

          <Card style={styles.section}>
            <View style={styles.memberHeader}>
              <View style={styles.flex}>
                <SectionHeader title={t('Membres')} />
              </View>
              <CountBadge count={memberIds.size} />
            </View>
            <FormField
              label={t('Rechercher')}
              onChangeText={setSearch}
              placeholder={t('Nom ou instrument')}
              value={search}
            />
            {visible.map((profile) => {
              const selected = memberIds.has(profile.id);
              return (
                <Pressable
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: selected }}
                  key={profile.id}
                  onPress={() => toggle(profile.id)}
                  style={({ pressed }) => [
                    styles.member,
                    { borderColor: selected ? palette.electric : palette.border },
                    pressed && pressedStyle,
                  ]}
                >
                  <GroupAvatar
                    emoji="🎵"
                    name={profile.name}
                    photoUrl={profile.photoUrl}
                    size={40}
                  />
                  <View style={styles.memberCopy}>
                    <AppText numberOfLines={1} variant="headline">
                      {profile.name}
                    </AppText>
                    <AppText color={palette.muted} numberOfLines={1} variant="caption2">
                      {profile.instruments.map((instrument) => t(instrument)).join(' · ') ||
                        t('Musicien')}
                    </AppText>
                  </View>
                  <Ionicons
                    color={selected ? palette.electric : palette.muted}
                    name={selected ? 'checkmark-circle' : 'ellipse-outline'}
                    size={23}
                  />
                </Pressable>
              );
            })}
          </Card>
          {creationError ? (
            <AppText color={palette.error} style={styles.error} variant="caption">
              {t(groupCreationErrorMessage(creationError))}
            </AppText>
          ) : null}
          <DispoButton
            disabled={!name.trim() || memberIds.size === 0 || pending}
            icon="add-circle"
            loading={pending}
            onPress={submit}
          >
            {t('Créer le groupe')}
          </DispoButton>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: { flex: 1 },
  content: { gap: spacing.sm, paddingBottom: spacing.xxl, paddingHorizontal: spacing.gutter },
  emoji: {
    alignItems: 'center',
    borderRadius: radii.round,
    height: minimumTouchTarget,
    justifyContent: 'center',
    width: minimumTouchTarget,
  },
  emojis: { flexDirection: 'row', gap: spacing.tight },
  error: { textAlign: 'center' },
  flex: { flex: 1 },
  gate: { padding: spacing.gutter },
  member: {
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: spacing.sm,
    minHeight: minimumTouchTarget,
    paddingVertical: spacing.sm,
  },
  memberCopy: { flex: 1 },
  memberHeader: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm },
  section: { gap: spacing.sm },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
});
