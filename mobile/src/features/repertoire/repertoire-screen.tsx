import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Fragment, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Alert,
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Switch,
  TextInput,
  View,
} from 'react-native';

import {
  masteryLabels,
  personalSongStyle,
  visiblePersonalSongs,
  type PersonalSong,
  type RepertoireOrder,
} from './repertoire-model';
import { usePersonalRepertoire, usePersonalRepertoireActions } from './repertoire-queries';

import { AppText } from '@/components/ui/app-text';
import { Card } from '@/components/ui/card';
import { ChoiceChip } from '@/components/ui/choice-chip';
import { DispoButton } from '@/components/ui/pressable';
import { ErrorState, LoadingState, Screen } from '@/components/ui/screen';
import { useAuth } from '@/features/auth/auth-context';
import { GroupSongRow } from '@/features/groups/group-song-row';
import { SubscriptionAccessCard } from '@/features/premium/subscription-access-card';
import { useSubscription } from '@/features/premium/subscription-queries';
import { useDispoTheme } from '@/theme/theme-context';
import { spacing } from '@/theme/tokens';

export function PersonalRepertoireLink({ profileId, self }: { profileId: string; self: boolean }) {
  const { t } = useTranslation();
  const { palette } = useDispoTheme();
  const query = usePersonalRepertoire(profileId);
  if (!self && (!query.data?.isPublic || query.isError)) return null;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => router.push(`/repertoire/${profileId}` as never)}
    >
      <Card style={styles.row}>
        <Ionicons name="musical-notes-outline" size={23} color={palette.electric} />
        <View style={styles.flex}>
          <AppText variant="headline">{t(self ? 'Mon répertoire' : 'Répertoire musical')}</AppText>
          <AppText color={palette.muted} variant="caption">
            {t(self ? 'Morceaux, maîtrise et visibilité' : 'Découvrir les morceaux de ce musicien')}
          </AppText>
        </View>
        <Ionicons name="chevron-forward" size={17} color={palette.muted} />
      </Card>
    </Pressable>
  );
}

export function PersonalSongRow({ item, onPress }: { item: PersonalSong; onPress: () => void }) {
  const { t } = useTranslation();
  const { palette } = useDispoTheme();
  return (
    <GroupSongRow
      song={item.song}
      onPress={onPress}
      showSoloAction={false}
      showDisclosure={false}
      trailing={
        <View
          accessible
          accessibilityLabel={`${t('Maîtrise')} : ${t(masteryLabels[item.mastery] ?? masteryLabels[0])}`}
          style={styles.mastery}
        >
          <View style={styles.dots}>
            {[1, 2, 3].map((level) => (
              <View
                key={level}
                style={[
                  styles.dot,
                  {
                    backgroundColor:
                      item.mastery >= level ? palette.electric : `${palette.muted}70`,
                  },
                ]}
              />
            ))}
          </View>
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
  const songs = query.data?.songs;
  const stylesPresent = useMemo(
    () => [...new Set((songs ?? []).map(personalSongStyle).filter(Boolean))].sort(),
    [songs],
  );
  const visible = useMemo(
    () => visiblePersonalSongs(songs ?? [], search, style, order),
    [songs, search, style, order],
  );
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
        <View style={styles.empty}>
          <Ionicons name="lock-closed-outline" color={palette.muted} size={32} />
          <AppText variant="headline">{t('Ce répertoire est privé.')}</AppText>
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
        ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
        renderItem={({ item }) => (
          <PersonalSongRow
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
                <Card style={styles.row}>
                  <Ionicons
                    name={query.data?.isPublic ? 'globe-outline' : 'lock-closed-outline'}
                    size={22}
                    color={palette.electric}
                  />
                  <View style={styles.flex}>
                    <AppText variant="subheadline">{t('Répertoire public')}</AppText>
                    <AppText variant="caption" color={palette.muted}>
                      {t(
                        query.data?.isPublic
                          ? canEdit
                            ? 'Visible depuis ton profil.'
                            : 'Le partage public est suspendu sans Premium.'
                          : 'Toi seul peux le consulter.',
                      )}
                    </AppText>
                  </View>
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
                </Card>
                <AppText variant="caption" color={palette.muted}>
                  {t(
                    'Les morceaux de tes groupes sont ajoutés automatiquement. Ta maîtrise reste personnelle.',
                  )}
                </AppText>
                <DispoButton
                  icon={canEdit ? 'add' : 'lock-closed-outline'}
                  onPress={() => router.push(canEdit ? ('/repertoire/add' as never) : '/premium')}
                >
                  {t('Ajouter un morceau')}
                </DispoButton>
              </>
            ) : null}
            <TextInput
              accessibilityLabel={t('Rechercher un morceau')}
              placeholder={t('Rechercher un morceau')}
              placeholderTextColor={palette.muted}
              value={search}
              onChangeText={setSearch}
              style={[
                styles.input,
                { color: palette.text, backgroundColor: palette.card, borderColor: palette.border },
              ]}
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
          <View style={styles.empty}>
            <Ionicons name="musical-notes-outline" size={30} color={palette.muted} />
            <AppText variant="headline">
              {t(search || style ? 'Aucun morceau trouvé' : 'Un répertoire à construire')}
            </AppText>
            <AppText color={palette.muted} style={styles.center} variant="subheadline">
              {t(
                search || style
                  ? 'Essaie une autre recherche ou un autre style.'
                  : self
                    ? 'Ajoute tes morceaux ou retrouve ici ceux de tes groupes.'
                    : 'Aucun morceau pour le moment.',
              )}
            </AppText>
          </View>
        }
      />
    </Container>
  );
}
const styles = StyleSheet.create({
  content: { padding: spacing.gutter, paddingBottom: spacing.xxl },
  header: { gap: 14, paddingBottom: 16 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  flex: { flex: 1, minWidth: 0, gap: 3 },
  mastery: { alignItems: 'flex-end', gap: 6, maxWidth: 100 },
  dots: { flexDirection: 'row', gap: 4 },
  dot: { width: 7, height: 7, borderRadius: 4 },
  chips: { flexDirection: 'row', gap: 8 },
  input: { borderWidth: 1, borderRadius: 14, padding: 14, fontSize: 16 },
  empty: { padding: 28, gap: 12, alignItems: 'center' },
  center: { textAlign: 'center' },
});
