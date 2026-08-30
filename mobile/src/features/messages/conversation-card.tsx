import { Pressable, StyleSheet, View } from 'react-native';

import type { ConversationSummary } from './message-repository';

import { AppText } from '@/components/ui/app-text';
import { Avatar } from '@/components/ui/avatar';
import { Card } from '@/components/ui/card';
import { useDispoTheme } from '@/theme/theme-context';
import { spacing } from '@/theme/tokens';

export function ConversationCard({
  conversation,
  onPress,
}: {
  conversation: ConversationSummary;
  onPress: () => void;
}) {
  const { palette } = useDispoTheme();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => pressed && styles.pressed}
    >
      <Card padding={13}>
        <View style={styles.row}>
          <Avatar name={conversation.contactName} size={50} uri={conversation.contactPhotoUrl} />
          <View style={styles.content}>
            <AppText numberOfLines={1} variant="title">
              {conversation.contactName}
            </AppText>
            <AppText color={palette.electric} style={styles.instrument} variant="caption">
              {conversation.contactInstrument}
            </AppText>
            <AppText color={palette.muted} numberOfLines={1}>
              {conversation.lastMessage?.deletedAt
                ? 'Message supprimé'
                : conversation.lastMessage?.text || 'Commence la conversation'}
            </AppText>
          </View>
        </View>
      </Card>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  content: { flex: 1, gap: 2 },
  instrument: { fontWeight: '800' },
  pressed: { opacity: 0.82, transform: [{ scale: 0.98 }] },
  row: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm },
});
