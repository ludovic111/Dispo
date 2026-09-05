import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui/app-text';
import { Card } from '@/components/ui/card';
import { ChoiceChip } from '@/components/ui/choice-chip';
import { DispoButton } from '@/components/ui/pressable';
import { useSchoolDirectory } from '@/features/schools/school-queries';
import { getSupabaseClient } from '@/services/supabase/client';
import { useDispoTheme } from '@/theme/theme-context';
import { spacing } from '@/theme/tokens';

export function GigSchoolCriteria({ ids }: { ids: string[] }) {
  const { t } = useTranslation();
  const { palette } = useDispoTheme();
  const schools = useQuery({
    queryKey: ['schools', 'gig-criteria', [...ids].sort()],
    enabled: ids.length > 0,
    queryFn: async ({ signal }) => {
      const result = await getSupabaseClient()
        .from('music_schools')
        .select('id,name')
        .in('id', ids)
        .abortSignal(signal);
      if (result.error) throw result.error;
      return result.data;
    },
  });
  if (!ids.length) return null;
  return (
    <View style={styles.card}>
      <AppText color={palette.bronze} variant="label">
        {t('Écoles de musique recherchées')}
      </AppText>
      {schools.data ? (
        <AppText color={palette.muted}>
          {schools.data.map((school) => school.name).join(' · ')}
        </AppText>
      ) : schools.isError ? (
        <DispoButton variant="secondary" onPress={() => void schools.refetch()}>
          {t('Réessayer')}
        </DispoButton>
      ) : (
        <AppText color={palette.muted}>{t('Chargement des écoles…')}</AppText>
      )}
    </View>
  );
}

export function GigSchoolField({
  selected,
  onChange,
}: {
  selected: string[];
  onChange: (ids: string[]) => void;
}) {
  const schools = useSchoolDirectory();
  const { t } = useTranslation();
  const { palette } = useDispoTheme();
  return (
    <Card style={styles.card}>
      <AppText color={palette.bronze} variant="label">
        {t('Écoles de musique recherchées')}
      </AppText>
      <AppText color={palette.muted} variant="caption">
        {t('Sans sélection : toutes les écoles. Plusieurs écoles : membres de l’une ou l’autre.')}
      </AppText>
      {schools.isLoading ? (
        <AppText>{t('Chargement des écoles…')}</AppText>
      ) : schools.isError ? (
        <DispoButton variant="secondary" onPress={() => void schools.refetch()}>
          {t('Réessayer')}
        </DispoButton>
      ) : (
        <View style={styles.choices}>
          {(schools.data?.pages.flatMap((page) => page.items) ?? []).map((school) => (
            <ChoiceChip
              key={school.id}
              label={school.name}
              selected={selected.includes(school.id)}
              onPress={() =>
                onChange(
                  selected.includes(school.id)
                    ? selected.filter((id) => id !== school.id)
                    : [...selected, school.id],
                )
              }
            />
          ))}
        </View>
      )}
      {selected.length ? (
        <DispoButton variant="secondary" onPress={() => onChange([])}>
          {t('Effacer les écoles')}
        </DispoButton>
      ) : null}
      {schools.hasNextPage ? (
        <DispoButton
          variant="secondary"
          loading={schools.isFetchingNextPage}
          onPress={() => void schools.fetchNextPage()}
        >
          {t('Voir plus')}
        </DispoButton>
      ) : null}
    </Card>
  );
}
const styles = StyleSheet.create({
  card: { gap: spacing.sm },
  choices: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
});
