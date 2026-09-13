import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { router, useFocusEffect } from 'expo-router';
import type { Href } from 'expo-router';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Linking, Platform, StyleSheet, View } from 'react-native';

import {
  SelectionDot,
  SettingsDivider,
  SettingsErrorBanner,
  SettingsRow,
  SettingsSection,
  SettingsShell,
  SettingsSwitchRow,
  SettingsValueAccessory,
} from './settings-components';
import {
  appearanceOptions,
  locationOptions,
  notificationStatusLabel,
  normalizeMarketingVersion,
  privacyPage,
  termsPage,
  supportPage,
  type AppearancePreference,
  type LocationPrecision,
} from './settings-model';
import {
  fetchSettingsProfile,
  getNotificationPermission,
  updateLocationPrecision,
  type SettingsProfile,
} from './settings-service';
import {
  calendarSyncKey,
  hideAlbumCoversKey,
  loadNotificationsEnabled,
  useBooleanPreference,
} from './settings-storage';

import { AppText } from '@/components/ui/app-text';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { useAuth } from '@/features/auth/auth-context';
import { linkAppleIdentity } from '@/features/auth/auth-service';
import { requestCalendarAccess } from '@/features/calendar/calendar-service';
import { countryOptions, languageOptions } from '@/features/onboarding/onboarding-model';
import i18n from '@/i18n';
import { useDispoTheme } from '@/theme/theme-context';
import { keyStyle, radii, spacing } from '@/theme/tokens';

const validLocationPrecisions = new Set<LocationPrecision>([
  'city',
  'exact_everyone',
  'exact_friends',
  'hidden',
]);

export function SettingsScreen() {
  const { session } = useAuth();
  const { palette, preference: appearance, setPreference, themeId, themes } = useDispoTheme();
  const { t } = useTranslation();
  const [profile, setProfile] = useState<SettingsProfile | null>(null);
  const [locationSaving, setLocationSaving] = useState<LocationPrecision | null>(null);
  const [linkingApple, setLinkingApple] = useState(false);
  const [appleLinkCompleted, setAppleLinkCompleted] = useState(false);
  const [notificationLabel, setNotificationLabel] = useState(t('À configurer'));
  const [errorText, setErrorText] = useState<string | null>(null);
  const [calendarSync, setCalendarSync] = useBooleanPreference(calendarSyncKey);
  const [hideAlbumCovers, setHideAlbumCovers] = useBooleanPreference(hideAlbumCoversKey);
  const version = normalizeMarketingVersion(Constants.expoConfig?.version ?? '2.4');
  const appleLinked =
    appleLinkCompleted ||
    session?.user.identities?.some((identity) => identity.provider === 'apple');
  const selectedLocation = validLocationPrecisions.has(
    profile?.location_precision as LocationPrecision,
  )
    ? (profile?.location_precision as LocationPrecision)
    : 'city';

  useFocusEffect(
    useCallback(() => {
      let active = true;
      void Promise.all([
        loadNotificationsEnabled(),
        getNotificationPermission(),
        session ? fetchSettingsProfile(session.user.id) : Promise.resolve(null),
      ])
        .then(([notificationsEnabled, permission, currentProfile]) => {
          if (!active) return;
          setNotificationLabel(t(notificationStatusLabel(permission, notificationsEnabled)));
          setProfile(currentProfile);
        })
        .catch(() => {
          if (active) setErrorText(t('Certains réglages ne peuvent pas être chargés.'));
        });
      return () => {
        active = false;
      };
    }, [session, t]),
  );

  const selectAppearance = (value: AppearancePreference) => {
    setPreference(value);
  };

  const selectLocation = async (precision: LocationPrecision) => {
    if (!session || locationSaving) return;
    setLocationSaving(precision);
    setErrorText(null);
    try {
      await updateLocationPrecision(session.user.id, precision);
      setProfile((value) => (value ? { ...value, location_precision: precision } : value));
    } catch (error) {
      const denied = error instanceof Error && error.message === 'location_permission_denied';
      setErrorText(
        denied
          ? t('Autorise la position dans les réglages du téléphone pour choisir ce partage.')
          : t("Impossible d'enregistrer ce réglage de position."),
      );
    } finally {
      setLocationSaving(null);
    }
  };

  const toggleCalendarSync = async (enabled: boolean) => {
    setErrorText(null);
    if (!enabled) {
      await setCalendarSync(false);
      return;
    }
    if (!(await requestCalendarAccess())) {
      setErrorText(
        t(
          'Autorise Dispo à écrire dans ton calendrier depuis les réglages du téléphone pour synchroniser tes sessions.',
        ),
      );
      return;
    }
    await setCalendarSync(true);
  };

  const linkApple = async () => {
    if (linkingApple) return;
    setLinkingApple(true);
    setErrorText(null);
    try {
      await linkAppleIdentity();
      setAppleLinkCompleted(true);
    } catch (error) {
      const code =
        typeof error === 'object' && error !== null && 'code' in error ? String(error.code) : '';
      if (code !== 'ERR_REQUEST_CANCELED') {
        setErrorText(t('La liaison avec Apple a échoué — réessaie.'));
      }
    } finally {
      setLinkingApple(false);
    }
  };

  return (
    <SettingsShell nativeHeader>
      <SettingsErrorBanner text={errorText} />

      <SettingsSection title={t('Compte')}>
        <SettingsRow
          color={session ? palette.jam : palette.bronze}
          icon={session ? 'person-circle' : 'person-add'}
          onPress={() => router.push('/account' as Href)}
          title={session ? t('Mon compte') : t('Se connecter')}
          {...(session?.user.email ? { detail: session.user.email } : {})}
        />
        {session ? (
          <>
            <SettingsDivider />
            <SettingsRow
              color={palette.jam}
              detail={t('E-mail et numéro de téléphone')}
              icon="shield-checkmark"
              onPress={() => router.push('/verify' as Href)}
              title={t('Vérification du compte')}
            />
          </>
        ) : null}
        {Platform.OS === 'ios' ? (
          <>
            <SettingsDivider />
            <SettingsRow
              color={palette.text}
              icon="logo-apple"
              {...(!appleLinked ? { onPress: () => void linkApple() } : {})}
              right={
                linkingApple ? (
                  <ActivityIndicator color={palette.text} />
                ) : appleLinked ? (
                  <View style={styles.linkedStatus}>
                    <Ionicons color={palette.jam} name="checkmark-circle" size={17} />
                    <AppText color={palette.jam} variant="footnote" weight="semibold">
                      {t('Lié')}
                    </AppText>
                  </View>
                ) : (
                  <SettingsValueAccessory value={t('Lier')} />
                )
              }
              title={appleLinked ? t('Compte Apple') : t('Lier mon compte Apple')}
            />
          </>
        ) : null}
      </SettingsSection>

      <SettingsSection title={t('Notifications')}>
        <SettingsRow
          color={palette.electric}
          icon="notifications"
          onPress={() => router.push('/notifications' as Href)}
          right={<SettingsValueAccessory value={notificationLabel} />}
          title={t('Notifications')}
        />
      </SettingsSection>

      <SettingsSection title={t('Apparence')}>
        <SettingsRow
          color={palette.electric}
          icon={
            appearanceOptions.find((option) => option.value === appearance)?.icon ??
            'contrast-outline'
          }
          right={<View />}
          title={t('Clair ou sombre')}
        />
        <View style={styles.appearanceControl}>
          <SegmentedControl<AppearancePreference>
            onChange={selectAppearance}
            options={appearanceOptions.map((option) => ({
              label: t(option.label),
              value: option.value,
            }))}
            value={appearance}
          />
        </View>
        <SettingsDivider />
        <SettingsRow
          color={palette.electric}
          detail={t(themes.find((theme) => theme.id === themeId)?.name ?? 'Jazz')}
          icon="color-palette-outline"
          onPress={() => router.push('/settings/theme' as Href)}
          right={<ThemeSwatchAccessory />}
          title={t('Thème de couleurs')}
        />
      </SettingsSection>

      <SettingsSection title={t('Préférences')}>
        <SettingsRow
          color={palette.bronze}
          detail={`${languageOptions.find((language) => language.locale === i18n.resolvedLanguage)?.flag ?? '🌍'} ${countryOptions.find((country) => country.code === profile?.country)?.flag ?? ''} ${profile?.city ?? ''}`.trim()}
          icon="globe-outline"
          onPress={() => router.push('/settings/language-region' as Href)}
          title={t('Langue & région')}
        />
        <SettingsDivider />
        <SettingsSwitchRow
          color={palette.electric}
          detail={t('Tes dates de groupe et tes dépannages dans un calendrier « Dispo ».')}
          icon="calendar"
          onValueChange={(enabled) => void toggleCalendarSync(enabled)}
          title={t('Synchroniser mes sessions avec le calendrier')}
          value={calendarSync}
        />
        <SettingsDivider />
        <SettingsSwitchRow
          color={palette.bronze}
          icon="image-outline"
          onValueChange={(enabled) => void setHideAlbumCovers(enabled)}
          title={t('Masquer les pochettes d’album')}
          value={hideAlbumCovers}
        />
      </SettingsSection>

      <SettingsSection
        footer={t(
          'Ta position est relevée uniquement quand tu touches un mode de partage ci-dessous. Pour l’actualiser, touche à nouveau ce mode. Aucun suivi automatique ni en arrière-plan. Tu peux retirer ta position à tout moment sans masquer ton profil.',
        )}
        title={t('Ma position')}
      >
        {locationOptions.map((option, index) => (
          <View key={option.value}>
            {index > 0 ? <SettingsDivider /> : null}
            <SettingsRow
              color={
                option.value === 'hidden'
                  ? palette.muted
                  : option.value === 'city'
                    ? palette.bronze
                    : palette.electric
              }
              detail={t(option.detail)}
              icon={option.icon}
              onPress={() => void selectLocation(option.value)}
              right={
                locationSaving === option.value ? (
                  <ActivityIndicator color={palette.electric} />
                ) : (
                  <SelectionDot
                    active={selectedLocation === option.value}
                    color={palette.electric}
                  />
                )
              }
              title={t(option.label)}
            />
          </View>
        ))}
      </SettingsSection>

      <SettingsSection title={t('Abonnements')}>
        <SettingsRow
          color={palette.electric}
          detail={t(
            'Un groupe avec Dispo Groupe, jusqu’à 6 groupes et le répertoire personnel avec Premium.',
          )}
          icon="pricetags"
          onPress={() => router.push('/premium' as Href)}
          title={t('Dispo Groupe & Premium')}
        />
      </SettingsSection>

      <SettingsSection title={t('Aide & infos')}>
        <SettingsRow
          color={palette.electric}
          icon="play-circle"
          onPress={() => router.push('/welcome' as Href)}
          title={t("Revoir l'onboarding")}
        />
        <SettingsDivider />
        <SettingsRow
          color={palette.electric}
          detail="ludovic@dispoapp.net"
          icon="mail"
          onPress={() => void Linking.openURL('mailto:ludovic@dispoapp.net')}
          right={<SettingsValueAccessory icon="open-outline" />}
          title={t('Contacter le support')}
        />
        <SettingsDivider />
        <SettingsRow
          color={palette.bronze}
          icon="help-circle"
          onPress={() => void Linking.openURL(supportPage(i18n.resolvedLanguage ?? 'fr'))}
          right={<SettingsValueAccessory icon="open-outline" />}
          title={t("Centre d'aide")}
        />
        <SettingsDivider />
        <SettingsRow
          color={palette.bronze}
          icon="hand-left"
          onPress={() => void Linking.openURL(privacyPage(i18n.resolvedLanguage ?? 'fr'))}
          right={<SettingsValueAccessory icon="open-outline" />}
          title={t('Confidentialité')}
        />
        <SettingsDivider />
        <SettingsRow
          color={palette.bronze}
          icon="document-text"
          onPress={() => void Linking.openURL(termsPage)}
          right={<SettingsValueAccessory icon="open-outline" />}
          title={t('Conditions d’utilisation')}
        />
        <SettingsDivider />
        <SettingsRow
          color={palette.bronze}
          icon="sparkles"
          onPress={() => router.push('/patch-notes' as Href)}
          right={<SettingsValueAccessory value={`v${version}`} />}
          title={t('Nouveautés')}
        />
      </SettingsSection>

      <AppText color={palette.muted} style={styles.footerText} variant="caption">
        Dispo v{version} · dispoapp.net
      </AppText>
    </SettingsShell>
  );
}

/** Petite touche accent du thème courant, devant le chevron de la ligne « Thème ». */
function ThemeSwatchAccessory() {
  const { palette } = useDispoTheme();
  return (
    <View style={styles.swatchAccessory}>
      <View style={[styles.swatch, keyStyle(palette.accent, palette.accentDeep)]} />
      <Ionicons color={palette.muted} name="chevron-forward" size={18} />
    </View>
  );
}

const styles = StyleSheet.create({
  appearanceControl: { paddingBottom: spacing.sm, paddingHorizontal: spacing.sm },
  footerText: { paddingBottom: spacing.sm, textAlign: 'center' },
  linkedStatus: { alignItems: 'center', flexDirection: 'row', gap: spacing.xxs },
  swatch: { borderRadius: radii.xs, height: 22, width: 34 },
  swatchAccessory: { alignItems: 'center', flexDirection: 'row', gap: spacing.xs },
});
