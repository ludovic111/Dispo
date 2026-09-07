import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui/app-text';
import { Avatar } from '@/components/ui/avatar';
import { BrandLogo } from '@/components/ui/brand';
import { formatSwiftPlaceholders } from '@/i18n/format';
import { useDispoTheme } from '@/theme/theme-context';
import { spacing } from '@/theme/tokens';

export function DiscoveryHomeWelcome({
  availabilityColor,
  firstName,
  greeting,
  networkCount,
  onNotifications,
  onProfile,
  onSearch,
  profileName,
  profilePhotoUrl,
  unread,
}: {
  availabilityColor: string | null;
  firstName: string;
  greeting: string;
  networkCount: number;
  onNotifications: () => void;
  onProfile: () => void;
  onSearch: () => void;
  profileName: string;
  profilePhotoUrl: string | null;
  unread: number;
}) {
  const { palette } = useDispoTheme();
  const { t } = useTranslation();
  return (
    <>
      <View style={styles.topRow}>
        <View style={styles.greeting}>
          <BrandLogo markSize={20} />
          <AppText style={styles.greetingTitle} variant="display">
            {greeting}, {firstName}
          </AppText>
          <View style={styles.networkLine}>
            <Ionicons color={palette.electric} name="people" size={13} />
            <AppText color={palette.muted} style={styles.flexText} variant="subheadline">
              {formatSwiftPlaceholders(t('%lld musiciens sur le réseau'), networkCount)}
            </AppText>
          </View>
        </View>
        <View style={styles.headerActions}>
          <Pressable
            accessibilityLabel={t('Notifications')}
            accessibilityRole="button"
            accessibilityValue={{
              text: formatSwiftPlaceholders(t('%lld non lues'), unread),
            }}
            onPress={onNotifications}
            style={({ pressed }) => [
              styles.circleAction,
              { backgroundColor: palette.cardMuted, borderColor: palette.border },
              pressed && styles.pressed,
            ]}
          >
            <Ionicons
              color={palette.electric}
              name={unread > 0 ? 'notifications' : 'notifications-outline'}
              size={19}
            />
            {unread > 0 ? (
              <View style={[styles.badge, { backgroundColor: palette.signal }]}>
                <AppText color="#FFFFFF" style={styles.badgeText}>
                  {unread > 99 ? '99+' : unread}
                </AppText>
              </View>
            ) : null}
          </Pressable>
          <Pressable
            accessibilityLabel={t('Ouvrir mon profil')}
            accessibilityRole="button"
            onPress={onProfile}
            style={({ pressed }) => pressed && styles.pressed}
          >
            <View>
              <Avatar name={profileName} size={48} uri={profilePhotoUrl} />
              {availabilityColor ? (
                <View
                  style={[
                    styles.availableDot,
                    { backgroundColor: availabilityColor, borderColor: palette.background },
                  ]}
                />
              ) : null}
            </View>
          </Pressable>
        </View>
      </View>

      <Pressable
        accessibilityRole="search"
        accessibilityLabel={t('Musicien, @pseudo, instrument, lieu…')}
        onPress={onSearch}
        style={({ pressed }) => [
          styles.search,
          { backgroundColor: palette.cardMuted, borderColor: palette.border },
          pressed && styles.pressed,
        ]}
      >
        <Ionicons color={palette.muted} name="search" size={17} />
        <AppText
          color={palette.muted}
          numberOfLines={1}
          style={styles.flexText}
          variant="subheadline"
        >
          {t('Musicien, @pseudo, instrument, lieu…')}
        </AppText>
      </Pressable>
    </>
  );
}

const styles = StyleSheet.create({
  availableDot: {
    borderRadius: 6,
    borderWidth: 2,
    height: 12,
    position: 'absolute',
    right: -2,
    top: -2,
    width: 12,
  },
  badge: {
    alignItems: 'center',
    borderRadius: 9,
    justifyContent: 'center',
    minHeight: 17,
    minWidth: 17,
    paddingHorizontal: 4,
    position: 'absolute',
    right: -5,
    top: -4,
  },
  badgeText: { fontSize: 9, fontWeight: '900', lineHeight: 11 },
  circleAction: {
    alignItems: 'center',
    borderRadius: 24,
    borderWidth: 1,
    height: 48,
    justifyContent: 'center',
    width: 48,
  },
  greeting: { flex: 1, gap: spacing.tight },
  flexText: { flex: 1, minWidth: 0 },
  greetingTitle: { fontSize: 25, lineHeight: 29 },
  headerActions: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm },
  networkLine: { alignItems: 'center', flexDirection: 'row', gap: spacing.tight },
  pressed: { opacity: 0.94, transform: [{ scale: 0.97 }] },
  search: {
    alignItems: 'center',
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.chip,
    minHeight: 48,
    paddingHorizontal: spacing.cluster,
  },
  topRow: { alignItems: 'center', flexDirection: 'row', gap: spacing.cluster },
});
