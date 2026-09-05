import { Ionicons } from '@expo/vector-icons';
import type { TFunction } from 'i18next';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import {
  combineGigDate,
  defaultGigDate,
  GIG_GENRE_GROUPS,
  GIG_INSTRUMENT_GROUPS,
  GIG_LEVELS,
  GIG_PAYMENT_METHODS,
  validateGigCreate,
  type FeeMode,
  type GigCreateInput,
  type GigFormDefaults,
} from './gig-model';
import { GigSchoolField } from './gig-school-field';

import { AppText } from '@/components/ui/app-text';
import { Card } from '@/components/ui/card';
import { FormField } from '@/components/ui/form-field';
import {
  mergeNativeDateTimePart,
  NativeDateTimeField,
} from '@/components/ui/native-date-time-field';
import { DispoButton } from '@/components/ui/pressable';
import { shortProfileLevel } from '@/domain/profile';
import { PostalPlaceField, type ResolvedPostalPlace } from '@/features/location';
import { useDispoTheme } from '@/theme/theme-context';
import { radii, spacing } from '@/theme/tokens';

export interface GigFormInitial {
  exactAddress?: string;
  latitude?: number | null;
  longitude?: number | null;
  wantedSchoolIds?: string[];
  date?: string;
  description?: string;
  fee?: number | null;
  genre?: string;
  paymentMethod?: string | null;
  publicPlace?: string;
  title?: string;
  wantedInstruments?: string[];
  wantedLevels?: string[];
}

interface GigFormProps {
  lockEventLocation?: boolean;
  availableDates?: string[];
  defaults: GigFormDefaults;
  errorMessage?: string;
  eventId?: string | null;
  groupId?: string | null;
  hostId: string;
  initial?: GigFormInitial;
  instrumentOptions?: string[];
  loading: boolean;
  mode: 'direct' | 'public';
  onSubmit: (input: GigCreateInput) => void;
  submitLabel: string;
  targetId?: string | null;
  targetName?: string;
}

function inputDate(value?: string): Date {
  if (!value) {
    const fallback = defaultGigDate();
    return new Date(combineGigDate(fallback.day, fallback.time));
  }
  const parsed = new Date(value);
  if (!Number.isNaN(parsed.getTime())) return parsed;
  const fallback = defaultGigDate();
  return new Date(combineGigDate(fallback.day, fallback.time));
}

function localDay(value: Date): string {
  const local = new Date(value.getTime() - value.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}

function errorLabel(code: string, t: TFunction): string {
  const labels: Record<string, string> = {
    gig_date_invalid: 'Choisis une date et une heure futures au format indiqué.',
    gig_exact_address_too_long: "L'adresse exacte est trop longue.",
    gig_fee_invalid: 'Indique un montant entier supérieur à zéro.',
    gig_genre_missing: 'Choisis un style musical.',
    gig_host_missing: 'Reconnecte-toi avant de publier.',
    gig_instrument_missing: 'Choisis au moins un instrument.',
    gig_public_area_incomplete: 'Le pays, le code postal et la ville sont obligatoires.',
    gig_title_missing: 'Ajoute un titre.',
  };
  return t(labels[code] ?? 'Vérifie les informations du SOS.');
}

function ChoiceChip({
  label,
  onPress,
  selected,
}: {
  label: string;
  onPress: () => void;
  selected: boolean;
}) {
  const { palette } = useDispoTheme();
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked: selected }}
      onPress={onPress}
      style={[
        styles.chip,
        {
          backgroundColor: selected ? `${palette.electric}24` : palette.inset,
          borderColor: selected ? palette.electric : palette.border,
        },
      ]}
    >
      {selected ? <Ionicons color={palette.electric} name="checkmark" size={14} /> : null}
      <AppText color={selected ? palette.electric : palette.text} style={styles.chipText}>
        {label}
      </AppText>
    </Pressable>
  );
}

function ChoiceSection({
  label,
  onToggle,
  selected,
  values,
}: {
  label: string;
  onToggle: (value: string) => void;
  selected: string[];
  values: readonly string[];
}) {
  const { palette } = useDispoTheme();
  const { t } = useTranslation();
  return (
    <View style={styles.choiceSection}>
      <AppText color={palette.muted} variant="caption">
        {t(label)}
      </AppText>
      <View style={styles.chips}>
        {values.map((value) => (
          <ChoiceChip
            key={value}
            label={t(value)}
            onPress={() => onToggle(value)}
            selected={selected.includes(value)}
          />
        ))}
      </View>
    </View>
  );
}

export function GigForm({
  availableDates = [],
  lockEventLocation = false,
  defaults,
  errorMessage,
  eventId = null,
  groupId = null,
  hostId,
  initial,
  instrumentOptions,
  loading,
  mode,
  onSubmit,
  submitLabel,
  targetId = null,
  targetName,
}: GigFormProps) {
  const { palette } = useDispoTheme();
  const { i18n, t } = useTranslation();
  const locale = i18n.resolvedLanguage ?? i18n.language ?? 'fr';
  const directDefaultTitle = t('Dépannage');
  const initialDate = inputDate(initial?.date);
  const initialPaymentMethod = initial?.paymentMethod?.trim() ?? '';
  const initialPaymentIsKnown = GIG_PAYMENT_METHODS.some(
    (method) => method.value === initialPaymentMethod,
  );
  const [title, setTitle] = useState(
    initial?.title ?? (mode === 'direct' ? directDefaultTitle : ''),
  );
  const [date, setDate] = useState(initialDate);
  const [genre, setGenre] = useState(initial?.genre ?? defaults.genres[0] ?? 'Jazz');
  const [publicPlace, setPublicPlace] = useState(initial?.publicPlace ?? '');
  const [countryCode, setCountryCode] = useState(defaults.countryCode || 'CH');
  const [postalCode, setPostalCode] = useState(defaults.postalCode);
  const [city, setCity] = useState(defaults.city);
  const [resolvedPlace, setResolvedPlace] = useState<ResolvedPostalPlace | null>(null);
  const [exactAddress, setExactAddress] = useState(initial?.exactAddress ?? '');
  const [wantedSchoolIds, setWantedSchoolIds] = useState(initial?.wantedSchoolIds ?? []);
  const [wantedInstruments, setWantedInstruments] = useState(initial?.wantedInstruments ?? []);
  const [wantedLevels, setWantedLevels] = useState(initial?.wantedLevels ?? []);
  const [feeMode, setFeeMode] = useState<FeeMode>(
    initial?.fee === 0 ? 'none' : initial?.fee ? 'amount' : 'negotiable',
  );
  const [feeAmount, setFeeAmount] = useState(initial?.fee ? String(initial.fee) : '');
  const [paymentMethod, setPaymentMethod] = useState(
    initialPaymentIsKnown ? initialPaymentMethod : '',
  );
  const [customPaymentMethod, setCustomPaymentMethod] = useState(
    initialPaymentIsKnown ? '' : initialPaymentMethod,
  );
  const [usesCustomPaymentMethod, setUsesCustomPaymentMethod] = useState(
    Boolean(initialPaymentMethod && !initialPaymentIsKnown),
  );
  const [description, setDescription] = useState(initial?.description ?? '');
  const [locationChanged, setLocationChanged] = useState(false);
  const [localError, setLocalError] = useState('');

  const directOptions = useMemo(
    () => [...new Set((instrumentOptions ?? []).filter(Boolean))],
    [instrumentOptions],
  );

  const toggleGenre = (value: string) => setGenre(value);
  const toggleInstrument = (value: string) => {
    setWantedInstruments((current) => {
      if (mode === 'direct') return current.includes(value) ? [] : [value];
      return current.includes(value)
        ? current.filter((instrument) => instrument !== value)
        : [...current, value];
    });
  };
  const toggleLevel = (value: string) => {
    setWantedLevels((current) =>
      current.includes(value) ? current.filter((level) => level !== value) : [...current, value],
    );
  };

  const submit = () => {
    try {
      const input: GigCreateInput = {
        city,
        countryCode,
        date: date.toISOString(),
        description,
        exactAddress,
        eventId,
        feeAmount,
        feeMode: defaults.isProfessional ? feeMode : 'negotiable',
        genre,
        groupId,
        hostId,
        latitude: resolvedPlace?.latitude ?? (locationChanged ? null : (initial?.latitude ?? null)),
        longitude:
          resolvedPlace?.longitude ?? (locationChanged ? null : (initial?.longitude ?? null)),
        paymentMethod: defaults.isProfessional
          ? usesCustomPaymentMethod
            ? customPaymentMethod
            : paymentMethod
          : '',
        postalCode,
        publicPlace,
        targetId,
        title:
          mode === 'direct' && title.trim() === directDefaultTitle && wantedInstruments[0]
            ? `${directDefaultTitle} — ${wantedInstruments[0]}`
            : title,
        wantedInstruments,
        wantedLevels: mode === 'direct' ? [] : wantedLevels,
        wantedSchoolIds: mode === 'direct' ? [] : wantedSchoolIds,
      };
      const [error] = validateGigCreate(input).filter(
        (code) => !lockEventLocation || code !== 'gig_public_area_incomplete',
      );
      if (error) {
        setLocalError(errorLabel(error, t));
        return;
      }
      setLocalError('');
      onSubmit(input);
    } catch (error) {
      setLocalError(errorLabel(error instanceof Error ? error.message : 'gig_date_invalid', t));
    }
  };

  const chooseAvailableDate = (value: string) => {
    const picked = new Date(`${value.slice(0, 10)}T12:00:00`);
    setDate((current) => mergeNativeDateTimePart(current, picked, 'date'));
  };
  const selectedGenre = genre ? [genre] : [];
  const feeModes: { label: string; value: FeeMode }[] = [
    { label: t('À discuter'), value: 'negotiable' },
    { label: t('Montant'), value: 'amount' },
    { label: t('Sans cachet'), value: 'none' },
  ];

  return (
    <View style={styles.form}>
      <Card style={styles.section}>
        <AppText color={palette.bronze} variant="label">
          {mode === 'direct'
            ? t('Demande à {{name}}', { name: targetName ?? t('ce musicien') })
            : t('Le concert')}
        </AppText>
        <FormField
          label={t('Titre')}
          onChangeText={setTitle}
          placeholder={t('Cherche pianiste, soirée salsa')}
          value={title}
        />
        {lockEventLocation ? (
          <AppText color={palette.muted}>
            {new Intl.DateTimeFormat(locale, { dateStyle: 'full', timeStyle: 'short' }).format(
              date,
            )}
          </AppText>
        ) : (
          <NativeDateTimeField
            dateLabel={t('Date')}
            minimumDate={new Date()}
            onChange={setDate}
            timeLabel={t('Heure')}
            value={date}
          />
        )}
        {mode === 'direct' && availableDates.length > 0 ? (
          <View style={styles.choiceSection}>
            <AppText color={palette.muted} variant="caption">
              {t('Jours où {{name}} s’est déclaré·e disponible', {
                name: targetName ?? t('la personne'),
              })}
            </AppText>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View style={styles.horizontalChips}>
                {availableDates.slice(0, 6).map((value) => (
                  <ChoiceChip
                    key={value}
                    label={new Intl.DateTimeFormat(locale, {
                      day: 'numeric',
                      month: 'short',
                      weekday: 'short',
                    }).format(new Date(`${value.slice(0, 10)}T12:00:00`))}
                    onPress={() => chooseAvailableDate(value)}
                    selected={localDay(date) === value.slice(0, 10)}
                  />
                ))}
              </View>
            </ScrollView>
          </View>
        ) : null}
      </Card>

      {mode === 'public' ? (
        <Card style={styles.section}>
          <AppText color={palette.bronze} variant="label">
            {t('Genre')}
          </AppText>
          {GIG_GENRE_GROUPS.map((group) => (
            <ChoiceSection
              key={group.label}
              label={group.label}
              onToggle={toggleGenre}
              selected={selectedGenre}
              values={group.values}
            />
          ))}
        </Card>
      ) : null}

      {mode === 'public' ? (
        <GigSchoolField selected={wantedSchoolIds} onChange={setWantedSchoolIds} />
      ) : null}
      {!lockEventLocation ? (
        <>
          <Card style={styles.section}>
            <AppText color={palette.bronze} variant="label">
              {t('Zone visible avant la réponse')}
            </AppText>
            <FormField
              label={t('Quartier, salle ou repère public (facultatif)')}
              onChangeText={setPublicPlace}
              placeholder={t('AMR, Plainpalais…')}
              value={publicPlace}
            />
            <FormField
              autoCapitalize="characters"
              label={t('Pays')}
              maxLength={2}
              onChangeText={(value) => {
                setResolvedPlace(null);
                setLocationChanged(true);
                setCountryCode(value);
              }}
              placeholder="CH"
              value={countryCode}
            />
            <PostalPlaceField
              onChange={(place) => {
                setResolvedPlace(null);
                setLocationChanged(true);
                setCountryCode(place.countryCode);
                setPostalCode(place.postalCode);
                setCity(place.city);
              }}
              onResolved={setResolvedPlace}
              value={{ city, countryCode, postalCode }}
            />
            <AppText color={palette.muted} variant="caption">
              {t('Tout le monde voit uniquement cette zone générale.')}
            </AppText>
          </Card>

          <Card style={styles.section}>
            <View style={styles.privateTitle}>
              <Ionicons color={palette.jam} name="lock-closed" size={17} />
              <AppText color={palette.bronze} variant="label">
                {t('Rendez-vous privé')}
              </AppText>
            </View>
            <FormField
              label={t('Rue, numéro, entrée, étage… (facultatif)')}
              multiline
              numberOfLines={3}
              onChangeText={setExactAddress}
              placeholder={t('Adresse exacte')}
              style={styles.textareaSmall}
              value={exactAddress}
            />
            <AppText color={palette.jam} variant="caption">
              {mode === 'direct'
                ? t('Révélée seulement si la demande est acceptée.')
                : t('Visible uniquement par toi et les musicien·nes accepté·es.')}
            </AppText>
          </Card>
        </>
      ) : null}
      <Card style={styles.section}>
        <AppText color={palette.bronze} variant="label">
          {mode === 'direct' ? t('Instrument recherché') : t('Musicien·nes recherché·es')}
        </AppText>
        {mode === 'direct' ? (
          <ChoiceSection
            label={t('Choisis un instrument joué par la personne')}
            onToggle={toggleInstrument}
            selected={wantedInstruments}
            values={directOptions}
          />
        ) : (
          GIG_INSTRUMENT_GROUPS.map((group) => (
            <ChoiceSection
              key={group.label}
              label={group.label}
              onToggle={toggleInstrument}
              selected={wantedInstruments}
              values={group.values}
            />
          ))
        )}
      </Card>

      {mode === 'public' ? (
        <Card style={styles.section}>
          <AppText color={palette.bronze} variant="label">
            {t('Niveau demandé')}
          </AppText>
          <AppText color={palette.muted} variant="caption">
            {t('Aucun choix signifie « ouvert à tous ».')}
          </AppText>
          <View style={styles.chips}>
            {GIG_LEVELS.map((level) => (
              <ChoiceChip
                key={level}
                label={t(shortProfileLevel(level))}
                onPress={() => toggleLevel(level)}
                selected={wantedLevels.includes(level)}
              />
            ))}
          </View>
        </Card>
      ) : null}

      {defaults.isProfessional ? (
        <Card style={styles.section}>
          <AppText color={palette.bronze} variant="label">
            {t('Cachet (CHF)')}
          </AppText>
          <View style={styles.chips}>
            {feeModes.map((option) => (
              <ChoiceChip
                key={option.value}
                label={option.label}
                onPress={() => setFeeMode(option.value)}
                selected={feeMode === option.value}
              />
            ))}
          </View>
          {feeMode === 'amount' ? (
            <FormField
              keyboardType="number-pad"
              label={t('Montant')}
              onChangeText={setFeeAmount}
              placeholder="150"
              value={feeAmount}
            />
          ) : null}
          {feeMode !== 'none' ? (
            <View style={styles.choiceSection}>
              <AppText color={palette.muted} variant="caption">
                {t('Moyen de versement (facultatif)')}
              </AppText>
              <View style={styles.chips}>
                {GIG_PAYMENT_METHODS.map((method) => (
                  <ChoiceChip
                    key={method.value}
                    label={t(method.label)}
                    onPress={() => {
                      setUsesCustomPaymentMethod(false);
                      setPaymentMethod((current) => (current === method.value ? '' : method.value));
                    }}
                    selected={!usesCustomPaymentMethod && paymentMethod === method.value}
                  />
                ))}
                <ChoiceChip
                  label={t('Autre…')}
                  onPress={() => {
                    setUsesCustomPaymentMethod((current) => !current);
                    setPaymentMethod('');
                  }}
                  selected={usesCustomPaymentMethod}
                />
              </View>
              {usesCustomPaymentMethod ? (
                <FormField
                  label={t('Autre…')}
                  maxLength={40}
                  onChangeText={setCustomPaymentMethod}
                  placeholder={t('Ex. PayPal, Revolut…')}
                  value={customPaymentMethod}
                />
              ) : null}
            </View>
          ) : null}
          <AppText color={palette.muted} variant="caption">
            {t('Le cachet reste discret et n’est affiché qu’aux profils professionnels.')}
          </AppText>
        </Card>
      ) : null}

      <Card style={styles.section}>
        <FormField
          label={mode === 'direct' ? t('Message (facultatif)') : t('Description (facultatif)')}
          multiline
          numberOfLines={4}
          onChangeText={setDescription}
          placeholder={t('Contexte, répertoire, matériel, horaires…')}
          style={styles.textarea}
          value={description}
        />
      </Card>

      {localError || errorMessage ? (
        <AppText color={palette.error}>{localError || errorMessage}</AppText>
      ) : null}
      <DispoButton loading={loading} onPress={submit}>
        {submitLabel}
      </DispoButton>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    alignItems: 'center',
    borderRadius: radii.chip,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 4,
    minHeight: 36,
    paddingHorizontal: 11,
    paddingVertical: 7,
  },
  chipText: { fontSize: 12, fontWeight: '700' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  choiceSection: { gap: spacing.xs },
  form: { gap: spacing.md },
  horizontalChips: { flexDirection: 'row', gap: spacing.xs, paddingVertical: 2 },
  privateTitle: { alignItems: 'center', flexDirection: 'row', gap: spacing.xs },
  section: { gap: spacing.md },
  textarea: { minHeight: 112, textAlignVertical: 'top' },
  textareaSmall: { minHeight: 84, textAlignVertical: 'top' },
});
