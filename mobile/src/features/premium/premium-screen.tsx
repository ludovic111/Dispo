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
import { RaisedIconWell } from '@/features/settings/settings-components';
import { useDispoTheme } from '@/theme/theme-context';
import {
  elevation,
  gradientsFor,
  keyHighlight,
  minimumTouchTarget,
  radii,
  spacing,
  tint,
} from '@/theme/tokens';

const perks = [
  {
    icon: 'musical-notes' as const,
    title: 'Ton répertoire personnel',
    text: 'Retrouve les morceaux de tes groupes, ajoute les tiens et suis ta maîtrise. Partage ton répertoire ou garde-le privé.',
  },
  {
    icon: 'people' as const,
    text: 'Centralise les membres, répertoires, setlists et événements de chacun de tes projets.',
    title: "Crée jusqu'à 6 groupes",
  },
  {
    icon: 'albums' as const,
    text: 'Construis un portfolio qui montre plusieurs styles, formations et facettes de ton jeu.',
    title: "Présente jusqu'à 6 vidéos de 1 min 30",
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

          <Card padding={0} tone="elevated">
            {perks.map((perk, index) => (
              <View key={perk.icon}>
                <View accessible style={styles.perkRow}>
                  <RaisedIconWell icon={perk.icon} shape="square" />
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
            <FreeLine
              icon="options"
              text={t('Filtres avancés, dates récurrentes, rappels et Auto-SOS')}
            />
            <FreeLine icon="people" text={t("Groupes d'atelier de ton école")} />
          </View>
        </Card>
      </ScrollView>
    </Screen>
  );
}

function PremiumHero() {
  const { t } = useTranslation();
  const { palette } = useDispoTheme();
  const ink = palette.accentInk;

  return (
    <View style={[styles.heroShadow, elevation(2, palette)]}>
      <LinearGradient
        accessible
        colors={gradientsFor(palette).hero}
        end={{ x: 1, y: 1 }}
        start={{ x: 0, y: 0 }}
        style={[styles.hero, { borderColor: palette.accentDeep }]}
      >
        <View
          pointerEvents="none"
          style={[styles.heroHighlight, { backgroundColor: keyHighlight }]}
        />
        <View style={styles.heroLabel}>
          <FontAwesome6 color={tint(ink, 0.82)} name="crown" size={12} />
          <AppText color={tint(ink, 0.82)} engraved={false} variant="label">
            {t('DISPO PREMIUM')}
          </AppText>
        </View>

        <AppText color={ink} variant="display">
          {t("Plus de musique.\nMoins d'organisation.")}
        </AppText>

        <AppText color={tint(ink, 0.78)} style={styles.heroSubtitle} variant="subheadline">
          {t('Des outils pour faire avancer tes projets sans alourdir les échanges.')}
        </AppText>
      </LinearGradient>
    </View>
  );
}

function FreeLine({
  icon,
  text,
}: {
  icon: 'business' | 'options' | 'people' | 'shield-checkmark';
  text: string;
}) {
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
    borderWidth: StyleSheet.hairlineWidth,
    gap: spacing.sm,
    overflow: 'hidden',
    padding: spacing.xl,
  },
  heroHighlight: {
    height: 1,
    left: radii.feature,
    position: 'absolute',
    right: radii.feature,
    top: 0,
  },
  heroShadow: { borderRadius: radii.feature },
  heroLabel: { alignItems: 'center', flexDirection: 'row', gap: spacing.tight },
  heroSubtitle: { maxWidth: 300 },
  perkCopy: { flex: 1, gap: spacing.xxs },
  perkRow: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: spacing.sm,
    padding: spacing.sm,
  },
  section: { gap: spacing.sm },
});
