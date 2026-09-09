import type { ComponentProps } from 'react';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Linking, StyleSheet, Text } from 'react-native';

import { AppText } from './app-text';

import { textLinkSegments } from '@/domain/text-links';
import { useDispoTheme } from '@/theme/theme-context';

export function LinkifiedText({
  children,
  linkColor,
  onLongPress,
  ...props
}: Omit<ComponentProps<typeof AppText>, 'children'> & { children: string; linkColor?: string }) {
  const { palette } = useDispoTheme();
  const { t } = useTranslation();
  const segments = useMemo(() => textLinkSegments(children), [children]);
  return (
    <AppText {...props} onLongPress={onLongPress}>
      {segments.map((segment, index) =>
        segment.url ? (
          <Text
            accessibilityRole="link"
            accessibilityLabel={segment.text}
            key={index}
            onLongPress={onLongPress}
            onPress={(event) => {
              event.stopPropagation();
              void Linking.openURL(segment.url!).catch(() =>
                Alert.alert(t('Erreur'), t('Impossible d’ouvrir ce lien.')),
              );
            }}
            style={[styles.link, { color: linkColor ?? palette.electric }]}
          >
            {segment.text}
          </Text>
        ) : (
          segment.text
        ),
      )}
    </AppText>
  );
}

const styles = StyleSheet.create({ link: { textDecorationLine: 'underline' } });
