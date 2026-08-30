import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui/app-text';
import type { ChatMessage } from '@/domain/message';
import { useDispoTheme } from '@/theme/theme-context';
import { billetInk, radii, spacing } from '@/theme/tokens';

export function MessageBubble({ message, mine }: { message: ChatMessage; mine: boolean }) {
  const { palette } = useDispoTheme();
  return (
    <View style={[styles.wrapper, mine ? styles.mine : styles.theirs]}>
      <View
        style={[
          styles.bubble,
          { backgroundColor: mine ? palette.electric : palette.card, borderColor: palette.border },
        ]}
      >
        <AppText color={mine ? billetInk : palette.text}>
          {message.deletedAt ? 'Message supprimé' : message.text}
        </AppText>
        <AppText
          color={mine ? `${billetInk}AA` : palette.muted}
          style={styles.time}
          variant="caption"
        >
          {new Intl.DateTimeFormat('fr-CH', { hour: '2-digit', minute: '2-digit' }).format(
            new Date(message.createdAt),
          )}
          {message.editedAt ? ' · modifié' : ''}
        </AppText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bubble: {
    borderRadius: radii.ticket,
    borderWidth: 1,
    maxWidth: '84%',
    paddingHorizontal: spacing.sm,
    paddingVertical: 9,
  },
  mine: { alignItems: 'flex-end' },
  theirs: { alignItems: 'flex-start' },
  time: { fontSize: 9, marginTop: 3, textAlign: 'right' },
  wrapper: { width: '100%' },
});
