import { Ionicons } from '@expo/vector-icons';
import type { PropsWithChildren, ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, StyleSheet, Switch, View } from 'react-native';

import { AppText } from '@/components/ui/app-text';
import { Screen } from '@/components/ui/screen';
import { useDispoTheme } from '@/theme/theme-context';
import { radii, spacing } from '@/theme/tokens';

export function SettingsShell({ children }: PropsWithChildren) {
  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.shell} showsVerticalScrollIndicator={false}>
        {children}
      </ScrollView>
    </Screen>
  );
}

export function SheetHeader({ onClose, title }: { onClose: () => void; title: string }) {
  const { palette } = useDispoTheme();
  const { t } = useTranslation();
  return (
    <View style={styles.header}>
      <View style={styles.headerSpacer} />
      <AppText style={styles.headerTitle}>{title}</AppText>
      <Pressable
        accessibilityRole="button"
        onPress={onClose}
        style={({ pressed }) => [styles.doneButton, pressed && styles.pressed]}
      >
        <AppText color={palette.electric} style={styles.doneText}>
          {t('OK')}
        </AppText>
      </Pressable>
    </View>
  );
}

export function SettingsSection({
  children,
  footer,
  title,
}: PropsWithChildren<{ footer?: string; title?: string }>) {
  const { palette } = useDispoTheme();
  return (
    <View style={styles.section}>
      {title ? (
        <AppText color={palette.muted} style={styles.sectionTitle} variant="label">
          {title}
        </AppText>
      ) : null}
      <View
        style={[styles.sectionCard, { backgroundColor: palette.card, borderColor: palette.border }]}
      >
        {children}
      </View>
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

export function IconBadge({
  color,
  icon,
}: {
  color: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
}) {
  return (
    <View style={[styles.iconBadge, { backgroundColor: `${color}20` }]}>
      <Ionicons color={color} name={icon} size={15} />
    </View>
  );
}

interface SettingsRowProps {
  accessibilityLabel?: string;
  color: string;
  detail?: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
  onPress?: () => void;
  right?: ReactNode;
  title: string;
}

export function SettingsRow({
  accessibilityLabel,
  color,
  detail,
  icon,
  onPress,
  right,
  title,
}: SettingsRowProps) {
  const { palette } = useDispoTheme();
  const content = (
    <>
      <IconBadge color={color} icon={icon} />
      <View style={styles.rowCopy}>
        <AppText style={styles.rowTitle}>{title}</AppText>
        {detail ? (
          <AppText color={palette.muted} style={styles.rowDetail} variant="caption">
            {detail}
          </AppText>
        ) : null}
      </View>
      {right ??
        (onPress ? <Ionicons color={palette.muted} name="chevron-forward" size={16} /> : null)}
    </>
  );
  if (!onPress) return <View style={styles.row}>{content}</View>;
  return (
    <Pressable
      accessibilityLabel={accessibilityLabel ?? title}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
    >
      {content}
    </Pressable>
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

const styles = StyleSheet.create({
  divider: { height: StyleSheet.hairlineWidth, marginLeft: 58 },
  doneButton: { alignItems: 'flex-end', minWidth: 48, paddingVertical: spacing.xs },
  doneText: { fontSize: 16, fontWeight: '800' },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingBottom: spacing.sm,
  },
  headerSpacer: { minWidth: 48 },
  headerTitle: { fontSize: 17, fontWeight: '900' },
  iconBadge: {
    alignItems: 'center',
    borderRadius: 8,
    height: 30,
    justifyContent: 'center',
    width: 30,
  },
  pressed: { opacity: 0.72 },
  row: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
    minHeight: 54,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  rowCopy: { flex: 1, gap: 2 },
  rowDetail: { lineHeight: 16 },
  rowTitle: { fontSize: 15, fontWeight: '600', lineHeight: 20 },
  section: { gap: 7 },
  sectionCard: {
    borderRadius: radii.ticket,
    borderWidth: 1,
    overflow: 'hidden',
  },
  sectionFooter: { lineHeight: 17, paddingHorizontal: 14 },
  sectionTitle: { paddingHorizontal: 14 },
  shell: { gap: spacing.lg, paddingBottom: spacing.xxl, paddingHorizontal: spacing.md },
});
