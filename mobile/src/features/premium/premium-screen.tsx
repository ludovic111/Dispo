import { FontAwesome6, Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppText } from '@/components/ui/app-text';
import { Card } from '@/components/ui/card';
import { DispoBackground } from '@/components/ui/dispo-background';
import { SectionHeader } from '@/components/ui/section';
import { useDispoTheme } from '@/theme/theme-context';
import { gradients, spacing, typography } from '@/theme/tokens';

const billetPaper = '#F0F4FF';

const perks = [
  {
    icon: 'people' as const,
    text: 'Centralise les membres, répertoires, setlists et événements de chacun de tes projets.',
    title: 'Dirige plusieurs groupes',
  },
  {
    icon: 'options' as const,
    text: 'Combine les filtres avancés pour trouver plus vite les profils qui correspondent à ton projet.',
    title: 'Affûte tes recherches',
  },
  {
    icon: 'calendar' as const,
    text: "Événements récurrents, rappels configurables et recherche automatique d'un remplaçant en cas de désistement.",
    title: "Automatise l'organisation",
  },
  {
    icon: 'albums' as const,
    text: 'Construis un portfolio qui montre plusieurs styles, formations et facettes de ton jeu.',
    title: "Présente jusqu'à 6 vidéos",
  },
] as const;

export function PremiumScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const { dark, palette } = useDispoTheme();

  function close() {
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.replace('/(tabs)/profile');
  }

  return (
    <DispoBackground>
      <SafeAreaView edges={['top', 'bottom']} style={styles.safeArea}>
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <PremiumHero />

          <Card accessible accessibilityRole="summary" style={styles.betaCard}>
            <View style={styles.betaRow}>
              <View style={[styles.betaIcon, { backgroundColor: `${palette.electric}1F` }]}>
                <Ionicons color={palette.electric} name="checkmark-circle" size={24} />
              </View>
              <View style={styles.betaCopy}>
                <AppText variant="headline">{t('Premium est inclus dans cette bêta')}</AppText>
                <AppText color={palette.muted} variant="callout">
                  {t(
                    "Aucun abonnement n'est proposé à la vente. Aucun achat ni débit ne peut être effectué depuis cette version.",
                  )}
                </AppText>
              </View>
            </View>
          </Card>

          <View style={styles.section}>
            <SectionHeader
              subtitle={t('Quatre outils concrets, sans limiter le cœur du réseau')}
              title={t('Premium te rend du temps')}
            />

            <Card padding={0}>
              {perks.map((perk, index) => (
                <View key={perk.icon}>
                  <View accessible style={styles.perkRow}>
                    <View style={[styles.perkIcon, { backgroundColor: `${palette.electric}1F` }]}>
                      <Ionicons color={palette.electric} name={perk.icon} size={18} />
                    </View>
                    <View style={styles.perkCopy}>
                      <AppText style={styles.perkTitle} variant="subheadline">
                        {t(perk.title)}
                      </AppText>
                      <AppText color={palette.muted} variant="caption">
                        {t(perk.text)}
                      </AppText>
                    </View>
                  </View>
                  {index < perks.length - 1 ? (
                    <View style={[styles.divider, { backgroundColor: palette.border }]} />
                  ) : null}
                </View>
              ))}
            </Card>
          </View>

          <Card>
            <View accessible style={styles.freeFoundations}>
              <View style={styles.freeHeading}>
                <Ionicons color={palette.electric} name="lock-open" size={15} />
                <AppText color={palette.electric} style={styles.freeTitle} variant="subheadline">
                  {t('Toujours gratuit')}
                </AppText>
              </View>

              <AppText color={palette.muted} variant="caption">
                {t("Premium n'achète ni l'accès au réseau ni ta sécurité.")}
              </AppText>

              <FreeLine icon="business" text={t("Affiliation et communautés d'école")} />
              <FreeLine
                icon="shield-checkmark"
                text={t('Accès aux SOS, adresse protégée, blocage et signalement')}
              />
            </View>
          </Card>
        </ScrollView>

        <Pressable
          accessibilityLabel={t('Fermer Premium')}
          accessibilityRole="button"
          onPress={close}
          style={({ pressed }) => [styles.closeButton, pressed && styles.closePressed]}
        >
          <BlurView intensity={72} style={StyleSheet.absoluteFill} tint={dark ? 'dark' : 'light'} />
          <View style={[styles.closeBorder, { borderColor: palette.border }]} />
          <Ionicons color={palette.text} name="close" size={20} />
        </Pressable>
      </SafeAreaView>
    </DispoBackground>
  );
}

function PremiumHero() {
  const { t } = useTranslation();

  return (
    <LinearGradient
      accessible
      colors={gradients.premium}
      end={{ x: 1, y: 1 }}
      start={{ x: 0, y: 0 }}
      style={styles.hero}
    >
      <Ionicons
        color="rgba(240,244,255,0.08)"
        name="musical-note"
        size={118}
        style={styles.heroWatermark}
      />

      <View style={styles.heroContent}>
        <View style={styles.heroLabel}>
          <FontAwesome6 color="rgba(240,244,255,0.82)" name="crown" size={12} />
          <AppText color="rgba(240,244,255,0.82)" style={styles.heroEyebrow}>
            {t('DISPO PREMIUM')}
          </AppText>
        </View>

        <AppText color={billetPaper} style={styles.heroTitle} variant="display">
          {t("Plus de musique.\nMoins d'organisation.")}
        </AppText>

        <AppText color="rgba(240,244,255,0.78)" style={styles.heroSubtitle}>
          {t('Des outils pour faire avancer tes projets sans alourdir les échanges.')}
        </AppText>
      </View>
    </LinearGradient>
  );
}

function FreeLine({ icon, text }: { icon: 'business' | 'shield-checkmark'; text: string }) {
  const { palette } = useDispoTheme();
  return (
    <View style={styles.freeLine}>
      <Ionicons color={palette.electric} name={icon} size={13} style={styles.freeLineIcon} />
      <AppText style={styles.freeLineText} variant="caption">
        {text}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  betaCard: { padding: spacing.md },
  betaCopy: { flex: 1, gap: spacing.compact },
  betaIcon: {
    alignItems: 'center',
    borderRadius: 13,
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  betaRow: { alignItems: 'flex-start', flexDirection: 'row', gap: 13 },
  closeBorder: {
    bottom: 0,
    borderRadius: 22,
    borderWidth: StyleSheet.hairlineWidth,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  closeButton: {
    alignItems: 'center',
    borderRadius: 22,
    height: 44,
    justifyContent: 'center',
    overflow: 'hidden',
    position: 'absolute',
    right: 12,
    top: 12,
    width: 44,
    zIndex: 2,
  },
  closePressed: { opacity: 0.94, transform: [{ scale: 0.97 }] },
  content: {
    gap: spacing.lg,
    paddingBottom: spacing.xxl,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
  },
  divider: { height: StyleSheet.hairlineWidth, marginLeft: 70 },
  freeFoundations: { alignItems: 'stretch', gap: spacing.section },
  freeHeading: { alignItems: 'center', flexDirection: 'row', gap: 7 },
  freeLine: { alignItems: 'flex-start', flexDirection: 'row', gap: spacing.chip },
  freeLineIcon: { textAlign: 'center', width: 18 },
  freeLineText: { flex: 1, fontWeight: '600' },
  freeTitle: { fontWeight: '800' },
  hero: {
    borderColor: 'rgba(240,244,255,0.14)',
    borderRadius: 28,
    borderWidth: 1,
    marginTop: spacing.xs,
    overflow: 'hidden',
  },
  heroContent: {
    alignItems: 'flex-start',
    gap: spacing.sm,
    paddingBottom: 26,
    paddingHorizontal: 22,
    paddingTop: 30,
  },
  heroEyebrow: {
    fontFamily: typography.monoSemibold,
    fontSize: 11,
    letterSpacing: 1.6,
    lineHeight: 15,
  },
  heroLabel: { alignItems: 'center', flexDirection: 'row', gap: 7 },
  heroSubtitle: { fontSize: 15, fontWeight: '500', lineHeight: 20, maxWidth: 300 },
  heroTitle: { fontSize: 30, lineHeight: 34 },
  heroWatermark: {
    bottom: -20,
    position: 'absolute',
    right: -18,
    transform: [{ rotate: '-9deg' }],
  },
  perkCopy: { flex: 1, gap: spacing.xxxs },
  perkIcon: {
    alignItems: 'center',
    borderRadius: spacing.sm,
    height: 42,
    justifyContent: 'center',
    width: 42,
  },
  perkRow: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: spacing.cluster,
    paddingHorizontal: spacing.cluster,
    paddingVertical: 13,
  },
  perkTitle: { fontWeight: '700' },
  safeArea: { flex: 1 },
  section: { gap: spacing.control },
});
