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
import { IconButton } from '@/components/ui/pressable';
import { useDispoTheme } from '@/theme/theme-context';
import { disabledStyle, pressedStyle, radii, spacing, tint } from '@/theme/tokens';

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
        { backgroundColor: palette.card, borderColor: tint(palette.electric, 0.24) },
      ]}
    >
      <View style={[styles.draftIcon, { backgroundColor: tint(palette.electric, 0.12) }]}>
        <Ionicons
          color={palette.electric}
          name={attachmentIcon(attachment.contentType, attachment.fileName)}
          size={16}
        />
      </View>
      <View style={styles.copy}>
        <AppText numberOfLines={1} variant="caption" weight="semibold">
          {attachment.fileName}
        </AppText>
        <AppText color={palette.muted} variant="caption2">
          {formatAttachmentBytes(attachment.byteCount, locale)}
        </AppText>
      </View>
      <IconButton
        accessibilityLabel={t('Retirer le fichier')}
        icon="close"
        iconColor={palette.muted}
        onPress={onRemove}
        variant="plain"
      />
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
      accessibilityState={{ busy: isLoading, disabled: isLoading }}
      disabled={isLoading}
      onPress={onOpen}
      style={({ pressed }) => [
        styles.card,
        { backgroundColor: palette.inset, borderColor: tint(palette.electric, 0.22) },
        pressed && pressedStyle,
        isLoading && disabledStyle,
      ]}
    >
      <View style={[styles.cardIcon, { backgroundColor: tint(palette.electric, 0.14) }]}>
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
        <AppText color={palette.text} numberOfLines={2} variant="caption" weight="semibold">
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
    borderRadius: radii.sm,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: spacing.sm,
    minWidth: 210,
    padding: spacing.sm,
  },
  cardIcon: {
    alignItems: 'center',
    borderRadius: radii.xs,
    height: 38,
    justifyContent: 'center',
    width: 38,
  },
  copy: { flex: 1 },
  draft: {
    alignItems: 'center',
    borderRadius: radii.sm,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: spacing.sm,
    paddingLeft: spacing.xs,
  },
  draftIcon: {
    alignItems: 'center',
    borderRadius: radii.xs,
    height: 30,
    justifyContent: 'center',
    width: 30,
  },
});
