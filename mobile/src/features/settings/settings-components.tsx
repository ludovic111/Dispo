import { Ionicons } from '@expo/vector-icons';
import type { ComponentProps, PropsWithChildren, ReactNode } from 'react';
import { ScrollView, StyleSheet, Switch, View } from 'react-native';

import { AppText } from '@/components/ui/app-text';
import { Card } from '@/components/ui/card';
import { ListRow } from '@/components/ui/list-row';
import { Screen } from '@/components/ui/screen';
import { useDispoTheme } from '@/theme/theme-context';
import { minimumTouchTarget, radii, spacing, surfaceStyle, tint } from '@/theme/tokens';

/** Largeur du puits d'icône de `ListRow`, pour aligner les séparateurs sur le texte. */
const iconWellWidth = 44;

export function SettingsShell({
  children,
  nativeHeader = false,
}: PropsWithChildren<{ nativeHeader?: boolean }>) {
  return (
    <Screen nativeHeader={nativeHeader}>
      <ScrollView contentContainerStyle={styles.shell} showsVerticalScrollIndicator={false}>
        {children}
      </ScrollView>
    </Screen>
  );
}

/** Titre de groupe de réglages : étiquette gravée dans le papier, jamais un titre éditorial. */
export function SettingsGroupTitle({ title }: { title: string }) {
  const { palette } = useDispoTheme();
  return (
    <AppText
      accessibilityRole="header"
      color={palette.bronze}
      style={styles.groupTitle}
      variant="label"
    >
      {title}
    </AppText>
  );
}

/**
 * Section de réglages façon liste groupée iOS : étiquette gravée, groupe en
 * creux dans la surface, note de bas de section.
 */
export function SettingsSection({
  children,
  footer,
  title,
}: PropsWithChildren<{ footer?: string; title?: string }>) {
  const { palette } = useDispoTheme();
  return (
    <View style={styles.section}>
      {title ? <SettingsGroupTitle title={title} /> : null}
      <Card padding={0} style={styles.sectionCard} tone="inset">
        {children}
      </Card>
      {footer ? (
        <AppText color={palette.muted} style={styles.sectionFooter} variant="caption">
          {footer}
        </AppText>
      ) : null}
    </View>
  );
}

export function SettingsDivider() {
  const { palette } = useDispoTheme();
  return <View style={[styles.divider, { backgroundColor: palette.border }]} />;
}

interface SettingsRowProps {
  accessibilityLabel?: string;
  color: string;
  detail?: string;
  icon: ComponentProps<typeof Ionicons>['name'];
  onPress?: () => void;
  right?: ReactNode;
  title: string;
}

/** Ligne de réglage : `ListRow` groupée avec un puits d'icône coloré. */
export function SettingsRow({
  accessibilityLabel,
  color,
  detail,
  icon,
  onPress,
  right,
  title,
}: SettingsRowProps) {
  return (
    <View style={styles.rowInset}>
      <ListRow
        leadingIcon={icon}
        leadingIconColor={color}
        title={title}
        tone="plain"
        {...(accessibilityLabel === undefined ? {} : { accessibilityLabel })}
        {...(detail === undefined ? {} : { subtitle: detail })}
        {...(onPress === undefined ? {} : { onPress })}
        {...(right === undefined ? {} : { accessory: right })}
      />
    </View>
  );
}

export function SettingsSwitchRow({
  color,
  detail,
  icon,
  onValueChange,
  title,
  value,
}: Omit<SettingsRowProps, 'onPress' | 'right'> & {
  onValueChange: (enabled: boolean) => void;
  value: boolean;
}) {
  return (
    <SettingsRow
      color={color}
      icon={icon}
      right={
        <Switch
          accessibilityLabel={title}
          onValueChange={onValueChange}
          trackColor={{ true: color }}
          value={value}
        />
      }
      title={title}
      {...(detail === undefined ? {} : { detail })}
    />
  );
}

/** Accessoire « valeur + chevron » d'une ligne qui ouvre un écran. */
export function SettingsValueAccessory({
  icon = 'chevron-forward',
  value,
}: {
  icon?: ComponentProps<typeof Ionicons>['name'];
  value?: string;
}) {
  const { palette } = useDispoTheme();
  return (
    <View style={styles.valueAccessory}>
      {value ? (
        <AppText color={palette.muted} numberOfLines={1} variant="footnote">
          {value}
        </AppText>
      ) : null}
      <Ionicons color={palette.muted} name={icon} size={18} />
    </View>
  );
}

export function SelectionDot({ active, color }: { active: boolean; color: string }) {
  const { palette } = useDispoTheme();
  return (
    <Ionicons
      color={active ? color : palette.muted}
      name={active ? 'checkmark-circle' : 'ellipse-outline'}
      size={21}
    />
  );
}

/**
 * Puits d'icône relevé : une petite surface « Backstage » (dégradé, liseré,
 * arête, ombre de carte) qui porte une icône. Sert aux en-têtes d'écran, aux
 * étapes d'onboarding et aux listes d'avantages.
 */
export function RaisedIconWell({
  color,
  icon,
  shape = 'round',
  size = 'regular',
}: {
  color?: string | undefined;
  icon: ComponentProps<typeof Ionicons>['name'];
  /** `round` : pastille · `square` : coins de contrôle. */
  shape?: 'round' | 'square' | undefined;
  /** `regular` : 44 pt · `large` : 64 pt (têtes d'étape). */
  size?: 'regular' | 'large' | undefined;
}) {
  const { palette } = useDispoTheme();
  const surface = surfaceStyle(palette, 'elevated');
  const side = size === 'large' ? 64 : minimumTouchTarget;
  return (
    <View
      style={[
        styles.iconWell,
        surface.container,
        {
          borderRadius: shape === 'round' ? radii.round : radii.sm,
          height: side,
          width: side,
        },
      ]}
    >
      {surface.highlight && shape === 'square' ? (
        <View
          pointerEvents="none"
          style={[surface.highlight, { left: radii.sm, right: radii.sm }]}
        />
      ) : null}
      <Ionicons color={color ?? palette.electric} name={icon} size={size === 'large' ? 26 : 20} />
    </View>
  );
}

/**
 * Bandeau d'état des écrans de réglages et de compte : une seule forme.
 * `error` (défaut) pour ce qui a échoué, `warning` pour ce qui demande une
 * lecture ou une action, `info` pour une confirmation.
 */
export function SettingsErrorBanner({
  text,
  tone = 'error',
}: {
  text: string | null;
  tone?: 'error' | 'info' | 'warning' | undefined;
}) {
  const { palette } = useDispoTheme();
  if (!text) return null;
  const color =
    tone === 'warning' ? palette.warning : tone === 'info' ? palette.electric : palette.error;
  return (
    <Card
      accessibilityRole="alert"
      padding={spacing.sm}
      style={[styles.banner, { backgroundColor: tint(color, 0.1), borderColor: tint(color, 0.33) }]}
      tone="muted"
    >
      <View style={styles.bannerRow}>
        <Ionicons
          color={color}
          name={tone === 'info' ? 'information-circle' : 'warning'}
          size={17}
        />
        <AppText color={color} style={styles.bannerCopy} variant="footnote">
          {text}
        </AppText>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  banner: { alignSelf: 'stretch' },
  bannerCopy: { flex: 1 },
  bannerRow: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm },
  divider: { height: StyleSheet.hairlineWidth, marginLeft: spacing.sm * 2 + iconWellWidth },
  groupTitle: { paddingHorizontal: spacing.xs },
  iconWell: { alignItems: 'center', justifyContent: 'center' },
  rowInset: { paddingHorizontal: spacing.sm },
  section: { gap: spacing.xs },
  sectionCard: { overflow: 'hidden' },
  sectionFooter: { paddingHorizontal: spacing.xs },
  shell: {
    gap: spacing.lg,
    paddingBottom: spacing.xxl,
    paddingHorizontal: spacing.gutter,
    paddingTop: spacing.sm,
  },
  valueAccessory: {
    alignItems: 'center',
    flexDirection: 'row',
    flexShrink: 1,
    gap: spacing.tight,
    maxWidth: '55%',
  },
});
