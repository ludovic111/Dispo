import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui/app-text';
import { Card } from '@/components/ui/card';
import { OptionSelector } from '@/components/ui/option-selector';
import { DispoButton } from '@/components/ui/pressable';
import { SectionHeader } from '@/components/ui/section';
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
        <DispoButton onPress={() => void schools.refetch()} size="compact" variant="secondary">
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
      <SectionHeader
        subtitle={t(
          'Sans sélection : toutes les écoles. Plusieurs écoles : membres de l’une ou l’autre.',
        )}
        title={t('Écoles de musique recherchées')}
      />
      {schools.isLoading ? (
        <AppText color={palette.muted}>{t('Chargement des écoles…')}</AppText>
      ) : schools.isError ? (
        <DispoButton onPress={() => void schools.refetch()} size="compact" variant="secondary">
          {t('Réessayer')}
        </DispoButton>
      ) : (
        <OptionSelector
          label={t('Écoles de musique recherchées')}
          value={selected}
          onChange={onChange}
          sections={[
            {
              label: '',
              options: (schools.data?.pages.flatMap((page) => page.items) ?? []).map((school) => ({
                value: school.id,
                label: school.name,
              })),
            },
          ]}
        />
      )}
      {selected.length ? (
        <DispoButton onPress={() => onChange([])} size="compact" variant="ghost">
          {t('Effacer les écoles')}
        </DispoButton>
      ) : null}
      {schools.hasNextPage ? (
        <DispoButton
          loading={schools.isFetchingNextPage}
          onPress={() => void schools.fetchNextPage()}
          size="compact"
          variant="secondary"
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
