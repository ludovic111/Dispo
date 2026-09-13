import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import type { AvailabilityScope } from './discovery-model';

import { AppText } from '@/components/ui/app-text';
import { Card } from '@/components/ui/card';
import { ListRow } from '@/components/ui/list-row';
import { DispoButton } from '@/components/ui/pressable';
import { EmptyState, LoadingState } from '@/components/ui/screen';
import { PillButton, SectionHeader } from '@/components/ui/section';
import { GroupAvatar } from '@/features/groups/group-avatar';
import { formatSwiftPlaceholders } from '@/i18n/format';
import { useDispoTheme } from '@/theme/theme-context';
import { spacing } from '@/theme/tokens';

export interface HomeGroup {
  date: string | null;
  emoji: string;
  id: string;
  memberCount: number;
  name: string;
  photoUrl: string | null;
}

export function HomeGroupsSection({
  groups,
  isLoading,
  isError,
  onCreate,
  onOpen,
  onRetry,
}: {
  groups: HomeGroup[];
  isLoading: boolean;
  isError: boolean;
  onCreate: () => void;
  onOpen: (id: string) => void;
  onRetry: () => void;
}) {
  const { palette } = useDispoTheme();
  const { i18n, t } = useTranslation();
  const empty = !isLoading && !isError && groups.length === 0;
  const locale = i18n.resolvedLanguage ?? i18n.language ?? 'fr';

  return (
    <View style={styles.section}>
      <SectionHeader
        title={t('Mes groupes')}
        {...(empty ? {} : { action: { label: t('Créer'), onPress: onCreate } })}
      />

      {isLoading && groups.length === 0 ? (
        <LoadingState label={t('Chargement des groupes…')} />
      ) : null}
      {isError ? (
        <Card padding={spacing.sm}>
          <AppText color={palette.muted} variant="subheadline">
            {t('Tes groupes n’ont pas pu être chargés.')}
          </AppText>
          <View style={styles.inlineAction}>
            <DispoButton
              accessibilityLabel={t('Réessayer')}
              icon="refresh"
              onPress={onRetry}
              size="compact"
              variant="ghost"
            >
              {t('Réessayer')}
            </DispoButton>
          </View>
        </Card>
      ) : null}
      {empty ? (
        <ListRow
          leadingIcon="people-outline"
          onPress={onCreate}
          title={t('Crée ton premier groupe')}
        />
      ) : null}
      {groups.map((group) => (
        <ListRow
          key={group.id}
          leading={
            <GroupAvatar
              emoji={group.emoji}
              name={group.name}
              photoUrl={group.photoUrl}
              size={44}
            />
          }
          onPress={() => onOpen(group.id)}
          subtitle={`${
            group.date
              ? new Intl.DateTimeFormat(locale, {
                  day: 'numeric',
                  month: 'short',
                  weekday: 'short',
                }).format(new Date(group.date))
              : t('Aucune session')
          } · ${
            group.memberCount === 1
              ? t('1 membre')
              : formatSwiftPlaceholders(t('%lld membres'), group.memberCount)
          }`}
          title={group.name}
        />
      ))}
    </View>
  );
}

export function HomeAvailabilitySection({
  count,
  filterCount,
  onFilters,
  scope,
}: {
  count: number;
  filterCount: number;
  onFilters: () => void;
  scope: AvailabilityScope;
}) {
  const { palette } = useDispoTheme();
  const { t } = useTranslation();
  const label =
    scope === 'today'
      ? "Aujourd'hui"
      : scope === 'weekend'
        ? 'Ce week-end'
        : scope === 'thisWeek'
          ? 'Cette semaine'
          : 'Près de chez toi';
  return (
    <View style={[styles.availability, { borderTopColor: palette.border }]}>
      <View style={styles.flex}>
        <SectionHeader subtitle={`${t(label)} · ${count}`} title={t('Dispo')} />
      </View>
      <PillButton
        active={filterCount > 0}
        icon="options"
        onPress={onFilters}
        title={
          filterCount > 0 ? formatSwiftPlaceholders(t('Filtres · %lld'), filterCount) : t('Filtres')
        }
      />
    </View>
  );
}

export function HomeEmptyState({
  onExplore,
  scope,
}: {
  onExplore: () => void;
  scope: AvailabilityScope;
}) {
  const { t } = useTranslation();
  return (
    <EmptyState
      action={{
        label: scope === 'nearby' ? t('Filtres') : t('Voir les musiciens à proximité'),
        onPress: onExplore,
      }}
      icon={
        scope === 'today'
          ? 'moon-outline'
          : scope === 'weekend'
            ? 'calendar-outline'
            : 'people-outline'
      }
      message={
        scope === 'nearby'
          ? t('Élargis le rayon ou retire un filtre pour voir plus de profils.')
          : t('Essaie une autre date ou explore les musiciens à proximité.')
      }
      title={t(
        scope === 'today'
          ? "Personne aujourd'hui"
          : scope === 'weekend'
            ? 'Personne ce week-end'
            : scope === 'thisWeek'
              ? 'Personne cette semaine'
              : 'Aucun musicien trouvé',
      )}
    />
  );
}

const styles = StyleSheet.create({
  availability: {
    alignItems: 'center',
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: spacing.sm,
    paddingTop: spacing.xl,
  },
  flex: { flex: 1, minWidth: 0 },
  inlineAction: { alignSelf: 'flex-start', marginTop: spacing.xs },
  section: { gap: spacing.sm },
});
