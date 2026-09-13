import { MaskedView } from '@expo/ui/community/masked-view';
import type { PropsWithChildren } from 'react';
import { useMemo, useState } from 'react';
import { StyleSheet, View, type LayoutChangeEvent, type ViewStyle } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { useDispoTheme } from '@/theme/theme-context';
import { billetInk, elevation, lightPalette, radii, tint } from '@/theme/tokens';

interface TicketCardProps extends PropsWithChildren {
  backgroundColor?: string;
  notchFromTrailing?: number;
  notchRadius?: number;
  /** Ligne de perforation pointillée entre les deux encoches (défaut : oui). */
  perforation?: boolean;
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

/**
 * Billet imprimé : papier clair fixe dans tous les thèmes, encoches de part
 * et d'autre de la souche, perforation pointillée, liseré clair en haut et
 * ombre marquée. Le contenu du billet écrit à l'encre `billetInk`.
 */
export function TicketCard({
  backgroundColor = lightPalette.background,
  children,
  notchFromTrailing = 74,
  notchRadius = 7,
  perforation = true,
  radius = 18,
  style,
}: TicketCardProps) {
  const { palette } = useDispoTheme();
  const [size, setSize] = useState<{ height: number; width: number } | null>(null);
  const path = useMemo(
    () =>
      size
        ? roundedTicketPath(size.width, size.height, radius, notchRadius, notchFromTrailing)
        : '',
    [notchFromTrailing, notchRadius, radius, size],
  );
  const notchX = size ? Math.max(radius + notchRadius, size.width - notchFromTrailing) : 0;
  const dots = size ? Math.max(0, Math.floor((size.height - notchRadius * 2 - 8) / 8)) : 0;

  const measure = (event: LayoutChangeEvent) => {
    const { height, width } = event.nativeEvent.layout;
    if (height > 0 && width > 0 && (height !== size?.height || width !== size?.width)) {
      setSize({ height, width });
    }
  };

  const decorations = size ? (
    <>
      <View
        pointerEvents="none"
        style={[styles.highlight, { left: radius, right: radius, backgroundColor: paperHighlight }]}
      />
      {perforation ? (
        <View
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          pointerEvents="none"
          style={[styles.perforation, { left: notchX - 1, top: notchRadius + 4 }]}
        >
          {Array.from({ length: dots }, (_, index) => (
            <View key={index} style={styles.dot} />
          ))}
        </View>
      ) : null}
    </>
  ) : null;

  return (
    <View onLayout={measure} style={[styles.shadow, elevation(3, palette)]}>
      {size ? (
        <MaskedView
          maskElement={
            <Svg
              height={size.height}
              viewBox={`0 0 ${size.width} ${size.height}`}
              width={size.width}
            >
              <Path d={path} fill="#000000" fillRule="evenodd" />
            </Svg>
          }
          style={[styles.mask, { height: size.height, width: size.width }, style]}
        >
          <View style={[styles.surface, { backgroundColor }]}>
            {decorations}
            {children}
          </View>
        </MaskedView>
      ) : (
        <View style={[styles.surface, { backgroundColor }, style]}>{children}</View>
      )}
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

const paperHighlight = tint(lightPalette.card, 0.7);

const styles = StyleSheet.create({
  bar: { backgroundColor: tint(billetInk, 0.42), height: 9 },
  barcode: { alignItems: 'center', flexDirection: 'row', gap: 2 },
  dot: { backgroundColor: tint(billetInk, 0.2), borderRadius: 1, height: 2, width: 2 },
  highlight: { height: 1, position: 'absolute', top: 0 },
  mask: { minHeight: 1 },
  perforation: { bottom: 0, gap: 6, position: 'absolute', width: 2 },
  shadow: { borderRadius: radii.ticket },
  surface: { width: '100%' },
});
