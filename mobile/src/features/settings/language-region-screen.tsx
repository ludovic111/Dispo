import { Ionicons } from '@expo/vector-icons';
import { useQueryClient } from '@tanstack/react-query';
import { router, Stack } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { SelectionDot, SettingsSection, SettingsShell } from './settings-components';
import { fetchSettingsProfile, updateProfileRegion } from './settings-service';

import { AppText } from '@/components/ui/app-text';
import { FormField } from '@/components/ui/form-field';
import { NativeHeaderButton } from '@/components/ui/native-header-button';
import { useAuth } from '@/features/auth/auth-context';
import {
  countryOptions,
  languageOptions,
  type CountryOption,
} from '@/features/onboarding/onboarding-model';
import i18n, { setAppLanguage, type SupportedLocale } from '@/i18n';
import { useDispoTheme } from '@/theme/theme-context';
import { minimumTouchTarget, spacing } from '@/theme/tokens';

export function LanguageRegionScreen() {
  const { session } = useAuth();
  const { palette } = useDispoTheme();
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const userId = session?.user.id ?? '';
  const [city, setCity] = useState('');
  const [country, setCountry] = useState('CH');
  const [postalCode, setPostalCode] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);
  const selectedCountry =
    countryOptions.find((option) => option.code === country) ?? countryOptions[0];

  useEffect(() => {
    let active = true;
    if (!userId) {
      return () => {
        active = false;
      };
    }
    void fetchSettingsProfile(userId)
      .then((profile) => {
        if (!active) return;
        setCity(profile.city ?? '');
        setCountry(profile.country ?? 'CH');
        setPostalCode(profile.postal_code ?? '');
      })
      .catch(() => {
        if (active) setErrorText(t('Certains réglages ne peuvent pas être chargés.'));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [t, userId]);

  const save = async () => {
    if (!userId || saving) return;
    setSaving(true);
    setErrorText(null);
    try {
      await updateProfileRegion(userId, { city, country, postalCode });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['profile'] }),
        queryClient.invalidateQueries({ queryKey: ['profiles'] }),
      ]);
      router.back();
    } catch (error) {
      setErrorText(
        error instanceof Error && error.message === 'profile_region_incomplete'
          ? t('Renseigne un pays, une ville et un code postal valides.')
          : t("Impossible d'enregistrer cette région."),
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Stack.Screen
        options={{
          headerRight: () => (
            <NativeHeaderButton
              disabled={loading || saving}
              label={saving ? t('Enregistrement…') : t('OK')}
              onPress={() => void save()}
            />
          ),
          headerShown: true,
          title: t('Langue & région'),
        }}
      />
      <SettingsShell nativeHeader>
        <SettingsSection title={t('Langue')}>
          {languageOptions.map((language, index) => (
            <LanguageChoice
              key={language.locale}
              active={i18n.resolvedLanguage === language.locale}
              bottomBorder={index < languageOptions.length - 1}
              flag={language.flag}
              label={language.nativeName}
              locale={language.locale}
              onPress={(locale) => void setAppLanguage(locale)}
            />
          ))}
        </SettingsSection>

        <SettingsSection
          footer={t('Le pays, le code postal et la ville servent aux recherches locales.')}
          title={t('Ville / région')}
        >
          {loading ? (
            <ActivityIndicator color={palette.electric} style={styles.loader} />
          ) : (
            <View style={styles.regionFields}>
              <AppText color={palette.bronze} variant="label">
                {t('Pays')}
              </AppText>
              <View style={styles.countryGrid}>
                {countryOptions.map((option) => (
                  <CountryChoice
                    key={option.code}
                    active={selectedCountry?.code === option.code}
                    option={option}
                    onPress={() => setCountry(option.code)}
                  />
                ))}
              </View>
              <View style={styles.placeRow}>
                <FormField
                  autoCapitalize="characters"
                  label={t('Code postal')}
                  onChangeText={setPostalCode}
                  style={styles.postalInput}
                  value={postalCode}
                />
                <View style={styles.cityField}>
                  <FormField label={t('Ville')} onChangeText={setCity} value={city} />
                </View>
              </View>
            </View>
          )}
        </SettingsSection>
        {errorText ? (
          <View style={[styles.error, { backgroundColor: `${palette.signal}18` }]}>
            <Ionicons color={palette.signal} name="warning" size={18} />
            <AppText color={palette.signal} style={styles.errorText} variant="caption">
              {errorText}
            </AppText>
          </View>
        ) : null}
      </SettingsShell>
    </>
  );
}

function LanguageChoice({
  active,
  bottomBorder,
  flag,
  label,
  locale,
  onPress,
}: {
  active: boolean;
  bottomBorder: boolean;
  flag: string;
  label: string;
  locale: SupportedLocale;
  onPress: (locale: SupportedLocale) => void;
}) {
  const { palette } = useDispoTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      onPress={() => onPress(locale)}
      style={({ pressed }) => [
        styles.languageChoice,
        bottomBorder && {
          borderBottomColor: palette.border,
          borderBottomWidth: StyleSheet.hairlineWidth,
        },
        pressed && styles.pressed,
      ]}
    >
      <AppText style={styles.flag}>{flag}</AppText>
      <AppText style={styles.choiceLabel}>{label}</AppText>
      <SelectionDot active={active} color={palette.electric} />
    </Pressable>
  );
}

function CountryChoice({
  active,
  onPress,
  option,
}: {
  active: boolean;
  onPress: () => void;
  option: CountryOption;
}) {
  const { palette } = useDispoTheme();
  const { t } = useTranslation();
  return (
    <Pressable
      accessibilityLabel={`${t(option.label)}, ${option.code}`}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.countryChoice,
        {
          backgroundColor: active ? `${palette.electric}20` : palette.inset,
          borderColor: active ? palette.electric : palette.border,
        },
        pressed && styles.pressed,
      ]}
    >
      <AppText style={styles.flag}>{option.flag}</AppText>
      <AppText numberOfLines={1} style={styles.countryLabel} variant="caption">
        {t(option.label)}
      </AppText>
      {active ? <Ionicons color={palette.electric} name="checkmark-circle" size={17} /> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  choiceLabel: { flex: 1, fontSize: 15, fontWeight: '600' },
  cityField: { flex: 1 },
  countryChoice: {
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1,
    flexBasis: '48%',
    flexDirection: 'row',
    gap: 7,
    minHeight: minimumTouchTarget,
    paddingHorizontal: spacing.sm,
  },
  countryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  countryLabel: { flex: 1, fontWeight: '700' },
  error: { alignItems: 'center', borderRadius: 12, flexDirection: 'row', gap: 8, padding: 12 },
  errorText: { flex: 1 },
  flag: { fontSize: 20 },
  languageChoice: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
    minHeight: 52,
    paddingHorizontal: 14,
  },
  loader: { marginVertical: spacing.lg },
  placeRow: { flexDirection: 'row', gap: spacing.sm },
  postalInput: { minWidth: 108 },
  pressed: { opacity: 0.72 },
  regionFields: { gap: spacing.sm, padding: 14 },
});
