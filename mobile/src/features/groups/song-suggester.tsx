import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { resolveSongSuggester, type GroupMember } from './group-model';

import { AppText } from '@/components/ui/app-text';
import { Avatar } from '@/components/ui/avatar';
import { useDispoTheme } from '@/theme/theme-context';
import { spacing } from '@/theme/tokens';

/** « Suggéré par X » : avatar + nom résolus contre les membres du groupe. */
export function SongSuggesterLine({
  members,
  size = 20,
  suggestedBy,
}: {
  members: readonly GroupMember[];
  size?: number;
  suggestedBy: string;
}) {
  const { t } = useTranslation();
  const { palette } = useDispoTheme();
  const suggester = resolveSongSuggester(suggestedBy, members);
  if (!suggester) return null;
  return (
    <View accessibilityRole="text" style={styles.row}>
      <Avatar name={suggester.name} size={size} uri={suggester.photoUrl} />
      <AppText color={palette.muted} numberOfLines={1} style={styles.flex} variant="caption">
        {t('Suggéré par {{name}}', { name: suggester.name })}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  row: { alignItems: 'center', flexDirection: 'row', gap: spacing.tight },
});
