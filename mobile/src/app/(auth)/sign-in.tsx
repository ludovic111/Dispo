import { zodResolver } from '@hookform/resolvers/zod';
import * as AppleAuthentication from 'expo-apple-authentication';
import { router } from 'expo-router';
import type { ComponentProps } from 'react';
import { useMemo, useState } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { z } from 'zod';

import { AppText } from '@/components/ui/app-text';
import { BrandLogo } from '@/components/ui/brand';
import { Card } from '@/components/ui/card';
import { DispoButton } from '@/components/ui/pressable';
import { Screen } from '@/components/ui/screen';
import { useAuth } from '@/features/auth/auth-context';
import {
  requestPasswordReset,
  signInWithApple,
  signInWithGoogle,
  signInWithPassword,
  signUpWithPassword,
} from '@/features/auth/auth-service';
import { useDispoTheme } from '@/theme/theme-context';
import { radii, spacing } from '@/theme/tokens';

interface Credentials {
  email: string;
  password: string;
}

interface AuthFieldProps extends ComponentProps<typeof TextInput> {
  error?: string | undefined;
  label: string;
}

function AuthField({ error, label, onBlur, onFocus, style, ...props }: AuthFieldProps) {
  const { palette } = useDispoTheme();
  const [focused, setFocused] = useState(false);

  return (
    <View style={styles.field}>
      <AppText color={palette.muted} style={styles.fieldLabel}>
        {label}
      </AppText>
      <TextInput
        {...props}
        onBlur={(event) => {
          setFocused(false);
          onBlur?.(event);
        }}
        onFocus={(event) => {
          setFocused(true);
          onFocus?.(event);
        }}
        placeholderTextColor={palette.muted}
        selectionColor={palette.electric}
        style={[
          styles.input,
          {
            backgroundColor: focused ? palette.cardElevated : palette.cardMuted,
            borderColor: error ? palette.error : focused ? palette.electric : palette.border,
            color: palette.text,
          },
          style,
        ]}
      />
      {error ? (
        <AppText color={palette.error} variant="caption">
          {error}
        </AppText>
      ) : null}
    </View>
  );
}

export default function SignInScreen() {
  const { authCallbackError, configurationReady } = useAuth();
  const { dark, palette } = useDispoTheme();
  const { t } = useTranslation();
  const [registering, setRegistering] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [infoText, setInfoText] = useState<string | null>(null);
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
    if (!configurationReady || formState.isSubmitting || resetting) return;
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

  const authenticateWithApple = async () => {
    if (!configurationReady || appleWorking || formState.isSubmitting || resetting) return;
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
    if (!configurationReady || googleWorking || formState.isSubmitting || resetting) return;
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
              <View style={[styles.heroRule, { backgroundColor: palette.electric }]} />
              <AppText style={styles.title} variant="display">
                {t('Le réseau des musiciens\nqui se dépannent')}
              </AppText>
              <AppText color={palette.muted} style={styles.subtitle}>
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
                    style={[styles.appleButton, appleWorking && styles.disabled]}
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
                      !configurationReady || googleWorking || formState.isSubmitting || resetting
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
                <View
                  accessibilityLabel={t('Mode')}
                  accessibilityRole="tablist"
                  style={[styles.modePicker, { backgroundColor: palette.inset }]}
                >
                  <Pressable
                    accessibilityRole="tab"
                    accessibilityState={{ selected: !registering }}
                    onPress={() => selectMode(false)}
                    style={({ pressed }) => [
                      styles.modeOption,
                      !registering && {
                        backgroundColor: `${palette.electric}1F`,
                        borderColor: `${palette.electric}66`,
                      },
                      pressed && styles.pressed,
                    ]}
                  >
                    <AppText
                      color={!registering ? palette.electric : palette.muted}
                      style={styles.modeText}
                    >
                      {t('Se connecter')}
                    </AppText>
                  </Pressable>
                  <Pressable
                    accessibilityRole="tab"
                    accessibilityState={{ selected: registering }}
                    onPress={() => selectMode(true)}
                    style={({ pressed }) => [
                      styles.modeOption,
                      registering && {
                        backgroundColor: `${palette.electric}1F`,
                        borderColor: `${palette.electric}66`,
                      },
                      pressed && styles.pressed,
                    ]}
                  >
                    <AppText
                      color={registering ? palette.electric : palette.muted}
                      style={styles.modeText}
                    >
                      {t('Créer un compte')}
                    </AppText>
                  </Pressable>
                </View>

                {!configurationReady ? (
                  <View
                    style={[
                      styles.notice,
                      {
                        backgroundColor: `${palette.signal}18`,
                        borderColor: `${palette.signal}55`,
                      },
                    ]}
                  >
                    <AppText color={palette.signal}>
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
                    <AuthField
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
                    <AuthField
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
                  disabled={!configurationReady || resetting}
                  loading={formState.isSubmitting}
                  onPress={() => void submit()}
                >
                  {registering ? t('Créer un compte') : t('Se connecter')}
                </DispoButton>

                {!registering ? (
                  <Pressable
                    accessibilityRole="button"
                    disabled={
                      !configurationReady ||
                      formState.isSubmitting ||
                      resetting ||
                      !normalizedEmail.includes('@')
                    }
                    hitSlop={8}
                    onPress={() => void forgotPassword()}
                    style={({ pressed }) => [
                      styles.forgotButton,
                      pressed && styles.pressed,
                      (!configurationReady ||
                        formState.isSubmitting ||
                        resetting ||
                        !normalizedEmail.includes('@')) &&
                        styles.disabled,
                    ]}
                  >
                    <AppText color={palette.muted} variant="caption">
                      {resetting ? t('Envoi…') : t('Mot de passe oublié ?')}
                    </AppText>
                  </Pressable>
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
              {t('En continuant, tu acceptes que ton profil soit visible des autres musiciens.')}
            </AppText>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  appleButton: { height: 50, width: '100%' },
  authBlock: { gap: spacing.md, width: '100%' },
  card: { gap: 14, width: '100%' },
  content: {
    alignItems: 'center',
    gap: spacing.xl,
    maxWidth: 520,
    width: '100%',
  },
  disabled: { opacity: 0.45 },
  field: { gap: 7 },
  fieldLabel: { fontSize: 12, fontWeight: '700', lineHeight: 16 },
  flex: { flex: 1 },
  forgotButton: { alignItems: 'center', minHeight: 24, justifyContent: 'center' },
  hero: { alignItems: 'center', gap: spacing.control, width: '100%' },
  heroRule: { borderRadius: 2, height: 3, marginBottom: 2, width: 42 },
  input: {
    borderRadius: radii.input,
    borderWidth: 1,
    fontSize: 16,
    minHeight: 48,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
  },
  legal: {
    fontSize: 11,
    lineHeight: 14,
    maxWidth: 360,
    paddingHorizontal: 14,
    textAlign: 'center',
  },
  modeOption: {
    alignItems: 'center',
    borderColor: 'transparent',
    borderRadius: 8,
    borderWidth: 1,
    flex: 1,
    justifyContent: 'center',
    minHeight: 34,
    paddingHorizontal: spacing.xs,
  },
  modePicker: { borderRadius: radii.input, flexDirection: 'row', gap: 3, padding: 3 },
  modeText: { fontSize: 13, fontWeight: '700', textAlign: 'center' },
  notice: { borderRadius: 14, borderWidth: 1, padding: spacing.sm },
  pressed: { opacity: 0.72 },
  scroll: {
    alignItems: 'center',
    flexGrow: 1,
    paddingBottom: spacing.xl,
    paddingHorizontal: 18,
    paddingTop: spacing.xxl,
  },
  separator: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm },
  separatorLine: { flex: 1, height: StyleSheet.hairlineWidth },
  separatorText: { flexShrink: 0 },
  status: { paddingHorizontal: spacing.xs },
  subtitle: {
    fontSize: 16,
    lineHeight: 22,
    maxWidth: 390,
    paddingHorizontal: spacing.lg,
    textAlign: 'center',
  },
  title: { fontSize: 28, lineHeight: 33, maxWidth: 390, textAlign: 'center' },
});
