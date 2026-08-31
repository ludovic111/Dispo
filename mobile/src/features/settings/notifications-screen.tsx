import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Linking, Platform, StyleSheet, View } from 'react-native';

import { SettingsDivider, SettingsShell, SettingsSwitchRow } from './settings-components';
import {
  notificationStatusLabel,
  permissionAllowsDelivery,
  setPushCategory,
  type PushCategory,
  type PushPreferences,
} from './settings-model';
import {
  disableLocalNotifications,
  getNotificationPermission,
  registerPushDevice,
  requestNotificationPermission,
  sendTestNotification,
  unregisterPushDevice,
  type NotificationPermission,
} from './settings-service';
import {
  clearPushToken,
  loadNotificationsEnabled,
  loadPushPreferences,
  loadPushToken,
  saveNotificationsEnabled,
  savePushPreferences,
  savePushToken,
} from './settings-storage';

import { AppText } from '@/components/ui/app-text';
import { Card } from '@/components/ui/card';
import { DispoButton } from '@/components/ui/pressable';
import { useAuth } from '@/features/auth/auth-context';
import i18n from '@/i18n';
import { useDispoTheme } from '@/theme/theme-context';
import { radii, spacing } from '@/theme/tokens';

export function NotificationsScreen() {
  const { session } = useAuth();
  const { palette } = useDispoTheme();
  const { t } = useTranslation();
  const userId = session?.user.id;
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission>('undetermined');
  const [pushToken, setPushToken] = useState<string | null>(null);
  const [preferences, setPreferences] = useState<PushPreferences>({
    groups: true,
    messages: true,
    sos: true,
  });
  const [errorText, setErrorText] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void Promise.all([
      loadNotificationsEnabled(),
      loadPushPreferences(),
      loadPushToken(),
      getNotificationPermission(),
    ])
      .then(async ([savedEnabled, savedPreferences, savedPushToken, currentPermission]) => {
        if (!active) return;
        const deliveryEnabled = savedEnabled && permissionAllowsDelivery(currentPermission);
        setEnabled(deliveryEnabled);
        setPreferences(savedPreferences);
        setPermission(currentPermission);
        setPushToken(savedPushToken);
        if (!deliveryEnabled || !userId) return;
        try {
          const currentToken = await registerPushDevice(
            userId,
            savedPreferences,
            i18n.resolvedLanguage ?? i18n.language ?? 'fr',
          );
          if (!active) return;
          setPushToken(currentToken);
          await savePushToken(currentToken);
          if (savedPushToken && savedPushToken !== currentToken) {
            await unregisterPushDevice(savedPushToken);
          }
        } catch {
          if (active) {
            setErrorText(
              t(
                "Les alertes locales restent actives, mais ce téléphone n'a pas pu être inscrit aux alertes distantes.",
              ),
            );
          }
        }
      })
      .catch(() => {
        if (active) setErrorText(t('Impossible de lire les réglages de notifications.'));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [t, userId]);

  const synchronizePushDevice = async (nextPreferences: PushPreferences) => {
    if (!userId) return;
    const currentToken = await registerPushDevice(
      userId,
      nextPreferences,
      i18n.resolvedLanguage ?? i18n.language ?? 'fr',
    );
    const previousToken = pushToken;
    setPushToken(currentToken);
    await savePushToken(currentToken);
    if (previousToken && previousToken !== currentToken) {
      await unregisterPushDevice(previousToken);
    }
  };

  const toggleMaster = async (nextEnabled: boolean) => {
    if (busy) return;
    setBusy(true);
    setErrorText(null);
    try {
      if (nextEnabled) {
        const nextPermission = await requestNotificationPermission();
        setPermission(nextPermission);
        const allowed = permissionAllowsDelivery(nextPermission);
        setEnabled(allowed);
        await saveNotificationsEnabled(allowed);
        if (!allowed) {
          setErrorText(t('Les notifications restent bloquées dans les réglages du téléphone.'));
        } else {
          await synchronizePushDevice(preferences);
        }
      } else {
        await disableLocalNotifications();
        let remoteRemovalFailed = false;
        if (pushToken) {
          try {
            await unregisterPushDevice(pushToken);
          } catch {
            remoteRemovalFailed = true;
          }
        }
        setPushToken(null);
        await clearPushToken();
        setEnabled(false);
        await saveNotificationsEnabled(false);
        if (remoteRemovalFailed) {
          setErrorText(
            t(
              "Les alertes sont coupées sur ce téléphone, mais l'inscription distante n'a pas pu être supprimée.",
            ),
          );
        }
      }
    } catch {
      setErrorText(t('Impossible de modifier les notifications sur cet appareil.'));
    } finally {
      setBusy(false);
    }
  };

  const toggleCategory = async (category: PushCategory, value: boolean) => {
    const next = setPushCategory(preferences, category, value);
    setPreferences(next);
    setErrorText(null);
    try {
      await savePushPreferences(next);
      if (enabled) await synchronizePushDevice(next);
    } catch {
      setErrorText(
        t("La préférence est gardée sur ce téléphone, mais n'a pas pu être synchronisée."),
      );
    }
  };

  const sendTest = async () => {
    setBusy(true);
    setErrorText(null);
    try {
      await sendTestNotification();
    } catch {
      setErrorText(t("La notification de test n'a pas pu être envoyée."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <SettingsShell nativeHeader>
      <Card padding={spacing.md}>
        <View style={styles.introRow}>
          <Ionicons
            color={palette.electric}
            name="notifications"
            size={27}
            style={styles.introIcon}
          />
          <View style={styles.introCopy}>
            <AppText style={styles.introTitle}>{t('Ne rate plus une occasion de jouer')}</AppText>
            <AppText color={palette.muted} style={styles.introText}>
              {t(
                "Choisis seulement les alertes utiles. Elles arrivent sur ton téléphone, dans la cloche de l'app et dans la puce de l'icône.",
              )}
            </AppText>
          </View>
        </View>
      </Card>

      <Card padding={0}>
        <SettingsSwitchRow
          color={palette.electric}
          detail={t(notificationStatusLabel(permission, enabled))}
          icon="notifications-outline"
          onValueChange={(value) => void toggleMaster(value)}
          title={t('Autoriser les notifications')}
          value={enabled}
        />
        {permission === 'denied' ? (
          <>
            <SettingsDivider />
            <View style={styles.settingsButtonWrap}>
              <DispoButton icon="settings" onPress={() => void Linking.openSettings()}>
                {t(
                  Platform.OS === 'ios' ? 'Ouvrir les réglages iOS' : 'Ouvrir les réglages Android',
                )}
              </DispoButton>
            </View>
          </>
        ) : null}
      </Card>

      {loading || busy ? (
        <View style={styles.loadingRow}>
          <ActivityIndicator color={palette.electric} />
        </View>
      ) : null}

      {enabled ? (
        <Card padding={0}>
          <View style={styles.cardHeading}>
            <AppText style={styles.cardTitle}>{t("M'alerter pour")}</AppText>
          </View>
          <SettingsSwitchRow
            color={palette.signal}
            detail={t('Un concert cherche ton instrument')}
            icon="flash"
            onValueChange={(value) => void toggleCategory('sos', value)}
            title={t('SOS compatibles')}
            value={preferences.sos}
          />
          <SettingsDivider />
          <SettingsSwitchRow
            color={palette.bronze}
            detail={t('Message, photo, vidéo ou nouvelle candidature')}
            icon="chatbubbles"
            onValueChange={(value) => void toggleCategory('messages', value)}
            title={t('Messages et candidatures')}
            value={preferences.messages}
          />
          <SettingsDivider />
          <SettingsSwitchRow
            color={palette.electric}
            detail={t('Message de groupe, concert, répétition ou jam')}
            icon="people"
            onValueChange={(value) => void toggleCategory('groups', value)}
            title={t('Groupes et événements')}
            value={preferences.groups}
          />
          <AppText color={palette.muted} style={styles.cardFootnote} variant="caption">
            {t(
              "Chaque choix contrôle à la fois les bannières, le centre dans l'app et la puce rouge.",
            )}
          </AppText>
        </Card>
      ) : null}

      {enabled ? (
        <Card padding={spacing.md} style={styles.testCard}>
          <AppText style={styles.cardTitle}>{t('Vérifier sur cet appareil')}</AppText>
          <AppText color={palette.muted} variant="caption">
            {t(
              'Le test ci-dessous est local. Les alertes distantes utilisent aussi ton compte Dispo et ce téléphone.',
            )}
          </AppText>
          <DispoButton icon="paper-plane" onPress={() => void sendTest()} variant="secondary">
            {t('Envoyer une notification de test')}
          </DispoButton>
        </Card>
      ) : null}

      {errorText ? (
        <View
          style={[
            styles.error,
            { backgroundColor: `${palette.signal}18`, borderColor: `${palette.signal}55` },
          ]}
        >
          <Ionicons color={palette.signal} name="warning" size={17} />
          <AppText color={palette.signal} style={styles.errorCopy} variant="caption">
            {errorText}
          </AppText>
        </View>
      ) : null}
    </SettingsShell>
  );
}

const styles = StyleSheet.create({
  cardFootnote: { paddingBottom: 14, paddingHorizontal: 14, paddingTop: spacing.xs },
  cardHeading: { paddingHorizontal: 14, paddingTop: 14 },
  cardTitle: { fontSize: 17, fontWeight: '800' },
  error: {
    alignItems: 'center',
    borderRadius: radii.ticket,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.sm,
    padding: spacing.sm,
  },
  errorCopy: { flex: 1 },
  introCopy: { flex: 1, gap: 5 },
  introIcon: { width: 36 },
  introRow: { alignItems: 'flex-start', flexDirection: 'row', gap: 13 },
  introText: { fontSize: 14, lineHeight: 20 },
  introTitle: { fontSize: 17, fontWeight: '800' },
  loadingRow: { alignItems: 'center', minHeight: 24 },
  settingsButtonWrap: { padding: 14 },
  testCard: { gap: spacing.sm },
});
