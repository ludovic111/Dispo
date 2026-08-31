import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui/app-text';
import { BrandLogo } from '@/components/ui/brand';
import { Card } from '@/components/ui/card';
import { FormField } from '@/components/ui/form-field';
import { DispoButton } from '@/components/ui/pressable';
import { Screen } from '@/components/ui/screen';
import { useAuth } from '@/features/auth/auth-context';
import { updatePassword } from '@/features/auth/auth-service';
import { useDispoTheme } from '@/theme/theme-context';
import { spacing } from '@/theme/tokens';

export default function UpdatePasswordScreen() {
  const { t } = useTranslation();
  const { clearPasswordRecovery } = useAuth();
  const { palette } = useDispoTheme();
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [working, setWorking] = useState(false);

  const submit = async () => {
    if (working) return;
    if (password.length < 8) {
      setError(t('8 caractères minimum.'));
      return;
    }
    if (password !== confirmation) {
      setError(t('Les deux mots de passe ne correspondent pas.'));
      return;
    }
    setWorking(true);
    setError(null);
    try {
      await updatePassword(password);
      clearPasswordRecovery();
      router.replace('/');
    } catch {
      setError(t('Impossible de modifier le mot de passe — demande un nouveau lien.'));
    } finally {
      setWorking(false);
    }
  };

  return (
    <Screen>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.flex}
      >
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <View style={styles.content}>
            <BrandLogo markSize={44} />
            <View style={styles.heading}>
              <AppText style={styles.title} variant="display">
                {t('Nouveau mot de passe')}
              </AppText>
              <AppText color={palette.muted} style={styles.center} variant="subheadline">
                {t('Choisis un mot de passe d’au moins 8 caractères pour ton compte Dispo.')}
              </AppText>
            </View>
            <Card style={styles.card}>
              <FormField
                autoCapitalize="none"
                autoComplete="new-password"
                label={t('Mot de passe')}
                onChangeText={setPassword}
                onSubmitEditing={() => void submit()}
                returnKeyType="next"
                secureTextEntry
                textContentType="newPassword"
                value={password}
              />
              <FormField
                autoCapitalize="none"
                autoComplete="new-password"
                error={error ?? undefined}
                label={t('Confirmer')}
                onChangeText={setConfirmation}
                onSubmitEditing={() => void submit()}
                returnKeyType="done"
                secureTextEntry
                textContentType="newPassword"
                value={confirmation}
              />
              <DispoButton disabled={password.length < 8} loading={working} onPress={submit}>
                {t('Enregistrer')}
              </DispoButton>
            </Card>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing.cluster, width: '100%' },
  center: { textAlign: 'center' },
  content: { alignItems: 'center', gap: spacing.xl, maxWidth: 520, width: '100%' },
  flex: { flex: 1 },
  heading: { alignItems: 'center', gap: spacing.xs },
  scroll: {
    alignItems: 'center',
    flexGrow: 1,
    justifyContent: 'center',
    padding: spacing.gutter,
  },
  title: { fontSize: 27, lineHeight: 31, textAlign: 'center' },
});
