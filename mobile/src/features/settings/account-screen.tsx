import { Ionicons } from '@expo/vector-icons';
import { router, type Href } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Linking, StyleSheet, View } from 'react-native';

import { disconnectWithBestEffortPushCleanup } from './account-session';
import {
  RaisedIconWell,
  SettingsDivider,
  SettingsErrorBanner,
  SettingsRow,
  SettingsSection,
  SettingsShell,
  SettingsValueAccessory,
} from './settings-components';
import { deleteCurrentAccount, unregisterPushDevice } from './settings-service';
import { clearPushToken, loadPushToken } from './settings-storage';

import { AppText } from '@/components/ui/app-text';
import { Card } from '@/components/ui/card';
import { DispoButton } from '@/components/ui/pressable';
import { useAccountStatus } from '@/features/auth/account-status';
import { useAuth } from '@/features/auth/auth-context';
import { signOut } from '@/features/auth/auth-service';
import { useDispoTheme } from '@/theme/theme-context';
import { radii, spacing } from '@/theme/tokens';

export function AccountScreen() {
  const { session } = useAuth();
  const { palette } = useDispoTheme();
  const { t } = useTranslation();
  const [deleting, setDeleting] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);
  const accountStatus = useAccountStatus();

  const disconnect = async () => {
    setErrorText(null);
    try {
      await disconnectWithBestEffortPushCleanup({
        clearPushToken,
        loadPushToken,
        signOut,
        unregisterPushDevice,
      });
      router.replace('/(auth)/sign-in');
    } catch {
      setErrorText(t('Déconnexion impossible — vérifie le réseau.'));
    }
  };

  const confirmDeletion = () => {
    Alert.alert(
      t('Supprimer définitivement le compte ?'),
      t(
        'Le profil, les messages, les SOS et les relations seront supprimés. Cette action est irréversible.',
      ),
      [
        { text: t('Annuler'), style: 'cancel' },
        {
          text: t('Supprimer mon compte'),
          style: 'destructive',
          onPress: () => {
            setDeleting(true);
            setErrorText(null);
            void deleteCurrentAccount()
              .then(async () => {
                await clearPushToken();
                try {
                  await signOut();
                } catch {
                  // L'identité n'existe déjà plus : le retour au portail reste correct.
                }
                router.replace('/(auth)/sign-in');
                if (session?.user.identities?.some((identity) => identity.provider === 'apple')) {
                  Alert.alert(
                    t('Compte supprimé'),
                    t(
                      'Tes données Dispo ont été supprimées. Pour retirer aussi l’autorisation Apple, ouvre les réglages de connexion avec Apple et supprime Dispo.',
                    ),
                    [
                      { text: t('Fermer'), style: 'cancel' },
                      {
                        text: t('Ouvrir les instructions Apple'),
                        onPress: () =>
                          void Linking.openURL('https://support.apple.com/102571').catch(
                            () => undefined,
                          ),
                      },
                    ],
                  );
                }
              })
              .catch(() => {
                setErrorText(
                  t(
                    "La suppression n'a pas abouti. Ton compte est encore actif : réessaie pour terminer le nettoyage, ou contacte le support.",
                  ),
                );
              })
              .finally(() => setDeleting(false));
          },
        },
      ],
    );
  };

  const statusColor = session ? palette.jam : palette.bronze;

  return (
    <SettingsShell nativeHeader>
      <Card tone="elevated">
        <View style={styles.introRow}>
          <RaisedIconWell
            color={statusColor}
            icon={session ? 'cloud-done' : 'cloud-outline'}
            shape="square"
          />
          <View style={styles.introCopy}>
            <AppText variant="headline">
              {session ? t('Connecté au réseau Dispo') : t('Rejoins le réseau Dispo')}
            </AppText>
            <AppText color={palette.muted} variant="footnote">
              {session
                ? t('Ton profil, les annonces SOS et tes messages sont synchronisés en temps réel.')
                : t(
                    'Ton profil devient visible des autres musiciens — annonces SOS et messages en temps réel.',
                  )}
            </AppText>
          </View>
        </View>
      </Card>

      {session ? (
        <Card style={styles.card}>
          <View style={styles.sessionRow}>
            <View style={[styles.liveDot, { backgroundColor: palette.jam }]} />
            <View style={styles.introCopy}>
              <AppText variant="subheadline" weight="semibold">
                {session.user.email ?? t('Connecté')}
              </AppText>
              <AppText color={palette.muted} variant="caption">
                {t('Compte connecté')}
              </AppText>
            </View>
          </View>

          <DispoButton onPress={() => void disconnect()} variant="secondary">
            {t('Se déconnecter')}
          </DispoButton>

          <View style={[styles.divider, { backgroundColor: palette.border }]} />

          <DispoButton
            icon="mail"
            onPress={() => void Linking.openURL('mailto:ludovic@dispoapp.net')}
            variant="secondary"
          >
            {t('Contacter le support')}
          </DispoButton>

          <DispoButton disabled={deleting} onPress={confirmDeletion} variant="danger">
            {deleting ? t('Suppression…') : t('Supprimer mon compte')}
          </DispoButton>
        </Card>
      ) : (
        <DispoButton onPress={() => router.replace('/(auth)/sign-in')}>
          {t('Se connecter')}
        </DispoButton>
      )}

      {session ? (
        <SettingsSection title={t('Vérification')}>
          <SettingsRow
            color={palette.electric}
            icon="key"
            onPress={() => router.push('/settings/passkeys' as Href)}
            title={t('Clés d’accès')}
          />
          <SettingsDivider />
          <SettingsRow
            color={accountStatus.data?.emailVerified ? palette.jam : palette.bronze}
            icon="mail"
            onPress={() => router.push('/verify' as Href)}
            right={
              accountStatus.data?.emailVerified ? (
                <VerifiedAccessory label={t('E-mail vérifié')} />
              ) : (
                <SettingsValueAccessory value={t('Vérifier')} />
              )
            }
            title={t('E-mail')}
            {...(session.user.email ? { detail: session.user.email } : {})}
          />
          <SettingsDivider />
          <SettingsRow
            color={accountStatus.data?.phoneVerified ? palette.jam : palette.bronze}
            icon="call"
            onPress={() => router.push('/verify' as Href)}
            right={
              accountStatus.data?.phoneVerified ? (
                <VerifiedAccessory label={t('Téléphone vérifié')} />
              ) : (
                <SettingsValueAccessory
                  value={accountStatus.data?.phone ? t('Vérifier') : t('Ajouter un numéro')}
                />
              )
            }
            title={t('Téléphone')}
            {...(accountStatus.data?.phone ? { detail: accountStatus.data.phone } : {})}
          />
        </SettingsSection>
      ) : null}

      <SettingsErrorBanner text={errorText} />
    </SettingsShell>
  );
}

function VerifiedAccessory({ label }: { label: string }) {
  const { palette } = useDispoTheme();
  return (
    <View accessibilityLabel={label} style={styles.verified}>
      <Ionicons color={palette.jam} name="checkmark-circle" size={17} />
      <AppText color={palette.jam} variant="footnote" weight="semibold">
        {label}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing.md },
  divider: { height: StyleSheet.hairlineWidth },
  introCopy: { flex: 1, gap: spacing.xxs },
  introRow: { alignItems: 'flex-start', flexDirection: 'row', gap: spacing.sm },
  liveDot: { borderRadius: radii.round, height: 10, width: 10 },
  sessionRow: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm },
  verified: { alignItems: 'center', flexDirection: 'row', gap: spacing.xxs },
});
