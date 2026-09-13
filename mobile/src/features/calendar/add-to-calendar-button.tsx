import { useTranslation } from 'react-i18next';
import { Alert, Linking, Platform } from 'react-native';

import { useCalendarEvent } from './use-calendar-event';

import { DispoButton } from '@/components/ui/pressable';

interface AddToCalendarButtonProps {
  endsAt?: string | Date | undefined;
  location?: string | undefined;
  notes?: string | undefined;
  sourceId: string;
  startsAt: string | Date;
  title: string;
  url?: string | undefined;
}

/**
 * Ajoute la session au calendrier « Dispo » de l'appareil, ou l'en retire.
 * L'état suit la carte locale partagée avec la synchronisation automatique.
 */
export function AddToCalendarButton(props: AddToCalendarButtonProps) {
  const { t } = useTranslation();
  const { busy, present, toggle } = useCalendarEvent(props);

  const onPress = async () => {
    const result = await toggle();
    if (result === 'denied') {
      Alert.alert(
        t('Accès au calendrier refusé'),
        t(
          'Autorise Dispo à écrire dans ton calendrier depuis les réglages du téléphone pour y retrouver tes sessions.',
        ),
        [
          { style: 'cancel', text: t('Plus tard') },
          {
            onPress: () => {
              void (
                Platform.OS === 'ios' ? Linking.openURL('app-settings:') : Linking.openSettings()
              ).catch(() => undefined);
            },
            text: t('Ouvrir les réglages'),
          },
        ],
      );
    } else if (result === 'failed') {
      Alert.alert(
        t('Calendrier indisponible'),
        t('La session n’a pas pu être écrite dans le calendrier.'),
      );
    }
  };

  return (
    <DispoButton
      accessibilityLabel={present ? t('Retirer du calendrier') : t('Ajouter au calendrier')}
      icon={present ? 'calendar' : 'calendar-outline'}
      loading={busy}
      onPress={() => void onPress()}
      size="compact"
      variant="secondary"
    >
      {present ? t('Dans le calendrier') : t('Ajouter au calendrier')}
    </DispoButton>
  );
}
