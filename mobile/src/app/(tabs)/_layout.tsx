import { Redirect } from 'expo-router';
import { NativeTabs } from 'expo-router/unstable-native-tabs';
import { useTranslation } from 'react-i18next';
import { Platform } from 'react-native';

import { LoadingState, Screen } from '@/components/ui/screen';
import { useAuth } from '@/features/auth/auth-context';
import { tabBadgeValue } from '@/features/navigation/tab-badge-model';
import { useTabBadgeCounts } from '@/features/navigation/tab-badge-queries';
import { useDispoTheme } from '@/theme/theme-context';

export default function TabsLayout() {
  const { isLoading, session } = useAuth();
  const { palette } = useDispoTheme();
  const { t } = useTranslation();
  const badges = useTabBadgeCounts();
  const messagesBadge = tabBadgeValue(badges.messages);
  const sessionsBadge = tabBadgeValue(badges.sessions);
  const sosBadge = tabBadgeValue(badges.sos);
  if (isLoading)
    return (
      <Screen>
        <LoadingState />
      </Screen>
    );
  if (!session) return <Redirect href="/(auth)/sign-in" />;

  return (
    <NativeTabs minimizeBehavior="automatic" tintColor={palette.electric}>
      <NativeTabs.Trigger disableAutomaticContentInsets={Platform.OS === 'ios'} name="index">
        <NativeTabs.Trigger.Icon
          md={{ default: 'home', selected: 'home_filled' }}
          sf={{ default: 'house', selected: 'house.fill' }}
        />
        <NativeTabs.Trigger.Label>{t('Accueil')}</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>

      <NativeTabs.Trigger disableAutomaticContentInsets={Platform.OS === 'ios'} name="sessions">
        <NativeTabs.Trigger.Icon
          md={{ default: 'calendar_month', selected: 'event_available' }}
          sf={{ default: 'calendar', selected: 'calendar.badge.checkmark' }}
        />
        <NativeTabs.Trigger.Label>{t('Sessions')}</NativeTabs.Trigger.Label>
        {sessionsBadge === undefined ? null : (
          <NativeTabs.Trigger.Badge>{sessionsBadge}</NativeTabs.Trigger.Badge>
        )}
      </NativeTabs.Trigger>

      <NativeTabs.Trigger disableAutomaticContentInsets={Platform.OS === 'ios'} name="sos">
        <NativeTabs.Trigger.Icon
          md={{ default: 'bolt', selected: 'electric_bolt' }}
          sf={{ default: 'bolt', selected: 'bolt.fill' }}
        />
        <NativeTabs.Trigger.Label>{t('SOS')}</NativeTabs.Trigger.Label>
        {sosBadge === undefined ? null : (
          <NativeTabs.Trigger.Badge>{sosBadge}</NativeTabs.Trigger.Badge>
        )}
      </NativeTabs.Trigger>

      <NativeTabs.Trigger disableAutomaticContentInsets={Platform.OS === 'ios'} name="messages">
        <NativeTabs.Trigger.Icon
          md={{ default: 'chat', selected: 'forum' }}
          sf={{
            default: 'bubble.left.and.bubble.right',
            selected: 'bubble.left.and.bubble.right.fill',
          }}
        />
        <NativeTabs.Trigger.Label>{t('Messages')}</NativeTabs.Trigger.Label>
        {messagesBadge === undefined ? null : (
          <NativeTabs.Trigger.Badge>{messagesBadge}</NativeTabs.Trigger.Badge>
        )}
      </NativeTabs.Trigger>

      <NativeTabs.Trigger disableAutomaticContentInsets={Platform.OS === 'ios'} name="profile">
        <NativeTabs.Trigger.Icon
          md={{ default: 'person', selected: 'account_circle' }}
          sf={{ default: 'person.crop.circle', selected: 'person.crop.circle.fill' }}
        />
        <NativeTabs.Trigger.Label>{t('Profil')}</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
