import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui/app-text';
import { ReceiptChecks } from '@/features/messages/message-controls';
import { useDispoTheme } from '@/theme/theme-context';
import { spacing } from '@/theme/tokens';

export function SongCommentMeta({ createdAt, isAuthor }: { createdAt: string; isAuthor: boolean }) {
  const { i18n } = useTranslation();
  const { palette } = useDispoTheme();
  const date = new Date(createdAt);
  const timestamp = Number.isNaN(date.getTime())
    ? null
    : new Intl.DateTimeFormat(i18n.resolvedLanguage || i18n.language || 'fr', {
        dateStyle: 'medium',
        timeStyle: 'short',
      }).format(date);

  return (
    <View style={styles.row}>
      {timestamp ? (
        <AppText color={palette.muted} variant="caption2">
          {timestamp}
        </AppText>
      ) : null}
      {isAuthor ? <ReceiptChecks receipt="sent" /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
});
