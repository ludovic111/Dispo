import { StyleSheet, View } from 'react-native';

import { Card } from '@/components/ui/card';
import { EmptyState, Screen, ScreenHeader } from '@/components/ui/screen';
import { spacing } from '@/theme/tokens';

export default function SessionsScreen() {
  return (
    <Screen>
      <ScreenHeader eyebrow="Agenda" icon="calendar-outline" title="Sessions" />
      <View style={styles.content}>
        <Card>
          <EmptyState
            icon="musical-notes-outline"
            message="La migration des groupes, événements, répertoires et setlists est planifiée en Phase 3."
            title="Tes prochaines sessions arrivent"
          />
        </Card>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({ content: { padding: spacing.md } });
