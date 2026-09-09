import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { searchSongCatalog, type SongCatalogResult } from './group-repository';
import { SongArtwork, SongStoreBadge } from './group-song-row';

import { AppText } from '@/components/ui/app-text';
import { Card } from '@/components/ui/card';
import { FormField } from '@/components/ui/form-field';
import { useDispoTheme } from '@/theme/theme-context';
import { spacing } from '@/theme/tokens';

export function SongCatalogPicker({
  onSelect,
  selectedId,
  loadingMetadata = false,
}: {
  onSelect: (song: SongCatalogResult) => void;
  selectedId: string | null;
  loadingMetadata?: boolean;
}) {
  const { t } = useTranslation();
  const { palette } = useDispoTheme();
  const [search, setSearch] = useState('');
  const [term, setTerm] = useState('');
  useEffect(() => {
    const timer = setTimeout(() => setTerm(search.trim()), 350);
    return () => clearTimeout(timer);
  }, [search]);
  const query = useQuery({
    queryKey: ['song-catalog-search', term],
    enabled: term.length >= 2,
    queryFn: ({ signal }) => searchSongCatalog(term, signal),
  });
  return (
    <Card style={styles.card}>
      <AppText variant="title">{t('Catalogue musical')}</AppText>
      <FormField
        label={t('Chercher')}
        value={search}
        onChangeText={setSearch}
        placeholder={t('Titre ou artiste')}
        returnKeyType="search"
      />
      {query.isFetching ? <ActivityIndicator color={palette.electric} /> : null}
      {query.isError ? (
        <AppText variant="caption" color={palette.muted}>
          {t('Catalogue indisponible. Tu peux ajouter le morceau manuellement.')}
        </AppText>
      ) : null}
      {search.trim().length >= 2 &&
        query.data?.map((item) => (
          <Pressable
            key={item.catalogId}
            accessibilityRole="button"
            onPress={() => {
              onSelect(item);
              setSearch('');
              setTerm('');
            }}
            style={[styles.row, { borderBottomColor: palette.border }]}
          >
            <SongArtwork song={item} radius={8} size={42} />
            <View style={styles.copy}>
              <AppText numberOfLines={1} style={styles.bold}>
                {item.title}
              </AppText>
              <AppText color={palette.muted} numberOfLines={1} variant="caption2">
                {item.artist}
                {item.albumTitle ? ` · ${item.albumTitle}` : ''}
              </AppText>
              <SongStoreBadge song={item} />
            </View>
            <Ionicons
              color={selectedId === item.catalogId ? palette.electric : palette.muted}
              name={selectedId === item.catalogId ? 'checkmark-circle' : 'add-circle-outline'}
              size={21}
            />
          </Pressable>
        ))}
      {loadingMetadata ? (
        <View accessibilityLiveRegion="polite" style={styles.analysis}>
          <ActivityIndicator color={palette.electric} size="small" />
          <AppText color={palette.muted} variant="caption">
            {t('Chargement…')}
          </AppText>
        </View>
      ) : null}
    </Card>
  );
}
const styles = StyleSheet.create({
  card: { gap: spacing.sm },
  row: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.xs,
    paddingVertical: spacing.xs,
    borderBottomWidth: 1,
  },
  copy: { flex: 1, minWidth: 0 },
  bold: { fontWeight: '700' },
  analysis: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
});
