import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import { useProfileCollaborators } from './profile-social-queries';

import { AppText } from '@/components/ui/app-text';
import { Avatar } from '@/components/ui/avatar';
import { Card } from '@/components/ui/card';
import { useDispoTheme } from '@/theme/theme-context';
import { pressedStyle, spacing } from '@/theme/tokens';

export function ProfileCollaboratorsCard({ profileId, name }: { profileId: string; name: string }) {
  const { t } = useTranslation();
  const { palette } = useDispoTheme();
  const query = useProfileCollaborators(profileId);
  const collaborators = query.data;
  if (!collaborators?.length) return null;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t('Voir les musiciens qui ont joué avec {{name}}', { name })}
      onPress={() =>
        router.push(`/profiles/${profileId}/played-with?name=${encodeURIComponent(name)}` as never)
      }
      style={({ pressed }) => pressed && pressedStyle}
    >
      <Card style={styles.row}>
        <View style={styles.avatars}>
          {collaborators.slice(0, 3).map((profile, index) => (
            <View key={profile.id} style={index > 0 ? styles.overlap : undefined}>
              <Avatar name={profile.name} uri={profile.photoUrl} size={34} />
            </View>
          ))}
        </View>
        <View style={styles.copy}>
          <AppText variant="headline">{t('A joué avec')}</AppText>
          <AppText color={palette.muted} variant="caption" numberOfLines={2}>
            {collaborators.length > 2
              ? t('{{names}} et {{count}} autres', {
                  names: collaborators
                    .slice(0, 2)
                    .map((profile) => profile.name)
                    .join(', '),
                  count: collaborators.length - 2,
                })
              : collaborators.map((profile) => profile.name).join(', ')}
          </AppText>
        </View>
        <Ionicons name="chevron-forward" size={18} color={palette.muted} />
      </Card>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  avatars: { flexDirection: 'row' },
  overlap: { marginLeft: -10 },
  copy: { flex: 1, gap: spacing.tight },
});
