import { StyleSheet, View } from 'react-native';

import { AppText } from './app-text';

import { useDispoTheme } from '@/theme/theme-context';
import { radii } from '@/theme/tokens';

interface TagProps {
  color?: string;
  label: string;
}

export function Tag({ color, label }: TagProps) {
  const { palette } = useDispoTheme();
  const resolved = color ?? palette.electric;
  return (
    <View style={[styles.tag, { backgroundColor: `${resolved}18`, borderColor: `${resolved}55` }]}>
      <AppText color={resolved} style={styles.text}>
        {label}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  tag: {
    alignSelf: 'flex-start',
    maxWidth: '100%',
    borderRadius: radii.chip,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  text: { fontSize: 12, fontWeight: '600' },
});
