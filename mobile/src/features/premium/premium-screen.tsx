import { FontAwesome6, Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { ScrollView, StyleSheet, View } from 'react-native';

import { SubscriptionPlans } from './subscription-plans';

import { AppText } from '@/components/ui/app-text';
import { Card } from '@/components/ui/card';
import { IconButton } from '@/components/ui/pressable';
import { Screen, ScreenHeader } from '@/components/ui/screen';
import { SectionHeader } from '@/components/ui/section';
import { useDispoTheme } from '@/theme/theme-context';
import { gradients, minimumTouchTarget, onAccent, radii, spacing, tint } from '@/theme/tokens';

const perks = [
  {
    icon: 'musical-notes' as const,
    title: 'Ton répertoire personnel',
    text: 'Retrouve les morceaux de tes groupes, ajoute les tiens et suis ta maîtrise. Partage ton répertoire ou garde-le privé.',
  },
  {
    icon: 'people' as const,
    text: 'Centralise les membres, répertoires, setlists et événements de chacun de tes projets.',
    title: 'Crée des groupes sans limite',
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
  const { palette } = useDispoTheme();

  function close() {
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.replace('/(tabs)/profile');
  }

  return (
    <Screen>
      <ScreenHeader
        action={
          <IconButton accessibilityLabel={t('Fermer Premium')} icon="close" onPress={close} />
        }
        title={t('Abonnements')}
      />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <PremiumHero />

        <SubscriptionPlans />

        <View style={styles.section}>
          <SectionHeader
            subtitle={t('Des outils pour tes projets musicaux')}
            title={t('Premium te rend du temps')}
          />

          <Card padding={0}>
            {perks.map((perk, index) => (
              <View key={perk.icon}>
                <View accessible style={styles.perkRow}>
                  <View
                    style={[styles.perkIcon, { backgroundColor: tint(palette.electric, 0.12) }]}
                  >
                    <Ionicons color={palette.electric} name={perk.icon} size={18} />
                  </View>
                  <View style={styles.perkCopy}>
                    <AppText variant="subheadline" weight="semibold">
                      {t(perk.title)}
                    </AppText>
                    <AppText color={palette.muted} variant="footnote">
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
            <SectionHeader
              subtitle={t("Premium n'achète ni l'accès au réseau ni ta sécurité.")}
              title={t('Toujours gratuit')}
            />
            <FreeLine icon="business" text={t("Affiliation et communautés d'école")} />
            <FreeLine
              icon="shield-checkmark"
              text={t('Accès aux SOS, adresse protégée, blocage et signalement')}
            />
          </View>
        </Card>
      </ScrollView>
    </Screen>
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
      style={[styles.hero, { borderColor: tint(onAccent, 0.14) }]}
    >
      <View style={styles.heroLabel}>
        <FontAwesome6 color={tint(onAccent, 0.82)} name="crown" size={12} />
        <AppText color={tint(onAccent, 0.82)} variant="label">
          {t('DISPO PREMIUM')}
        </AppText>
      </View>

      <AppText color={onAccent} variant="display">
        {t("Plus de musique.\nMoins d'organisation.")}
      </AppText>

      <AppText color={tint(onAccent, 0.78)} style={styles.heroSubtitle} variant="subheadline">
        {t('Des outils pour faire avancer tes projets sans alourdir les échanges.')}
      </AppText>
    </LinearGradient>
  );
}

function FreeLine({ icon, text }: { icon: 'business' | 'shield-checkmark'; text: string }) {
  const { palette } = useDispoTheme();
  return (
    <View style={styles.freeLine}>
      <Ionicons color={palette.electric} name={icon} size={13} style={styles.freeLineIcon} />
      <AppText style={styles.freeLineText} variant="footnote">
        {text}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: spacing.lg,
    paddingBottom: spacing.xxl,
    paddingHorizontal: spacing.gutter,
    paddingTop: spacing.xs,
  },
  divider: { height: StyleSheet.hairlineWidth, marginLeft: spacing.sm * 2 + minimumTouchTarget },
  freeFoundations: { alignItems: 'stretch', gap: spacing.sm },
  freeLine: { alignItems: 'flex-start', flexDirection: 'row', gap: spacing.xs },
  freeLineIcon: { textAlign: 'center', width: 18 },
  freeLineText: { flex: 1 },
  hero: {
    alignItems: 'flex-start',
    borderRadius: radii.feature,
    borderWidth: 1,
    gap: spacing.sm,
    overflow: 'hidden',
    padding: spacing.xl,
  },
  heroLabel: { alignItems: 'center', flexDirection: 'row', gap: spacing.tight },
  heroSubtitle: { maxWidth: 300 },
  perkCopy: { flex: 1, gap: spacing.xxs },
  perkIcon: {
    alignItems: 'center',
    borderRadius: radii.sm,
    height: minimumTouchTarget,
    justifyContent: 'center',
    width: minimumTouchTarget,
  },
  perkRow: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: spacing.sm,
    padding: spacing.sm,
  },
  section: { gap: spacing.sm },
});
