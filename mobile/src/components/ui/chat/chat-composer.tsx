import { Ionicons } from '@expo/vector-icons';
import type { ComponentProps, PropsWithChildren, RefObject } from 'react';
import { ActivityIndicator, StyleSheet, TextInput, View } from 'react-native';

import { AppText } from '../app-text';
import { Card } from '../card';
import { IconButton } from '../pressable';

import { useDispoTheme } from '@/theme/theme-context';
import { insetInputStyle, minimumTouchTarget, radii, spacing, typography } from '@/theme/tokens';

interface ChatComposerProps extends PropsWithChildren {
  accessibilityLabel: string;
  /** Désactive les boutons de pièce jointe (envoi en cours, édition…). */
  attachDisabled?: boolean | undefined;
  editable?: boolean | undefined;
  error?: string | null | undefined;
  inputRef?: RefObject<TextInput | null> | undefined;
  maxLength?: number | undefined;
  /** Bouton « Joindre un fichier » ; absent si non fourni. */
  onAttachFile?: { label: string; onPress: () => void } | undefined;
  /** Bouton « Joindre une photo ou une vidéo » ; absent si non fourni. */
  onAttachMedia?: { label: string; onPress: () => void } | undefined;
  onChangeText: (value: string) => void;
  onSend: () => void;
  /** Marge basse (zone sûre) sous la barre. */
  paddingBottom?: number | undefined;
  placeholder: string;
  /** Un import de pièce jointe est en cours : le bouton média affiche un indicateur. */
  preparingAttachment?: boolean | undefined;
  sendDisabled?: boolean | undefined;
  sendIcon?: ComponentProps<typeof Ionicons>['name'] | undefined;
  sendLabel: string;
  /** Envoi en cours : le bouton d'envoi affiche un indicateur. */
  sending?: boolean | undefined;
  value: string;
}

/**
 * Barre de saisie unique des conversations : pièces jointes à gauche, champ
 * multiligne, envoi à droite. Les bandeaux (réponse, édition, fichier en
 * attente) se passent en `children` et s'affichent au-dessus du champ.
 */
export function ChatComposer({
  accessibilityLabel,
  attachDisabled = false,
  children,
  editable = true,
  error,
  inputRef,
  maxLength,
  onAttachFile,
  onAttachMedia,
  onChangeText,
  onSend,
  paddingBottom = spacing.xs,
  placeholder,
  preparingAttachment = false,
  sendDisabled = false,
  sendIcon = 'arrow-up',
  sendLabel,
  sending = false,
  value,
}: ChatComposerProps) {
  const { palette } = useDispoTheme();
  return (
    <View
      style={[
        styles.shell,
        { backgroundColor: palette.background, borderTopColor: palette.edge, paddingBottom },
      ]}
    >
      {error ? (
        <AppText color={palette.error} style={styles.error} variant="caption">
          {error}
        </AppText>
      ) : null}
      {children}
      <View style={styles.row}>
        {onAttachMedia ? (
          preparingAttachment ? (
            <View style={styles.slot}>
              <ActivityIndicator color={palette.electric} size="small" />
            </View>
          ) : (
            <IconButton
              accessibilityLabel={onAttachMedia.label}
              disabled={attachDisabled}
              icon="images-outline"
              onPress={onAttachMedia.onPress}
              variant="plain"
            />
          )
        ) : null}
        {onAttachFile ? (
          <IconButton
            accessibilityLabel={onAttachFile.label}
            disabled={attachDisabled || preparingAttachment}
            icon="attach"
            onPress={onAttachFile.onPress}
            variant="plain"
          />
        ) : null}
        <TextInput
          accessibilityLabel={accessibilityLabel}
          editable={editable}
          maxLength={maxLength}
          multiline
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={palette.muted}
          ref={inputRef}
          selectionColor={palette.electric}
          style={[styles.input, insetInputStyle(palette), { color: palette.text }]}
          value={value}
        />
        {sending ? (
          <View style={styles.slot}>
            <ActivityIndicator color={palette.electric} size="small" />
          </View>
        ) : (
          <IconButton
            accessibilityLabel={sendLabel}
            disabled={sendDisabled}
            icon={sendIcon}
            iconColor={sendDisabled ? palette.muted : palette.electric}
            onPress={onSend}
            variant={sendDisabled ? 'filled' : 'accent'}
          />
        )}
      </View>
    </View>
  );
}

/**
 * Bandeau posé au-dessus du champ (« Réponse à … », « Modification du
 * message ») avec son action de fermeture.
 */
export function ChatComposerNotice({
  children,
  dismissLabel,
  icon,
  onDismiss,
  title,
}: PropsWithChildren<{
  dismissLabel: string;
  icon?: ComponentProps<typeof Ionicons>['name'] | undefined;
  onDismiss: () => void;
  title: string;
}>) {
  const { palette } = useDispoTheme();
  return (
    <Card padding={spacing.xs} tone="inset">
      <View style={styles.notice}>
        {icon ? <Ionicons color={palette.electric} name={icon} size={16} /> : null}
        <View style={styles.noticeCopy}>
          <AppText color={palette.electric} numberOfLines={1} variant="caption" weight="semibold">
            {title}
          </AppText>
          {children}
        </View>
        <IconButton
          accessibilityLabel={dismissLabel}
          icon="close"
          iconColor={palette.muted}
          onPress={onDismiss}
          variant="plain"
        />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  error: { paddingHorizontal: spacing.xxs },
  input: {
    borderRadius: radii.lg,
    flex: 1,
    fontFamily: typography.body,
    fontSize: 16,
    maxHeight: 112,
    minHeight: minimumTouchTarget,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    textAlignVertical: 'center',
  },
  notice: { alignItems: 'center', flexDirection: 'row', gap: spacing.xs },
  noticeCopy: { flex: 1, gap: spacing.xxs, minWidth: 0 },
  row: { alignItems: 'flex-end', flexDirection: 'row', gap: spacing.xxs },
  shell: {
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingTop: spacing.xs,
  },
  slot: {
    alignItems: 'center',
    height: minimumTouchTarget,
    justifyContent: 'center',
    width: minimumTouchTarget,
  },
});
