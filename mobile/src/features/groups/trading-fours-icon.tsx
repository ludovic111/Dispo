import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';

import { useDispoTheme } from '@/theme/theme-context';
import { radii } from '@/theme/tokens';

export function TradingFoursIcon() {
  const { palette } = useDispoTheme();
  return (
    <View style={[styles.well, { backgroundColor: palette.inset }]}>
      <Ionicons color={palette.electric} name="repeat" size={20} />
    </View>
  );
}

const styles = StyleSheet.create({
  well: {
    alignItems: 'center',
    borderRadius: radii.round,
    height: 34,
    justifyContent: 'center',
    width: 34,
  },
});
