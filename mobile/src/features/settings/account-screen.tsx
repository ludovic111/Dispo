import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Linking, StyleSheet, View } from 'react-native';

import { disconnectWithBestEffortPushCleanup } from './account-session';
import { SettingsShell, SheetHeader } from './settings-components';
import { deleteCurrentAccount, unregisterPushDevice } from './settings-service';
import { clearPushToken, loadPushToken } from './settings-storage';

import { AppText } from '@/components/ui/app-text';
import { Card } from '@/components/ui/card';
import { DispoButton } from '@/components/ui/pressable';
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

  return (
    <SettingsShell>
      <SheetHeader onClose={() => router.back()} title={t('Mon compte')} />

      <View style={styles.header}>
        <View style={[styles.cloudIcon, { backgroundColor: `${palette.bronze}20` }]}>
          <Ionicons
            color={session ? palette.jam : palette.bronze}
            name={session ? 'cloud-done' : 'cloud-outline'}
            size={28}
          />
        </View>
        <AppText style={styles.headerTitle}>
          {session ? t('Connecté au réseau Dispo') : t('Rejoins le réseau Dispo')}
        </AppText>
        <AppText color={palette.muted} style={styles.headerCopy} variant="caption">
          {session
            ? t('Ton profil, les annonces SOS et tes messages sont synchronisés en temps réel.')
            : t(
                'Ton profil devient visible des autres musiciens — annonces SOS et messages en temps réel.',
              )}
        </AppText>
      </View>

      {session ? (
        <Card padding={spacing.md} style={styles.card}>
          <View style={styles.sessionRow}>
            <View style={[styles.liveDot, { backgroundColor: palette.jam }]} />
            <View style={styles.sessionCopy}>
              <AppText style={styles.email}>{session.user.email ?? t('Connecté')}</AppText>
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
  card: { gap: spacing.md },
  cloudIcon: {
    alignItems: 'center',
    borderRadius: radii.round,
    height: 64,
    justifyContent: 'center',
    width: 64,
  },
  divider: { height: StyleSheet.hairlineWidth },
  email: { fontSize: 14, fontWeight: '800' },
  error: {
    alignItems: 'center',
    borderRadius: radii.ticket,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.sm,
    padding: spacing.sm,
  },
  errorCopy: { flex: 1 },
  header: {
    alignItems: 'center',
    gap: 9,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  headerCopy: { maxWidth: 330, textAlign: 'center' },
  headerTitle: { fontSize: 17, fontWeight: '800', textAlign: 'center' },
  liveDot: { borderRadius: radii.round, height: 10, width: 10 },
  sessionCopy: { flex: 1, gap: 2 },
  sessionRow: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm },
});
