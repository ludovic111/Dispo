import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { router } from 'expo-router';
import type { Href } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Linking, Platform, Pressable, StyleSheet, View } from 'react-native';

import {
  IconBadge,
  SelectionDot,
  SettingsDivider,
  SettingsRow,
  SettingsSection,
  SettingsShell,
  SheetHeader,
} from './settings-components';
import {
  appearanceOptions,
  locationOptions,
  notificationStatusLabel,
  normalizeMarketingVersion,
  privacyPage,
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
import { loadNotificationsEnabled } from './settings-storage';

import { AppText } from '@/components/ui/app-text';
import { useAuth } from '@/features/auth/auth-context';
import { linkAppleIdentity } from '@/features/auth/auth-service';
import { languageOptions } from '@/features/onboarding/onboarding-model';
import i18n, { setAppLanguage, type SupportedLocale } from '@/i18n';
import { useDispoTheme } from '@/theme/theme-context';
import { radii, spacing } from '@/theme/tokens';

const validLocationPrecisions = new Set<LocationPrecision>([
  'city',
  'exact_everyone',
  'exact_friends',
  'hidden',
]);

export function SettingsScreen() {
  const { session } = useAuth();
  const { palette, preference: appearance, setPreference } = useDispoTheme();
  const { t } = useTranslation();
  const [profile, setProfile] = useState<SettingsProfile | null>(null);
  const [languageExpanded, setLanguageExpanded] = useState(false);
  const [locationSaving, setLocationSaving] = useState<LocationPrecision | null>(null);
  const [linkingApple, setLinkingApple] = useState(false);
  const [appleLinkCompleted, setAppleLinkCompleted] = useState(false);
  const [notificationLabel, setNotificationLabel] = useState(t('À configurer'));
  const [errorText, setErrorText] = useState<string | null>(null);
  const version = normalizeMarketingVersion(Constants.expoConfig?.version ?? '2.4');
  const appleLinked =
    appleLinkCompleted ||
    session?.user.identities?.some((identity) => identity.provider === 'apple');
  const selectedLocation = validLocationPrecisions.has(
    profile?.location_precision as LocationPrecision,
  )
    ? (profile?.location_precision as LocationPrecision)
    : 'city';

  useEffect(() => {
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
  }, [session, t]);

  const selectAppearance = (value: AppearancePreference) => {
    setPreference(value);
  };

  const selectLanguage = (locale: SupportedLocale) => {
    void setAppLanguage(locale);
    setLanguageExpanded(false);
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
    <SettingsShell>
      <SheetHeader onClose={() => router.back()} title={t('Réglages')} />

      {errorText ? (
        <View
          style={[
            styles.errorBanner,
            { backgroundColor: `${palette.signal}18`, borderColor: `${palette.signal}55` },
          ]}
        >
          <Ionicons color={palette.signal} name="warning" size={17} />
          <AppText color={palette.signal} style={styles.errorCopy} variant="caption">
            {errorText}
          </AppText>
        </View>
      ) : null}

      <SettingsSection title={t('Compte')}>
        <SettingsRow
          color={session ? palette.jam : palette.bronze}
          icon={session ? 'person-circle' : 'person-add'}
          onPress={() => router.push('/account' as Href)}
          title={session ? t('Mon compte') : t('Se connecter')}
          {...(session?.user.email ? { detail: session.user.email } : {})}
        />
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
                    <AppText color={palette.jam} style={styles.linkedText} variant="caption">
                      {t('Lié')}
                    </AppText>
                  </View>
                ) : (
                  <View style={styles.linkedStatus}>
                    <AppText color={palette.text} style={styles.linkedText} variant="caption">
                      {t('Lier')}
                    </AppText>
                    <Ionicons color={palette.muted} name="chevron-forward" size={16} />
                  </View>
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
          right={
            <View style={styles.rowRight}>
              <AppText color={palette.muted} variant="caption">
                {notificationLabel}
              </AppText>
              <Ionicons color={palette.muted} name="chevron-forward" size={16} />
            </View>
          }
          title={t('Notifications')}
        />
      </SettingsSection>

      <SettingsSection title={t('Préférences')}>
        <View style={styles.appearanceRow}>
          <IconBadge
            color={palette.electric}
            icon={
              appearanceOptions.find((option) => option.value === appearance)?.icon ??
              'contrast-outline'
            }
          />
          <View style={styles.appearanceCopy}>
            <AppText style={styles.preferenceTitle}>{t('Apparence')}</AppText>
            <View style={styles.appearanceOptions}>
              {appearanceOptions.map((option) => {
                const active = appearance === option.value;
                return (
                  <Pressable
                    key={option.value}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                    onPress={() => selectAppearance(option.value)}
                    style={({ pressed }) => [
                      styles.appearancePill,
                      {
                        backgroundColor: active ? `${palette.electric}22` : palette.inset,
                        borderColor: active ? `${palette.electric}77` : 'transparent',
                      },
                      pressed && styles.pressed,
                    ]}
                  >
                    <AppText style={styles.appearanceLabel} variant="caption">
                      {t(option.label)}
                    </AppText>
                  </Pressable>
                );
              })}
            </View>
          </View>
        </View>
        <SettingsDivider />
        <SettingsRow
          color={palette.bronze}
          detail={`${languageOptions.find((language) => language.locale === i18n.resolvedLanguage)?.flag ?? '🌍'} ${profile?.city ?? ''}`.trim()}
          icon="globe-outline"
          onPress={() => setLanguageExpanded((value) => !value)}
          right={
            <Ionicons
              color={palette.muted}
              name={languageExpanded ? 'chevron-up' : 'chevron-down'}
              size={16}
            />
          }
          title={t('Langue & région')}
        />
        {languageExpanded ? (
          <View style={[styles.languageGrid, { borderTopColor: palette.border }]}>
            {languageOptions.map((language) => (
              <Pressable
                key={language.locale}
                onPress={() => selectLanguage(language.locale)}
                style={({ pressed }) => [styles.languageChoice, pressed && styles.pressed]}
              >
                <AppText style={styles.flag}>{language.flag}</AppText>
                <AppText style={styles.languageLabel} variant="caption">
                  {language.nativeName}
                </AppText>
                <SelectionDot
                  active={i18n.resolvedLanguage === language.locale}
                  color={palette.electric}
                />
              </Pressable>
            ))}
          </View>
        ) : null}
      </SettingsSection>

      <SettingsSection
        footer={t(
          "Ta position est relevée quand tu ouvres l'app, jamais en arrière-plan. En approximatif, les autres te situent à ~5 km près — assez pour te trouver dans les recherches, sans révéler ton adresse. En masqué, aucune coordonnée n'est publiée : ton profil reste trouvable par nom, instrument et style.",
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

      <SettingsSection title={t('Projet Premium')}>
        <SettingsRow
          color={palette.electric}
          detail={t(
            "Work in progress : le modèle économique n'est pas décidé. Toutes les fonctionnalités sont ouvertes gratuitement aux bêta-testeurs.",
          )}
          icon="construct"
          onPress={() => router.push('/premium' as Href)}
          right={<Ionicons color={palette.muted} name="chevron-forward" size={16} />}
          title={t('Premium — en réflexion')}
        />
      </SettingsSection>

      <SettingsSection title={t('Aide & infos')}>
        <SettingsRow
          color={palette.electric}
          icon="play-circle"
          onPress={() => router.push('/welcome' as Href)}
          right={<Ionicons color={palette.muted} name="chevron-forward" size={16} />}
          title={t("Revoir l'onboarding")}
        />
        <SettingsDivider />
        <SettingsRow
          color={palette.electric}
          detail="ludovic@dispoapp.net"
          icon="mail"
          onPress={() => void Linking.openURL('mailto:ludovic@dispoapp.net')}
          right={<Ionicons color={palette.muted} name="open-outline" size={16} />}
          title={t('Contacter le support')}
        />
        <SettingsDivider />
        <SettingsRow
          color={palette.bronze}
          icon="help-circle"
          onPress={() => void Linking.openURL(supportPage(i18n.resolvedLanguage ?? 'fr'))}
          right={<Ionicons color={palette.muted} name="open-outline" size={16} />}
          title={t("Centre d'aide")}
        />
        <SettingsDivider />
        <SettingsRow
          color={palette.bronze}
          icon="hand-left"
          onPress={() => void Linking.openURL(privacyPage(i18n.resolvedLanguage ?? 'fr'))}
          right={<Ionicons color={palette.muted} name="open-outline" size={16} />}
          title={t('Confidentialité')}
        />
        <SettingsDivider />
        <SettingsRow
          color={palette.bronze}
          icon="sparkles"
          onPress={() => router.push('/patch-notes' as Href)}
          right={
            <View style={styles.rowRight}>
              <AppText color={palette.muted} variant="caption">
                v{version}
              </AppText>
              <Ionicons color={palette.muted} name="chevron-forward" size={16} />
            </View>
          }
          title={t('Nouveautés')}
        />
      </SettingsSection>

      <AppText color={palette.muted} style={styles.footerText} variant="caption">
        Dispo v{version} · dispoapp.net
      </AppText>
    </SettingsShell>
  );
}

const styles = StyleSheet.create({
  appearanceCopy: { flex: 1, gap: spacing.xs },
  appearanceLabel: { fontSize: 10, fontWeight: '800' },
  appearanceOptions: { flexDirection: 'row', gap: 6 },
  appearancePill: {
    alignItems: 'center',
    borderRadius: radii.round,
    borderWidth: 1,
    minHeight: 30,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  appearanceRow: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: 12,
    minHeight: 70,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  errorBanner: {
    alignItems: 'center',
    borderRadius: radii.ticket,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.sm,
    padding: spacing.sm,
  },
  errorCopy: { flex: 1 },
  flag: { fontSize: 18 },
  footerText: { paddingBottom: spacing.sm, textAlign: 'center' },
  languageChoice: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
    minHeight: 42,
    width: '48%',
  },
  languageGrid: {
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: spacing.sm,
  },
  languageLabel: { flex: 1, fontWeight: '700' },
  linkedStatus: { alignItems: 'center', flexDirection: 'row', gap: 5 },
  linkedText: { fontWeight: '800' },
  preferenceTitle: { fontSize: 15, fontWeight: '600' },
  pressed: { opacity: 0.72 },
  rowRight: { alignItems: 'center', flexDirection: 'row', gap: 7 },
});
