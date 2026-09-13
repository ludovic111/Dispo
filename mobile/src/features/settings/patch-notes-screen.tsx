import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { FlatList, StyleSheet, View } from 'react-native';

import { patchNotes, type PatchNote } from './patch-notes-data';
import { normalizeMarketingVersion } from './settings-model';

import { AppText } from '@/components/ui/app-text';
import { Card } from '@/components/ui/card';
import { NativeHeaderButton } from '@/components/ui/native-header-button';
import { ModalHeader, Screen } from '@/components/ui/screen';
import { SectionHeader } from '@/components/ui/section';
import { Tag } from '@/components/ui/tag';
import { useDispoTheme } from '@/theme/theme-context';
import { minimumTouchTarget, radii, spacing, tint } from '@/theme/tokens';

function NoteCard({ current, note }: { current: boolean; note: PatchNote }) {
  const { palette } = useDispoTheme();
  const { t } = useTranslation();
  return (
    <Card style={styles.noteCard}>
      <SectionHeader subtitle={`v${note.version}`} title={t(note.title)} />
      {current ? <Tag icon="checkmark-circle" label={t('Version actuelle')} /> : null}
      {note.points.map((point) => (
        <View key={point} style={styles.pointRow}>
          <Ionicons color={palette.bronze} name="sparkles" size={12} style={styles.sparkle} />
          <AppText style={styles.pointText} variant="footnote">
            {t(point)}
          </AppText>
        </View>
      ))}
    </Card>
  );
}

export function PatchNotesScreen() {
  const { palette } = useDispoTheme();
  const { t } = useTranslation();
  const currentVersion = normalizeMarketingVersion(Constants.expoConfig?.version ?? '2.4');
  return (
    <Screen>
      <ModalHeader
        title={t('Nouveautés')}
        trailing={<NativeHeaderButton label={t('OK')} onPress={() => router.back()} />}
      />
      <FlatList
        contentContainerStyle={styles.list}
        data={patchNotes as PatchNote[]}
        keyExtractor={(note) => note.version}
        ListHeaderComponent={
          <Card style={styles.feedback} tone="inset">
            <View style={[styles.feedbackIcon, { backgroundColor: tint(palette.electric, 0.12) }]}>
              <Ionicons color={palette.electric} name="heart" size={22} />
            </View>
            <View style={styles.feedbackCopy}>
              <AppText variant="headline">{t("Merci d'utiliser Dispo !")}</AppText>
              <AppText color={palette.muted} variant="footnote">
                {t("Un pépin, une idée ? Écris-nous via l'assistance dispoapp.net.")}
              </AppText>
            </View>
          </Card>
        }
        renderItem={({ item }) => (
          <NoteCard current={item.version === currentVersion} note={item} />
        )}
        showsVerticalScrollIndicator={false}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  feedback: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  feedbackCopy: { flex: 1, gap: spacing.xxs },
  feedbackIcon: {
    alignItems: 'center',
    borderRadius: radii.round,
    height: minimumTouchTarget,
    justifyContent: 'center',
    width: minimumTouchTarget,
  },
  list: { paddingBottom: spacing.xxl, paddingHorizontal: spacing.gutter },
  noteCard: { gap: spacing.xs, marginBottom: spacing.md },
  pointRow: { alignItems: 'flex-start', flexDirection: 'row', gap: spacing.xs },
  pointText: { flex: 1 },
  sparkle: { marginTop: spacing.xxs },
});
