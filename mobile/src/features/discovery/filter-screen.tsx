import { Ionicons } from '@expo/vector-icons';
import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import Slider from '@react-native-community/slider';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Platform, Pressable, ScrollView, StyleSheet, Switch, View } from 'react-native';

import { useDiscoveryState } from './discovery-context';

import { AppText } from '@/components/ui/app-text';
import { Card } from '@/components/ui/card';
import { ChoiceChip } from '@/components/ui/choice-chip';
import { OptionSelector } from '@/components/ui/option-selector';
import { DispoButton, IconButton } from '@/components/ui/pressable';
import { LoadingState, Screen, ScreenHeader } from '@/components/ui/screen';
import { SectionHeader } from '@/components/ui/section';
import { shortProfileLevel } from '@/domain/profile';
import { GIG_GENRE_GROUPS } from '@/features/gigs/gig-model';
import { PostalPlaceField, type PostalPlaceDraft } from '@/features/location';
import {
  countryOptions,
  instrumentCategories,
  levelOptions,
} from '@/features/onboarding/onboarding-model';
import { useSchoolDirectory } from '@/features/schools/school-queries';
import { useDispoTheme } from '@/theme/theme-context';
import { insetStyle, minimumTouchTarget, pressedStyle, radii, spacing } from '@/theme/tokens';

function toggle(list: readonly string[], value: string): string[] {
  return list.includes(value) ? list.filter((item) => item !== value) : [...list, value];
}

function inputDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function FilterSwitch({
  label,
  onValueChange,
  value,
}: {
  label: string;
  onValueChange: (value: boolean) => void;
  value: boolean;
}) {
  const { palette } = useDispoTheme();
  return (
    <View style={styles.switchRow}>
      <AppText style={styles.flex}>{label}</AppText>
      <Switch
        ios_backgroundColor={palette.inset}
        onValueChange={onValueChange}
        trackColor={{ false: palette.inset, true: palette.electric }}
        value={value}
      />
    </View>
  );
}

function ClearSelectionButton({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <View style={styles.inlineAction}>
      <DispoButton icon="close-circle-outline" onPress={onPress} size="compact" variant="ghost">
        {label}
      </DispoButton>
    </View>
  );
}

/** Sélecteur de jour natif : contrôle compact sur iOS, boîte de dialogue système sur Android. */
function NeededDateField({
  label,
  onChange,
  value,
}: {
  label: string;
  onChange: (value: Date) => void;
  value: Date;
}) {
  const { dark, palette } = useDispoTheme();
  const { i18n } = useTranslation();
  const locale = i18n.resolvedLanguage ?? i18n.language ?? 'fr';
  const today = new Date();
  const minimumDate = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  if (Platform.OS === 'ios') {
    return (
      <View style={[styles.dateField, insetStyle(palette)]}>
        <AppText color={palette.muted} style={styles.flex} variant="label">
          {label}
        </AppText>
        <DateTimePicker
          accentColor={palette.electric}
          display="compact"
          minimumDate={minimumDate}
          mode="date"
          onValueChange={(_event, picked) => onChange(picked)}
          textColor={palette.text}
          themeVariant={dark ? 'dark' : 'light'}
          value={value}
        />
      </View>
    );
  }
  const dateText = new Intl.DateTimeFormat(locale, { dateStyle: 'long' }).format(value);
  return (
    <Pressable
      accessibilityLabel={`${label}: ${dateText}`}
      accessibilityRole="button"
      onPress={() =>
        DateTimePickerAndroid.open({
          display: 'default',
          minimumDate,
          mode: 'date',
          onValueChange: (_event, picked) => onChange(picked),
          value,
        })
      }
      style={({ pressed }) => [styles.dateField, insetStyle(palette), pressed && pressedStyle]}
    >
      <Ionicons color={palette.electric} name="calendar" size={17} />
      <AppText style={styles.flex}>{dateText}</AppText>
    </Pressable>
  );
}

export function FilterScreen() {
  const { filters, resetFilters, scope, setFilters, setScope } = useDiscoveryState();
  const schoolDirectory = useSchoolDirectory();
  const { palette } = useDispoTheme();
  const { t } = useTranslation();
  const schools = schoolDirectory.data?.pages.flatMap((page) => page.items) ?? [];
  const placeDraft: PostalPlaceDraft = {
    city: filters.placeCity,
    countryCode: filters.placeCountry || 'CH',
    postalCode: filters.placePostalCode,
  };
  const date = filters.neededDate ? new Date(`${filters.neededDate}T12:00:00`) : new Date();
  const close = (
    <IconButton accessibilityLabel={t('Fermer')} icon="close" onPress={() => router.back()} />
  );
  const updatePlace = (place: PostalPlaceDraft) => {
    setFilters({
      ...filters,
      placeCity: place.city,
      placeCountry: place.countryCode,
      placePostalCode: place.postalCode,
    });
  };

  return (
    <Screen>
      <ScreenHeader action={close} title={t('Filtres')} />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.section}>
          <SectionHeader title={t('Disponibilité')} />
          <Card style={styles.card}>
            <View style={styles.choices}>
              {(['nearby', 'today', 'weekend', 'thisWeek'] as const).map((period) => (
                <ChoiceChip
                  key={period}
                  label={t(
                    period === 'today'
                      ? "Aujourd'hui"
                      : period === 'weekend'
                        ? 'Ce week-end'
                        : period === 'thisWeek'
                          ? 'Cette semaine'
                          : 'Toutes les dates',
                  )}
                  selected={scope === period && !filters.neededDate}
                  onPress={() => {
                    setScope(period);
                    setFilters({ ...filters, neededDate: null });
                  }}
                />
              ))}
            </View>
            <FilterSwitch
              label={t('Dispo à une date précise')}
              onValueChange={(enabled) => {
                setScope('nearby');
                setFilters({ ...filters, neededDate: enabled ? inputDate(new Date()) : null });
              }}
              value={Boolean(filters.neededDate)}
            />
            {filters.neededDate ? (
              <NeededDateField
                label={t('Dispo à une date précise')}
                onChange={(value) => setFilters({ ...filters, neededDate: inputDate(value) })}
                value={date}
              />
            ) : null}
          </Card>
        </View>

        <View style={styles.section}>
          <SectionHeader
            subtitle={filters.instruments.length ? `${filters.instruments.length}` : t('Tous')}
            title={t('Instruments')}
          />
          {filters.instruments.length > 0 ? (
            <ClearSelectionButton
              label={t('Effacer les instruments')}
              onPress={() => setFilters({ ...filters, instruments: [] })}
            />
          ) : null}
          <OptionSelector
            label={t('Instruments')}
            value={filters.instruments}
            onChange={(instruments) => setFilters({ ...filters, instruments })}
            sections={instrumentCategories.map((category) => ({
              label: t(category.label),
              options: category.instruments.map((value) => ({ value, label: t(value) })),
            }))}
          />
        </View>
        <OptionSelector
          label={t('Styles')}
          value={filters.genres}
          onChange={(genres) => setFilters({ ...filters, genres })}
          sections={GIG_GENRE_GROUPS.map((group) => ({
            label: t(group.label),
            options: group.values.map((value) => ({ value, label: t(value) })),
          }))}
        />

        <View style={styles.section}>
          <SectionHeader title={t('Où')} />
          <Card style={styles.card}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View style={styles.countryChoices}>
                {countryOptions.map((country) => (
                  <ChoiceChip
                    key={country.code}
                    label={`${country.flag} ${t(country.label)}`}
                    onPress={() => updatePlace({ ...placeDraft, countryCode: country.code })}
                    selected={placeDraft.countryCode === country.code}
                  />
                ))}
              </View>
            </ScrollView>
            <PostalPlaceField onChange={updatePlace} value={placeDraft} />
            {filters.placeCity || filters.placePostalCode || filters.placeCountry ? (
              <ClearSelectionButton
                label={t('Chercher partout')}
                onPress={() =>
                  setFilters({
                    ...filters,
                    placeCity: '',
                    placeCountry: '',
                    placePostalCode: '',
                  })
                }
              />
            ) : null}
            <View style={styles.radiusHeader}>
              <AppText>{t('Rayon')}</AppText>
              <AppText color={palette.electric} variant="subheadline" weight="bold">
                {filters.radiusKm} km
              </AppText>
            </View>
            <Slider
              maximumTrackTintColor={palette.inset}
              maximumValue={100}
              minimumTrackTintColor={palette.electric}
              minimumValue={5}
              onSlidingComplete={(radiusKm) => setFilters({ ...filters, radiusKm })}
              step={5}
              thumbTintColor={palette.electric}
              value={filters.radiusKm}
            />
            <View style={styles.sliderLabels}>
              <AppText color={palette.muted} variant="caption2">
                5 km
              </AppText>
              <AppText color={palette.muted} variant="caption2">
                100 km
              </AppText>
            </View>
          </Card>
        </View>

        <View style={styles.section}>
          <SectionHeader
            subtitle={filters.levels.length ? `${filters.levels.length}` : t('Tous')}
            title={t('Niveaux')}
          />
          <Card>
            <View style={styles.choices}>
              {levelOptions.map((level) => (
                <ChoiceChip
                  key={level}
                  label={t(shortProfileLevel(level))}
                  onPress={() => setFilters({ ...filters, levels: toggle(filters.levels, level) })}
                  selected={filters.levels.includes(level)}
                />
              ))}
            </View>
          </Card>
        </View>

        <View style={styles.section}>
          <SectionHeader
            subtitle={filters.schoolIds.length ? `${filters.schoolIds.length}` : t('Toutes')}
            title={t('Écoles de musique')}
          />
          {filters.schoolIds.length > 0 ? (
            <ClearSelectionButton
              label={t('Effacer les écoles')}
              onPress={() => setFilters({ ...filters, schoolIds: [] })}
            />
          ) : null}
          <Card style={styles.card}>
            {schoolDirectory.isLoading ? (
              <LoadingState label={t('Chargement des écoles…')} />
            ) : schoolDirectory.isError ? (
              <View style={styles.schoolError}>
                <AppText color={palette.error} style={styles.flex} variant="caption">
                  {t("L'annuaire des écoles n'a pas pu être chargé.")}
                </AppText>
                <DispoButton
                  onPress={() => void schoolDirectory.refetch()}
                  size="compact"
                  variant="ghost"
                >
                  {t('Réessayer')}
                </DispoButton>
              </View>
            ) : schools.length > 0 ? (
              <>
                <OptionSelector
                  label={t('Écoles de musique')}
                  value={filters.schoolIds}
                  onChange={(schoolIds) => setFilters({ ...filters, schoolIds })}
                  sections={[
                    {
                      label: '',
                      options: schools.map((school) => ({ value: school.id, label: school.name })),
                    },
                  ]}
                />
                {schoolDirectory.hasNextPage ? (
                  <DispoButton
                    loading={schoolDirectory.isFetchingNextPage}
                    onPress={() => void schoolDirectory.fetchNextPage()}
                    variant="secondary"
                  >
                    {t('Charger plus')}
                  </DispoButton>
                ) : null}
              </>
            ) : (
              <AppText color={palette.muted} variant="caption">
                {t("Aucune école active dans l'annuaire.")}
              </AppText>
            )}
          </Card>
        </View>

        <View style={styles.section}>
          <SectionHeader title={t('Relations')} />
          <Card padding={0}>
            <View style={styles.switchPad}>
              <FilterSwitch
                label={t('Ami')}
                onValueChange={(friendsOnly) => setFilters({ ...filters, friendsOnly })}
                value={filters.friendsOnly}
              />
              <View style={[styles.divider, { backgroundColor: palette.border }]} />
              <FilterSwitch
                label={t('A joué avec un ami')}
                onValueChange={(playedWithFriend) => setFilters({ ...filters, playedWithFriend })}
                value={filters.playedWithFriend}
              />
              <View style={[styles.divider, { backgroundColor: palette.border }]} />
              <FilterSwitch
                label={t('Même école')}
                onValueChange={(sameSchoolOnly) => setFilters({ ...filters, sameSchoolOnly })}
                value={filters.sameSchoolOnly}
              />
              <View style={[styles.divider, { backgroundColor: palette.border }]} />
              <FilterSwitch
                label={t('Morceaux en commun')}
                onValueChange={(commonRepertoire) => setFilters({ ...filters, commonRepertoire })}
                value={filters.commonRepertoire}
              />
            </View>
          </Card>
        </View>

        <Card style={styles.card}>
          <SectionHeader title={t('Match minimum')} subtitle={`${filters.minimumMatchPercent} %`} />
          <Slider
            accessibilityLabel={t('Match minimum')}
            minimumValue={0}
            maximumValue={100}
            step={5}
            value={filters.minimumMatchPercent}
            onValueChange={(minimumMatchPercent) => setFilters({ ...filters, minimumMatchPercent })}
            minimumTrackTintColor={palette.electric}
            maximumTrackTintColor={palette.inset}
            thumbTintColor={palette.electric}
          />
        </Card>
        <DispoButton onPress={() => router.back()}>{t('Voir les résultats')}</DispoButton>
        <DispoButton
          onPress={() => {
            resetFilters();
          }}
          variant="danger"
        >
          {t('Réinitialiser les filtres')}
        </DispoButton>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing.sm },
  choices: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  content: { gap: spacing.lg, paddingBottom: spacing.xxl, paddingHorizontal: spacing.gutter },
  countryChoices: { flexDirection: 'row', gap: spacing.xs },
  dateField: {
    alignItems: 'center',
    borderRadius: radii.input,
    flexDirection: 'row',
    gap: spacing.xs,
    minHeight: minimumTouchTarget + spacing.xxs,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xxs,
  },
  divider: { height: StyleSheet.hairlineWidth },
  flex: { flex: 1 },
  inlineAction: { alignSelf: 'flex-start' },
  radiusHeader: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  schoolError: { alignItems: 'center', flexDirection: 'row', gap: spacing.xs },
  section: { gap: spacing.sm },
  sliderLabels: { flexDirection: 'row', justifyContent: 'space-between' },
  switchPad: { paddingHorizontal: spacing.md },
  switchRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
    justifyContent: 'space-between',
    minHeight: minimumTouchTarget + spacing.xs,
  },
});
