import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet } from 'react-native';

import { AppText } from '@/components/ui/app-text';
import { Card } from '@/components/ui/card';
import { FormField } from '@/components/ui/form-field';
import { DispoButton } from '@/components/ui/pressable';
import { Screen } from '@/components/ui/screen';
import { useAuth } from '@/features/auth/auth-context';
import { useCreateGig } from '@/features/gigs/gig-queries';
import { useDispoTheme } from '@/theme/theme-context';
import { spacing } from '@/theme/tokens';

function defaultDate(): string {
  const date = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  return date.toISOString().slice(0, 16);
}

export default function CreateGigScreen() {
  const { session } = useAuth();
  const { palette } = useDispoTheme();
  const create = useCreateGig();
  const [title, setTitle] = useState('');
  const [date, setDate] = useState(defaultDate);
  const [genre, setGenre] = useState('');
  const [place, setPlace] = useState('');
  const [instrument, setInstrument] = useState('');
  const [description, setDescription] = useState('');
  const [fee, setFee] = useState('');
  const valid = useMemo(
    () => [title, date, genre, place, instrument, description].every((value) => value.trim()),
    [date, description, genre, instrument, place, title],
  );

  const submit = () => {
    const parsedDate = new Date(date);
    create.mutate(
      {
        date: parsedDate.toISOString(),
        description,
        fee: fee.trim() ? Number(fee) : null,
        genre,
        hostId: session?.user.id ?? '',
        place,
        title,
        wantedInstruments: instrument
          .split(',')
          .map((value) => value.trim())
          .filter(Boolean),
      },
      { onSuccess: (id) => router.replace(`/gigs/${id}`) },
    );
  };

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Card style={styles.card}>
          <AppText color={palette.bronze} variant="label">
            Nouvelle annonce
          </AppText>
          <AppText variant="display">Trouve le bon musicien</AppText>
          <FormField
            label="Titre"
            onChangeText={setTitle}
            placeholder="Remplacement pour un concert"
            value={title}
          />
          <FormField
            autoCapitalize="none"
            label="Date et heure (ISO)"
            onChangeText={setDate}
            placeholder="2026-09-06T20:00"
            value={date}
          />
          <FormField label="Style" onChangeText={setGenre} placeholder="Jazz" value={genre} />
          <FormField
            label="Lieu public"
            onChangeText={setPlace}
            placeholder="Genève"
            value={place}
          />
          <FormField
            label="Instrument(s)"
            onChangeText={setInstrument}
            placeholder="Basse, Batterie"
            value={instrument}
          />
          <FormField
            keyboardType="numeric"
            label="Cachet CHF (facultatif)"
            onChangeText={setFee}
            placeholder="250"
            value={fee}
          />
          <FormField
            label="Description"
            multiline
            numberOfLines={4}
            onChangeText={setDescription}
            placeholder="Décris le contexte, le répertoire et les horaires…"
            style={styles.textarea}
            value={description}
          />
          {create.error ? <AppText color={palette.error}>{create.error.message}</AppText> : null}
          <DispoButton
            disabled={!valid || Number.isNaN(Date.parse(date))}
            loading={create.isPending}
            onPress={submit}
          >
            Publier le SOS
          </DispoButton>
        </Card>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing.md },
  content: { padding: spacing.md, paddingBottom: spacing.xxl },
  textarea: { minHeight: 112, textAlignVertical: 'top' },
});
