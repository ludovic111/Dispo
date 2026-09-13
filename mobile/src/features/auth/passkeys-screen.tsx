import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, View } from 'react-native';

import { useAuth } from './auth-context';
import {
  deletePasskey,
  listPasskeys,
  passkeyWasCancelled,
  registerPasskey,
  supportsPasskeys,
} from './passkey-service';

import { AppText } from '@/components/ui/app-text';
import { Card } from '@/components/ui/card';
import { DispoButton } from '@/components/ui/pressable';
import { SettingsErrorBanner, SettingsShell } from '@/features/settings/settings-components';
import { useDispoTheme } from '@/theme/theme-context';
import { spacing } from '@/theme/tokens';

export function PasskeysScreen() {
  const { session } = useAuth();
  const { t } = useTranslation();
  const { palette } = useDispoTheme();
  const client = useQueryClient();
  const key = ['passkeys', session?.user.id];
  const query = useQuery({ queryKey: key, queryFn: listPasskeys, enabled: !!session });
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const change = async (operation: () => Promise<void>) => {
    if (working) return;
    setWorking(true);
    setError(null);
    try {
      await operation();
      await client.invalidateQueries({ queryKey: key });
    } catch (caught) {
      if (!passkeyWasCancelled(caught))
        setError(t('Impossible de mettre à jour les clés d’accès. Réessaie.'));
    } finally {
      setWorking(false);
    }
  };
  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: t('Clés d’accès') }} />
      <SettingsShell nativeHeader>
        <Card>
          <AppText variant="headline">{t('Se connecter sans mot de passe')}</AppText>
          <AppText color={palette.muted}>
            {t(
              'Une clé d’accès utilise Face ID, ton empreinte ou le code de ton appareil. Ton gestionnaire de mots de passe la conserve.',
            )}
          </AppText>
          <DispoButton
            disabled={working || !session || !supportsPasskeys()}
            icon="key"
            loading={working}
            onPress={() => void change(registerPasskey)}
          >
            {t('Créer une clé d’accès')}
          </DispoButton>
          {!supportsPasskeys() ? (
            <AppText color={palette.muted}>
              {t('Les clés d’accès ne sont pas disponibles sur cet appareil.')}
            </AppText>
          ) : null}
        </Card>
        {query.data?.map((item) => (
          <Card key={item.id}>
            <View style={{ gap: spacing.sm }}>
              <AppText variant="headline">{item.friendly_name || t('Clé d’accès')}</AppText>
              <DispoButton
                disabled={working}
                variant="secondary"
                onPress={() =>
                  Alert.alert(
                    t('Retirer cette clé d’accès ?'),
                    t('Tu pourras toujours te connecter avec les autres méthodes de ton compte.'),
                    [
                      { text: t('Annuler'), style: 'cancel' },
                      {
                        text: t('Retirer'),
                        style: 'destructive',
                        onPress: () => void change(() => deletePasskey(item.id)),
                      },
                    ],
                  )
                }
              >
                {t('Retirer')}
              </DispoButton>
            </View>
          </Card>
        ))}
        <SettingsErrorBanner
          text={
            error || (query.error ? t('Impossible de charger les clés d’accès. Réessaie.') : null)
          }
        />
      </SettingsShell>
    </>
  );
}
