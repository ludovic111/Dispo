import { Ionicons } from '@expo/vector-icons';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Pressable, ScrollView, StyleSheet, Switch, View } from 'react-native';

import { GroupAvatar } from './group-avatar';
import { useDeleteGroup, useGroup, useGroupPhoto, useUpdateGroupSettings } from './group-queries';

import { AppText } from '@/components/ui/app-text';
import { Card } from '@/components/ui/card';
import { ChoiceChip } from '@/components/ui/choice-chip';
import { FormField } from '@/components/ui/form-field';
import { DispoButton } from '@/components/ui/pressable';
import { ErrorState, LoadingState, Screen } from '@/components/ui/screen';
import { useAuth } from '@/features/auth/auth-context';
import { useDispoTheme } from '@/theme/theme-context';
import { spacing } from '@/theme/tokens';

const autoSosLevelRules: readonly { label: string; value: string | null }[] = [
  { label: 'Peu importe', value: null },
  { label: "Identique à l'absent", value: 'same' },
];

export function GroupSettingsScreen({ groupId }: { groupId: string }) {
  const { t } = useTranslation();
  const { session } = useAuth();
  const { palette } = useDispoTheme();
  const query = useGroup(groupId);
  const save = useUpdateGroupSettings();
  const photo = useGroupPhoto();
  const remove = useDeleteGroup();
  const group = query.data;
  const [nameOverride, setNameOverride] = useState<string | null>(null);
  const [publicOverride, setPublicOverride] = useState<boolean | null>(null);
  const [autoSosOverride, setAutoSosOverride] = useState<boolean | null>(null);
  const [minLevelOverride, setMinLevelOverride] = useState<{ value: string | null } | null>(null);
  if (query.isLoading)
    return (
      <Screen nativeHeader>
        <LoadingState label={t('Chargement des réglages…')} />
      </Screen>
    );
  if (query.error)
    return (
      <Screen nativeHeader>
        <ErrorState
          message={t('Les réglages n’ont pas pu être chargés.')}
          onRetry={() => void query.refetch()}
        />
      </Screen>
    );
  if (!group)
    return (
      <Screen nativeHeader>
        <ErrorState message={t('Ce groupe n’est plus accessible.')} />
      </Screen>
    );
  if (group.leaderId !== session?.user.id)
    return (
      <Screen nativeHeader>
        <ErrorState message={t('Seul le leader peut modifier ce groupe.')} />
      </Screen>
    );
  const name = nameOverride ?? group.name;
  const isPublic = publicOverride ?? group.isPublic;
  const autoSosEnabled = autoSosOverride ?? group.autoSosEnabled;
  // Swift ne conserve plus les anciens niveaux fixes : toute ancienne valeur
  // non nulle signifie désormais « identique à l'absent ».
  const storedMinLevel = group.autoSosMinLevel === null ? null : 'same';
  const minLevel = minLevelOverride ? minLevelOverride.value : storedMinLevel;

  const pickPhoto = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        allowsEditing: true,
        aspect: [1, 1],
        mediaTypes: ['images'],
        quality: 0.82,
      });
      const asset = result.assets?.[0];
      if (!asset) return;
      const resize =
        (asset.width ?? 0) >= (asset.height ?? 0)
          ? { resize: { width: 800 } }
          : { resize: { height: 800 } };
      const jpeg = await manipulateAsync(asset.uri, [resize], {
        compress: 0.85,
        format: SaveFormat.JPEG,
      });
      photo.mutate({
        contentType: 'image/jpeg',
        groupId: group.id,
        leaderId: group.leaderId,
        uri: jpeg.uri,
      });
    } catch {
      Alert.alert(t('Photo non enregistrée'), t('Réessaie avec une autre image.'));
    }
  };
  const submit = () =>
    save.mutate({
      autoSosEnabled,
      autoSosMinLevel: autoSosEnabled ? minLevel : null,
      groupId: group.id,
      isPublic,
      name,
    });
  const confirmDelete = () =>
    Alert.alert(
      t('Supprimer le groupe ?'),
      t('Messages, événements, documents et répertoire seront supprimés définitivement.'),
      [
        { style: 'cancel', text: t('Annuler') },
        {
          onPress: () =>
            remove.mutate(group.id, { onSuccess: () => router.replace('/groups' as never) }),
          style: 'destructive',
          text: t('Supprimer définitivement'),
        },
      ],
    );
  return (
    <Screen nativeHeader>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Card style={styles.card}>
          <FormField
            label={t('Nom du groupe')}
            onChangeText={setNameOverride}
            placeholder={t('Nom du groupe')}
            value={name}
          />
          <AppText color={palette.muted} variant="caption">
            {t('Le nouveau nom s’affiche chez tous les membres.')}
          </AppText>
        </Card>
        <Card style={styles.card}>
          <AppText variant="title">{t('Photo du groupe')}</AppText>
          <View style={styles.photoRow}>
            <GroupAvatar
              emoji={group.emoji}
              name={group.name}
              photoUrl={group.photoUrl}
              size={68}
            />
            <View style={styles.photoActions}>
              <DispoButton
                disabled={photo.isPending}
                icon="camera"
                onPress={() => void pickPhoto()}
                variant="secondary"
              >
                {group.photoUrl ? t('Changer la photo') : t('Ajouter une photo')}
              </DispoButton>
              {group.photoUrl ? (
                <Pressable
                  onPress={() =>
                    photo.mutate({ groupId: group.id, leaderId: group.leaderId, remove: true })
                  }
                  style={styles.removePhoto}
                >
                  <Ionicons color={palette.signal} name="trash-outline" size={15} />
                  <AppText color={palette.signal} variant="caption">
                    {t('Retirer')}
                  </AppText>
                </Pressable>
              ) : null}
            </View>
          </View>
        </Card>
        <Card style={styles.card}>
          <View style={styles.switchRow}>
            <View style={styles.switchCopy}>
              <AppText variant="title">{t('Groupe public')}</AppText>
              <AppText color={palette.muted} variant="caption">
                {t('Visible sur le profil de ses membres.')}
              </AppText>
            </View>
            <Switch
              onValueChange={setPublicOverride}
              trackColor={{ false: palette.inset, true: palette.electric }}
              value={isPublic}
            />
          </View>
        </Card>
        <Card style={styles.card}>
          <View style={styles.switchRow}>
            <View style={styles.switchCopy}>
              <AppText variant="title">{t('Auto-SOS')}</AppText>
              <AppText color={palette.muted} variant="caption">
                {t('Cherche automatiquement un remplaçant quand un rôle manque.')}
              </AppText>
            </View>
            <Switch
              onValueChange={setAutoSosOverride}
              trackColor={{ false: palette.inset, true: palette.electric }}
              value={autoSosEnabled}
            />
          </View>
          {autoSosEnabled ? (
            <View style={styles.levels}>
              <AppText color={palette.bronze} variant="label">
                {t('Niveau demandé')}
              </AppText>
              <View style={styles.levelRow}>
                {autoSosLevelRules.map((rule) => (
                  <ChoiceChip
                    key={rule.value ?? 'any'}
                    label={t(rule.label)}
                    onPress={() => setMinLevelOverride({ value: rule.value })}
                    selected={minLevel === rule.value}
                  />
                ))}
              </View>
            </View>
          ) : null}
        </Card>
        {save.error || photo.error ? (
          <AppText color={palette.error} style={styles.center} variant="caption">
            {t('La modification n’a pas pu être enregistrée.')}
          </AppText>
        ) : null}
        <DispoButton disabled={!name.trim()} loading={save.isPending} onPress={submit}>
          {t('Enregistrer')}
        </DispoButton>
        <DispoButton loading={remove.isPending} onPress={confirmDelete} variant="danger">
          {t('Supprimer le groupe')}
        </DispoButton>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing.sm },
  center: { textAlign: 'center' },
  content: { gap: spacing.sm, padding: spacing.gutter, paddingBottom: spacing.xxl },
  levelRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  levels: { gap: spacing.xs },
  photoActions: { flex: 1, gap: spacing.xs },
  photoRow: { alignItems: 'center', flexDirection: 'row', gap: spacing.md },
  removePhoto: {
    alignItems: 'center',
    alignSelf: 'center',
    flexDirection: 'row',
    gap: spacing.xxs,
  },
  switchCopy: { flex: 1, gap: spacing.xxs },
  switchRow: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm },
});
