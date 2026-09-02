import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { GroupAvatar } from './group-avatar';
import {
  acquireGroupCreationLock,
  groupCreationDiagnostic,
  groupCreationErrorMessage,
  releaseGroupCreationLock,
} from './group-creation-model';
import { useCreateGroup, useGroupProfileCandidates } from './group-queries';

import { AppText } from '@/components/ui/app-text';
import { Card } from '@/components/ui/card';
import { FormField } from '@/components/ui/form-field';
import { DispoButton } from '@/components/ui/pressable';
import { ErrorState, LoadingState, Screen } from '@/components/ui/screen';
import { useAuth } from '@/features/auth/auth-context';
import { useDispoTheme } from '@/theme/theme-context';
import { spacing } from '@/theme/tokens';

const emojis = ['🎶', '🎷', '🪘', '🎸', '🎹', '🎺', '🥁', '🎻', '🎤', '⚡'];

export function GroupNewScreen() {
  const { session } = useAuth();
  const { i18n, t } = useTranslation();
  const { palette } = useDispoTheme();
  const candidates = useGroupProfileCandidates();
  const create = useCreateGroup();
  const [name, setName] = useState('');
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
  const submit = () => {
    if (!acquireGroupCreationLock(submitLock)) return;
    create.mutate(
      { emoji, memberIds: [...memberIds], name },
      {
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
      },
    );
  };

  return (
    <Screen nativeHeader>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Card style={styles.section}>
          <FormField
            autoCapitalize="words"
            error={!name.trim() && create.isError ? t('Donne un nom au groupe.') : undefined}
            label={t('Le groupe')}
            onChangeText={setName}
            placeholder={t('Latin Vibes Quartet')}
            value={name}
          />
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={styles.emojis}>
              {emojis.map((option) => (
                <Pressable
                  accessibilityLabel={t('Choisir {{emoji}}', { emoji: option })}
                  accessibilityRole="button"
                  accessibilityState={{ selected: emoji === option }}
                  key={option}
                  onPress={() => setEmoji(option)}
                  style={[
                    styles.emoji,
                    { backgroundColor: emoji === option ? `${palette.bronze}33` : 'transparent' },
                  ]}
                >
                  <AppText style={styles.emojiText}>{option}</AppText>
                </Pressable>
              ))}
            </View>
          </ScrollView>
          <AppText color={palette.muted} variant="caption">
            {t('Membres, répertoire et événements passeront par toi.')}
          </AppText>
        </Card>

        <Card style={styles.section}>
          <View style={styles.memberHeader}>
            <AppText variant="title">{t('Membres')}</AppText>
            <AppText color={palette.electric} style={styles.count}>
              {memberIds.size}
            </AppText>
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
                  pressed && styles.pressed,
                ]}
              >
                <GroupAvatar emoji="🎵" name={profile.name} photoUrl={profile.photoUrl} size={40} />
                <View style={styles.memberCopy}>
                  <AppText numberOfLines={1} style={styles.memberName}>
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
        {create.error ? (
          <AppText color={palette.error} style={styles.error} variant="caption">
            {t(groupCreationErrorMessage(create.error))}
          </AppText>
        ) : null}
        <DispoButton
          disabled={!name.trim() || memberIds.size === 0 || create.isPending}
          icon="add-circle"
          loading={create.isPending}
          onPress={submit}
        >
          {t('Créer le groupe')}
        </DispoButton>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { gap: spacing.cluster, paddingBottom: spacing.xxl, paddingHorizontal: spacing.gutter },
  count: { fontWeight: '800' },
  emoji: {
    alignItems: 'center',
    borderRadius: 22,
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  emojiText: { fontSize: 21 },
  emojis: { flexDirection: 'row', gap: spacing.tight },
  error: { textAlign: 'center' },
  member: {
    alignItems: 'center',
    borderBottomWidth: 1,
    flexDirection: 'row',
    gap: spacing.control,
    paddingVertical: spacing.control,
  },
  memberCopy: { flex: 1 },
  memberHeader: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  memberName: { fontWeight: '700' },
  pressed: { opacity: 0.7 },
  section: { gap: spacing.sm },
});
