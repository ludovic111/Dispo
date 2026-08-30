import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui/app-text';
import { Card } from '@/components/ui/card';
import { FormField } from '@/components/ui/form-field';
import { DispoButton } from '@/components/ui/pressable';
import { ErrorState, LoadingState, Screen } from '@/components/ui/screen';
import { Tag } from '@/components/ui/tag';
import { useAuth } from '@/features/auth/auth-context';
import { useApplyToGig, useGig } from '@/features/gigs/gig-queries';
import { useDispoTheme } from '@/theme/theme-context';
import { spacing } from '@/theme/tokens';

export default function GigDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session } = useAuth();
  const { palette } = useDispoTheme();
  const query = useGig(id);
  const apply = useApplyToGig();
  const [instrument, setInstrument] = useState('');
  const [message, setMessage] = useState('');

  if (query.isLoading)
    return (
      <Screen>
        <LoadingState label="Chargement du SOS…" />
      </Screen>
    );
  if (query.isError)
    return (
      <Screen>
        <ErrorState message={query.error.message} onRetry={() => void query.refetch()} />
      </Screen>
    );
  const gig = query.data;
  if (!gig)
    return (
      <Screen>
        <ErrorState message="Annonce introuvable." />
      </Screen>
    );
  const mine = gig.hostId === session?.user.id;
  const date = new Intl.DateTimeFormat('fr-CH', { dateStyle: 'full', timeStyle: 'short' }).format(
    new Date(gig.date),
  );

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Card style={styles.hero}>
          <View style={styles.topline}>
            <Tag
              color={gig.isLocked ? palette.bronze : palette.signal}
              label={gig.isLocked ? 'Premium' : 'SOS'}
            />
            <Tag color={palette.bronze} label={gig.genre} />
          </View>
          <AppText variant="display">{gig.title}</AppText>
          <View style={styles.meta}>
            <Ionicons color={palette.electric} name="calendar-outline" size={18} />
            <AppText style={styles.metaText}>{date}</AppText>
          </View>
          <View style={styles.meta}>
            <Ionicons color={palette.electric} name="location-outline" size={18} />
            <AppText style={styles.metaText}>{gig.place}</AppText>
          </View>
          <View style={styles.tags}>
            {gig.wantedInstruments.map((item) => (
              <Tag key={item} label={item} />
            ))}
          </View>
          {gig.fee ? (
            <AppText color={palette.electric} style={styles.fee}>
              {gig.fee} CHF
            </AppText>
          ) : null}
        </Card>
        <Card style={styles.section}>
          <AppText color={palette.bronze} variant="label">
            Organisateur
          </AppText>
          <AppText variant="title">{gig.hostName}</AppText>
          <AppText>
            {gig.description ??
              'Le détail complet est réservé aux membres Premium pendant l’avant-première.'}
          </AppText>
        </Card>
        {!mine ? (
          <Card style={styles.section}>
            <AppText color={palette.bronze} variant="label">
              Je peux dépanner
            </AppText>
            <FormField
              autoCapitalize="words"
              label="Instrument"
              onChangeText={setInstrument}
              placeholder="Ex. Guitare"
              value={instrument}
            />
            <FormField
              label="Message"
              multiline
              numberOfLines={3}
              onChangeText={setMessage}
              placeholder="Présente-toi en quelques mots…"
              style={styles.textarea}
              value={message}
            />
            {apply.error ? <AppText color={palette.error}>{apply.error.message}</AppText> : null}
            {apply.isSuccess ? <AppText color={palette.jam}>Candidature envoyée.</AppText> : null}
            <DispoButton
              disabled={!instrument.trim() || gig.isLocked}
              loading={apply.isPending}
              onPress={() =>
                apply.mutate({
                  gigId: gig.id,
                  instrument,
                  message,
                  musicianId: session?.user.id ?? '',
                })
              }
            >
              Je peux dépanner !
            </DispoButton>
          </Card>
        ) : (
          <Card>
            <AppText color={palette.muted}>
              C’est ton annonce. Les candidatures seront migrées avec la gestion complète des SOS.
            </AppText>
          </Card>
        )}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { gap: spacing.md, padding: spacing.md, paddingBottom: spacing.xxl },
  fee: { fontFamily: 'SplineSansMonoSemibold', fontSize: 20 },
  hero: { gap: spacing.md },
  meta: { alignItems: 'center', flexDirection: 'row', gap: spacing.xs },
  metaText: { flex: 1 },
  section: { gap: spacing.sm },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  textarea: { minHeight: 94, textAlignVertical: 'top' },
  topline: { flexDirection: 'row', gap: spacing.xs },
});
