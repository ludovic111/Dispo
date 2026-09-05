import { useMutation, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Switch, View } from 'react-native';

import { attendanceFor, type GroupEvent, type MusicGroup } from './group-model';
import { useUpdateGroupSettings } from './group-queries';

import { AppText } from '@/components/ui/app-text';
import { Card } from '@/components/ui/card';
import { DispoButton } from '@/components/ui/pressable';
import { getSupabaseClient } from '@/services/supabase/client';
import { useDispoTheme } from '@/theme/theme-context';
import { spacing } from '@/theme/tokens';

export function GroupEventAutoSos({ event, group }: { event: GroupEvent; group: MusicGroup }) {
  const { t } = useTranslation();
  const { palette } = useDispoTheme();
  const client = useQueryClient();
  const update = useUpdateGroupSettings();
  const create = useMutation({
    mutationFn: async (memberId: string) => {
      const member = group.members.find((item) => item.id === memberId);
      const instrument = member?.role || member?.instruments[0];
      if (!instrument) throw new Error('missing_instrument');
      const result = await getSupabaseClient().rpc('create_auto_sos', {
        p_event_id: event.id,
        p_absent_profile_id: memberId,
        p_instrument: instrument,
        p_title: `${t(event.kind)} — ${t(instrument)}`,
        p_description: '',
      });
      if (result.error) throw result.error;
      const gigId = result.data?.[0]?.gig_id;
      if (!gigId) throw new Error('auto_sos_not_created');
      return gigId;
    },
    onSuccess: async (gigId) => {
      await Promise.all([
        client.invalidateQueries({ queryKey: ['groups'] }),
        client.invalidateQueries({ queryKey: ['gigs'] }),
      ]);
      router.push(`/gigs/${gigId}` as never);
    },
  });
  const [openedAt] = useState(Date.now);
  const absent = group.members.filter(
    (member) => attendanceFor(event, member.id) === 'unavailable',
  );
  if (Date.parse(event.date) <= openedAt) return null;
  return (
    <Card style={styles.card}>
      <View style={styles.row}>
        <AppText style={styles.flex} variant="title">
          {t('Auto-SOS')}
        </AppText>
        <Switch
          accessibilityLabel={t('Auto-SOS pour ce groupe')}
          disabled={update.isPending || create.isPending}
          value={group.autoSosEnabled}
          onValueChange={(enabled) =>
            update.mutate(
              {
                groupId: group.id,
                name: group.name,
                isPublic: group.isPublic,
                autoSosEnabled: enabled,
                autoSosMinLevel: enabled ? 'same' : group.autoSosMinLevel,
              },
              {
                onSuccess: () => {
                  void client.invalidateQueries({ queryKey: ['gigs'] });
                },
              },
            )
          }
        />
      </View>
      <AppText color={palette.muted} variant="caption">
        {group.autoSosEnabled && group.autoSosMinLevel === null
          ? t('Cherche automatiquement un remplaçant quand un rôle manque.')
          : t(
              'Pour les dates du groupe, un SOS reprend l’instrument et le niveau du membre absent.',
            )}
      </AppText>
      {group.autoSosEnabled
        ? absent.map((member) => (
            <DispoButton
              key={member.id}
              variant="secondary"
              disabled={
                update.isPending || create.isPending || (!member.role && !member.instruments.length)
              }
              loading={create.isPending && create.variables === member.id}
              onPress={() => create.mutate(member.id)}
            >
              {t('SOS pour {{name}}', { name: member.name })}
            </DispoButton>
          ))
        : null}
      {update.error || create.error ? (
        <AppText color={palette.error} variant="caption">
          {t('L’Auto-SOS n’a pas pu être activé. Vérifie les droits du leader et réessaie.')}
        </AppText>
      ) : null}
    </Card>
  );
}
const styles = StyleSheet.create({
  card: { gap: spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  flex: { flex: 1 },
});
