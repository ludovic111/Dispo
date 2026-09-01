import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { router } from 'expo-router';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { patchNotes } from './patch-notes-data';
import { normalizeMarketingVersion } from './settings-model';
import { markWhatsNewSeen } from './whats-new-storage';

import { AppText } from '@/components/ui/app-text';
import { Card } from '@/components/ui/card';
import { DispoButton } from '@/components/ui/pressable';
import { Screen, ScreenHeader } from '@/components/ui/screen';
import { HeaderAction } from '@/components/ui/section';
import { useDispoTheme } from '@/theme/theme-context';
import { radii, spacing } from '@/theme/tokens';

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
          action={<HeaderAction icon="close" label={t('Fermer')} onPress={close} />}
          title={t('Nouveautés')}
        />
        <View
          style={[
            styles.banner,
            { backgroundColor: `${palette.signal}1A`, borderColor: `${palette.signal}59` },
          ]}
        >
          <Ionicons color={palette.signal} name="chatbubble-ellipses" size={21} />
          <View style={styles.bannerCopy}>
            <AppText color={palette.signal} style={styles.bannerTitle} variant="subheadline">
              {t('Important — à lire')}
            </AppText>
            <AppText color={palette.muted} variant="caption">
              {t(
                "Cette mise à jour déplace des choses dans l'app. Une minute de lecture t'évitera de chercher.",
              )}
            </AppText>
          </View>
        </View>

        {note ? (
          <>
            <View style={styles.heading}>
              <AppText color={palette.bronze} variant="label">
                v{note.version}
              </AppText>
              <AppText variant="display">{t(note.title)}</AppText>
            </View>
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

        <Pressable
          accessibilityRole="button"
          onPress={() => router.push('/patch-notes' as never)}
          style={({ pressed }) => [styles.history, pressed && styles.pressed]}
        >
          <Ionicons color={palette.bronze} name="time-outline" size={16} />
          <AppText color={palette.bronze} style={styles.historyLabel} variant="caption">
            {t("Voir tout l'historique des versions")}
          </AppText>
        </Pressable>
        <DispoButton onPress={close}>{t("J'ai lu, c'est parti")}</DispoButton>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  banner: {
    alignItems: 'flex-start',
    borderRadius: radii.ticket,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.sm,
    padding: spacing.cluster,
  },
  bannerCopy: { flex: 1, gap: spacing.xxxs },
  bannerTitle: { fontWeight: '900' },
  content: {
    gap: spacing.md,
    paddingBottom: spacing.xxl,
    paddingHorizontal: spacing.gutter,
  },
  heading: { gap: spacing.tight },
  history: { alignItems: 'center', flexDirection: 'row', gap: spacing.xs, minHeight: 44 },
  historyLabel: { fontWeight: '800' },
  point: { alignItems: 'flex-start', flexDirection: 'row', gap: spacing.chip },
  pointCopy: { flex: 1 },
  points: { gap: spacing.section },
  pressed: { opacity: 0.94, transform: [{ scale: 0.97 }] },
});
