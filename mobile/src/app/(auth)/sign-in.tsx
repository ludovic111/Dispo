import { zodResolver } from '@hookform/resolvers/zod';
import * as AppleAuthentication from 'expo-apple-authentication';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { z } from 'zod';

import { AppText } from '@/components/ui/app-text';
import { BrandLogo } from '@/components/ui/brand';
import { Card } from '@/components/ui/card';
import { FormField } from '@/components/ui/form-field';
import { LegalLinks } from '@/components/ui/legal-links';
import { DispoButton } from '@/components/ui/pressable';
import { Screen } from '@/components/ui/screen';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { useAuth } from '@/features/auth/auth-context';
import {
  requestEmailSignInLink,
  requestPasswordReset,
  signInWithApple,
  signInWithGoogle,
  signInWithPassword,
  signUpWithPassword,
} from '@/features/auth/auth-service';
import { useDispoTheme } from '@/theme/theme-context';
import { disabledStyle, radii, spacing, tint } from '@/theme/tokens';

interface Credentials {
  email: string;
  password: string;
}

type AuthMode = 'signin' | 'signup';

export default function SignInScreen() {
  const { authCallbackError, configurationReady } = useAuth();
  const { dark, palette } = useDispoTheme();
  const { t } = useTranslation();
  const [registering, setRegistering] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [infoText, setInfoText] = useState<string | null>(null);
  const [emailLinkWorking, setEmailLinkWorking] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [appleWorking, setAppleWorking] = useState(false);
  const [googleWorking, setGoogleWorking] = useState(false);
  const schema = useMemo(
    () =>
      z.object({
        email: z.string().email(t('Adresse e-mail invalide')),
        password: z.string().min(8, t('8 caractères minimum')),
      }),
    [t],
  );
  const { control, formState, getValues, handleSubmit, trigger } = useForm<Credentials>({
    defaultValues: { email: '', password: '' },
    resolver: zodResolver(schema),
  });
  const normalizedEmail = useWatch({ control, name: 'email' }).trim().toLowerCase();

  const submit = handleSubmit(async ({ email, password }) => {
    setServerError(null);
    setInfoText(null);
    try {
      if (registering) await signUpWithPassword(email, password);
      else await signInWithPassword(email, password);
      router.replace('/');
    } catch (error) {
      const message = error instanceof Error ? error.message.toLowerCase() : '';
      if (registering && message.includes('already registered')) {
        setServerError(t('Un compte existe déjà avec cet e-mail — connecte-toi.'));
        setRegistering(false);
      } else if (!registering && message.includes('invalid login credentials')) {
        setServerError(t('E-mail ou mot de passe incorrect.'));
      } else if (message.includes('password')) {
        setServerError(t('Mot de passe trop court : 8 caractères minimum.'));
      } else {
        setServerError(
          registering
            ? t('Création du compte impossible — vérifie le réseau.')
            : t('Connexion impossible — vérifie le réseau.'),
        );
      }
    }
  });

  const selectMode = (nextRegistering: boolean) => {
    setRegistering(nextRegistering);
    setServerError(null);
    setInfoText(null);
  };

  const forgotPassword = async () => {
    if (!configurationReady || emailLinkWorking || formState.isSubmitting || resetting) return;
    const emailIsValid = await trigger('email');
    if (!emailIsValid) return;

    setResetting(true);
    setServerError(null);
    setInfoText(null);
    try {
      await requestPasswordReset(getValues('email'));
      setInfoText(`${t('E-mail de réinitialisation envoyé à :')} ${normalizedEmail}`);
    } catch {
      setServerError(t("Envoi impossible — vérifie l'adresse et le réseau."));
    } finally {
      setResetting(false);
    }
  };

  const sendEmailSignInLink = async () => {
    if (!configurationReady || emailLinkWorking || formState.isSubmitting || resetting) return;
    const emailIsValid = await trigger('email');
    if (!emailIsValid) return;

    setEmailLinkWorking(true);
    setServerError(null);
    setInfoText(null);
    try {
      await requestEmailSignInLink(getValues('email'));
      setInfoText(t('Lien envoyé. Ouvre ton e-mail sur cet appareil pour te connecter.'));
    } catch {
      setServerError(t("Envoi impossible — vérifie l'adresse et le réseau."));
    } finally {
      setEmailLinkWorking(false);
    }
  };

  const authenticateWithApple = async () => {
    if (
      !configurationReady ||
      appleWorking ||
      emailLinkWorking ||
      formState.isSubmitting ||
      resetting
    )
      return;
    setAppleWorking(true);
    setServerError(null);
    setInfoText(null);
    try {
      await signInWithApple();
      router.replace('/');
    } catch (error) {
      const code =
        typeof error === 'object' && error !== null && 'code' in error ? String(error.code) : '';
      if (code !== 'ERR_REQUEST_CANCELED') {
        setServerError(t('Connexion Apple impossible — réessaie.'));
      }
    } finally {
      setAppleWorking(false);
    }
  };

  const authenticateWithGoogle = async () => {
    if (
      !configurationReady ||
      googleWorking ||
      emailLinkWorking ||
      formState.isSubmitting ||
      resetting
    )
      return;
    setGoogleWorking(true);
    setServerError(null);
    setInfoText(null);
    try {
      await signInWithGoogle();
      router.replace('/');
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      if (message !== 'oauth_cancelled') {
        setServerError(t('Connexion Google impossible — réessaie.'));
      }
    } finally {
      setGoogleWorking(false);
    }
  };

  return (
    <Screen>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.flex}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.content}>
            <View style={styles.hero}>
              <BrandLogo markSize={48} />
              <AppText style={styles.title} variant="display">
                {t('Le réseau des musiciens\nqui se dépannent')}
              </AppText>
              <AppText color={palette.muted} style={styles.subtitle} variant="callout">
                {t(
                  'Un musicien te lâche ? Trouve un remplaçant fiable en quelques minutes à Genève.',
                )}
              </AppText>
            </View>

            <View style={styles.authBlock}>
              {Platform.OS === 'ios' ? (
                <>
                  <AppleAuthentication.AppleAuthenticationButton
                    buttonStyle={
                      dark
                        ? AppleAuthentication.AppleAuthenticationButtonStyle.WHITE
                        : AppleAuthentication.AppleAuthenticationButtonStyle.BLACK
                    }
                    buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
                    cornerRadius={radii.button}
                    onPress={() => void authenticateWithApple()}
                    style={[styles.appleButton, appleWorking && disabledStyle]}
                  />
                  <View style={styles.separator}>
                    <View style={[styles.separatorLine, { backgroundColor: palette.border }]} />
                    <AppText color={palette.muted} style={styles.separatorText} variant="caption">
                      {t('ou par e-mail')}
                    </AppText>
                    <View style={[styles.separatorLine, { backgroundColor: palette.border }]} />
                  </View>
                </>
              ) : null}

              {Platform.OS === 'android' ? (
                <>
                  <DispoButton
                    disabled={
                      !configurationReady ||
                      googleWorking ||
                      emailLinkWorking ||
                      formState.isSubmitting ||
                      resetting
                    }
                    icon="logo-google"
                    loading={googleWorking}
                    onPress={() => void authenticateWithGoogle()}
                    variant="secondary"
                  >
                    {t('Se connecter avec Google')}
                  </DispoButton>
                  <View style={styles.separator}>
                    <View style={[styles.separatorLine, { backgroundColor: palette.border }]} />
                    <AppText color={palette.muted} style={styles.separatorText} variant="caption">
                      {t('ou par e-mail')}
                    </AppText>
                    <View style={[styles.separatorLine, { backgroundColor: palette.border }]} />
                  </View>
                </>
              ) : null}

              <Card padding={spacing.gutter} style={styles.card} tone="elevated">
                <SegmentedControl<AuthMode>
                  onChange={(mode) => selectMode(mode === 'signup')}
                  options={[
                    { label: t('Se connecter'), value: 'signin' },
                    { label: t('Créer un compte'), value: 'signup' },
                  ]}
                  value={registering ? 'signup' : 'signin'}
                />

                {!configurationReady ? (
                  <View
                    style={[
                      styles.notice,
                      {
                        backgroundColor: tint(palette.signal, 0.1),
                        borderColor: tint(palette.signal, 0.33),
                      },
                    ]}
                  >
                    <AppText color={palette.signal} variant="footnote">
                      {t(
                        'Configuration Supabase manquante. Copie `.env.example` vers `.env.local` et renseigne uniquement les valeurs publiques.',
                      )}
                    </AppText>
                  </View>
                ) : null}

                <Controller
                  control={control}
                  name="email"
                  render={({ field, fieldState }) => (
                    <FormField
                      autoCapitalize="none"
                      autoComplete="email"
                      error={fieldState.error?.message}
                      keyboardType="email-address"
                      label={t('E-mail')}
                      onBlur={field.onBlur}
                      onChangeText={field.onChange}
                      placeholder={t('toi@exemple.ch')}
                      returnKeyType="next"
                      textContentType="emailAddress"
                      value={field.value}
                    />
                  )}
                />
                <Controller
                  control={control}
                  name="password"
                  render={({ field, fieldState }) => (
                    <FormField
                      autoCapitalize="none"
                      autoComplete={registering ? 'new-password' : 'current-password'}
                      error={fieldState.error?.message}
                      label={t('Mot de passe')}
                      onBlur={field.onBlur}
                      onChangeText={field.onChange}
                      onSubmitEditing={() => void submit()}
                      placeholder={registering ? t('8 caractères minimum') : t('Ton mot de passe')}
                      returnKeyType="go"
                      secureTextEntry
                      textContentType={registering ? 'newPassword' : 'password'}
                      value={field.value}
                    />
                  )}
                />

                <DispoButton
                  disabled={!configurationReady || emailLinkWorking || resetting}
                  loading={formState.isSubmitting}
                  onPress={() => void submit()}
                >
                  {registering ? t('Créer un compte') : t('Se connecter')}
                </DispoButton>

                {!registering ? (
                  <>
                    <DispoButton
                      disabled={
                        !configurationReady ||
                        emailLinkWorking ||
                        formState.isSubmitting ||
                        resetting ||
                        !normalizedEmail.includes('@')
                      }
                      icon="mail-outline"
                      loading={emailLinkWorking}
                      onPress={() => void sendEmailSignInLink()}
                      variant="secondary"
                    >
                      {t('Recevoir un lien de connexion')}
                    </DispoButton>
                    <DispoButton
                      disabled={
                        !configurationReady ||
                        emailLinkWorking ||
                        formState.isSubmitting ||
                        !normalizedEmail.includes('@')
                      }
                      loading={resetting}
                      onPress={() => void forgotPassword()}
                      size="compact"
                      variant="ghost"
                    >
                      {t('Mot de passe oublié ?')}
                    </DispoButton>
                  </>
                ) : null}
              </Card>

              {serverError || authCallbackError ? (
                <AppText color={palette.error} style={styles.status} variant="caption">
                  {serverError ?? authCallbackError}
                </AppText>
              ) : null}
              {infoText ? (
                <AppText color={palette.muted} style={styles.status} variant="caption">
                  {infoText}
                </AppText>
              ) : null}
            </View>

            <AppText color={palette.muted} style={styles.legal} variant="caption">
              {t(
                'En continuant, tu confirmes avoir au moins 13 ans et tu acceptes les conditions d’utilisation, les règles de la communauté et la politique de confidentialité.',
              )}
            </AppText>
            <LegalLinks />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  appleButton: { height: 50, width: '100%' },
  authBlock: { gap: spacing.md, width: '100%' },
  card: { gap: spacing.md, width: '100%' },
  content: {
    alignItems: 'center',
    gap: spacing.xl,
    maxWidth: 520,
    width: '100%',
  },
  flex: { flex: 1 },
  hero: { alignItems: 'center', gap: spacing.sm, width: '100%' },
  legal: { maxWidth: 360, paddingHorizontal: spacing.sm, textAlign: 'center' },
  notice: { borderRadius: radii.button, borderWidth: 1, padding: spacing.sm },
  scroll: {
    alignItems: 'center',
    flexGrow: 1,
    paddingBottom: spacing.xl,
    paddingHorizontal: spacing.gutter,
    paddingTop: spacing.xxl,
  },
  separator: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm },
  separatorLine: { flex: 1, height: StyleSheet.hairlineWidth },
  separatorText: { flexShrink: 0 },
  status: { paddingHorizontal: spacing.xs },
  subtitle: { maxWidth: 390, paddingHorizontal: spacing.lg, textAlign: 'center' },
  title: { maxWidth: 390, textAlign: 'center' },
});
