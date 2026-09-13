import { useMemo, useState, type PropsWithChildren } from 'react';
import { useTranslation } from 'react-i18next';
import { Linking, ScrollView, StyleSheet, View } from 'react-native';

import { accountGateDecision, useAccountStatus, type AccountGateDecision } from './account-status';
import { AuthCase } from './auth-case';
import { useAuth } from './auth-context';
import { signOut } from './auth-service';
import { VerificationScreen } from './verification-screen';

import { AppText } from '@/components/ui/app-text';
import { BrandLogo } from '@/components/ui/brand';
import { Card } from '@/components/ui/card';
import { DispoButton } from '@/components/ui/pressable';
import { Screen } from '@/components/ui/screen';
import { Tag } from '@/components/ui/tag';
import { RaisedIconWell } from '@/features/settings/settings-components';
import { useDispoTheme } from '@/theme/theme-context';
import { spacing } from '@/theme/tokens';

export const supportEmail = 'ludovic@dispoapp.net';

function RestrictedAccountScreen({
  decision,
}: {
  decision: Extract<AccountGateDecision, { kind: 'banned' | 'suspended' }>;
}) {
  const { palette } = useDispoTheme();
  const { i18n, t } = useTranslation();
  const locale = i18n.resolvedLanguage ?? i18n.language ?? 'fr';
  const [signingOut, setSigningOut] = useState(false);
  const until =
    decision.kind === 'suspended' && decision.until
      ? new Intl.DateTimeFormat(locale, { dateStyle: 'long', timeStyle: 'short' }).format(
          new Date(decision.until),
        )
      : null;

  const disconnect = async () => {
    setSigningOut(true);
    try {
      await signOut();
    } catch {
      // Sans réseau, la session locale est déjà invalide : la porte reste fermée.
    } finally {
      setSigningOut(false);
    }
  };

  const tone = decision.kind === 'banned' ? palette.error : palette.warning;

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.brand}>
          <BrandLogo markSize={36} />
        </View>
        <AuthCase style={styles.case}>
          <RaisedIconWell
            color={tone}
            icon={decision.kind === 'banned' ? 'hand-left' : 'time'}
            size="large"
          />
          <Tag
            color={tone}
            icon={decision.kind === 'banned' ? 'close-circle' : 'time-outline'}
            label={decision.kind === 'banned' ? t('Accès retiré') : t('Accès en pause')}
            tone="solid"
          />
          <AppText numberOfLines={3} style={styles.centered} variant="display">
            {decision.kind === 'banned' ? t('Compte banni') : t('Compte suspendu')}
          </AppText>
          <AppText color={palette.muted} style={styles.centered} variant="subheadline">
            {decision.kind === 'banned'
              ? t('Ce compte ne peut plus utiliser Dispo.')
              : until
                ? t('Ce compte est suspendu jusqu’au {{date}}.', { date: until })
                : t('Ce compte est suspendu pour le moment.')}
          </AppText>
          {decision.reason ? (
            <Card padding={spacing.sm} tone="inset">
              <AppText color={palette.bronze} variant="label">
                {t('Motif')}
              </AppText>
              <AppText variant="body">{decision.reason}</AppText>
            </Card>
          ) : null}
          <AppText color={palette.muted} style={styles.centered} variant="footnote">
            {t(
              'Si tu penses qu’il s’agit d’une erreur, écris-nous : nous répondons à chaque message.',
            )}
          </AppText>
          <View style={styles.actions}>
            <DispoButton
              icon="mail"
              onPress={() =>
                void Linking.openURL(`mailto:${supportEmail}?subject=Dispo`).catch(() => undefined)
              }
            >
              {t('Contacter le support')}
            </DispoButton>
            <DispoButton loading={signingOut} onPress={() => void disconnect()} variant="ghost">
              {t('Se déconnecter')}
            </DispoButton>
          </View>
        </AuthCase>
      </ScrollView>
    </Screen>
  );
}

/**
 * Porte d'entrée du compte : bannissement, suspension ou vérification exigée par
 * le serveur. Sans statut chargé (réseau absent, erreur), l'app reste ouverte.
 */
export function AccountStatusGate({ children }: PropsWithChildren) {
  const { session } = useAuth();
  const status = useAccountStatus();
  const [bypassedUserId, setBypassedUserId] = useState<string | null>(null);
  const decision = useMemo(() => accountGateDecision(status.data), [status.data]);
  const userId = session?.user.id ?? null;

  if (!userId || decision.kind === 'open') return <>{children}</>;
  if (decision.kind === 'verify') {
    if (bypassedUserId === userId) return <>{children}</>;
    return (
      <VerificationScreen
        blocking
        onContinueWithoutVerification={() => setBypassedUserId(userId)}
        required={{ email: decision.email, phone: decision.phone }}
      />
    );
  }
  return <RestrictedAccountScreen decision={decision} />;
}

const styles = StyleSheet.create({
  actions: { alignSelf: 'stretch', gap: spacing.xs, marginTop: spacing.xs },
  brand: { alignItems: 'center', marginBottom: spacing.xl },
  case: { alignItems: 'center' },
  centered: { textAlign: 'center' },
  content: { flexGrow: 1, justifyContent: 'center', padding: spacing.gutter },
});
