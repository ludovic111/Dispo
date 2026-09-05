import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import type { GroupMessage } from './group-model';

import { AppText } from '@/components/ui/app-text';
import { useDispoTheme } from '@/theme/theme-context';
import { spacing } from '@/theme/tokens';

export function GroupMessageQuote({
  message,
  loading = false,
  expanded = false,
  showSender = true,
}: {
  message: GroupMessage | null;
  loading?: boolean;
  expanded?: boolean;
  showSender?: boolean;
}) {
  const { palette } = useDispoTheme();
  const { t } = useTranslation();
  const preview = message?.deletedAt
    ? t('Message supprimé')
    : message?.text ||
      message?.attachmentName ||
      (loading ? t('Chargement du message…') : t('Message indisponible'));
  return (
    <View style={[styles.quote, { backgroundColor: palette.inset, borderColor: palette.electric }]}>
      {message && showSender ? (
        <AppText color={palette.electric} numberOfLines={1} variant="caption">
          {message.senderName}
        </AppText>
      ) : null}
      <AppText color={palette.muted} numberOfLines={expanded ? undefined : 2} variant="caption">
        {preview}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  quote: {
    borderLeftWidth: 3,
    borderRadius: 6,
    gap: spacing.xxs,
    paddingHorizontal: spacing.xs,
    paddingVertical: spacing.xs,
  },
});
