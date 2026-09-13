import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui/app-text';
import { Avatar } from '@/components/ui/avatar';
import { IconButton } from '@/components/ui/pressable';
import { formatSwiftPlaceholders } from '@/i18n/format';
import { useDispoTheme } from '@/theme/theme-context';
import { insetStyle, minimumTouchTarget, pressedStyle, radii, spacing } from '@/theme/tokens';

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
          <AppText numberOfLines={2} variant="display">
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
          <IconButton
            accessibilityLabel={t('Notifications')}
            badge={unread}
            icon={unread > 0 ? 'notifications' : 'notifications-outline'}
            onPress={onNotifications}
          />
          <Pressable
            accessibilityLabel={t('Ouvrir mon profil')}
            accessibilityRole="button"
            onPress={onProfile}
            style={({ pressed }) => pressed && pressedStyle}
          >
            <View>
              <Avatar name={profileName} size={minimumTouchTarget} uri={profilePhotoUrl} />
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
        style={({ pressed }) => [styles.search, insetStyle(palette), pressed && pressedStyle]}
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
  // Pastille de présence : l'anneau de 2 pt la détache de la photo (couleur du fond).
  availableDot: {
    borderRadius: radii.round,
    borderWidth: 2,
    height: 12,
    position: 'absolute',
    right: -2,
    top: -2,
    width: 12,
  },
  flexText: { flex: 1, minWidth: 0 },
  greeting: { flex: 1, gap: spacing.tight },
  headerActions: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm },
  networkLine: { alignItems: 'center', flexDirection: 'row', gap: spacing.tight },
  search: {
    alignItems: 'center',
    borderRadius: radii.control,
    flexDirection: 'row',
    gap: spacing.xs,
    minHeight: minimumTouchTarget + spacing.xxs,
    paddingHorizontal: spacing.sm,
  },
  topRow: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm },
});
