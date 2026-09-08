import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { randomUUID } from 'expo-crypto';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';

import { repertoireStyles } from './repertoire-model';
import { addPersonalSong } from './repertoire-repository';

import { AppText } from '@/components/ui/app-text';
import { Card } from '@/components/ui/card';
import { ChoiceChip } from '@/components/ui/choice-chip';
import { DispoButton } from '@/components/ui/pressable';
import { Screen } from '@/components/ui/screen';
import { useAuth } from '@/features/auth/auth-context';
import { groupSongFromJson } from '@/features/groups/group-model';
import { searchSongCatalog, type SongCatalogResult } from '@/features/groups/group-repository';
import { useDispoTheme } from '@/theme/theme-context';

export function RepertoireAddScreen() {
  const { session } = useAuth();
  const { t } = useTranslation();
  const { palette } = useDispoTheme();
  const client = useQueryClient();
  const [title, setTitle] = useState('');
  const [artist, setArtist] = useState('');
  const [style, setStyle] = useState('');
  const [key, setKey] = useState('');
  const [catalog, setCatalog] = useState<SongCatalogResult | null>(null);
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(search.trim()), 350);
    return () => clearTimeout(timer);
  }, [search]);
  const results = useQuery({
    queryKey: ['personal-song-search', debounced],
    queryFn: ({ signal }) => searchSongCatalog(debounced, signal),
    enabled: debounced.length >= 2,
  });
  const add = useMutation({
    mutationFn: async () => {
      const song = groupSongFromJson({
        id: randomUUID(),
        title: title.trim(),
        artist: artist.trim(),
        genre: style || catalog?.genre || null,
        genres: style ? [style] : (catalog?.genres ?? []),
        key: key.trim() || null,
        is_approved: true,
      });
      if (!song || !session?.user.id) throw new Error('invalid_song');
      return addPersonalSong({
        ...song,
        ...(catalog
          ? {
              ...catalog,
              genre: style || catalog.genre,
              genres: style ? [style] : catalog.genres,
              title: title.trim(),
              artist: artist.trim(),
              key: key.trim() || catalog.key,
            }
          : {}),
      });
    },
    onSuccess: async (id) => {
      await client.invalidateQueries({ queryKey: ['personal-repertoire'] });
      router.replace({
        pathname: '/repertoire/songs/[songId]',
        params: { songId: id, profileId: session?.user.id },
      } as never);
    },
    onError: () => Alert.alert(t('Le morceau n’a pas pu être ajouté.')),
  });
  const field = [
    styles.input,
    { backgroundColor: palette.card, borderColor: palette.border, color: palette.text },
  ];
  return (
    <Screen nativeHeader>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.flex}
        keyboardVerticalOffset={100}
      >
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
          <AppText color={palette.muted} variant="subheadline">
            {t('Choisis un morceau du catalogue ou renseigne-le toi-même.')}
          </AppText>
          <TextInput
            accessibilityLabel={t('Rechercher dans le catalogue')}
            placeholder={t('Rechercher dans le catalogue')}
            placeholderTextColor={palette.muted}
            value={search}
            onChangeText={setSearch}
            style={field}
          />
          {results.isFetching ? (
            <AppText color={palette.muted} variant="caption">
              {t('Recherche…')}
            </AppText>
          ) : null}
          {results.isError ? (
            <AppText color={palette.muted} variant="caption">
              {t('Catalogue indisponible. Tu peux ajouter le morceau manuellement.')}
            </AppText>
          ) : null}
          {search.trim().length >= 2 &&
            results.data?.slice(0, 8).map((result) => (
              <Pressable
                accessibilityRole="button"
                key={result.catalogId}
                onPress={() => {
                  setCatalog(result);
                  setTitle(result.title);
                  setArtist(result.artist);
                  setStyle(result.genre ?? '');
                  setKey(result.key ?? '');
                  setSearch('');
                }}
              >
                <Card padding={12}>
                  <AppText variant="subheadline">{result.title}</AppText>
                  <AppText color={palette.muted} variant="caption">
                    {result.artist}
                  </AppText>
                </Card>
              </Pressable>
            ))}
          <View style={styles.field}>
            <AppText variant="subheadline">{t('Titre')}</AppText>
            <TextInput
              accessibilityLabel={t('Titre')}
              maxLength={200}
              value={title}
              onChangeText={(value) => {
                setTitle(value);
                setCatalog(null);
              }}
              style={field}
            />
          </View>
          <View style={styles.field}>
            <AppText variant="subheadline">{t('Artiste ou compositeur')}</AppText>
            <TextInput
              accessibilityLabel={t('Artiste ou compositeur')}
              maxLength={200}
              value={artist}
              onChangeText={(value) => {
                setArtist(value);
                setCatalog(null);
              }}
              style={field}
            />
          </View>
          <View style={styles.field}>
            <AppText variant="subheadline">{t('Tonalité')}</AppText>
            <TextInput
              accessibilityLabel={t('Tonalité')}
              maxLength={20}
              placeholder="C, B♭, Dm…"
              placeholderTextColor={palette.muted}
              value={key}
              onChangeText={setKey}
              style={field}
            />
          </View>
          <AppText variant="subheadline">{t('Style')}</AppText>
          <View style={styles.chips}>
            {repertoireStyles.map((value) => (
              <ChoiceChip
                key={value}
                label={t(value)}
                selected={style === value}
                onPress={() => setStyle(value)}
              />
            ))}
          </View>
          <DispoButton
            disabled={!title.trim() || !session?.user.id}
            loading={add.isPending}
            onPress={() => add.mutate()}
          >
            {t('Ajouter à mon répertoire')}
          </DispoButton>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}
const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: 18, paddingBottom: 40, gap: 14 },
  field: { gap: 6 },
  input: { borderWidth: 1, borderRadius: 14, padding: 14, fontSize: 16 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
});
