import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { router } from 'expo-router';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, StyleSheet, View } from 'react-native';

import { patchNotes } from './patch-notes-data';
import { normalizeMarketingVersion } from './settings-model';
import { markWhatsNewSeen } from './whats-new-storage';

import { AppText } from '@/components/ui/app-text';
import { Card } from '@/components/ui/card';
import { DispoButton, IconButton } from '@/components/ui/pressable';
import { Screen, ScreenHeader } from '@/components/ui/screen';
import { SectionHeader } from '@/components/ui/section';
import { useDispoTheme } from '@/theme/theme-context';
import { radii, spacing, tint } from '@/theme/tokens';

export function WhatsNewScreen() {
  const { t } = useTranslation();
  const { palette } = useDispoTheme();
  const version = normalizeMarketingVersion(Constants.expoConfig?.version ?? '2.4');
  const note = patchNotes.find((item) => item.version === version);

  useEffect(
    () => () => {
      void markWhatsNewSeen(version);
    },
    [version],
  );

  const close = () => {
    void markWhatsNewSeen(version).finally(() => router.replace('/(tabs)'));
  };

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <ScreenHeader
          action={<IconButton accessibilityLabel={t('Fermer')} icon="close" onPress={close} />}
          inset={false}
          title={t('Nouveautés')}
        />
        <View
          style={[
            styles.banner,
            { backgroundColor: tint(palette.signal, 0.1), borderColor: tint(palette.signal, 0.35) },
          ]}
        >
          <Ionicons color={palette.signal} name="chatbubble-ellipses" size={21} />
          <View style={styles.bannerCopy}>
            <AppText color={palette.signal} variant="subheadline" weight="bold">
              {t('Important — à lire')}
            </AppText>
            <AppText color={palette.muted} variant="footnote">
              {t(
                "Cette mise à jour déplace des choses dans l'app. Une minute de lecture t'évitera de chercher.",
              )}
            </AppText>
          </View>
        </View>

        {note ? (
          <>
            <SectionHeader subtitle={`v${note.version}`} title={t(note.title)} />
            <Card style={styles.points}>
              {note.points.map((point) => (
                <View key={point} style={styles.point}>
                  <Ionicons color={palette.bronze} name="sparkles" size={12} />
                  <AppText style={styles.pointCopy} variant="subheadline">
                    {t(point)}
                  </AppText>
                </View>
              ))}
            </Card>
          </>
        ) : null}

        <DispoButton
          icon="time-outline"
          onPress={() => router.push('/patch-notes' as never)}
          size="compact"
          variant="ghost"
        >
          {t("Voir tout l'historique des versions")}
        </DispoButton>
        <DispoButton onPress={close}>{t("J'ai lu, c'est parti")}</DispoButton>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  banner: {
    alignItems: 'flex-start',
    borderRadius: radii.card,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.sm,
    padding: spacing.sm,
  },
  bannerCopy: { flex: 1, gap: spacing.xxs },
  content: {
    gap: spacing.md,
    paddingBottom: spacing.xxl,
    paddingHorizontal: spacing.gutter,
  },
  point: { alignItems: 'flex-start', flexDirection: 'row', gap: spacing.xs },
  pointCopy: { flex: 1 },
  points: { gap: spacing.sm },
});
