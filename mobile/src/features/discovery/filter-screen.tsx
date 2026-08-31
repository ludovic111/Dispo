import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import Slider from '@react-native-community/slider';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Platform, Pressable, ScrollView, StyleSheet, Switch, View } from 'react-native';

import { useDiscoveryState } from './discovery-context';

import { AppText } from '@/components/ui/app-text';
import { Card } from '@/components/ui/card';
import { ChoiceChip } from '@/components/ui/choice-chip';
import { DispoButton } from '@/components/ui/pressable';
import { Screen, ScreenHeader } from '@/components/ui/screen';
import { HeaderAction, SectionHeader } from '@/components/ui/section';
import { useAuth } from '@/features/auth/auth-context';
import { PostalPlaceField, type PostalPlaceDraft } from '@/features/location';
import {
  countryOptions,
  instrumentCategories,
  levelOptions,
} from '@/features/onboarding/onboarding-model';
import { useDiscoveryProfiles } from '@/features/profiles/profile-queries';
import { useDispoTheme } from '@/theme/theme-context';
import { radii, spacing } from '@/theme/tokens';

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
      <AppText style={styles.switchLabel}>{label}</AppText>
      <Switch
        ios_backgroundColor={palette.inset}
        onValueChange={onValueChange}
        thumbColor={Platform.OS === 'android' ? palette.text : undefined}
        trackColor={{ false: palette.inset, true: palette.electric }}
        value={value}
      />
    </View>
  );
}

export function FilterScreen() {
  const { filters, resetFilters, setFilters } = useDiscoveryState();
  const { session } = useAuth();
  const { palette } = useDispoTheme();
  const { i18n, t } = useTranslation();
  const profilesQuery = useDiscoveryProfiles(session?.user.id ?? '');
  const profiles = useMemo(
    () => profilesQuery.data?.pages.flatMap((page) => page.items) ?? [],
    [profilesQuery.data?.pages],
  );
  const genres = useMemo(
    () =>
      [...new Set(profiles.flatMap((profile) => profile.genres))].sort((a, b) =>
        a.localeCompare(b, 'fr'),
      ),
    [profiles],
  );
  const [showDatePicker, setShowDatePicker] = useState(Platform.OS === 'ios');
  const [placeDraft, setPlaceDraft] = useState<PostalPlaceDraft>({
    city: filters.place,
    countryCode: 'CH',
    postalCode: '',
  });
  const date = filters.neededDate ? new Date(`${filters.neededDate}T12:00:00`) : new Date();
  const close = <HeaderAction icon="close" label={t('Fermer')} onPress={() => router.back()} />;
  const updatePlace = (place: PostalPlaceDraft) => {
    setPlaceDraft(place);
    setFilters({
      ...filters,
      place: [place.postalCode, place.city, place.countryCode].filter(Boolean).join(' '),
    });
  };

  return (
    <Screen>
      <ScreenHeader action={close} title={t('Filtres')} />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.section}>
          <SectionHeader
            subtitle={filters.instruments.length ? `${filters.instruments.length}` : t('Tous')}
            title={t('Instruments')}
          />
          {instrumentCategories.map((category) => (
            <Card key={category.label} style={styles.card}>
              <View style={styles.categoryTitle}>
                <Ionicons color={palette.bronze} name={category.icon} size={16} />
                <AppText style={styles.categoryLabel} variant="subheadline">
                  {t(category.label)}
                </AppText>
              </View>
              <View style={styles.choices}>
                {category.instruments.map((instrument) => (
                  <ChoiceChip
                    key={instrument}
                    label={t(instrument)}
                    onPress={() =>
                      setFilters({
                        ...filters,
                        instruments: toggle(filters.instruments, instrument),
                      })
                    }
                    selected={filters.instruments.includes(instrument)}
                  />
                ))}
              </View>
            </Card>
          ))}
        </View>

        <View style={styles.section}>
          <SectionHeader
            subtitle={filters.genres.length ? `${filters.genres.length}` : t('Tous')}
            title={t('Styles')}
          />
          <Card>
            {genres.length > 0 ? (
              <View style={styles.choices}>
                {genres.map((genre) => (
                  <ChoiceChip
                    key={genre}
                    label={t(genre)}
                    onPress={() =>
                      setFilters({ ...filters, genres: toggle(filters.genres, genre) })
                    }
                    selected={filters.genres.includes(genre)}
                  />
                ))}
              </View>
            ) : (
              <AppText color={palette.muted} variant="caption">
                {t('Les styles apparaissent avec les profils du réseau.')}
              </AppText>
            )}
          </Card>
        </View>

        <View style={styles.section}>
          <SectionHeader title={t('Disponibilité')} />
          <Card style={styles.card}>
            <FilterSwitch
              label={t('Dispo à une date précise')}
              onValueChange={(enabled) => {
                setFilters({ ...filters, neededDate: enabled ? inputDate(new Date()) : null });
                setShowDatePicker(enabled && Platform.OS === 'android');
              }}
              value={Boolean(filters.neededDate)}
            />
            {filters.neededDate ? (
              Platform.OS === 'ios' || showDatePicker ? (
                <DateTimePicker
                  display={Platform.OS === 'ios' ? 'inline' : 'default'}
                  minimumDate={new Date()}
                  mode="date"
                  onChange={(_event, value) => {
                    if (Platform.OS === 'android') setShowDatePicker(false);
                    if (value) setFilters({ ...filters, neededDate: inputDate(value) });
                  }}
                  value={date}
                />
              ) : (
                <Pressable
                  accessibilityRole="button"
                  onPress={() => setShowDatePicker(true)}
                  style={[styles.dateButton, { backgroundColor: palette.inset }]}
                >
                  <Ionicons color={palette.electric} name="calendar" size={17} />
                  <AppText>
                    {new Intl.DateTimeFormat(i18n.resolvedLanguage ?? i18n.language ?? 'fr', {
                      dateStyle: 'long',
                    }).format(date)}
                  </AppText>
                </Pressable>
              )
            ) : null}
          </Card>
        </View>

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
            <View style={styles.radiusHeader}>
              <AppText>{t('Rayon')}</AppText>
              <AppText color={palette.electric} style={styles.radiusValue} variant="subheadline">
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
                  label={t(level === 'Professionnel' ? 'Pro' : level)}
                  onPress={() => setFilters({ ...filters, levels: toggle(filters.levels, level) })}
                  selected={filters.levels.includes(level)}
                />
              ))}
            </View>
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
            </View>
          </Card>
        </View>

        <DispoButton onPress={() => router.back()}>{t('Voir les résultats')}</DispoButton>
        <DispoButton
          onPress={() => {
            setPlaceDraft({ city: '', countryCode: 'CH', postalCode: '' });
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
  categoryLabel: { fontWeight: '800' },
  categoryTitle: { alignItems: 'center', flexDirection: 'row', gap: spacing.xs },
  choices: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  content: { gap: spacing.lg, paddingBottom: spacing.xxl, paddingHorizontal: spacing.gutter },
  countryChoices: { flexDirection: 'row', gap: spacing.xs },
  dateButton: {
    alignItems: 'center',
    borderRadius: radii.button,
    flexDirection: 'row',
    gap: spacing.xs,
    minHeight: 48,
    paddingHorizontal: spacing.sm,
  },
  divider: { height: StyleSheet.hairlineWidth },
  radiusHeader: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  radiusValue: { fontWeight: '800' },
  section: { gap: spacing.sm },
  sliderLabels: { flexDirection: 'row', justifyContent: 'space-between' },
  switchLabel: { flex: 1 },
  switchPad: { paddingHorizontal: spacing.md },
  switchRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
    justifyContent: 'space-between',
    minHeight: 54,
  },
});
