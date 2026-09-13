import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import { GigMatchChips, GigMatchScore } from './gig-match-chips';
import { gigErrorMessage, type GigApplication, type GigDetail } from './gig-model';
import { useContactGigApplicant, useGigApplicationDecision } from './gig-queries';

import { AppText } from '@/components/ui/app-text';
import { Avatar } from '@/components/ui/avatar';
import { Card } from '@/components/ui/card';
import { FormField } from '@/components/ui/form-field';
import { DispoButton } from '@/components/ui/pressable';
import { BottomSheet } from '@/components/ui/sheet';
import { Tag } from '@/components/ui/tag';
import { VerifiedBadge } from '@/components/ui/verified-badge';
import { formatRelativeTime, type RelativeTimeUnit } from '@/i18n/relative-time';
import { useDispoTheme } from '@/theme/theme-context';
import { pressedStyle, spacing } from '@/theme/tokens';

export function relativeContactLabel(value: string, locale: string, now = new Date()): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const seconds = Math.round((date.getTime() - now.getTime()) / 1000);
  const units: { divisor: number; unit: RelativeTimeUnit }[] = [
    { divisor: 86_400, unit: 'day' },
    { divisor: 3_600, unit: 'hour' },
    { divisor: 60, unit: 'minute' },
  ];
  for (const item of units) {
    if (Math.abs(seconds) >= item.divisor || item.unit === 'minute') {
      return formatRelativeTime(seconds / item.divisor, item.unit, locale);
    }
  }
  return formatRelativeTime(0, 'minute', locale);
}

function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] ?? '';
}

function ContactSheet({
  applicant,
  gig,
  onClose,
  visible,
}: {
  applicant: GigApplication;
  gig: Pick<GigDetail, 'id' | 'title'>;
  onClose: () => void;
  visible: boolean;
}) {
  const { palette } = useDispoTheme();
  const { t } = useTranslation();
  const contact = useContactGigApplicant();
  const [text, setText] = useState(() =>
    t('Salut {{name}}, ', { name: firstName(applicant.musicianName) || t('toi') }),
  );
  const send = () =>
    contact.mutate(
      { applicationId: applicant.id, gigId: gig.id, text },
      {
        onSuccess: (conversationId) => {
          onClose();
          router.push(
            `/messages/${conversationId}?name=${encodeURIComponent(applicant.musicianName)}`,
          );
        },
      },
    );
  return (
    <BottomSheet
      avoidKeyboard
      onClose={onClose}
      title={t('Contacter {{name}}', { name: applicant.musicianName || t('Musicien·ne') })}
      visible={visible}
    >
      <View style={styles.sheet}>
        <AppText color={palette.muted}>
          {t('Un seul message par SOS : il ouvre une conversation privée avec cette personne.')}
        </AppText>
        <FormField
          autoFocus
          label={t('Message')}
          maxLength={500}
          multiline
          numberOfLines={4}
          onChangeText={setText}
          placeholder={t('Présente ton SOS en quelques mots…')}
          value={text}
        />
        {contact.error ? (
          <AppText color={palette.error} variant="caption">
            {t(gigErrorMessage(contact.error, 'Le message n’a pas pu être envoyé.'))}
          </AppText>
        ) : null}
        <DispoButton
          disabled={text.trim().length === 0}
          icon="paper-plane"
          loading={contact.isPending}
          onPress={send}
        >
          {t('Envoyer')}
        </DispoButton>
      </View>
    </BottomSheet>
  );
}

/**
 * Tuile d'un·e candidat·e vue par l'hôte : bloc en creux dans la carte
 * « J’organise », profil ouvrable, VU-mètre de compatibilité, critères de
 * match en puces, décision et contact unique.
 */
export function GigApplicantCard({
  applicant,
  gig,
}: {
  applicant: GigApplication;
  gig: Pick<GigDetail, 'date' | 'id' | 'title' | 'wantedLevels' | 'wantedSchoolIds'>;
}) {
  const { palette } = useDispoTheme();
  const { i18n, t } = useTranslation();
  const locale = i18n.resolvedLanguage ?? i18n.language ?? 'fr';
  const decision = useGigApplicationDecision();
  const [contacting, setContacting] = useState(false);
  const run = (value: 'accept' | 'decline' | 'reopen') =>
    decision.mutate({ applicationId: applicant.id, decision: value, gigId: gig.id });
  const name = applicant.musicianName || t('Musicien·ne');
  const status =
    applicant.status === 'accepted'
      ? { color: palette.jam, label: t('Pris·e') }
      : applicant.status === 'declined'
        ? { color: palette.signal, label: t('Écarté·e') }
        : { color: palette.bronze, label: t('En attente') };

  return (
    <Card padding={spacing.sm} style={styles.applicant} tone="inset">
      <Pressable
        accessibilityHint={t('Ouvre le profil')}
        accessibilityLabel={name}
        accessibilityRole="button"
        onPress={() => router.push(`/profiles/${applicant.musicianId}`)}
        style={({ pressed }) => [styles.applicantTop, pressed && pressedStyle]}
      >
        <Avatar name={name} size={44} uri={applicant.musicianPhotoUrl} />
        <View style={styles.applicantText}>
          <View style={styles.nameRow}>
            <AppText numberOfLines={2} style={styles.name} variant="title3">
              {name}
            </AppText>
            {applicant.musicianIsPremium ? <VerifiedBadge size="sm" /> : null}
          </View>
          <View style={styles.statusRow}>
            <AppText color={palette.muted} variant="caption">
              {applicant.instrument ? t(applicant.instrument) : t('Instrument à préciser')}
            </AppText>
            <Tag color={status.color} label={status.label} />
          </View>
        </View>
        {applicant.match ? <GigMatchScore score={applicant.match.score} /> : null}
      </Pressable>
      {applicant.match ? (
        <GigMatchChips
          gigDate={gig.date}
          levelWanted={gig.wantedLevels.length > 0}
          match={applicant.match}
          musicianLevel={applicant.musicianLevel}
          perspective="host"
          schoolWanted={(gig.wantedSchoolIds ?? []).length > 0}
        />
      ) : null}
      {applicant.match && applicant.match.commonSongs.titles.length > 0 ? (
        <AppText color={palette.muted} numberOfLines={2} variant="caption">
          {applicant.match.commonSongs.titles.join(' · ')}
        </AppText>
      ) : null}
      {applicant.message ? (
        <AppText color={palette.muted} variant="caption">
          « {applicant.message} »
        </AppText>
      ) : null}
      <View style={styles.inlineActions}>
        {applicant.hostContactedAt ? (
          <Tag
            color={palette.bronze}
            icon="checkmark-done"
            label={t('Contacté·e · {{when}}', {
              when: relativeContactLabel(applicant.hostContactedAt, locale),
            })}
          />
        ) : (
          <DispoButton
            icon="chatbubble-ellipses-outline"
            onPress={() => setContacting(true)}
            size="compact"
            variant="secondary"
          >
            {t('Contacter')}
          </DispoButton>
        )}
        <View style={styles.flex} />
        {applicant.status === 'pending' ? (
          <>
            <DispoButton
              loading={decision.isPending}
              onPress={() => run('decline')}
              size="compact"
              variant="ghost"
            >
              {t('Refuser')}
            </DispoButton>
            <DispoButton loading={decision.isPending} onPress={() => run('accept')} size="compact">
              {t('Accepter')}
            </DispoButton>
          </>
        ) : null}
        {applicant.status === 'accepted' ? (
          <>
            <DispoButton
              loading={decision.isPending}
              onPress={() => run('reopen')}
              size="compact"
              variant="ghost"
            >
              {t('Remettre en attente')}
            </DispoButton>
            <DispoButton
              loading={decision.isPending}
              onPress={() => run('decline')}
              size="compact"
              variant="danger"
            >
              {t('Libérer')}
            </DispoButton>
          </>
        ) : null}
        {applicant.status === 'declined' ? (
          <DispoButton
            loading={decision.isPending}
            onPress={() => run('reopen')}
            size="compact"
            variant="secondary"
          >
            {t('Replacer en attente')}
          </DispoButton>
        ) : null}
      </View>
      {decision.error ? (
        <AppText color={palette.error} variant="caption">
          {t('La décision n’a pas pu être enregistrée.')}
        </AppText>
      ) : null}
      {contacting ? (
        <ContactSheet
          applicant={applicant}
          gig={gig}
          onClose={() => setContacting(false)}
          visible={contacting}
        />
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  applicant: { gap: spacing.sm },
  applicantText: { flex: 1, gap: spacing.xxs },
  applicantTop: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm },
  flex: { flex: 1 },
  name: { flexShrink: 1 },
  nameRow: { alignItems: 'center', flexDirection: 'row', gap: spacing.xxs },
  inlineActions: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  sheet: { gap: spacing.sm },
  statusRow: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
});
