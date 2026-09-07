import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import type { AvailabilityScope } from './discovery-model';

import { AppText } from '@/components/ui/app-text';
import { Card } from '@/components/ui/card';
import { PillButton, SectionHeader } from '@/components/ui/section';
import { formatSwiftPlaceholders } from '@/i18n/format';
import { useDispoTheme } from '@/theme/theme-context';
import { minimumTouchTarget, radii, spacing } from '@/theme/tokens';

export interface HomeGroup {
  date: string | null;
  emoji: string;
  id: string;
  memberCount: number;
  name: string;
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

  return (
    <View style={styles.section}>
      <View style={styles.sectionHeading}>
        <View style={styles.flex}>
          <SectionHeader title={t('Mes groupes')} />
        </View>
        {!empty ? (
          <Pressable
            accessibilityLabel={t('Nouveau groupe')}
            accessibilityRole="button"
            onPress={onCreate}
            style={({ pressed }) => [styles.textAction, pressed && styles.pressed]}
          >
            <Ionicons color={palette.electric} name="add" size={18} />
            <AppText color={palette.electric} style={styles.actionText} variant="subheadline">
              {t('Créer')}
            </AppText>
          </Pressable>
        ) : null}
      </View>

      {isLoading && groups.length === 0 ? (
        <View accessibilityRole="progressbar" style={styles.statusRow}>
          <ActivityIndicator color={palette.electric} />
          <AppText color={palette.muted} style={styles.flex} variant="subheadline">
            {t('Chargement des groupes…')}
          </AppText>
        </View>
      ) : null}
      {isError ? (
        <Card padding={spacing.sm}>
          <AppText color={palette.muted} variant="subheadline">
            {t('Tes groupes n’ont pas pu être chargés.')}
          </AppText>
          <Pressable
            accessibilityLabel={t('Réessayer')}
            accessibilityRole="button"
            onPress={onRetry}
            style={({ pressed }) => [styles.textAction, pressed && styles.pressed]}
          >
            <Ionicons color={palette.electric} name="refresh" size={16} />
            <AppText color={palette.electric} variant="subheadline">
              {t('Réessayer')}
            </AppText>
          </Pressable>
        </Card>
      ) : null}
      {empty ? (
        <Pressable
          accessibilityLabel={t('Crée ton premier groupe')}
          accessibilityRole="button"
          onPress={onCreate}
          style={({ pressed }) => pressed && styles.pressed}
        >
          <Card tone="inset">
            <View style={styles.row}>
              <Ionicons color={palette.electric} name="people-outline" size={23} />
              <AppText style={[styles.flex, styles.actionText]} variant="subheadline">
                {t('Crée ton premier groupe')}
              </AppText>
              <Ionicons color={palette.electric} name="add-circle-outline" size={24} />
            </View>
          </Card>
        </Pressable>
      ) : null}
      {groups.map((group) => (
        <Pressable
          accessibilityRole="button"
          key={group.id}
          onPress={() => onOpen(group.id)}
          style={({ pressed }) => pressed && styles.pressed}
        >
          <Card tone="inset">
            <View style={styles.row}>
              <View style={[styles.groupIcon, { backgroundColor: `${palette.electric}14` }]}>
                <AppText>{group.emoji}</AppText>
              </View>
              <View style={[styles.flex, styles.groupCopy]}>
                <AppText style={styles.actionText} variant="subheadline">
                  {group.name}
                </AppText>
                <AppText color={palette.muted} variant="caption">
                  {group.date
                    ? new Intl.DateTimeFormat(i18n.resolvedLanguage ?? i18n.language ?? 'fr', {
                        day: 'numeric',
                        month: 'short',
                        weekday: 'short',
                      }).format(new Date(group.date))
                    : t('Aucune session')}
                  {' · '}
                  {group.memberCount === 1
                    ? t('1 membre')
                    : formatSwiftPlaceholders(t('%lld membres'), group.memberCount)}
                </AppText>
              </View>
              <Ionicons color={palette.electric} name="chevron-forward" size={17} />
            </View>
          </Card>
        </Pressable>
      ))}
    </View>
  );
}

export function HomeAvailabilitySection({
  counts,
  filterCount,
  onFilters,
  onScopeChange,
  scope,
}: {
  counts: Record<AvailabilityScope, number>;
  filterCount: number;
  onFilters: () => void;
  onScopeChange: (scope: AvailabilityScope) => void;
  scope: AvailabilityScope;
}) {
  const { palette } = useDispoTheme();
  const { t } = useTranslation();
  return (
    <View style={[styles.availability, { borderTopColor: palette.border }]}>
      <SectionHeader subtitle={t('Les musiciens disponibles')} title={t('Dispo')} />
      <View style={styles.scopes}>
        {(['today', 'weekend'] as const).map((item) => {
          const selected = scope === item;
          return (
            <Pressable
              accessibilityLabel={`${t(item === 'today' ? "Aujourd'hui" : 'Ce week-end')} · ${counts[item]}`}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              key={item}
              onPress={() => onScopeChange(item)}
              style={({ pressed }) => [
                styles.scope,
                {
                  backgroundColor: selected ? `${palette.electric}1F` : palette.cardMuted,
                  borderColor: selected ? `${palette.electric}80` : palette.border,
                },
                pressed && styles.pressed,
              ]}
            >
              <Ionicons
                color={selected ? palette.electric : palette.muted}
                name={item === 'today' ? 'flash-outline' : 'calendar-outline'}
                size={16}
              />
              <AppText
                color={selected ? palette.electric : palette.text}
                style={[styles.scopeLabel, selected && styles.actionText]}
                variant="subheadline"
              >
                {t(item === 'today' ? "Aujourd'hui" : 'Ce week-end')} · {counts[item]}
              </AppText>
            </Pressable>
          );
        })}
      </View>
      <View style={styles.availabilityActions}>
        <Pressable
          accessibilityLabel={`${t('Près de chez toi')} · ${counts.nearby}`}
          accessibilityRole="button"
          accessibilityState={{ selected: scope === 'nearby' }}
          onPress={() => onScopeChange('nearby')}
          style={({ pressed }) => [styles.nearbyAction, pressed && styles.pressed]}
        >
          <Ionicons
            color={scope === 'nearby' ? palette.electric : palette.muted}
            name={scope === 'nearby' ? 'checkmark-circle' : 'location-outline'}
            size={16}
          />
          <AppText
            color={scope === 'nearby' ? palette.electric : palette.muted}
            style={styles.scopeLabel}
            variant="caption"
          >
            {t('Près de chez toi')} · {counts.nearby}
          </AppText>
        </Pressable>
        <PillButton
          active={filterCount > 0}
          icon="options"
          onPress={onFilters}
          title={
            filterCount > 0
              ? formatSwiftPlaceholders(t('Filtres · %lld'), filterCount)
              : t('Filtres')
          }
        />
      </View>
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
  const { palette } = useDispoTheme();
  const { t } = useTranslation();
  return (
    <Card style={styles.empty}>
      <Ionicons
        color={palette.muted}
        name={
          scope === 'today'
            ? 'moon-outline'
            : scope === 'weekend'
              ? 'calendar-outline'
              : 'people-outline'
        }
        size={28}
      />
      <AppText style={styles.centered} variant="headline">
        {t(
          scope === 'today'
            ? "Personne aujourd'hui"
            : scope === 'weekend'
              ? 'Personne ce week-end'
              : 'Aucun musicien trouvé',
        )}
      </AppText>
      <AppText color={palette.muted} style={styles.centered} variant="subheadline">
        {scope === 'nearby'
          ? t('Élargis le rayon ou retire un filtre pour voir plus de profils.')
          : t('Essaie une autre date ou explore les musiciens à proximité.')}
      </AppText>
      <Pressable
        accessibilityLabel={scope === 'nearby' ? t('Filtres') : t('Voir les musiciens à proximité')}
        accessibilityRole="button"
        onPress={onExplore}
        style={({ pressed }) => [styles.textAction, pressed && styles.pressed]}
      >
        <AppText
          color={palette.electric}
          style={[styles.scopeLabel, styles.centered]}
          variant="subheadline"
        >
          {scope === 'nearby' ? t('Filtres') : t('Voir les musiciens à proximité')}
        </AppText>
        <Ionicons color={palette.electric} name="arrow-forward" size={16} />
      </Pressable>
    </Card>
  );
}

const styles = StyleSheet.create({
  actionText: { fontWeight: '700' },
  availability: { borderTopWidth: 1, gap: spacing.md, paddingTop: spacing.xl },
  availabilityActions: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.xs,
    flexWrap: 'wrap',
  },
  centered: { textAlign: 'center' },
  empty: { alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.xl },
  flex: { flex: 1, minWidth: 0 },
  groupCopy: { gap: spacing.xxs },
  groupIcon: {
    alignItems: 'center',
    borderRadius: radii.input,
    height: 38,
    justifyContent: 'center',
    width: 38,
  },
  nearbyAction: {
    alignItems: 'center',
    flexDirection: 'row',
    flexGrow: 1,
    flexBasis: 150,
    gap: spacing.tight,
    minHeight: minimumTouchTarget,
  },
  pressed: { opacity: 0.7 },
  row: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm },
  scope: {
    alignItems: 'center',
    borderRadius: radii.button,
    borderWidth: 1,
    flex: 1,
    flexDirection: 'row',
    gap: spacing.tight,
    justifyContent: 'center',
    minHeight: 48,
    paddingHorizontal: spacing.xs,
    paddingVertical: spacing.sm,
  },
  scopeLabel: { flexShrink: 1 },
  scopes: { flexDirection: 'row', gap: spacing.xs },
  section: { gap: spacing.sm },
  sectionHeading: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm },
  statusRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
  },
  textAction: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    flexDirection: 'row',
    gap: spacing.xxs,
    minHeight: minimumTouchTarget,
    paddingHorizontal: spacing.xxs,
  },
});
