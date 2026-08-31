import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Alert, StyleSheet, View } from 'react-native';

import { NativeHeaderButton } from '@/components/ui/native-header-button';
import { SchoolCommunityScreen } from '@/features/schools/school-community-screen';
import { schoolDisplayName, schoolErrorMessage } from '@/features/schools/school-model';
import { useLeaveSchool, useSchoolCommunity } from '@/features/schools/school-queries';

export default function SchoolCommunityRoute() {
  const { t } = useTranslation();
  const { id = '' } = useLocalSearchParams<{ id?: string }>();
  const community = useSchoolCommunity(id);
  const leave = useLeaveSchool();
  const school = community.data?.affiliation.school;

  const confirmLeave = () => {
    if (!school) return;
    Alert.alert(
      t('Quitter cette communauté ?'),
      t("Ton affiliation disparaîtra et tu perdras immédiatement l'accès à cette conversation."),
      [
        { style: 'cancel', text: t('Annuler') },
        {
          onPress: () =>
            leave
              .mutateAsync(school.id)
              .then(() => router.replace(`/schools/${school.id}` as never))
              .catch((error: unknown) =>
                Alert.alert(t("Impossible de quitter l'école"), t(schoolErrorMessage(error))),
              ),
          style: 'destructive',
          text: t("Quitter l'école"),
        },
      ],
    );
  };

  const openMenu = () => {
    if (!school) return;
    Alert.alert(school.name, undefined, [
      { style: 'cancel', text: t('Annuler') },
      {
        onPress: () => router.push(`/schools/${school.id}/join` as never),
        text: t('Modifier mon affiliation'),
      },
      { onPress: confirmLeave, style: 'destructive', text: t('Quitter cette école') },
    ]);
  };

  return (
    <>
      <Stack.Screen
        options={{
          ...(school
            ? {
                headerRight: () => (
                  <View style={styles.actions}>
                    <NativeHeaderButton
                      icon="people"
                      label={t('Voir les membres')}
                      onPress={() => router.push(`/schools/${school.id}/members` as never)}
                    />
                    <NativeHeaderButton
                      icon="ellipsis-horizontal-circle"
                      label={t('Modifier mon affiliation')}
                      onPress={openMenu}
                    />
                  </View>
                ),
              }
            : {}),
          title: school ? schoolDisplayName(school) : t('École'),
        }}
      />
      <SchoolCommunityScreen schoolId={id} />
    </>
  );
}

const styles = StyleSheet.create({
  actions: { alignItems: 'center', flexDirection: 'row' },
});
