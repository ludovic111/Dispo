import { MaskedView } from '@expo/ui/community/masked-view';
import type { PropsWithChildren } from 'react';
import { useMemo, useState } from 'react';
import { StyleSheet, View, type LayoutChangeEvent, type ViewStyle } from 'react-native';
import Svg, { Path } from 'react-native-svg';

interface TicketCardProps extends PropsWithChildren {
  backgroundColor?: string;
  notchFromTrailing?: number;
  notchRadius?: number;
  radius?: number;
  style?: ViewStyle;
}

function roundedTicketPath(
  width: number,
  height: number,
  radius: number,
  notchRadius: number,
  notchFromTrailing: number,
): string {
  const r = Math.min(radius, width / 2, height / 2);
  const notchX = Math.max(r + notchRadius, width - notchFromTrailing);
  const body = [
    `M ${r} 0`,
    `H ${width - r}`,
    `Q ${width} 0 ${width} ${r}`,
    `V ${height - r}`,
    `Q ${width} ${height} ${width - r} ${height}`,
    `H ${r}`,
    `Q 0 ${height} 0 ${height - r}`,
    `V ${r}`,
    `Q 0 0 ${r} 0`,
    'Z',
  ].join(' ');
  const circle = (cy: number) =>
    [
      `M ${notchX - notchRadius} ${cy}`,
      `A ${notchRadius} ${notchRadius} 0 1 0 ${notchX + notchRadius} ${cy}`,
      `A ${notchRadius} ${notchRadius} 0 1 0 ${notchX - notchRadius} ${cy}`,
      'Z',
    ].join(' ');
  return `${body} ${circle(0)} ${circle(height)}`;
}

export function TicketCard({
  backgroundColor = '#F0F4FF',
  children,
  notchFromTrailing = 74,
  notchRadius = 7,
  radius = 18,
  style,
}: TicketCardProps) {
  const [size, setSize] = useState({ height: 1, width: 1 });
  const path = useMemo(
    () => roundedTicketPath(size.width, size.height, radius, notchRadius, notchFromTrailing),
    [notchFromTrailing, notchRadius, radius, size.height, size.width],
  );

  const measure = (event: LayoutChangeEvent) => {
    const { height, width } = event.nativeEvent.layout;
    if (height > 0 && width > 0 && (height !== size.height || width !== size.width)) {
      setSize({ height, width });
    }
  };

  return (
    <View onLayout={measure} style={styles.shadow}>
      <MaskedView
        maskElement={
          <Svg height={size.height} viewBox={`0 0 ${size.width} ${size.height}`} width={size.width}>
            <Path d={path} fill="#000000" fillRule="evenodd" />
          </Svg>
        }
        style={[styles.mask, style]}
      >
        <View style={[styles.surface, { backgroundColor }]}>{children}</View>
      </MaskedView>
    </View>
  );
}

export function Barcode({ seed }: { seed: string }) {
  let hash = 5381;
  for (let index = 0; index < seed.length; index += 1) {
    hash = (hash * 33) ^ seed.charCodeAt(index);
  }
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={styles.barcode}
    >
      {Array.from({ length: 11 }, (_, index) => (
        <View
          key={index}
          style={[styles.bar, { width: (Math.abs(hash) >> (index % 6)) & 1 ? 2.6 : 1.2 }]}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { backgroundColor: 'rgba(5,8,20,0.42)', height: 9 },
  barcode: { alignItems: 'center', flexDirection: 'row', gap: 2 },
  mask: { minHeight: 1 },
  shadow: {
    borderRadius: 18,
    elevation: 9,
    shadowColor: '#000000',
    shadowOffset: { height: 7, width: 0 },
    shadowOpacity: 0.28,
    shadowRadius: 12,
  },
  surface: { width: '100%' },
});
