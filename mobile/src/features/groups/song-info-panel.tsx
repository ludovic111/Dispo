import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Linking, Platform, StyleSheet, View } from 'react-native';

import type { GroupSong } from './group-model';
import { isKnownMusicalKey, musicalKeyOptions, musicalKeysEqual } from './group-song-key-model';
import { SongArtwork, SongListenSheet, SongStoreBadge } from './group-song-row';

import { AppText } from '@/components/ui/app-text';
import { Card } from '@/components/ui/card';
import { ChoiceChip } from '@/components/ui/choice-chip';
import { FormField } from '@/components/ui/form-field';
import { DispoButton, IconButton } from '@/components/ui/pressable';
import { SectionHeader } from '@/components/ui/section';
import { Tag } from '@/components/ui/tag';
import { irealDestination } from '@/domain/song';
import { useDispoTheme } from '@/theme/theme-context';
import { radii, spacing } from '@/theme/tokens';

function durationLabel(milliseconds: number | null): string | null {
  if (!milliseconds || milliseconds < 0) return null;
  const seconds = Math.floor(milliseconds / 1_000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

export function SongInfoPanel({
  draft,
  canEdit,
  patch,
  subtitle,
  arrangementSubtitle,
}: {
  draft: GroupSong;
  canEdit: boolean;
  patch: <K extends keyof GroupSong>(key: K, value: GroupSong[K]) => void;
  subtitle: string;
  arrangementSubtitle: string;
}) {
  const { t } = useTranslation();
  const { palette } = useDispoTheme();
  const [listenVisible, setListenVisible] = useState(false);
  const arrangement = [
    draft.key?.trim(),
    draft.tempoBpm ? `${draft.tempoBpm} BPM` : null,
    draft.form?.trim(),
  ].filter((value): value is string => Boolean(value));
  const recording = [
    draft.albumTitle,
    draft.releaseYear?.toString(),
    durationLabel(draft.durationMilliseconds),
  ].filter((value): value is string => Boolean(value));
  const ireal = irealDestination(draft);
  const openIReal = async () => {
    if (!ireal) return;
    try {
      if (await Linking.canOpenURL(ireal.url)) {
        await Linking.openURL(ireal.url);
        return;
      }
    } catch {
      // La même issue de secours s'applique si la vérification native échoue.
    }
    const storeUrl =
      Platform.OS === 'android'
        ? 'https://play.google.com/store/apps/details?id=com.massimobiolcati.irealb'
        : 'https://apps.apple.com/app/ireal-pro/id409035833';
    Alert.alert(t('iReal Pro'), undefined, [
      { style: 'cancel', text: t('Annuler') },
      {
        onPress: () => void Linking.openURL(storeUrl),
        text: Platform.OS === 'android' ? t('Ouvrir') : t("Voir dans l'App Store"),
      },
    ]);
  };
  return (
    <>
      <Card style={styles.card}>
        <SectionHeader subtitle={subtitle} title={t('Identité')} />
        <View style={styles.songHero}>
          <SongArtwork song={draft} radius={radii.sm} size={54} />
          <View style={styles.heroCopy}>
            <AppText numberOfLines={2} variant="title3">
              {draft.title || t('Titre')}
            </AppText>
            {arrangement.length ? (
              <AppText color={palette.muted} numberOfLines={1} variant="mono">
                {arrangement.join(' · ')}
              </AppText>
            ) : null}
            {draft.artist ? (
              <AppText color={palette.muted} numberOfLines={1} variant="subheadline">
                {draft.artist}
              </AppText>
            ) : null}
            {recording.length ? (
              <AppText color={palette.muted} numberOfLines={1} variant="caption">
                {recording.join(' · ')}
              </AppText>
            ) : null}
            <SongStoreBadge song={draft} />
          </View>
          <IconButton
            accessibilityLabel={t('Écouter ce morceau')}
            icon="headset"
            onPress={() => setListenVisible(true)}
          />
        </View>
        {!draft.isApproved ? (
          <Tag color={palette.signal} label={t('Suggestion à valider')} />
        ) : null}
        {canEdit ? (
          <View style={styles.editorFields}>
            <FormField
              label={t('Titre')}
              onChangeText={(value) => patch('title', value)}
              value={draft.title}
            />
            <FormField
              label={t('Artiste')}
              onChangeText={(value) => patch('artist', value)}
              value={draft.artist}
            />
          </View>
        ) : null}
      </Card>
      <SongListenSheet
        onClose={() => setListenVisible(false)}
        song={draft}
        visible={listenVisible}
      />
      <Card style={styles.card}>
        <SectionHeader subtitle={arrangementSubtitle} title={t('Repères')} />
        <AppText color={palette.bronze} variant="label">
          {t('Tonalité')}
        </AppText>
        {draft.key?.trim() && !isKnownMusicalKey(draft.key) ? (
          <AppText color={palette.muted} variant="caption">
            {t('Tonalité')} : {draft.key}
          </AppText>
        ) : null}
        {canEdit ? (
          <View style={styles.wrap}>
            <ChoiceChip
              label={t('Non renseignée')}
              onPress={() => patch('key', null)}
              selected={!draft.key?.trim()}
            />
            {musicalKeyOptions.map((key) => (
              <ChoiceChip
                key={key}
                label={key}
                onPress={() => patch('key', key)}
                selected={musicalKeysEqual(draft.key, key)}
              />
            ))}
          </View>
        ) : (
          <Tag color={palette.bronze} label={draft.key?.trim() || t('Non renseignée')} />
        )}
        <FormField
          editable={canEdit}
          keyboardType="number-pad"
          label={t('Tempo BPM')}
          onChangeText={(value) => patch('tempoBpm', Number.parseInt(value, 10) || null)}
          value={draft.tempoBpm?.toString() ?? ''}
        />
        <FormField
          editable={canEdit}
          label={t('Forme')}
          onChangeText={(value) => patch('form', value.trim() || null)}
          placeholder={t('AABA, ABAB…')}
          value={draft.form ?? ''}
        />
      </Card>
      <DispoButton disabled={!ireal} icon="open-outline" onPress={() => void openIReal()}>
        {t('Ouvrir dans iReal Pro')}
      </DispoButton>
    </>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing.sm },
  editorFields: { gap: spacing.sm },
  heroCopy: { flex: 1, gap: spacing.xxs, minWidth: 0 },
  songHero: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
});
