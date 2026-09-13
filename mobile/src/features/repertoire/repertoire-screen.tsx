import { router } from 'expo-router';
import { Fragment, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Alert,
  FlatList,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Switch,
  View,
} from 'react-native';

import {
  masteryLabels,
  personalSongStyle,
  visiblePersonalSongs,
  withoutSongArtwork,
  type PersonalSong,
  type RepertoireOrder,
} from './repertoire-model';
import { usePersonalRepertoire, usePersonalRepertoireActions } from './repertoire-queries';

import { AppText } from '@/components/ui/app-text';
import { ChoiceChip } from '@/components/ui/choice-chip';
import { FormField } from '@/components/ui/form-field';
import { ListRow } from '@/components/ui/list-row';
import { DispoButton } from '@/components/ui/pressable';
import { EmptyState, ErrorState, LoadingState, Screen } from '@/components/ui/screen';
import { useAuth } from '@/features/auth/auth-context';
import { GroupSongRow } from '@/features/groups/group-song-row';
import { SubscriptionAccessCard } from '@/features/premium/subscription-access-card';
import { useSubscription } from '@/features/premium/subscription-queries';
import { hideAlbumCoversKey, useBooleanPreference } from '@/features/settings/settings-storage';
import { useDispoTheme } from '@/theme/theme-context';
import { spacing, tint } from '@/theme/tokens';

export function PersonalRepertoireLink({ profileId, self }: { profileId: string; self: boolean }) {
  const { t } = useTranslation();
  const query = usePersonalRepertoire(profileId);
  if (!self && (!query.data?.isPublic || query.isError)) return null;
  return (
    <ListRow
      leadingIcon="musical-notes-outline"
      onPress={() => router.push(`/repertoire/${profileId}` as never)}
      subtitle={t(
        self ? 'Morceaux, maîtrise et visibilité' : 'Découvrir les morceaux de ce musicien',
      )}
      title={t(self ? 'Mon répertoire' : 'Répertoire musical')}
    />
  );
}

function PersonalSongRow({
  hideArtwork,
  item,
  onPress,
}: {
  hideArtwork: boolean;
  item: PersonalSong;
  onPress: () => void;
}) {
  const { t } = useTranslation();
  const { palette } = useDispoTheme();
  return (
    <GroupSongRow
      song={hideArtwork ? withoutSongArtwork(item.song) : item.song}
      onPress={onPress}
      showSoloAction={false}
      showDisclosure={false}
      trailing={
        <View
          accessible
          accessibilityLabel={`${t('Maîtrise')} : ${t(masteryLabels[item.mastery] ?? masteryLabels[0])}`}
          style={styles.dots}
        >
          {[1, 2, 3].map((level) => (
            <View
              key={level}
              style={[
                styles.bar,
                { height: 6 + level * 3 },
                {
                  backgroundColor:
                    item.mastery >= level ? palette.electric : tint(palette.muted, 0.44),
                },
              ]}
            />
          ))}
        </View>
      }
    />
  );
}

export function RepertoireScreen({
  profileId,
  embedded = false,
}: {
  profileId: string;
  embedded?: boolean;
}) {
  const Container = embedded ? Fragment : Screen;
  const { session } = useAuth();
  const self = profileId === session?.user.id;
  const subscription = useSubscription();
  const canEdit = subscription.data?.tier === 'premium';
  const { t } = useTranslation();
  const { palette } = useDispoTheme();
  const query = usePersonalRepertoire(profileId);
  const { visibility } = usePersonalRepertoireActions();
  const [search, setSearch] = useState('');
  const [style, setStyle] = useState('');
  const [order, setOrder] = useState<RepertoireOrder>('title');
  const [hideArtwork] = useBooleanPreference(hideAlbumCoversKey);
  const songs = query.data?.songs;
  const stylesPresent = useMemo(
    () => [...new Set((songs ?? []).map(personalSongStyle).filter(Boolean))].sort(),
    [songs],
  );
  const visible = useMemo(
    () => visiblePersonalSongs(songs ?? [], search, style, order),
    [songs, search, style, order],
  );
  const addSong = () => router.push(canEdit ? ('/repertoire/add' as never) : '/premium');
  if (query.isLoading)
    return (
      <Container {...(!embedded ? { nativeHeader: true } : {})}>
        <LoadingState />
      </Container>
    );
  if (query.isError)
    return (
      <Container {...(!embedded ? { nativeHeader: true } : {})}>
        <ErrorState
          message={t('Le répertoire n’a pas pu être chargé.')}
          onRetry={() => void query.refetch()}
        />
      </Container>
    );
  if (!self && !query.data?.isPublic)
    return (
      <Container {...(!embedded ? { nativeHeader: true } : {})}>
        <View style={styles.content}>
          <EmptyState
            icon="lock-closed-outline"
            message={t('Ce répertoire est privé.')}
            title={t('Répertoire musical')}
          />
        </View>
      </Container>
    );
  return (
    <Container {...(!embedded ? { nativeHeader: true } : {})}>
      <FlatList
        data={visible}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            tintColor={palette.electric}
            refreshing={query.isRefetching}
            onRefresh={() => void query.refetch()}
          />
        }
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        renderItem={({ item }) => (
          <PersonalSongRow
            hideArtwork={hideArtwork}
            item={item}
            onPress={() =>
              router.push({
                pathname: '/repertoire/songs/[songId]',
                params: { songId: item.id, profileId },
              } as never)
            }
          />
        )}
        ListHeaderComponent={
          <View style={styles.header}>
            {self ? (
              <>
                {!canEdit ? <SubscriptionAccessCard /> : null}
                <ListRow
                  accessory={
                    <Switch
                      accessibilityLabel={t('Répertoire public')}
                      disabled={visibility.isPending || (!canEdit && !query.data?.isPublic)}
                      value={query.data?.isPublic ?? false}
                      trackColor={{ true: palette.electric, false: palette.inset }}
                      onValueChange={(value) =>
                        visibility.mutate(value, {
                          onError: () => Alert.alert(t('La visibilité n’a pas pu être modifiée.')),
                        })
                      }
                    />
                  }
                  leadingIcon={query.data?.isPublic ? 'globe-outline' : 'lock-closed-outline'}
                  subtitle={t(
                    query.data?.isPublic
                      ? canEdit
                        ? 'Visible depuis ton profil.'
                        : 'Le partage public est suspendu sans Premium.'
                      : 'Toi seul peux le consulter.',
                  )}
                  title={t('Répertoire public')}
                />
                <AppText variant="caption" color={palette.muted}>
                  {t(
                    'Les morceaux de tes groupes sont ajoutés automatiquement. Ta maîtrise reste personnelle.',
                  )}
                </AppText>
                <DispoButton icon={canEdit ? 'add' : 'lock-closed-outline'} onPress={addSong}>
                  {t('Ajouter un morceau')}
                </DispoButton>
              </>
            ) : null}
            <FormField
              label={t('Rechercher un morceau')}
              placeholder={t('Rechercher un morceau')}
              value={search}
              onChangeText={setSearch}
            />
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View style={styles.chips}>
                <ChoiceChip
                  label={t('Tous les styles')}
                  selected={!style}
                  onPress={() => setStyle('')}
                />
                {stylesPresent.map((value) => (
                  <ChoiceChip
                    key={value}
                    label={t(value)}
                    selected={style === value}
                    onPress={() => setStyle(value)}
                  />
                ))}
              </View>
            </ScrollView>
            <View style={styles.chips}>
              {(['title', 'style', 'mastery'] as const).map((value) => (
                <ChoiceChip
                  key={value}
                  label={t(value === 'title' ? 'Titre' : value === 'style' ? 'Style' : 'Maîtrise')}
                  selected={order === value}
                  onPress={() => setOrder(value)}
                />
              ))}
            </View>
            <AppText color={palette.muted} variant="caption">
              {t('{{count}} morceau', { count: visible.length })}
            </AppText>
          </View>
        }
        ListEmptyComponent={
          <EmptyState
            icon="musical-notes-outline"
            message={t(
              search || style
                ? 'Essaie une autre recherche ou un autre style.'
                : self
                  ? 'Ajoute tes morceaux ou retrouve ici ceux de tes groupes.'
                  : 'Aucun morceau pour le moment.',
            )}
            title={t(search || style ? 'Aucun morceau trouvé' : 'Un répertoire à construire')}
            {...(self && !search && !style
              ? { action: { label: t('Ajouter un morceau'), onPress: addSong } }
              : {})}
          />
        }
      />
    </Container>
  );
}
const styles = StyleSheet.create({
  chips: { flexDirection: 'row', gap: spacing.xs },
  content: { padding: spacing.gutter, paddingBottom: spacing.xxl },
  bar: { borderRadius: 1, width: 3 },
  dots: {
    alignItems: 'flex-end',
    flexDirection: 'row',
    gap: spacing.xxs - 1,
    paddingHorizontal: spacing.xxs,
  },
  header: { gap: spacing.md, paddingBottom: spacing.md },
  separator: { height: spacing.xs },
});
