import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Linking, ScrollView, StyleSheet, View } from 'react-native';

import {
  confirmPhoneVerification,
  isPhoneProviderUnavailableError,
  isValidOtpCode,
  normalizePhoneNumber,
  resendEmailConfirmation,
  startPhoneVerification,
  useAccountStatus,
  useInvalidateAccountStatus,
} from './account-status';
import { useAuth } from './auth-context';
import { signOut } from './auth-service';

import { AppText } from '@/components/ui/app-text';
import { Card } from '@/components/ui/card';
import { FormField } from '@/components/ui/form-field';
import { DispoButton } from '@/components/ui/pressable';
import { LoadingState, Screen, ScreenHeader } from '@/components/ui/screen';
import { Tag } from '@/components/ui/tag';
import { RaisedIconWell, SettingsErrorBanner } from '@/features/settings/settings-components';
import { useDispoTheme } from '@/theme/theme-context';
import { spacing, typography } from '@/theme/tokens';

const supportEmail = 'ludovic@dispoapp.net';

interface VerificationScreenProps {
  /** Rendu par la porte d'entrée : pas de header natif, sortie par déconnexion. */
  blocking?: boolean | undefined;
  onContinueWithoutVerification?: (() => void) | undefined;
  required?: { email: boolean; phone: boolean } | undefined;
}

function StatusTag({ verified }: { verified: boolean }) {
  const { palette } = useDispoTheme();
  const { t } = useTranslation();
  return (
    <Tag
      color={verified ? palette.jam : palette.warning}
      icon={verified ? 'checkmark-circle' : 'time-outline'}
      label={verified ? t('Vérifié') : t('À vérifier')}
    />
  );
}

/** Vérification de l'e-mail et du numéro de téléphone du compte connecté. */
export function VerificationScreen({
  blocking = false,
  onContinueWithoutVerification,
  required,
}: VerificationScreenProps) {
  const { palette } = useDispoTheme();
  const { t } = useTranslation();
  const { session } = useAuth();
  const status = useAccountStatus();
  const invalidate = useInvalidateAccountStatus();
  const [errorText, setErrorText] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [emailSent, setEmailSent] = useState(false);
  const [emailSending, setEmailSending] = useState(false);
  const [phoneInput, setPhoneInput] = useState('+41 ');
  const [phoneStep, setPhoneStep] = useState<'code' | 'enter' | 'unavailable'>('enter');
  const [phoneTarget, setPhoneTarget] = useState<string | null>(null);
  const [phoneEditing, setPhoneEditing] = useState(false);
  const [code, setCode] = useState('');
  const [phoneBusy, setPhoneBusy] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const email = session?.user.email ?? null;
  const data = status.data;
  const phoneRequiredButUnavailable =
    Boolean(required?.phone) &&
    phoneStep === 'unavailable' &&
    !(required?.email && !data?.emailVerified);

  const resendEmail = async () => {
    if (!email || emailSending) return;
    setEmailSending(true);
    setErrorText(null);
    try {
      await resendEmailConfirmation(email);
      setEmailSent(true);
      setNotice(t('E-mail envoyé. Ouvre le lien reçu, puis reviens ici.'));
    } catch {
      setErrorText(
        t('L’e-mail de confirmation n’a pas pu être envoyé — réessaie dans une minute.'),
      );
    } finally {
      setEmailSending(false);
    }
  };

  const sendCode = async () => {
    if (phoneBusy) return;
    const normalized = normalizePhoneNumber(phoneInput);
    if (!normalized) {
      setErrorText(
        t('Numéro invalide. Utilise le format international, par exemple +41 79 123 45 67.'),
      );
      return;
    }
    setPhoneBusy(true);
    setErrorText(null);
    setNotice(null);
    try {
      await startPhoneVerification(normalized);
      setPhoneTarget(normalized);
      setPhoneStep('code');
      setNotice(t('Code envoyé par SMS au {{phone}}.', { phone: normalized }));
    } catch (error) {
      if (isPhoneProviderUnavailableError(error)) {
        setPhoneStep('unavailable');
        setNotice(t('La vérification par SMS sera activée prochainement.'));
      } else {
        setErrorText(t('Le code n’a pas pu être envoyé — vérifie le numéro et réessaie.'));
      }
    } finally {
      setPhoneBusy(false);
    }
  };

  const verifyCode = async () => {
    if (phoneBusy || !phoneTarget) return;
    if (!isValidOtpCode(code)) {
      setErrorText(t('Le code comporte 6 chiffres.'));
      return;
    }
    setPhoneBusy(true);
    setErrorText(null);
    try {
      await confirmPhoneVerification(phoneTarget, code);
      setCode('');
      setPhoneStep('enter');
      setPhoneEditing(false);
      setNotice(t('Numéro vérifié.'));
      await invalidate();
    } catch {
      setErrorText(t('Code refusé ou expiré — demande un nouveau code.'));
    } finally {
      setPhoneBusy(false);
    }
  };

  const disconnect = async () => {
    setSigningOut(true);
    try {
      await signOut();
    } catch {
      // La session locale reste, la porte se rouvrira à la prochaine reconnexion.
    } finally {
      setSigningOut(false);
    }
  };

  const showPhoneForm = !data?.phoneVerified || phoneEditing;

  return (
    <Screen nativeHeader={!blocking}>
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {blocking ? (
          <ScreenHeader
            icon="shield-checkmark"
            inset={false}
            subtitle={t('Une étape rapide pour garder le réseau fiable.')}
            title={t('Vérifie ton compte')}
          />
        ) : null}
        <SettingsErrorBanner text={errorText} />
        <SettingsErrorBanner text={notice} tone="info" />
        {status.isLoading && !data ? <LoadingState /> : null}

        <Card style={styles.card} tone="elevated">
          <View style={styles.rowTop}>
            <RaisedIconWell icon="mail" shape="square" />
            <View style={styles.rowCopy}>
              <AppText variant="headline">{t('Adresse e-mail')}</AppText>
              <AppText color={palette.muted} numberOfLines={2} variant="footnote">
                {email ?? t('Aucune adresse e-mail sur ce compte')}
              </AppText>
            </View>
            <StatusTag verified={Boolean(data?.emailVerified)} />
          </View>
          {required?.email && !data?.emailVerified ? (
            <AppText color={palette.warning} variant="caption" weight="semibold">
              {t('La confirmation de l’e-mail est requise pour continuer.')}
            </AppText>
          ) : null}
          {!data?.emailVerified && email ? (
            <View style={styles.actions}>
              <DispoButton
                icon="paper-plane-outline"
                loading={emailSending}
                onPress={() => void resendEmail()}
                size="compact"
                variant="secondary"
              >
                {emailSent ? t('Renvoyer l’e-mail') : t('Envoyer l’e-mail de confirmation')}
              </DispoButton>
              {emailSent ? (
                <DispoButton onPress={() => void invalidate()} size="compact" variant="ghost">
                  {t('J’ai confirmé, actualiser')}
                </DispoButton>
              ) : null}
            </View>
          ) : null}
        </Card>

        <Card style={styles.card} tone="elevated">
          <View style={styles.rowTop}>
            <RaisedIconWell icon="call" shape="square" />
            <View style={styles.rowCopy}>
              <AppText variant="headline">{t('Numéro de téléphone')}</AppText>
              <AppText color={palette.muted} numberOfLines={1} variant="footnote">
                {data?.phone ?? t('Aucun numéro enregistré')}
              </AppText>
            </View>
            <StatusTag verified={Boolean(data?.phoneVerified)} />
          </View>
          {required?.phone && !data?.phoneVerified ? (
            <AppText color={palette.warning} variant="caption" weight="semibold">
              {t('Un numéro vérifié est requis pour continuer.')}
            </AppText>
          ) : null}
          {data?.phoneVerified && !phoneEditing ? (
            <View style={styles.actions}>
              <DispoButton onPress={() => setPhoneEditing(true)} size="compact" variant="ghost">
                {t('Changer de numéro')}
              </DispoButton>
            </View>
          ) : null}
          {showPhoneForm && phoneStep !== 'code' ? (
            <>
              <FormField
                autoComplete="tel"
                hint={t(
                  'Format international. +41 est ajouté aux numéros suisses commençant par 0.',
                )}
                keyboardType="phone-pad"
                label={t('Numéro')}
                onChangeText={setPhoneInput}
                placeholder="+41 79 123 45 67"
                textContentType="telephoneNumber"
                value={phoneInput}
              />
              <View style={styles.actions}>
                <DispoButton
                  icon="chatbubble-ellipses-outline"
                  loading={phoneBusy}
                  onPress={() => void sendCode()}
                  size="compact"
                  variant="secondary"
                >
                  {t('Envoyer le code')}
                </DispoButton>
                {phoneEditing ? (
                  <DispoButton
                    onPress={() => setPhoneEditing(false)}
                    size="compact"
                    variant="ghost"
                  >
                    {t('Annuler')}
                  </DispoButton>
                ) : null}
              </View>
            </>
          ) : null}
          {showPhoneForm && phoneStep === 'code' ? (
            <>
              <FormField
                autoComplete="sms-otp"
                hint={t('6 chiffres reçus par SMS.')}
                keyboardType="number-pad"
                label={t('Code reçu')}
                maxLength={6}
                onChangeText={setCode}
                placeholder="123456"
                style={styles.otp}
                textContentType="oneTimeCode"
                value={code}
              />
              <View style={styles.actions}>
                <DispoButton loading={phoneBusy} onPress={() => void verifyCode()} size="compact">
                  {t('Vérifier')}
                </DispoButton>
                <DispoButton
                  onPress={() => {
                    setCode('');
                    setPhoneStep('enter');
                  }}
                  size="compact"
                  variant="ghost"
                >
                  {t('Changer de numéro')}
                </DispoButton>
              </View>
            </>
          ) : null}
          {phoneStep === 'unavailable' ? (
            <AppText color={palette.muted} variant="caption">
              {t('Ton numéro sera demandé à nouveau dès que l’envoi de SMS sera disponible.')}
            </AppText>
          ) : null}
        </Card>

        {blocking ? (
          <View style={styles.footer}>
            {phoneRequiredButUnavailable && onContinueWithoutVerification ? (
              <DispoButton onPress={onContinueWithoutVerification}>{t('Continuer')}</DispoButton>
            ) : null}
            <DispoButton
              icon="mail"
              onPress={() =>
                void Linking.openURL(`mailto:${supportEmail}?subject=Dispo`).catch(() => undefined)
              }
              variant="secondary"
            >
              {t('Contacter le support')}
            </DispoButton>
            <DispoButton loading={signingOut} onPress={() => void disconnect()} variant="ghost">
              {t('Se déconnecter')}
            </DispoButton>
          </View>
        ) : null}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  card: { gap: spacing.sm },
  content: {
    gap: spacing.md,
    paddingBottom: spacing.xxl,
    paddingHorizontal: spacing.gutter,
    paddingTop: spacing.sm,
  },
  footer: { gap: spacing.xs, marginTop: spacing.sm },
  // Le code à usage unique est une donnée : mono, grand et espacé pour être
  // relu chiffre par chiffre. Seule dérogation typographique de l'écran.
  otp: { fontFamily: typography.monoSemibold, fontSize: 24, letterSpacing: 6, textAlign: 'center' },
  rowCopy: { flex: 1, gap: spacing.xxs },
  rowTop: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm },
});
