import { Ionicons } from '@expo/vector-icons';
import { useNetworkState } from 'expo-network';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/components/ui/app-text';
import { useDispoTheme } from '@/theme/theme-context';
import { radii, spacing } from '@/theme/tokens';

export function NetworkBanner() {
  const network = useNetworkState();
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const { palette } = useDispoTheme();
  const offline = network.isConnected === false || network.isInternetReachable === false;

  if (!offline) return null;
  return (
    <View
      accessibilityLiveRegion="polite"
      accessibilityRole="alert"
      pointerEvents="none"
      style={[
        styles.banner,
        {
          backgroundColor: palette.signal,
          top: insets.top + spacing.xs,
        },
      ]}
    >
      <Ionicons color="#FFFFFF" name="cloud-offline" size={16} />
      <AppText color="#FFFFFF" style={styles.label} variant="caption">
        {t('Hors ligne — les changements seront disponibles dès le retour du réseau.')}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    alignItems: 'center',
    borderRadius: radii.button,
    flexDirection: 'row',
    gap: spacing.xs,
    left: spacing.gutter,
    minHeight: 44,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    position: 'absolute',
    right: spacing.gutter,
    zIndex: 100,
  },
  label: { flex: 1, fontWeight: '800' },
});
