import { Ionicons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import {
  formatAttachmentBytes,
  type MessageAttachment,
  type PendingMessageAttachment,
} from './message-model';

import { AppText } from '@/components/ui/app-text';
import { useDispoTheme } from '@/theme/theme-context';
import { spacing } from '@/theme/tokens';

function attachmentIcon(
  contentType: string,
  fileName: string,
): ComponentProps<typeof Ionicons>['name'] {
  if (contentType.startsWith('image/')) return 'image';
  if (contentType.startsWith('video/')) return 'videocam';
  const extension = fileName.split('.').pop()?.toLowerCase();
  if (extension === 'pdf') return 'document-text';
  if (['mid', 'midi', 'musicxml', 'mxl', 'xml'].includes(extension ?? '')) return 'musical-notes';
  return 'document';
}

export function PendingAttachmentChip({
  attachment,
  onRemove,
}: {
  attachment: PendingMessageAttachment;
  onRemove: () => void;
}) {
  const { palette } = useDispoTheme();
  const { i18n, t } = useTranslation();
  const locale = i18n.resolvedLanguage ?? i18n.language ?? 'fr';
  return (
    <View
      style={[
        styles.draft,
        { backgroundColor: palette.card, borderColor: `${palette.electric}3D` },
      ]}
    >
      <View style={[styles.draftIcon, { backgroundColor: `${palette.electric}1F` }]}>
        <Ionicons
          color={palette.electric}
          name={attachmentIcon(attachment.contentType, attachment.fileName)}
          size={16}
        />
      </View>
      <View style={styles.copy}>
        <AppText numberOfLines={1} style={styles.fileName} variant="caption">
          {attachment.fileName}
        </AppText>
        <AppText color={palette.muted} variant="caption2">
          {formatAttachmentBytes(attachment.byteCount, locale)}
        </AppText>
      </View>
      <Pressable
        accessibilityLabel={t('Retirer le fichier')}
        accessibilityRole="button"
        hitSlop={8}
        onPress={onRemove}
        style={({ pressed }) => pressed && styles.pressed}
      >
        <Ionicons color={palette.muted} name="close-circle" size={21} />
      </Pressable>
    </View>
  );
}

export function MessageAttachmentCard({
  attachment,
  isLoading,
  onOpen,
}: {
  attachment: MessageAttachment;
  isLoading: boolean;
  onOpen: () => void;
}) {
  const { palette } = useDispoTheme();
  const { i18n, t } = useTranslation();
  const locale = i18n.resolvedLanguage ?? i18n.language ?? 'fr';
  return (
    <Pressable
      accessibilityLabel={`${t('Ouvrir le fichier')} ${attachment.fileName}`}
      accessibilityRole="button"
      disabled={isLoading}
      onPress={onOpen}
      style={({ pressed }) => [
        styles.card,
        {
          backgroundColor: palette.inset,
          borderColor: `${palette.electric}38`,
        },
        pressed && styles.pressed,
      ]}
    >
      <View style={[styles.cardIcon, { backgroundColor: `${palette.electric}24` }]}>
        {isLoading ? (
          <ActivityIndicator color={palette.electric} size="small" />
        ) : (
          <Ionicons
            color={palette.electric}
            name={attachmentIcon(attachment.contentType, attachment.fileName)}
            size={17}
          />
        )}
      </View>
      <View style={styles.copy}>
        <AppText color={palette.text} numberOfLines={2} style={styles.fileName} variant="caption">
          {attachment.fileName}
        </AppText>
        <AppText color={palette.muted} variant="caption2">
          {formatAttachmentBytes(attachment.byteCount, locale)}
        </AppText>
      </View>
      <Ionicons color={palette.electric} name="eye-outline" size={16} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    alignItems: 'center',
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.control,
    minWidth: 210,
    padding: spacing.control,
  },
  cardIcon: {
    alignItems: 'center',
    borderRadius: 10,
    height: 38,
    justifyContent: 'center',
    width: 38,
  },
  copy: { flex: 1 },
  draft: {
    alignItems: 'center',
    borderRadius: 13,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.control,
    padding: spacing.chip,
  },
  draftIcon: {
    alignItems: 'center',
    borderRadius: 9,
    height: 30,
    justifyContent: 'center',
    width: 30,
  },
  fileName: { fontWeight: '700' },
  pressed: { opacity: 0.72, transform: [{ scale: 0.98 }] },
});
