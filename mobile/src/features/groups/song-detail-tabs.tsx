import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui/app-text';
import { useDispoTheme } from '@/theme/theme-context';
import { spacing } from '@/theme/tokens';

export type SongDetailTab = 'info' | 'documents' | 'solos' | 'comments';

export function SongDetailTabs({
  selected,
  onSelect,
}: {
  selected: SongDetailTab;
  onSelect: (tab: SongDetailTab) => void;
}) {
  const { t } = useTranslation();
  const { palette } = useDispoTheme();
  const tabs = [
    { id: 'info', label: t('Infos') },
    { id: 'documents', label: t('Partitions') },
    { id: 'solos', label: t('Solos') },
    { id: 'comments', label: t('Commentaires') },
  ] as const;
  return (
    <View style={[styles.tabs, { borderBottomColor: palette.border }]}>
      {tabs.map(({ id, label }) => (
        <Pressable
          accessibilityRole="tab"
          accessibilityState={{ selected: id === selected }}
          key={id}
          onPress={() => onSelect(id)}
          style={[
            styles.tab,
            {
              backgroundColor: id === selected ? `${palette.electric}18` : 'transparent',
              borderBottomColor: id === selected ? palette.electric : 'transparent',
            },
          ]}
        >
          <AppText color={id === selected ? palette.electric : palette.muted} style={styles.label}>
            {label}
          </AppText>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  tabs: { flexDirection: 'row', paddingHorizontal: spacing.xs, borderBottomWidth: 1 },
  tab: {
    flex: 1,
    minHeight: 56,
    justifyContent: 'center',
    padding: spacing.xxs,
    borderBottomWidth: 3,
  },
  label: { textAlign: 'center', fontSize: 12, fontWeight: '800' },
});
