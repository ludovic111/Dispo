import { Ionicons } from '@expo/vector-icons';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
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
import { minimumTouchTarget, pressedStyle, spacing } from '@/theme/tokens';

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
  const resolving = resolution.status === 'waiting' || resolution.status === 'resolving';

  return (
    <View style={[styles.wrapper, style]} testID={testID}>
      <View style={styles.postalRow}>
        <View style={styles.postalInput}>
          <FormField
            autoCapitalize="characters"
            autoCorrect={false}
            editable={!disabled}
            keyboardType="numbers-and-punctuation"
            label={t('Code postal')}
            onChangeText={(postalCode) => {
              setEditingCityKey(null);
              onChange({
                ...value,
                postalCode: normalizePostalCode(postalCode),
              });
            }}
            placeholder={postalCodePlaceholder ?? t('Code postal — ex. 1227')}
            testID={`${testID}-postal-code`}
            value={value.postalCode}
          />
        </View>
        <View accessibilityLiveRegion="polite" style={styles.status}>
          {resolving ? <ActivityIndicator color={palette.electric} size="small" /> : null}
          {shownCity && !showCityField ? (
            <Pressable
              accessibilityLabel={t('Corriger la ville')}
              accessibilityRole="button"
              accessibilityState={{ disabled }}
              disabled={disabled}
              hitSlop={spacing.xs}
              onPress={() => {
                setManualCityKey(currentKey);
                setEditingCityKey(currentKey);
              }}
              style={({ pressed }) => [styles.statusAction, pressed && pressedStyle]}
            >
              <Ionicons color={palette.jam} name="location" size={15} />
              <AppText
                color={palette.jam}
                numberOfLines={1}
                style={styles.statusText}
                variant="caption"
                weight="bold"
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
              accessibilityState={{ disabled }}
              disabled={disabled}
              hitSlop={spacing.xs}
              onPress={resolution.retry}
              style={({ pressed }) => [styles.statusAction, pressed && pressedStyle]}
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
  postalInput: { flexBasis: 150, flexGrow: 0, flexShrink: 1 },
  postalRow: { alignItems: 'flex-end', flexDirection: 'row', gap: spacing.sm },
  status: {
    alignItems: 'flex-end',
    flex: 1,
    justifyContent: 'center',
    minHeight: minimumTouchTarget,
  },
  statusAction: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.xxs,
    justifyContent: 'flex-end',
    maxWidth: '100%',
    minHeight: minimumTouchTarget,
  },
  statusText: { flexShrink: 1, textAlign: 'right' },
  wrapper: { gap: spacing.xs },
});
