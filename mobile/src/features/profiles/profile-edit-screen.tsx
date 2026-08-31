import { Ionicons } from '@expo/vector-icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { toggleProfileValue, type EditableProfile } from './profile-edit-model';
import {
  fetchEditableProfile,
  saveEditableProfile,
  uploadProfileAvatar,
} from './profile-edit-repository';
import { profileKeys } from './profile-queries';

import { AppText } from '@/components/ui/app-text';
import { Avatar } from '@/components/ui/avatar';
import { Card } from '@/components/ui/card';
import { ChoiceChip } from '@/components/ui/choice-chip';
import { FormField } from '@/components/ui/form-field';
import { DispoButton } from '@/components/ui/pressable';
import { ErrorState, LoadingState, Screen, ScreenHeader } from '@/components/ui/screen';
import { HeaderAction, SectionHeader } from '@/components/ui/section';
import { useAuth } from '@/features/auth/auth-context';
import { GIG_GENRE_GROUPS } from '@/features/gigs/gig-model';
import { instrumentCategories, levelOptions } from '@/features/onboarding/onboarding-model';
import { useDispoTheme } from '@/theme/theme-context';
import { radii, spacing } from '@/theme/tokens';

const socialNetworks = [
  { icon: 'logo-instagram' as const, key: 'instagram', label: 'Instagram' },
  { icon: 'logo-tiktok' as const, key: 'tiktok', label: 'TikTok' },
  { icon: 'logo-youtube' as const, key: 'youtube', label: 'YouTube' },
  { icon: 'at' as const, key: 'x', label: 'X' },
] as const;

export function ProfileEditScreen() {
  const { session } = useAuth();
  const userId = session?.user.id ?? '';
  const { palette } = useDispoTheme();
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const query = useQuery({
    enabled: Boolean(userId),
    queryFn: () => fetchEditableProfile(userId),
    queryKey: ['profile', 'edit', userId],
  });
  const [draft, setDraft] = useState<EditableProfile | null>(null);
  const value = draft ?? query.data ?? null;
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);
  const allGenres = useMemo(() => GIG_GENRE_GROUPS.flatMap((group) => group.values), []);
  const close = <HeaderAction icon="close" label={t('Fermer')} onPress={() => router.back()} />;

  const update = (patch: Partial<EditableProfile>) => {
    if (value) setDraft({ ...value, ...patch });
  };

  const pickPhoto = async () => {
    if (!value || uploading) return;
    setUploading(true);
    setErrorText(null);
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        allowsEditing: true,
        aspect: [1, 1],
        mediaTypes: ['images'],
        quality: 1,
      });
      if (result.canceled) return;
      const asset = result.assets[0];
      if (!asset) return;
      const resize =
        (asset.width ?? 0) >= (asset.height ?? 0)
          ? { resize: { width: 800 } }
          : { resize: { height: 800 } };
      const resized = await manipulateAsync(asset.uri, [resize], {
        compress: 0.85,
        format: SaveFormat.JPEG,
      });
      const bytes = await fetch(resized.uri).then((response) => response.arrayBuffer());
      const photoUrl = await uploadProfileAvatar(userId, bytes);
      update({ photoUrl });
      await queryClient.invalidateQueries({ queryKey: profileKeys.me(userId) });
    } catch {
      setErrorText(t("La photo n'a pas pu être enregistrée."));
    } finally {
      setUploading(false);
    }
  };

  const save = async () => {
    if (!value || saving) return;
    setSaving(true);
    setErrorText(null);
    try {
      await saveEditableProfile(userId, value);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: profileKeys.me(userId) }),
        queryClient.invalidateQueries({ queryKey: profileKeys.discovery(userId) }),
      ]);
      router.back();
    } catch (error) {
      setErrorText(
        error instanceof Error && error.message === 'profile_required_fields_missing'
          ? t('Renseigne ton nom, au moins un instrument, ta ville et ton code postal.')
          : t("Impossible d'enregistrer ton profil — vérifie le réseau."),
      );
    } finally {
      setSaving(false);
    }
  };

  if (query.isLoading || !value) {
    return (
      <Screen>
        <ScreenHeader action={close} title={t('Modifier mon profil')} />
        <LoadingState />
      </Screen>
    );
  }
  if (query.isError) {
    return (
      <Screen>
        <ScreenHeader action={close} title={t('Modifier mon profil')} />
        <ErrorState message={query.error.message} onRetry={() => void query.refetch()} />
      </Screen>
    );
  }

  return (
    <Screen>
      <ScreenHeader action={close} title={t('Modifier mon profil')} />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Pressable
          accessibilityLabel={t('Changer ma photo')}
          accessibilityRole="button"
          onPress={() => void pickPhoto()}
          style={({ pressed }) => [styles.avatarButton, pressed && styles.pressed]}
        >
          <Avatar name={value.name} size={86} uri={value.photoUrl} />
          <View style={[styles.camera, { backgroundColor: '#FFFFFF' }]}>
            <Ionicons color="#050814" name="camera" size={12} />
          </View>
          <AppText color={palette.electric} variant="caption">
            {uploading ? t('Envoi…') : t('Changer la photo')}
          </AppText>
        </Pressable>

        <View style={styles.section}>
          <SectionHeader title={t('Identité')} />
          <Card style={styles.card}>
            <FormField
              label={t('Nom')}
              onChangeText={(name) => update({ name })}
              value={value.name}
            />
            <FormField
              label={t('Bio')}
              multiline
              numberOfLines={4}
              onChangeText={(bio) => update({ bio })}
              placeholder={t('Parle de toi…')}
              style={styles.bio}
              value={value.bio}
            />
            <View style={styles.placeRow}>
              <FormField
                label={t('Code postal')}
                onChangeText={(postalCode) => update({ postalCode })}
                style={styles.postal}
                value={value.postalCode}
              />
              <View style={styles.city}>
                <FormField
                  label={t('Ville')}
                  onChangeText={(city) => update({ city })}
                  value={value.city}
                />
              </View>
            </View>
          </Card>
        </View>

        <View style={styles.section}>
          <SectionHeader title={t('Mes instruments')} />
          {instrumentCategories.map((category) => (
            <Card key={category.label} style={styles.card}>
              <AppText style={styles.cardTitle} variant="subheadline">
                {t(category.label)}
              </AppText>
              {category.instruments.map((instrument) => {
                const selected = value.instruments.includes(instrument);
                return (
                  <View key={instrument} style={styles.instrumentRow}>
                    <ChoiceChip
                      label={t(instrument)}
                      onPress={() => {
                        const instruments = toggleProfileValue(value.instruments, instrument);
                        const instrumentLevels = { ...value.instrumentLevels };
                        if (!instruments.includes(instrument)) delete instrumentLevels[instrument];
                        update({ instrumentLevels, instruments });
                      }}
                      selected={selected}
                    />
                    {selected ? (
                      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                        <View style={styles.levels}>
                          {levelOptions.map((level) => (
                            <ChoiceChip
                              key={level}
                              label={t(level)}
                              onPress={() =>
                                update({
                                  instrumentLevels: {
                                    ...value.instrumentLevels,
                                    [instrument]: level,
                                  },
                                })
                              }
                              selected={value.instrumentLevels[instrument] === level}
                            />
                          ))}
                        </View>
                      </ScrollView>
                    ) : null}
                  </View>
                );
              })}
            </Card>
          ))}
        </View>

        <View style={styles.section}>
          <SectionHeader title={t('Mes genres')} />
          <Card>
            <View style={styles.choices}>
              {allGenres.map((genre) => (
                <ChoiceChip
                  key={genre}
                  label={t(genre)}
                  onPress={() => update({ genres: toggleProfileValue(value.genres, genre) })}
                  selected={value.genres.includes(genre)}
                />
              ))}
            </View>
          </Card>
        </View>

        <View style={styles.section}>
          <SectionHeader title={t('Réseaux sociaux')} />
          <Card style={styles.card}>
            {socialNetworks.map((network) => (
              <View key={network.key} style={styles.socialRow}>
                <Ionicons color={palette.bronze} name={network.icon} size={22} />
                <AppText style={styles.socialLabel} variant="subheadline">
                  {t(network.label)}
                </AppText>
                <TextInput
                  autoCapitalize="none"
                  autoCorrect={false}
                  onChangeText={(handle) =>
                    update({ socials: { ...value.socials, [network.key]: handle } })
                  }
                  placeholder={t('pseudo')}
                  placeholderTextColor={palette.muted}
                  style={[styles.socialInput, { color: palette.text }]}
                  value={value.socials[network.key] ?? ''}
                />
              </View>
            ))}
          </Card>
        </View>

        {errorText ? (
          <AppText color={palette.signal} variant="caption">
            {errorText}
          </AppText>
        ) : null}
        <DispoButton loading={saving} onPress={() => void save()}>
          {t('Enregistrer')}
        </DispoButton>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  avatarButton: { alignItems: 'center', alignSelf: 'center', gap: spacing.tight },
  bio: { minHeight: 100, textAlignVertical: 'top' },
  camera: {
    alignItems: 'center',
    borderRadius: 11,
    height: 22,
    justifyContent: 'center',
    position: 'absolute',
    right: 3,
    top: 62,
    width: 22,
  },
  card: { gap: spacing.sm },
  cardTitle: { fontWeight: '800' },
  choices: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  city: { flex: 1 },
  content: { gap: spacing.lg, paddingBottom: spacing.xxl, paddingHorizontal: spacing.gutter },
  instrumentRow: { gap: spacing.xs },
  levels: { flexDirection: 'row', gap: spacing.tight },
  placeRow: { flexDirection: 'row', gap: spacing.sm },
  postal: { width: 120 },
  pressed: { opacity: 0.94, transform: [{ scale: 0.97 }] },
  section: { gap: spacing.sm },
  socialInput: { flex: 1, fontSize: 15, minHeight: 44, textAlign: 'right' },
  socialLabel: { flex: 1 },
  socialRow: {
    alignItems: 'center',
    borderRadius: radii.button,
    flexDirection: 'row',
    gap: spacing.control,
    minHeight: 48,
  },
});
