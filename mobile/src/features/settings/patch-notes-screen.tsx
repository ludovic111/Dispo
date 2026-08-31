import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { FlatList, StyleSheet, View } from 'react-native';

import { patchNotes, type PatchNote } from './patch-notes-data';
import { SheetHeader } from './settings-components';
import { normalizeMarketingVersion } from './settings-model';

import { AppText } from '@/components/ui/app-text';
import { Card } from '@/components/ui/card';
import { Screen } from '@/components/ui/screen';
import { useDispoTheme } from '@/theme/theme-context';
import { radii, spacing } from '@/theme/tokens';

function NoteCard({ current, note }: { current: boolean; note: PatchNote }) {
  const { palette } = useDispoTheme();
  const { t } = useTranslation();
  return (
    <Card padding={spacing.md} style={styles.noteCard}>
      <View style={styles.noteHeading}>
        <AppText color={current ? palette.electric : palette.muted} style={styles.version}>
          v{note.version}
        </AppText>
        <AppText style={styles.noteTitle}>{t(note.title)}</AppText>
        {current ? (
          <View
            style={[
              styles.currentTag,
              { backgroundColor: `${palette.electric}18`, borderColor: `${palette.electric}55` },
            ]}
          >
            <AppText color={palette.electric} style={styles.currentTagText} variant="caption">
              {t('Version actuelle')}
            </AppText>
          </View>
        ) : null}
      </View>
      {note.points.map((point) => (
        <View key={point} style={styles.pointRow}>
          <Ionicons color={palette.bronze} name="sparkles" size={12} style={styles.sparkle} />
          <AppText color={palette.text} style={styles.pointText} variant="caption">
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
      <View style={styles.headerWrap}>
        <SheetHeader onClose={() => router.back()} title={t('Nouveautés')} />
      </View>
      <FlatList
        contentContainerStyle={styles.list}
        data={patchNotes as PatchNote[]}
        keyExtractor={(note) => note.version}
        ListHeaderComponent={
          <View
            style={[
              styles.feedback,
              { backgroundColor: `${palette.electric}15`, borderColor: `${palette.electric}55` },
            ]}
          >
            <Ionicons color={palette.electric} name="heart" size={22} />
            <View style={styles.feedbackCopy}>
              <AppText style={styles.feedbackTitle}>{t("Merci d'utiliser Dispo !")}</AppText>
              <AppText color={palette.muted} variant="caption">
                {t("Un pépin, une idée ? Écris-nous via l'assistance dispoapp.net.")}
              </AppText>
            </View>
          </View>
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
  currentTag: {
    borderRadius: radii.round,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  currentTagText: { fontSize: 9, fontWeight: '800' },
  feedback: {
    alignItems: 'center',
    borderRadius: radii.ticket,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.md,
    padding: 14,
  },
  feedbackCopy: { flex: 1, gap: 2 },
  feedbackTitle: { fontSize: 14, fontWeight: '900' },
  headerWrap: { paddingHorizontal: spacing.md },
  list: { gap: spacing.md, paddingBottom: spacing.xxl, paddingHorizontal: spacing.md },
  noteCard: { gap: 10, marginBottom: spacing.md },
  noteHeading: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  noteTitle: { flex: 1, fontSize: 14, fontWeight: '800', minWidth: 160 },
  pointRow: { alignItems: 'flex-start', flexDirection: 'row', gap: 8 },
  pointText: { flex: 1, lineHeight: 17, opacity: 0.88 },
  sparkle: { marginTop: 2 },
  version: { fontSize: 14, fontWeight: '900' },
});
