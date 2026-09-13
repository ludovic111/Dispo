import type { TFunction } from 'i18next';
import { useTranslation } from 'react-i18next';
import { Alert, StyleSheet } from 'react-native';

import { AppText } from '@/components/ui/app-text';
import {
  moderatedMessageCopyKey,
  moderatedMessagePlaceholder,
  moderationErrorCode,
  moderationErrorCopyKey,
} from '@/features/moderation/moderation-model';
import { useDispoTheme } from '@/theme/theme-context';
import { tint } from '@/theme/tokens';

/** True when the server sanitised the message (flag or stored placeholder). */
export function isModeratedMessage(message: {
  moderated?: boolean | null | undefined;
  text: string;
}): boolean {
  return message.moderated === true || message.text === moderatedMessagePlaceholder;
}

/** Preview copy for a moderated message in conversation lists and quotes. */
export function moderatedPreview(t: TFunction): string {
  return t(moderatedMessageCopyKey);
}

/**
 * Corps d'une bulle dont le texte a été retiré par la modération : copie
 * traduite, en italique atténué, sans lien ni réaction.
 */
export function ModeratedMessageText({ mine }: { mine: boolean }) {
  const { t } = useTranslation();
  const { palette } = useDispoTheme();
  return (
    <AppText
      accessibilityLabel={t(moderatedMessageCopyKey)}
      color={mine ? tint(palette.accentInk, 0.7) : palette.muted}
      style={styles.moderated}
      variant="subheadline"
    >
      {t(moderatedMessageCopyKey)}
    </AppText>
  );
}

/**
 * Sending failed: a moderation / rate-limit code opens a system alert with the
 * dedicated copy (the user must read it), anything else stays inline in the
 * composer through `setInlineError`.
 */
export function reportSendFailure(
  error: unknown,
  t: TFunction,
  fallback: string,
  setInlineError: (message: string) => void,
): void {
  if (moderationErrorCode(error)) {
    Alert.alert(t('Message non envoyé'), t(moderationErrorCopyKey(error, fallback)));
    return;
  }
  setInlineError(fallback);
}

const styles = StyleSheet.create({
  // Italique de citation : le seul style de texte que `AppText` ne porte pas.
  moderated: { fontStyle: 'italic' },
});
