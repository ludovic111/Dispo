import { useTranslation } from 'react-i18next';
import { Alert, Linking, Pressable, StyleSheet, View } from 'react-native';

import { AppText } from './app-text';

import { privacyPage, termsPage } from '@/features/settings/settings-model';
import { useDispoTheme } from '@/theme/theme-context';

export function LegalLinks() {
  const { t, i18n } = useTranslation();
  const { palette } = useDispoTheme();
  const open = (url: string) =>
    void Linking.openURL(url).catch(() => Alert.alert(t('Ce lien n’a pas pu être ouvert.')));
  return (
    <View style={styles.links}>
      {[
        { label: 'Conditions d’utilisation', url: termsPage },
        { label: 'Confidentialité', url: privacyPage(i18n.resolvedLanguage ?? 'fr') },
        {
          label: 'Règles de la communauté',
          url: `https://dispoapp.net/support-${(i18n.resolvedLanguage ?? 'fr').startsWith('fr') ? 'fr' : 'en'}#community`,
        },
      ].map(({ label, url }) => (
        <Pressable
          accessibilityRole="link"
          key={label}
          onPress={() => open(url)}
          style={styles.link}
        >
          <AppText variant="caption" color={palette.electric} style={styles.text}>
            {t(label)}
          </AppText>
        </Pressable>
      ))}
    </View>
  );
}
const styles = StyleSheet.create({
  links: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 8 },
  link: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 8 },
  text: { textDecorationLine: 'underline', textAlign: 'center' },
});
