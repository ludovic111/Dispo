import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Alert, Pressable, StyleSheet, View } from 'react-native';
import DraggableFlatList, { ScaleDecorator } from 'react-native-draggable-flatlist';

import { reorderSongs, type GroupSong } from './group-model';
import { GroupSongRow } from './group-song-row';

import { AppText } from '@/components/ui/app-text';
import { Card } from '@/components/ui/card';
import { useDispoTheme } from '@/theme/theme-context';
import { radii, spacing } from '@/theme/tokens';

/** A single scroll viewport keeps drag activation and edge scrolling identical in both lists. */
export function SongReorderList({
  songs,
  title,
  onDone,
  onSave,
}: {
  songs: GroupSong[];
  title: string;
  onDone: () => void;
  onSave: (ids: string[]) => Promise<unknown>;
}) {
  const { t } = useTranslation();
  const { palette } = useDispoTheme();
  const [order, setOrder] = useState<string[] | null>(null);
  const [saving, setSaving] = useState(false);
  const [dragging, setDragging] = useState(false);
  const savingRef = useRef(false);
  const placeholderIndex = useRef<number | null>(null);
  const data = order ? reorderSongs(songs, order) : songs;
  const busy = saving || dragging;

  const persist = async (ids: string[]) => {
    if (savingRef.current) return;
    // A membership change during a drag must not silently reorder a different list.
    if (
      ids.length !== songs.length ||
      new Set(ids).size !== songs.length ||
      songs.some((song) => !ids.includes(song.id))
    ) {
      Alert.alert(t('L’ordre n’a pas pu être enregistré.'));
      return;
    }
    if (ids.every((id, index) => id === songs[index]?.id)) return;
    savingRef.current = true;
    setSaving(true);
    setOrder(ids);
    try {
      await onSave(ids);
    } catch {
      // The existing mutation restores its cache and reloads the persisted server order.
      Alert.alert(t('L’ordre n’a pas pu être enregistré.'));
    } finally {
      setOrder(null);
      savingRef.current = false;
      setSaving(false);
    }
  };
  const move = (id: string, offset: -1 | 1) => {
    if (busy || savingRef.current) return;
    const index = data.findIndex((song) => song.id === id);
    const destination = index + offset;
    if (index < 0 || destination < 0 || destination >= data.length) return;
    const ids = data.map((song) => song.id);
    [ids[index], ids[destination]] = [ids[destination]!, ids[index]!];
    void Haptics.selectionAsync();
    void persist(ids);
  };
  return (
    <View style={styles.flex}>
      <View style={[styles.toolbar, { borderBottomColor: palette.border }]}>
        <AppText style={styles.title} variant="title">
          {title}
        </AppText>
        {saving ? (
          <ActivityIndicator accessibilityLabel={t('Enregistrement…')} color={palette.electric} />
        ) : null}
        <Pressable
          accessibilityLabel={t('Terminé')}
          accessibilityRole="button"
          accessibilityState={{ disabled: busy }}
          disabled={busy}
          onPress={onDone}
          style={[
            styles.done,
            { backgroundColor: `${palette.electric}18` },
            busy && styles.disabled,
          ]}
        >
          <Ionicons color={palette.electric} name="checkmark" size={20} />
          <AppText color={palette.electric} style={styles.bold}>
            {t('Terminé')}
          </AppText>
        </Pressable>
      </View>
      <DraggableFlatList
        activationDistance={6}
        autoscrollSpeed={120}
        autoscrollThreshold={56}
        animationConfig={{ damping: 24, mass: 0.3, stiffness: 200 }}
        containerStyle={styles.flex}
        contentContainerStyle={styles.content}
        data={data}
        extraData={busy}
        keyExtractor={(song) => song.id}
        onDragBegin={(index) => {
          placeholderIndex.current = index;
          setDragging(true);
          void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        }}
        onDragEnd={({ data: next, from, to }) => {
          setDragging(false);
          placeholderIndex.current = null;
          if (from !== to) void persist(next.map((song) => song.id));
        }}
        onPlaceholderIndexChange={(index) => {
          if (placeholderIndex.current === index) return;
          placeholderIndex.current = index;
          void Haptics.selectionAsync();
        }}
        renderPlaceholder={() => (
          <View
            style={[
              styles.placeholder,
              { backgroundColor: `${palette.electric}18`, borderColor: palette.electric },
            ]}
          />
        )}
        renderItem={({ item, drag, isActive }) => {
          const index = data.findIndex((song) => song.id === item.id);
          return (
            <ScaleDecorator activeScale={1.015}>
              <View style={styles.row}>
                <Card padding={10} style={isActive ? { borderColor: palette.electric } : undefined}>
                  <GroupSongRow
                    embedded
                    song={item}
                    showDisclosure={false}
                    showListenAction={false}
                    showSoloAction={false}
                  />
                  <View style={styles.controls}>
                    <AppText style={styles.position} color={palette.muted} variant="caption">
                      {index + 1} / {data.length}
                    </AppText>
                    {([-1, 1] as const).map((offset) => {
                      const disabled =
                        busy || (offset === -1 ? index === 0 : index === data.length - 1);
                      return (
                        <Pressable
                          accessibilityLabel={`${t(offset === -1 ? 'Monter' : 'Descendre')} · ${item.title}`}
                          accessibilityRole="button"
                          accessibilityState={{ disabled }}
                          disabled={disabled}
                          key={offset}
                          onPress={() => move(item.id, offset)}
                          style={[styles.control, disabled && styles.disabled]}
                        >
                          <Ionicons
                            color={palette.electric}
                            name={offset === -1 ? 'chevron-up' : 'chevron-down'}
                            size={23}
                          />
                        </Pressable>
                      );
                    })}
                    <Pressable
                      accessibilityLabel={`${t('Déplacer le morceau')} · ${item.title}`}
                      accessibilityHint={t(
                        "Maintiens la poignée puis glisse pour changer l'ordre.",
                      )}
                      accessibilityRole="button"
                      accessibilityState={{ disabled: saving }}
                      disabled={saving}
                      onPressIn={() => {
                        if (!savingRef.current && !dragging) drag();
                      }}
                      style={[
                        styles.handle,
                        { backgroundColor: `${palette.electric}18` },
                        saving && styles.disabled,
                      ]}
                    >
                      <Ionicons color={palette.electric} name="reorder-three" size={28} />
                    </Pressable>
                  </View>
                </Card>
              </View>
            </ScaleDecorator>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    padding: spacing.gutter,
    borderBottomWidth: 1,
  },
  title: { flex: 1 },
  bold: { fontWeight: '800' },
  done: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    minHeight: 48,
    paddingHorizontal: spacing.sm,
    borderRadius: radii.button,
  },
  content: { padding: spacing.gutter, paddingBottom: spacing.xxl },
  row: { paddingBottom: spacing.sm },
  controls: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginTop: spacing.xs },
  position: { flex: 1 },
  control: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
  handle: {
    width: 56,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.button,
  },
  disabled: { opacity: 0.3 },
  placeholder: {
    flex: 1,
    borderWidth: 2,
    borderStyle: 'dashed',
    borderRadius: radii.card,
    marginBottom: spacing.sm,
  },
});
