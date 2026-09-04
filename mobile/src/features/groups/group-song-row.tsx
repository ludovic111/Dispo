import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { type ReactNode, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Alert,
  Linking,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  type ViewStyle,
} from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Path, Rect } from 'react-native-svg';

import type { GroupMember, GroupSong } from './group-model';
import { soloOrderMembers } from './group-song-row-model';

import { AppText } from '@/components/ui/app-text';
import { Avatar } from '@/components/ui/avatar';
import { Card } from '@/components/ui/card';
import { Tag } from '@/components/ui/tag';
import {
  directStreamingDestinations,
  streamingSearchFallbacks,
  type StreamingPlatformId,
} from '@/domain/song';
import { useDispoTheme } from '@/theme/theme-context';
import { minimumTouchTarget, radii, spacing, typography } from '@/theme/tokens';

const platformLabels: Record<StreamingPlatformId, string> = {
  amazonMusic: 'Amazon Music',
  appleMusic: 'Apple Music',
  deezer: 'Deezer',
  spotify: 'Spotify',
  tidal: 'Tidal',
  youtubeMusic: 'YouTube Music',
};

function StreamingLogo({ platform, size = 34 }: { platform: StreamingPlatformId; size?: number }) {
  const { dark } = useDispoTheme();
  if (platform === 'deezer') {
    const colors = ['#A238FF', '#5A5BFF', '#00B9FF', '#00D88A', '#F5D90A', '#FF7A21', '#FF3055'];
    return (
      <View
        accessible={false}
        style={[styles.logoSurface, { backgroundColor: '#111118', height: size, width: size }]}
      >
        <View style={styles.deezerBars}>
          {colors.map((color, index) => (
            <View
              key={color}
              style={{
                backgroundColor: color,
                height: 5 + (index % 3) * 3,
                width: 2.4,
              }}
            />
          ))}
        </View>
      </View>
    );
  }
  if (platform === 'tidal') {
    return (
      <View
        accessible={false}
        style={[
          styles.logoSurface,
          { backgroundColor: dark ? '#FFFFFF' : '#050814', height: size, width: size },
        ]}
      >
        <Svg height={size * 0.62} viewBox="0 0 24 15" width={size * 0.62}>
          <Path
            d="M4 0 8 4 4 8 0 4 4 0Zm8 0 4 4-4 4-4-4 4-4Zm8 0 4 4-4 4-4-4 4-4Zm-8 8 4 4-4 4-4-4 4-4Z"
            fill={dark ? '#050814' : '#FFFFFF'}
          />
        </Svg>
      </View>
    );
  }
  if (platform === 'amazonMusic') {
    return (
      <View
        accessible={false}
        style={[styles.logoSurface, { backgroundColor: '#172235', height: size, width: size }]}
      >
        <Ionicons color="#FFFFFF" name="logo-amazon" size={size * 0.58} />
        <Svg height={size * 0.22} style={styles.amazonSmile} viewBox="0 0 24 6" width={size * 0.68}>
          <Path d="M2 1.5c5.8 3.7 12.3 3.8 19.6.1" fill="none" stroke="#25D1DA" strokeWidth="2" />
          <Path d="m18.7.5 3.2 1-1.1 3" fill="none" stroke="#25D1DA" strokeWidth="1.6" />
        </Svg>
      </View>
    );
  }
  const path =
    platform === 'appleMusic'
      ? 'M23.994 6.124a9.23 9.23 0 00-.24-2.19c-.317-1.31-1.062-2.31-2.18-3.043a5.022 5.022 0 00-1.877-.726 10.496 10.496 0 00-1.564-.15c-.04-.003-.083-.01-.124-.013H5.986c-.152.01-.303.017-.455.026-.747.043-1.49.123-2.193.4-1.336.53-2.3 1.452-2.865 2.78-.192.448-.292.925-.363 1.408-.056.392-.088.785-.1 1.18 0 .032-.007.062-.01.093v12.223c.01.14.017.283.027.424.05.815.154 1.624.497 2.373.65 1.42 1.738 2.353 3.234 2.801.42.127.856.187 1.293.228.555.053 1.11.06 1.667.06h11.03a12.5 12.5 0 001.57-.1c.822-.106 1.596-.35 2.295-.81a5.046 5.046 0 001.88-2.207c.186-.42.293-.87.37-1.324.113-.675.138-1.358.137-2.04-.002-3.8 0-7.595-.003-11.393zm-6.423 3.99v5.712c0 .417-.058.827-.244 1.206-.29.59-.76.962-1.388 1.14-.35.1-.706.157-1.07.173-.95.045-1.773-.6-1.943-1.536a1.88 1.88 0 011.038-2.022c.323-.16.67-.25 1.018-.324.378-.082.758-.153 1.134-.24.274-.063.457-.23.51-.516a.904.904 0 00.02-.193c0-1.815 0-3.63-.002-5.443a.725.725 0 00-.026-.185c-.04-.15-.15-.243-.304-.234-.16.01-.318.035-.475.066-.76.15-1.52.303-2.28.456l-2.325.47-1.374.278c-.016.003-.032.01-.048.013-.277.077-.377.203-.39.49-.002.042 0 .086 0 .13-.002 2.602 0 5.204-.003 7.805 0 .42-.047.836-.215 1.227-.278.64-.77 1.04-1.434 1.233-.35.1-.71.16-1.075.172-.96.036-1.755-.6-1.92-1.544-.14-.812.23-1.685 1.154-2.075.357-.15.73-.232 1.108-.31.287-.06.575-.116.86-.177.383-.083.583-.323.6-.714v-.15c0-2.96 0-5.922.002-8.882 0-.123.013-.25.042-.37.07-.285.273-.448.546-.518.255-.066.515-.112.774-.165.733-.15 1.466-.296 2.2-.444l2.27-.46c.67-.134 1.34-.27 2.01-.403.22-.043.442-.088.663-.106.31-.025.523.17.554.482.008.073.012.148.012.223.002 1.91.002 3.822 0 5.732z'
      : platform === 'spotify'
        ? 'M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z'
        : 'M12 0C5.376 0 0 5.376 0 12s5.376 12 12 12 12-5.376 12-12S18.624 0 12 0zm0 19.104c-3.924 0-7.104-3.18-7.104-7.104S8.076 4.896 12 4.896s7.104 3.18 7.104 7.104-3.18 7.104-7.104 7.104zm0-13.332c-3.432 0-6.228 2.796-6.228 6.228S8.568 18.228 12 18.228s6.228-2.796 6.228-6.228S15.432 5.772 12 5.772zM9.684 15.54V8.46L15.816 12l-6.132 3.54z';
  const color =
    platform === 'appleMusic' ? '#FA243C' : platform === 'spotify' ? '#1DB954' : '#FF0000';
  return (
    <Svg accessible={false} height={size} viewBox="0 0 24 24" width={size}>
      <Rect fill="transparent" height="24" width="24" />
      <Path d={path} fill={color} />
    </Svg>
  );
}

export function SongArtwork({
  artworkUrl,
  radius,
  size,
}: {
  artworkUrl: string | null;
  radius: number;
  size: number;
}) {
  const { palette } = useDispoTheme();
  if (artworkUrl) {
    return (
      <Image
        accessibilityIgnoresInvertColors
        contentFit="cover"
        source={{ uri: artworkUrl }}
        style={{ borderRadius: radius, height: size, width: size }}
        transition={120}
      />
    );
  }
  return (
    <View
      style={[
        styles.artworkFallback,
        { backgroundColor: `${palette.bronze}24`, borderRadius: radius, height: size, width: size },
      ]}
    >
      <Ionicons color={palette.bronze} name="musical-note" size={size * 0.42} />
    </View>
  );
}

export function SongListenSheet({
  onClose,
  song,
  visible,
}: {
  onClose: () => void;
  song: GroupSong;
  visible: boolean;
}) {
  const { palette } = useDispoTheme();
  const { t } = useTranslation();
  const [searchesVisible, setSearchesVisible] = useState(false);
  const directDestinations = useMemo(() => directStreamingDestinations(song), [song]);
  const searchFallbacks = useMemo(() => streamingSearchFallbacks(song), [song]);
  const close = () => {
    setSearchesVisible(false);
    onClose();
  };
  const open = async (url: string) => {
    try {
      await Linking.openURL(url);
      close();
    } catch {
      Alert.alert(t('Erreur'), t('Ce lien ne peut pas être ouvert.'));
    }
  };
  return (
    <Modal
      animationType="fade"
      onRequestClose={close}
      presentationStyle="overFullScreen"
      statusBarTranslucent
      transparent
      visible={visible}
    >
      <View style={styles.sheetOverlay}>
        <Pressable
          accessibilityLabel={t('Fermer')}
          accessibilityRole="button"
          onPress={close}
          style={styles.sheetBackdrop}
        />
        <SafeAreaView
          edges={['bottom']}
          style={[
            styles.sheet,
            { backgroundColor: palette.background, borderColor: palette.border },
          ]}
        >
          <View style={[styles.sheetHandle, { backgroundColor: palette.border }]} />
          <View style={[styles.sheetNavigation, { borderBottomColor: palette.border }]}>
            <View style={styles.navigationSpacer} />
            <AppText numberOfLines={1} style={styles.sheetTitle} variant="headline">
              {t('Écouter sur…')}
            </AppText>
            <Pressable
              accessibilityLabel={t('Fermer')}
              accessibilityRole="button"
              hitSlop={10}
              onPress={close}
              style={[styles.closeButton, { backgroundColor: palette.inset }]}
            >
              <Ionicons color={palette.text} name="close" size={18} />
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={styles.sheetContent}>
            <View style={styles.sheetSong}>
              <SongArtwork artworkUrl={song.artworkUrl} radius={12} size={54} />
              <View style={styles.flex}>
                <AppText numberOfLines={2} style={styles.sheetSongTitle} variant="headline">
                  {song.title}
                </AppText>
                {song.artist ? (
                  <AppText color={palette.muted} numberOfLines={1} variant="subheadline">
                    {song.artist}
                  </AppText>
                ) : null}
              </View>
            </View>
            <View style={styles.destinationStack}>
              {directDestinations.map((destination) => (
                <Pressable
                  accessibilityLabel={`${t('Ouvrir')} ${platformLabels[destination.platform]}`}
                  accessibilityRole="link"
                  key={`direct-${destination.platform}`}
                  onPress={() => void open(destination.url)}
                  style={({ pressed }) => [
                    styles.destination,
                    { backgroundColor: palette.card, borderColor: palette.border },
                    pressed && styles.pressed,
                  ]}
                >
                  <StreamingLogo platform={destination.platform} />
                  <AppText numberOfLines={1} style={styles.destinationLabel} variant="subheadline">
                    {platformLabels[destination.platform]}
                  </AppText>
                  <Tag color={palette.jam} label={t('Lien direct')} />
                  <Ionicons color={palette.muted} name="arrow-up-outline" size={15} />
                </Pressable>
              ))}
              {!directDestinations.length ? (
                <AppText
                  color={palette.muted}
                  style={styles.emptyDestinations}
                  variant="subheadline"
                >
                  {t("Aucun lien exact n'est encore disponible pour ce morceau.")}
                </AppText>
              ) : null}
              {searchFallbacks.length ? (
                <>
                  <Pressable
                    accessibilityLabel={t('Rechercher sur un autre service')}
                    accessibilityRole="button"
                    accessibilityState={{ expanded: searchesVisible }}
                    onPress={() => setSearchesVisible((current) => !current)}
                    style={({ pressed }) => [
                      styles.searchToggle,
                      { backgroundColor: palette.inset },
                      pressed && styles.pressed,
                    ]}
                  >
                    <Ionicons color={palette.muted} name="search" size={18} />
                    <AppText style={styles.searchToggleLabel} variant="subheadline">
                      {t('Rechercher sur un autre service')}
                    </AppText>
                    <Ionicons
                      color={palette.muted}
                      name={searchesVisible ? 'chevron-up' : 'chevron-down'}
                      size={16}
                    />
                  </Pressable>
                  {searchesVisible ? (
                    <View style={styles.searchStack}>
                      {searchFallbacks.map((destination) => {
                        const label = t('Rechercher sur {{service}}', {
                          service: platformLabels[destination.platform],
                        });
                        return (
                          <Pressable
                            accessibilityLabel={label}
                            accessibilityRole="link"
                            key={`search-${destination.platform}`}
                            onPress={() => void open(destination.url)}
                            style={({ pressed }) => [
                              styles.destination,
                              styles.searchDestination,
                              { backgroundColor: palette.inset, borderColor: 'transparent' },
                              pressed && styles.pressed,
                            ]}
                          >
                            <StreamingLogo platform={destination.platform} size={30} />
                            <AppText
                              numberOfLines={1}
                              style={styles.destinationLabel}
                              variant="subheadline"
                            >
                              {label}
                            </AppText>
                            <Ionicons color={palette.muted} name="search" size={16} />
                          </Pressable>
                        );
                      })}
                    </View>
                  ) : null}
                </>
              ) : null}
            </View>
          </ScrollView>
        </SafeAreaView>
      </View>
    </Modal>
  );
}

export function SongSoloOrderSheet({
  members,
  onClose,
  song,
  visible,
}: {
  members: readonly GroupMember[];
  onClose: () => void;
  song: GroupSong;
  visible: boolean;
}) {
  const { palette } = useDispoTheme();
  const { t } = useTranslation();
  const orderedMembers = useMemo(() => soloOrderMembers(song, members), [members, song]);
  return (
    <Modal
      animationType="fade"
      onRequestClose={onClose}
      presentationStyle="overFullScreen"
      statusBarTranslucent
      transparent
      visible={visible}
    >
      <View style={styles.sheetOverlay}>
        <Pressable
          accessibilityLabel={t('Fermer')}
          accessibilityRole="button"
          onPress={onClose}
          style={styles.sheetBackdrop}
        />
        <SafeAreaView
          edges={['bottom']}
          style={[
            styles.sheet,
            { backgroundColor: palette.background, borderColor: palette.border },
          ]}
        >
          <View style={[styles.sheetHandle, { backgroundColor: palette.border }]} />
          <View style={[styles.sheetNavigation, { borderBottomColor: palette.border }]}>
            <View style={styles.navigationSpacer} />
            <AppText numberOfLines={1} style={styles.sheetTitle} variant="headline">
              {t('Ordre des solos')}
            </AppText>
            <Pressable
              accessibilityLabel={t('Fermer')}
              accessibilityRole="button"
              hitSlop={10}
              onPress={onClose}
              style={[styles.closeButton, { backgroundColor: palette.inset }]}
            >
              <Ionicons color={palette.text} name="close" size={18} />
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={styles.soloSheetContent}>
            <AppText color={palette.muted} variant="caption">
              {t("Les noms apparaissent dans l'ordre de passage.")}
            </AppText>
            {orderedMembers.map((member, index) => {
              const name = member?.name ?? t('Membre retiré');
              return (
                <View
                  key={`${song.solos[index]}-${index}`}
                  style={[styles.soloSheetRow, { borderColor: palette.border }]}
                >
                  <View style={[styles.soloIndex, { backgroundColor: palette.inset }]}>
                    <AppText style={styles.soloIndexText} variant="caption">
                      {index + 1}
                    </AppText>
                  </View>
                  <Avatar name={name} size={34} uri={member?.photoUrl ?? null} />
                  <View style={styles.flex}>
                    <AppText numberOfLines={1} style={styles.soloMemberName}>
                      {name}
                    </AppText>
                    {member?.instruments.length ? (
                      <AppText color={palette.muted} numberOfLines={1} variant="caption2">
                        {member.instruments.map((instrument) => t(instrument)).join(' · ')}
                      </AppText>
                    ) : null}
                  </View>
                </View>
              );
            })}
          </ScrollView>
        </SafeAreaView>
      </View>
    </Modal>
  );
}

function SongRowSurface({
  cardStyle,
  children,
  embedded,
}: {
  cardStyle?: ViewStyle;
  children: ReactNode;
  embedded: boolean;
}) {
  if (embedded) return <View style={[styles.embeddedSurface, cardStyle]}>{children}</View>;
  return (
    <Card padding={10} style={[styles.cardSurface, cardStyle]}>
      {children}
    </Card>
  );
}

export function GroupSongRow({
  cardStyle,
  embedded = false,
  members = [],
  onPress,
  showDisclosure = true,
  showListenAction = true,
  showSoloAction = true,
  song,
  trailing,
}: {
  cardStyle?: ViewStyle;
  embedded?: boolean;
  members?: readonly GroupMember[];
  onPress?: () => void;
  showDisclosure?: boolean;
  showListenAction?: boolean;
  showSoloAction?: boolean;
  song: GroupSong;
  trailing?: ReactNode;
}) {
  const { palette } = useDispoTheme();
  const { t } = useTranslation();
  const reduceMotion = useReducedMotion();
  const [listenVisible, setListenVisible] = useState(false);
  const [solosVisible, setSolosVisible] = useState(false);
  const metadata = [song.key?.trim(), song.tempoBpm ? `${song.tempoBpm} BPM` : null].filter(
    (value): value is string => Boolean(value),
  );
  return (
    <>
      <SongRowSurface {...(cardStyle ? { cardStyle } : {})} embedded={embedded}>
        <View style={styles.songRow}>
          <Pressable
            accessibilityHint={onPress ? t('Ouvrir') : undefined}
            accessibilityLabel={`${onPress ? `${t('Ouvrir')} ` : ''}${song.title}`}
            accessibilityRole={onPress ? 'button' : undefined}
            disabled={!onPress}
            onPress={onPress}
            style={({ pressed }) => [
              styles.identity,
              pressed && (reduceMotion ? styles.pressedReduced : styles.pressed),
            ]}
          >
            <SongArtwork artworkUrl={song.artworkUrl} radius={11} size={52} />
            <View style={styles.songCopy}>
              <AppText
                adjustsFontSizeToFit
                minimumFontScale={0.82}
                numberOfLines={1}
                style={styles.songTitle}
                variant="subheadline"
              >
                {song.title}
              </AppText>
              {song.artist ? (
                <AppText
                  adjustsFontSizeToFit
                  color={palette.muted}
                  minimumFontScale={0.8}
                  numberOfLines={1}
                  style={styles.artist}
                  variant="caption"
                >
                  {song.artist}
                </AppText>
              ) : null}
              {metadata.length ? (
                <AppText
                  color={palette.bronze}
                  numberOfLines={1}
                  style={styles.metadata}
                  variant="caption2"
                >
                  {metadata.join(' · ')}
                </AppText>
              ) : null}
              {song.form?.trim() ? (
                <AppText color={palette.bronze} style={styles.metadata} variant="caption2">
                  {song.form.trim()}
                </AppText>
              ) : null}
            </View>
            {onPress && showDisclosure ? (
              <Ionicons color={palette.muted} name="chevron-forward" size={16} />
            ) : null}
          </Pressable>
          {showListenAction ? (
            <Pressable
              accessibilityLabel={t('Écouter ce morceau')}
              accessibilityRole="button"
              hitSlop={8}
              onPress={() => setListenVisible(true)}
              style={({ pressed }) => [
                styles.listenButton,
                { backgroundColor: palette.inset },
                pressed && (reduceMotion ? styles.pressedReduced : styles.pressed),
              ]}
            >
              <Ionicons color={palette.muted} name="headset" size={14} />
            </Pressable>
          ) : null}
          {showSoloAction && song.solos.length > 0 ? (
            <Pressable
              accessibilityLabel={t('Ordre des solos')}
              accessibilityRole="button"
              hitSlop={8}
              onPress={() => setSolosVisible(true)}
              style={({ pressed }) => [
                styles.listenButton,
                { backgroundColor: palette.inset },
                pressed && (reduceMotion ? styles.pressedReduced : styles.pressed),
              ]}
            >
              <Ionicons color={palette.bronze} name="list" size={15} />
            </Pressable>
          ) : null}
          {trailing}
        </View>
      </SongRowSurface>
      <SongListenSheet
        onClose={() => setListenVisible(false)}
        song={song}
        visible={listenVisible}
      />
      <SongSoloOrderSheet
        members={members}
        onClose={() => setSolosVisible(false)}
        song={song}
        visible={solosVisible}
      />
    </>
  );
}

const styles = StyleSheet.create({
  amazonSmile: { bottom: 4, position: 'absolute' },
  artworkFallback: { alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  artist: { fontWeight: '600' },
  cardSurface: { minHeight: 76 },
  closeButton: {
    alignItems: 'center',
    borderRadius: 16,
    height: minimumTouchTarget,
    justifyContent: 'center',
    width: minimumTouchTarget,
  },
  deezerBars: { alignItems: 'flex-end', flexDirection: 'row', gap: 1 },
  destination: {
    alignItems: 'center',
    borderRadius: radii.button,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.sm,
    minHeight: 60,
    padding: spacing.sm,
  },
  destinationLabel: { flex: 1, fontWeight: '700' },
  destinationStack: { gap: spacing.xs },
  emptyDestinations: { paddingVertical: spacing.sm, textAlign: 'center' },
  embeddedSurface: { justifyContent: 'center', minHeight: 76, paddingHorizontal: 10 },
  flex: { flex: 1 },
  identity: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
    gap: spacing.section,
    minWidth: 0,
  },
  listenButton: {
    alignItems: 'center',
    borderRadius: 15,
    height: minimumTouchTarget,
    justifyContent: 'center',
    width: minimumTouchTarget,
  },
  logoSurface: {
    alignItems: 'center',
    borderRadius: 8,
    justifyContent: 'center',
    overflow: 'hidden',
  },
  metadata: { fontFamily: typography.monoSemibold, fontSize: 10.5, lineHeight: 14 },
  navigationSpacer: { width: 32 },
  pressed: { opacity: 0.94, transform: [{ scale: 0.97 }] },
  pressedReduced: { opacity: 0.96 },
  searchStack: { gap: spacing.xs },
  searchDestination: { minHeight: 52, opacity: 0.82 },
  searchToggle: {
    alignItems: 'center',
    borderRadius: radii.button,
    flexDirection: 'row',
    gap: spacing.sm,
    minHeight: 48,
    paddingHorizontal: spacing.sm,
  },
  searchToggleLabel: { flex: 1, fontWeight: '700' },
  soloIndex: {
    alignItems: 'center',
    borderRadius: 999,
    height: 28,
    justifyContent: 'center',
    width: 28,
  },
  soloIndexText: { fontWeight: '700' },
  soloMemberName: { fontWeight: '700' },
  soloSheetContent: { gap: spacing.xs, padding: spacing.gutter, paddingBottom: spacing.xxl },
  soloSheetRow: {
    alignItems: 'center',
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.xs,
    minHeight: 52,
    padding: spacing.xs,
  },
  sheet: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderWidth: 1,
    maxHeight: '82%',
    overflow: 'hidden',
  },
  sheetBackdrop: {
    backgroundColor: 'rgba(5, 8, 20, 0.58)',
    bottom: 0,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  sheetContent: { gap: spacing.cluster, padding: spacing.gutter, paddingBottom: spacing.xxl },
  sheetNavigation: {
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 52,
    paddingHorizontal: spacing.gutter,
  },
  sheetHandle: {
    alignSelf: 'center',
    borderRadius: 2,
    height: 5,
    marginTop: spacing.xs,
    width: 38,
  },
  sheetOverlay: { flex: 1, justifyContent: 'flex-end' },
  sheetSong: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm },
  sheetSongTitle: { fontWeight: '800' },
  sheetTitle: { flex: 1, fontWeight: '800', textAlign: 'center' },
  songCopy: { flex: 1, gap: 2, minWidth: 0 },
  songRow: { alignItems: 'center', flex: 1, flexDirection: 'row', gap: spacing.xs },
  songTitle: { fontWeight: '700' },
});
