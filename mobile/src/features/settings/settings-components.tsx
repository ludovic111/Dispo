import { Ionicons } from '@expo/vector-icons';
import type { ComponentProps, PropsWithChildren, ReactNode } from 'react';
import { ScrollView, StyleSheet, Switch, View } from 'react-native';

import { AppText } from '@/components/ui/app-text';
import { Card } from '@/components/ui/card';
import { ListRow } from '@/components/ui/list-row';
import { Screen } from '@/components/ui/screen';
import { SectionHeader } from '@/components/ui/section';
import { useDispoTheme } from '@/theme/theme-context';
import { radii, spacing, tint } from '@/theme/tokens';

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

/** Section de réglages : en-tête standard, carte groupée, note de bas de section. */
export function SettingsSection({
  children,
  footer,
  title,
}: PropsWithChildren<{ footer?: string; title?: string }>) {
  const { palette } = useDispoTheme();
  return (
    <View style={styles.section}>
      {title ? <SectionHeader title={title} /> : null}
      <Card padding={0} style={styles.sectionCard} tone="elevated">
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
      right={<Switch onValueChange={onValueChange} trackColor={{ true: color }} value={value} />}
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

/** Bandeau d'erreur des écrans de réglages : une seule forme. */
export function SettingsErrorBanner({ text }: { text: string | null }) {
  const { palette } = useDispoTheme();
  if (!text) return null;
  return (
    <View
      accessibilityRole="alert"
      style={[
        styles.errorBanner,
        { backgroundColor: tint(palette.signal, 0.1), borderColor: tint(palette.signal, 0.33) },
      ]}
    >
      <Ionicons color={palette.signal} name="warning" size={17} />
      <AppText color={palette.signal} style={styles.errorCopy} variant="footnote">
        {text}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  divider: { height: StyleSheet.hairlineWidth, marginLeft: spacing.sm * 2 + iconWellWidth },
  errorBanner: {
    alignItems: 'center',
    borderRadius: radii.card,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.sm,
    padding: spacing.sm,
  },
  errorCopy: { flex: 1 },
  rowInset: { paddingHorizontal: spacing.sm },
  section: { gap: spacing.xs },
  sectionCard: { overflow: 'hidden' },
  sectionFooter: { paddingHorizontal: spacing.sm },
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
