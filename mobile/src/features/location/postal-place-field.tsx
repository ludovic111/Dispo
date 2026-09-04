import { Ionicons } from '@expo/vector-icons';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  TextInput,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import {
  normalizePostalCode,
  postalPlaceCacheKey,
  type PostalPlaceDraft,
  type ResolvedPostalPlace,
} from './postal-place-model';
import { postalPlaceDebounceMs, usePostalPlaceResolver } from './use-postal-place-resolver';

import { AppText } from '@/components/ui/app-text';
import { FormField } from '@/components/ui/form-field';
import { useDispoTheme } from '@/theme/theme-context';
import { radii, spacing } from '@/theme/tokens';

export interface PostalPlaceFieldProps {
  debounceMs?: number;
  disabled?: boolean;
  onChange: (value: PostalPlaceDraft) => void;
  onResolved?: (place: ResolvedPostalPlace) => void;
  postalCodePlaceholder?: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
  value: PostalPlaceDraft;
}

export function PostalPlaceField({
  debounceMs = postalPlaceDebounceMs,
  disabled = false,
  onChange,
  onResolved,
  postalCodePlaceholder,
  style,
  testID = 'postal-place',
  value,
}: PostalPlaceFieldProps) {
  const { t } = useTranslation();
  const { palette } = useDispoTheme();
  const initialKey = postalPlaceCacheKey(value);
  const [manualCityKey, setManualCityKey] = useState(value.city.trim() ? initialKey : null);
  const [editingCityKey, setEditingCityKey] = useState<string | null>(null);
  const notifiedResolution = useRef<string | null>(null);
  const currentKey = postalPlaceCacheKey(value);
  const resolution = usePostalPlaceResolver({
    countryCode: value.countryCode,
    debounceMs,
    enabled: !disabled && manualCityKey !== currentKey,
    postalCode: value.postalCode,
  });

  const resolvedPlace = resolution.status === 'resolved' ? resolution.place : null;
  useEffect(() => {
    if (!resolvedPlace) return;
    const identity = [
      resolvedPlace.countryCode,
      resolvedPlace.postalCode,
      resolvedPlace.city,
      resolvedPlace.latitude,
      resolvedPlace.longitude,
    ].join(':');
    if (notifiedResolution.current === identity) return;
    notifiedResolution.current = identity;
    if (
      resolvedPlace.city !== value.city ||
      resolvedPlace.countryCode !== value.countryCode ||
      resolvedPlace.postalCode !== value.postalCode
    ) {
      onChange({
        city: resolvedPlace.city,
        countryCode: resolvedPlace.countryCode,
        postalCode: resolvedPlace.postalCode,
      });
    }
    onResolved?.(resolvedPlace);
  }, [onChange, onResolved, resolvedPlace, value.city, value.countryCode, value.postalCode]);

  const showCityField =
    editingCityKey === currentKey ||
    resolution.status === 'not-found' ||
    resolution.status === 'unavailable';
  const shownCity = resolution.status === 'resolved' ? resolution.place.city : value.city.trim();

  return (
    <View style={[styles.wrapper, style]} testID={testID}>
      <AppText color={palette.bronze} variant="label">
        {t('Code postal')}
      </AppText>
      <View style={styles.postalRow}>
        <TextInput
          numberOfLines={1}
          accessibilityLabel={t('Code postal')}
          autoCapitalize="characters"
          autoCorrect={false}
          editable={!disabled}
          keyboardType="numbers-and-punctuation"
          onChangeText={(postalCode) => {
            setEditingCityKey(null);
            onChange({
              ...value,
              postalCode: normalizePostalCode(postalCode),
            });
          }}
          placeholder={postalCodePlaceholder ?? t('Code postal — ex. 1227')}
          placeholderTextColor={palette.muted}
          selectionColor={palette.electric}
          style={[
            styles.postalInput,
            {
              backgroundColor: palette.inset,
              borderColor: palette.border,
              color: palette.text,
            },
          ]}
          testID={`${testID}-postal-code`}
          value={value.postalCode}
        />
        <View accessibilityLiveRegion="polite" style={styles.status}>
          {resolution.status === 'waiting' || resolution.status === 'resolving' ? (
            <ActivityIndicator color={palette.electric} size="small" />
          ) : null}
          {shownCity && !showCityField ? (
            <Pressable
              accessibilityLabel={t('Corriger la ville')}
              disabled={disabled}
              onPress={() => {
                setManualCityKey(currentKey);
                setEditingCityKey(currentKey);
              }}
              style={({ pressed }) => [styles.cityBadge, pressed && styles.pressed]}
            >
              <Ionicons color={palette.jam} name="location" size={15} />
              <AppText
                color={palette.jam}
                numberOfLines={1}
                style={styles.cityBadgeText}
                variant="caption"
              >
                {shownCity}
              </AppText>
            </Pressable>
          ) : null}
          {resolution.status === 'not-found' ? (
            <AppText color={palette.bronze} style={styles.statusText} variant="caption2">
              {t('Code inconnu — écris la ville')}
            </AppText>
          ) : null}
          {resolution.status === 'unavailable' ? (
            <Pressable
              accessibilityRole="button"
              disabled={disabled}
              onPress={resolution.retry}
              style={({ pressed }) => [styles.retry, pressed && styles.pressed]}
            >
              <AppText color={palette.bronze} style={styles.statusText} variant="caption2">
                {t('Service indisponible — écris la ville')}
              </AppText>
              <Ionicons color={palette.electric} name="refresh" size={14} />
            </Pressable>
          ) : null}
        </View>
      </View>

      {showCityField ? (
        <FormField
          autoCapitalize="words"
          autoCorrect={false}
          editable={!disabled}
          label={t('Ville')}
          onChangeText={(city) => {
            setManualCityKey(currentKey);
            onChange({ ...value, city });
          }}
          placeholder={t('Ville')}
          testID={`${testID}-city`}
          value={value.city}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  cityBadge: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.compact,
    justifyContent: 'flex-end',
    maxWidth: '100%',
    minHeight: 32,
  },
  cityBadgeText: { flexShrink: 1, fontWeight: '800' },
  postalInput: {
    borderRadius: radii.button,
    borderWidth: 1,
    flexBasis: 150,
    flexGrow: 0,
    flexShrink: 1,
    fontSize: 16,
    minHeight: 48,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  postalRow: { alignItems: 'center', flexDirection: 'row', gap: spacing.control },
  pressed: { opacity: 0.7 },
  retry: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.compact,
    justifyContent: 'flex-end',
  },
  status: { alignItems: 'flex-end', flex: 1, justifyContent: 'center', minHeight: 32 },
  statusText: { textAlign: 'right' },
  wrapper: { gap: spacing.xs },
});
