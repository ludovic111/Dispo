import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { AppText } from './app-text';
import { FormField } from './form-field';
import { DispoButton } from './pressable';
import { BottomSheet } from './sheet';

import { useDispoTheme } from '@/theme/theme-context';
import { minimumTouchTarget, radii, spacing } from '@/theme/tokens';

export interface SelectorSection {
  label: string;
  options: readonly { value: string; label: string }[];
}

/** Stored values stay separate from localized labels. Changes apply immediately. */
export function OptionSelector({
  label,
  sections,
  value,
  onChange,
}: {
  label: string;
  sections: readonly SelectorSection[];
  value: readonly string[];
  onChange: (value: string[]) => void;
}) {
  const { t } = useTranslation();
  const { palette } = useDispoTheme();
  const [visible, setVisible] = useState(false);
  const [search, setSearch] = useState('');
  const normalize = (text: string) =>
    text
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLocaleLowerCase();
  const needle = normalize(search.trim());
  const options = sections.flatMap((section) => section.options);
  const selected = value.map(
    (item) => options.find((option) => option.value === item)?.label ?? item,
  );
  const summary = selected.length
    ? `${selected.slice(0, 3).join(' · ')}${selected.length > 3 ? ` · +${selected.length - 3}` : ''}`
    : t('Choisir');
  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${summary}`}
        onPress={() => {
          setSearch('');
          setVisible(true);
        }}
        style={[styles.field, { borderColor: palette.border, backgroundColor: palette.inset }]}
      >
        <View style={styles.copy}>
          <AppText variant="label">{label}</AppText>
          <AppText color={palette.muted} numberOfLines={2} variant="subheadline">
            {summary}
          </AppText>
        </View>
        <Ionicons name="chevron-down" size={18} color={palette.muted} />
      </Pressable>
      <BottomSheet title={label} visible={visible} onClose={() => setVisible(false)} avoidKeyboard>
        <FormField
          label={t('Rechercher')}
          value={search}
          onChangeText={setSearch}
          autoCorrect={false}
        />
        <View style={styles.toolbar}>
          <AppText color={palette.muted} variant="caption">
            {t('{{count}} sélectionné(s)', { count: value.length })}
          </AppText>
          <DispoButton size="compact" variant="ghost" onPress={() => onChange([])}>
            {t('Tout effacer')}
          </DispoButton>
        </View>
        <ScrollView keyboardShouldPersistTaps="handled" style={styles.options}>
          {sections.map((section) => {
            const shown = section.options.filter(
              (option) => !needle || normalize(`${section.label} ${option.label}`).includes(needle),
            );
            if (!shown.length) return null;
            return (
              <View key={section.label}>
                {section.label ? (
                  <AppText color={palette.muted} variant="label" style={styles.section}>
                    {section.label}
                  </AppText>
                ) : null}
                {shown.map((option) => {
                  const checked = value.includes(option.value);
                  return (
                    <Pressable
                      key={option.value}
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked }}
                      accessibilityLabel={option.label}
                      style={styles.option}
                      onPress={() =>
                        onChange(
                          checked
                            ? value.filter((item) => item !== option.value)
                            : [...value, option.value],
                        )
                      }
                    >
                      <AppText style={styles.copy}>{option.label}</AppText>
                      <Ionicons
                        name={checked ? 'checkbox' : 'square-outline'}
                        size={23}
                        color={checked ? palette.electric : palette.muted}
                      />
                    </Pressable>
                  );
                })}
              </View>
            );
          })}
        </ScrollView>
        <DispoButton onPress={() => setVisible(false)}>{t('Terminé')}</DispoButton>
      </BottomSheet>
    </>
  );
}

const styles = StyleSheet.create({
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.sm,
    borderRadius: radii.input,
    borderWidth: 1,
    minHeight: minimumTouchTarget,
  },
  copy: { flex: 1, gap: spacing.xxs },
  toolbar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  options: { flexShrink: 1 },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: minimumTouchTarget,
    paddingVertical: spacing.xs,
  },
  section: { paddingTop: spacing.md, paddingBottom: spacing.xs },
});
