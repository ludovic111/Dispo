import { useQueryClient } from '@tanstack/react-query';
import { router, Stack } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import {
  SelectionDot,
  SettingsDivider,
  SettingsErrorBanner,
  SettingsSection,
  SettingsShell,
} from './settings-components';
import { fetchSettingsProfile, updateProfileRegion } from './settings-service';

import { AppText } from '@/components/ui/app-text';
import { ChoiceChip } from '@/components/ui/choice-chip';
import { FormField } from '@/components/ui/form-field';
import { ListRow } from '@/components/ui/list-row';
import { NativeHeaderButton } from '@/components/ui/native-header-button';
import { LoadingState } from '@/components/ui/screen';
import { SectionHeader } from '@/components/ui/section';
import { useAuth } from '@/features/auth/auth-context';
import { countryOptions, languageOptions } from '@/features/onboarding/onboarding-model';
import i18n, { setAppLanguage } from '@/i18n';
import { useDispoTheme } from '@/theme/theme-context';
import { spacing } from '@/theme/tokens';

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
          {languageOptions.map((language, index) => {
            const active = i18n.resolvedLanguage === language.locale;
            return (
              <View key={language.locale} style={styles.rowInset}>
                {index > 0 ? <SettingsDivider /> : null}
                <ListRow
                  accessory={<SelectionDot active={active} color={palette.electric} />}
                  leading={<AppText variant="body">{language.flag}</AppText>}
                  onPress={() => void setAppLanguage(language.locale)}
                  title={language.nativeName}
                  tone="plain"
                />
              </View>
            );
          })}
        </SettingsSection>

        <SettingsSection
          footer={t('Le pays, le code postal et la ville servent aux recherches locales.')}
          title={t('Ville / région')}
        >
          {loading ? (
            <LoadingState />
          ) : (
            <View style={styles.regionFields}>
              <SectionHeader title={t('Pays')} />
              <View style={styles.countryGrid}>
                {countryOptions.map((option) => (
                  <ChoiceChip
                    key={option.code}
                    label={`${option.flag} ${t(option.label)}`}
                    onPress={() => setCountry(option.code)}
                    selected={selectedCountry?.code === option.code}
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
        <SettingsErrorBanner text={errorText} />
      </SettingsShell>
    </>
  );
}

const styles = StyleSheet.create({
  cityField: { flex: 1 },
  countryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  placeRow: { flexDirection: 'row', gap: spacing.sm },
  postalInput: { minWidth: 108 },
  regionFields: { gap: spacing.sm, padding: spacing.sm },
  rowInset: { paddingHorizontal: spacing.sm },
});
