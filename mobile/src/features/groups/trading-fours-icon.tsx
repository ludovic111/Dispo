import { Ionicons } from '@expo/vector-icons';
import { View } from 'react-native';

import { useDispoTheme } from '@/theme/theme-context';

export function TradingFoursIcon() {
  const { palette } = useDispoTheme();
  return (
    <View
      style={{
        width: 34,
        height: 34,
        borderRadius: 17,
        backgroundColor: palette.inset,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Ionicons color={palette.electric} name="repeat" size={20} />
    </View>
  );
}
