import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import * as Location from 'expo-location';
import { router } from 'expo-router';
import type { TFunction } from 'i18next';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Linking, Platform, StyleSheet, View } from 'react-native';
import MapView, { Marker } from 'react-native-maps';

import { GigApplicantCard } from './gig-applicant-card';
import {
  GIG_PAYMENT_METHODS,
  eligibleApplyInstruments,
  gigErrorMessage,
  gigViewerAction,
  openGigInstruments,
  unslottedGigApplicants,
  type GigDetail,
} from './gig-model';
import {
  useApplyToGig,
  useDeleteGig,
  useRespondToDirectGig,
  useWithdrawGigApplication,
} from './gig-queries';
import { GigSchoolCriteria } from './gig-school-field';

import { AppText } from '@/components/ui/app-text';
import { Avatar } from '@/components/ui/avatar';
import { Card } from '@/components/ui/card';
import { ChoiceChip } from '@/components/ui/choice-chip';
import { DateTicket } from '@/components/ui/date-ticket';
import { FormField } from '@/components/ui/form-field';
import { ListRow } from '@/components/ui/list-row';
import { DispoButton } from '@/components/ui/pressable';
import { SectionHeader } from '@/components/ui/section';
import { Tag } from '@/components/ui/tag';
import { Barcode, TicketCard } from '@/components/ui/ticket-card';
import { VerifiedBadge } from '@/components/ui/verified-badge';
import { shortProfileLevel } from '@/domain/profile';
import { AddToCalendarButton } from '@/features/calendar/add-to-calendar-button';
import { gigCalendarSourceId } from '@/features/calendar/calendar-sync';
import { useProfile } from '@/features/profiles/profile-queries';
import { readableOn } from '@/theme/color';
import { useDispoTheme } from '@/theme/theme-context';
import { blend, onAccent, spacing } from '@/theme/tokens';

/** Largeur de la souche du billet : le billet de date (52 pt) et sa marge, alignée sur la perforation. */
const stubWidth = 52 + spacing.sm * 2;

function paymentLabel(value: string | null, t: TFunction): string | null {
  if (!value) return null;
  const label = GIG_PAYMENT_METHODS.find((method) => method.value === value)?.label;
  return label ? t(label) : value;
}

function PrivateLocationCard({ gig }: { gig: GigDetail }) {
  const { palette } = useDispoTheme();
  const { t } = useTranslation();
  const location = gig.location;
  const embeddedMapEnabled =
    Platform.OS === 'ios' || Constants.expoConfig?.extra?.googleMapsAndroidEnabled === true;
  const lookupQuery = [location.exactAddress, gig.neighborhood].filter(Boolean).join(', ');
  const directCoordinate =
    location.latitude !== null && location.longitude !== null
      ? { latitude: location.latitude, longitude: location.longitude }
      : null;
  const [geocoded, setGeocoded] = useState<{
    coordinate: { latitude: number; longitude: number };
    query: string;
  } | null>(null);
  const coordinate =
    directCoordinate ?? (geocoded?.query === lookupQuery ? geocoded.coordinate : null);

  useEffect(() => {
    if (
      (location.latitude !== null && location.longitude !== null) ||
      location.state !== 'available' ||
      !lookupQuery
    )
      return;
    let active = true;
    void Location.geocodeAsync(lookupQuery)
      .then(([match]) => {
        if (!active || !match) return;
        setGeocoded({
          coordinate: { latitude: match.latitude, longitude: match.longitude },
          query: lookupQuery,
        });
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [location.latitude, location.longitude, location.state, lookupQuery]);

  const openMap = async () => {
    if (location.state !== 'available' || !location.exactAddress) return;
    const query = encodeURIComponent(location.exactAddress);
    const coordinateLabel = coordinate ? `${coordinate.latitude},${coordinate.longitude}` : null;
    const url = Platform.select({
      ios: coordinateLabel ? `maps://?q=${query}&ll=${coordinateLabel}` : `maps://?q=${query}`,
      default: coordinateLabel ? `geo:0,0?q=${coordinateLabel}(${query})` : `geo:0,0?q=${query}`,
    });
    if (url && (await Linking.canOpenURL(url))) await Linking.openURL(url);
  };

  const content = {
    absent: {
      icon: 'location-outline' as const,
      message: t("L'organisateur n'a pas encore renseigné d'adresse exacte."),
      title: t('Lieu précis à confirmer'),
    },
    restricted: {
      icon: 'lock-closed' as const,
      message: t('Elle sera révélée seulement si tu es accepté·e ou si tu organises ce SOS.'),
      title: t('Adresse exacte protégée'),
    },
    unknown: {
      icon: 'cloud-offline-outline' as const,
      message: t(
        "La vérification privée n'a pas abouti. Aucune adresse n'est déduite de la zone publique.",
      ),
      title: t('Adresse privée non vérifiée'),
    },
  };

  if (location.state === 'available' && location.exactAddress) {
    return (
      <Card padding={0}>
        <View style={styles.privateLocationHeader}>
          <SectionHeader
            subtitle={t("Partagé uniquement avec l'organisateur et les personnes acceptées.")}
            title={t('Rendez-vous privé')}
          />
          <AppText variant="title">{location.exactAddress}</AppText>
        </View>
        {coordinate && embeddedMapEnabled ? (
          <MapView
            accessibilityLabel={t('Rendez-vous')}
            initialRegion={{
              ...coordinate,
              latitudeDelta: 0.012,
              longitudeDelta: 0.012,
            }}
            pitchEnabled={false}
            pointerEvents="none"
            rotateEnabled={false}
            scrollEnabled={false}
            style={styles.privateMap}
            toolbarEnabled={false}
            zoomEnabled={false}
          >
            <Marker coordinate={coordinate} pinColor={palette.signal} title={t('Rendez-vous')} />
          </MapView>
        ) : null}
        <View style={styles.routeRow}>
          <ListRow
            accessory={<Ionicons color={palette.muted} name="open-outline" size={16} />}
            leadingIcon="navigate-circle"
            onPress={() => void openMap()}
            title={t("Ouvrir l'itinéraire")}
            tone="plain"
          />
        </View>
      </Card>
    );
  }

  const state = content[location.state === 'available' ? 'unknown' : location.state];
  return (
    <Card style={styles.section}>
      <View style={styles.sectionTitleRow}>
        <Ionicons color={palette.bronze} name={state.icon} size={18} />
        <AppText variant="title">{state.title}</AppText>
      </View>
      <AppText color={palette.muted}>{state.message}</AppText>
    </Card>
  );
}

function OrganizerPanel({
  gig,
  onDeleted,
  onShowMatches,
}: {
  gig: GigDetail;
  onDeleted: () => void;
  onShowMatches: () => void;
}) {
  const { palette } = useDispoTheme();
  const { t } = useTranslation();
  const remove = useDeleteGig();
  const open = openGigInstruments(gig);
  const accepted = gig.applicants.filter((applicant) => applicant.status === 'accepted');
  const unslotted = unslottedGigApplicants(gig);
  return (
    <Card style={styles.section}>
      <SectionHeader title={t('J’organise')} />
      {gig.targetId ? (
        <View style={styles.statusLine}>
          <Tag
            color={
              gig.targetStatus === 'accepted'
                ? palette.jam
                : gig.targetStatus === 'declined'
                  ? palette.signal
                  : palette.bronze
            }
            label={
              gig.targetStatus === 'accepted'
                ? t('Demande acceptée')
                : gig.targetStatus === 'declined'
                  ? t('Demande refusée')
                  : t('Réponse en attente')
            }
          />
        </View>
      ) : (
        <>
          <AppText color={palette.muted}>
            {open.length === 0
              ? t('Tous les postes sont pourvus.')
              : open.length > 1
                ? t('{{count}} postes encore ouverts.', { count: open.length })
                : t('1 poste encore ouvert.')}
          </AppText>
          {accepted.length > 0 ? (
            <View style={styles.chips}>
              {accepted.map((applicant) => (
                <Tag
                  color={palette.jam}
                  key={applicant.id}
                  label={`${applicant.instrument ? t(applicant.instrument) : t('Poste')} · ${
                    applicant.musicianName || t('Musicien·ne')
                  }`}
                />
              ))}
            </View>
          ) : null}
          {gig.applicants.length === 0 ? (
            <AppText color={palette.muted}>{t('Aucune candidature pour le moment.')}</AppText>
          ) : (
            gig.wantedInstruments.map((instrument) => {
              const applicants = gig.applicants.filter(
                (applicant) => applicant.instrument === instrument,
              );
              if (applicants.length === 0) return null;
              return (
                <View key={instrument} style={styles.applicantGroup}>
                  <AppText color={palette.bronze} variant="label">
                    {t(instrument)}
                  </AppText>
                  {applicants.map((applicant) => (
                    <GigApplicantCard applicant={applicant} gig={gig} key={applicant.id} />
                  ))}
                </View>
              );
            })
          )}
          {unslotted.length > 0 ? (
            <View style={styles.applicantGroup}>
              <AppText color={palette.bronze} variant="label">
                {t('Autre')}
              </AppText>
              {unslotted.map((applicant) => (
                <GigApplicantCard applicant={applicant} gig={gig} key={applicant.id} />
              ))}
            </View>
          ) : null}
          <DispoButton onPress={onShowMatches} variant="secondary">
            {t('Voir les profils compatibles')}
          </DispoButton>
        </>
      )}
      <DispoButton
        loading={remove.isPending}
        onPress={() =>
          Alert.alert(t('Retirer ce SOS ?'), t('Les candidatures liées seront aussi supprimées.'), [
            { style: 'cancel', text: t('Annuler') },
            {
              onPress: () => remove.mutate(gig.id, { onSuccess: onDeleted }),
              style: 'destructive',
              text: t('Retirer'),
            },
          ])
        }
        variant="danger"
      >
        {t('Retirer ce SOS')}
      </DispoButton>
      {remove.error ? (
        <AppText color={palette.error}>{t('Le SOS n’a pas pu être retiré.')}</AppText>
      ) : null}
    </Card>
  );
}

function ViewerPanel({ gig, userId }: { gig: GigDetail; userId: string }) {
  const { palette } = useDispoTheme();
  const { t } = useTranslation();
  const action = gigViewerAction(gig, userId);
  const viewer = useProfile(userId, userId);
  const eligible = viewer.data
    ? eligibleApplyInstruments(gig, {
        instrumentLevels: viewer.data.instrumentLevels,
        instruments: viewer.data.instruments,
        level: viewer.data.level,
      })
    : [];
  const [instrument, setInstrument] = useState('');
  const [message, setMessage] = useState('');
  const selected = eligible.includes(instrument) ? instrument : (eligible[0] ?? '');
  const apply = useApplyToGig();
  const withdraw = useWithdrawGigApplication();
  const respond = useRespondToDirectGig();

  if (action === 'direct-pending') {
    return (
      <Card style={styles.section}>
        <AppText variant="title">{t('On te demande un dépannage')}</AppText>
        <AppText color={palette.muted}>
          {t('Ta réponse met automatiquement le poste à jour.')}
        </AppText>
        <View style={styles.actionsRow}>
          <View style={styles.actionButton}>
            <DispoButton
              loading={respond.isPending}
              onPress={() => respond.mutate({ accept: false, gigId: gig.id })}
              variant="danger"
            >
              {t('Non')}
            </DispoButton>
          </View>
          <View style={styles.actionButton}>
            <DispoButton
              loading={respond.isPending}
              onPress={() =>
                respond.mutate({
                  accept: true,
                  gigId: gig.id,
                  celebration: { title: gig.title, date: gig.date },
                  onCelebrationComplete: () => router.replace('/(tabs)/sessions'),
                })
              }
            >
              {t('Oui, je dépanne')}
            </DispoButton>
          </View>
        </View>
        {respond.error ? (
          <AppText color={palette.error}>{t('Réponse non envoyée.')}</AppText>
        ) : null}
      </Card>
    );
  }

  const statuses: Partial<
    Record<typeof action, { color: string; label: string; message: string }>
  > = {
    'application-accepted': {
      color: palette.jam,
      label: t('Candidature acceptée'),
      message: gig.myApplication?.instrument
        ? t('Tu es retenu·e pour {{instrument}}.', {
            instrument: t(gig.myApplication.instrument),
          })
        : t('Tu es retenu·e.'),
    },
    'application-declined': {
      color: palette.signal,
      label: t('Non retenu·e'),
      message: t("L'organisateur a choisi une autre candidature."),
    },
    'direct-accepted': {
      color: palette.jam,
      label: t('Dépannage accepté'),
      message: t("L'adresse exacte est disponible ci-dessus si elle a été renseignée."),
    },
    'direct-declined': {
      color: palette.signal,
      label: t('Demande refusée'),
      message: t('Ta réponse a bien été enregistrée.'),
    },
    filled: {
      color: palette.bronze,
      label: t('Équipe complète'),
      message: t('Tous les postes de ce SOS sont pourvus.'),
    },
    locked: {
      color: palette.bronze,
      label: t('Avant-première Premium'),
      message: t('Le détail complet est réservé aux membres Premium pendant l’avant-première.'),
    },
  };
  const status = statuses[action];
  if (status) {
    return (
      <Card style={styles.section}>
        <Tag color={status.color} label={status.label} />
        <AppText color={palette.muted}>{status.message}</AppText>
        {action === 'application-accepted' || action === 'direct-accepted' ? (
          <AddToCalendarButton
            location={gig.place || gig.neighborhood || undefined}
            sourceId={gigCalendarSourceId(gig.id)}
            startsAt={gig.date}
            title={gig.title}
            url={`dispo://gigs/${gig.id}`}
          />
        ) : null}
        {action === 'application-declined' ? (
          <DispoButton
            loading={withdraw.isPending}
            onPress={() => withdraw.mutate({ gigId: gig.id, musicianId: userId })}
            variant="secondary"
          >
            {t('Retirer ma candidature')}
          </DispoButton>
        ) : null}
        {action === 'application-declined' && withdraw.error ? (
          <AppText color={palette.error}>{t('La candidature n’a pas pu être retirée.')}</AppText>
        ) : null}
      </Card>
    );
  }

  if (action === 'application-pending') {
    return (
      <Card style={styles.section}>
        <Tag color={palette.bronze} label={t('Candidature envoyée')} />
        <AppText color={palette.muted}>
          {t('Poste proposé : {{instrument}}.', {
            instrument: gig.myApplication?.instrument
              ? t(gig.myApplication.instrument)
              : t('à préciser'),
          })}
        </AppText>
        <DispoButton
          loading={withdraw.isPending}
          onPress={() => withdraw.mutate({ gigId: gig.id, musicianId: userId })}
          variant="secondary"
        >
          {t('Retirer ma candidature')}
        </DispoButton>
        {withdraw.error ? (
          <AppText color={palette.error}>{t('La candidature n’a pas pu être retirée.')}</AppText>
        ) : null}
      </Card>
    );
  }

  if (viewer.isSuccess && eligible.length === 0) {
    return (
      <Card style={styles.section}>
        <Tag color={palette.bronze} label={t('Pas pour toi')} />
        <AppText color={palette.muted}>
          {gig.wantedLevels.length > 0
            ? t('Les postes ouverts demandent un autre instrument ou un autre niveau que le tien.')
            : t('Les postes ouverts ne sont pas dans tes instruments.')}
        </AppText>
      </Card>
    );
  }

  return (
    <Card style={styles.section}>
      <SectionHeader title={t('Je peux dépanner')} />
      <View style={styles.chips}>
        {eligible.map((value) => (
          <ChoiceChip
            key={value}
            label={t(value)}
            onPress={() => setInstrument(value)}
            selected={selected === value}
          />
        ))}
      </View>
      <FormField
        label={t('Message (facultatif)')}
        multiline
        numberOfLines={3}
        onChangeText={setMessage}
        placeholder={t('Présente-toi en quelques mots…')}
        style={styles.textarea}
        value={message}
      />
      <DispoButton
        disabled={!selected}
        loading={apply.isPending}
        onPress={() =>
          apply.mutate({ gigId: gig.id, instrument: selected, message, musicianId: userId })
        }
      >
        {t('Je peux dépanner !')}
      </DispoButton>
      {apply.error ? (
        <AppText color={palette.error}>
          {t(gigErrorMessage(apply.error, 'La candidature n’a pas pu être envoyée.'))}
        </AppText>
      ) : null}
    </Card>
  );
}

export function GigDetailContent({
  gig,
  onDeleted,
  onShowMatches,
  userId,
}: {
  gig: GigDetail;
  onDeleted: () => void;
  onShowMatches: () => void;
  userId: string;
}) {
  const { palette } = useDispoTheme();
  const { i18n, t } = useTranslation();
  const locale = i18n.resolvedLanguage ?? i18n.language ?? 'fr';
  const date = new Intl.DateTimeFormat(locale, {
    dateStyle: 'full',
    timeStyle: 'short',
  }).format(new Date(gig.date));
  const time = new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit' }).format(
    new Date(gig.date),
  );
  // Papier clair du thème (fixe en clair comme en sombre) ; encre choisie par contraste.
  const paper = palette.paper;
  const ink = readableOn(paper, [palette.ink, palette.paper, onAccent]);
  const inkMuted = blend(ink, paper, 0.42);
  const open = openGigInstruments(gig);
  const payment = paymentLabel(gig.paymentMethod, t);
  const hostName = gig.hostName || t(gig.isLocked ? 'Membre Premium requis' : 'Organisateur');

  return (
    <View style={styles.content}>
      <TicketCard backgroundColor={paper} notchFromTrailing={stubWidth}>
        <View style={styles.ticket}>
          <View style={styles.ticketMain}>
            <View style={styles.chips}>
              <Tag color={palette.signal} label={gig.targetId ? t('Demande directe') : t('SOS')} />
              <Tag color={inkMuted} label={t(gig.genre)} />
            </View>
            <AppText color={ink} variant="display">
              {gig.title}
            </AppText>
            <View style={styles.ticketMeta}>
              <Ionicons color={inkMuted} name="calendar-outline" size={16} />
              <AppText color={inkMuted} style={styles.flex}>
                {date}
              </AppText>
            </View>
            <View style={styles.ticketMeta}>
              <Ionicons color={inkMuted} name="location-outline" size={16} />
              <AppText color={inkMuted} style={styles.flex}>
                {gig.place}
              </AppText>
            </View>
          </View>
          <View style={styles.ticketStub}>
            <DateTicket color={palette.signal} date={gig.date} />
            <AppText color={inkMuted} engraved={false} variant="label">
              {time}
            </AppText>
            <Barcode seed={gig.id} />
          </View>
        </View>
      </TicketCard>

      <Card style={styles.section}>
        <SectionHeader title={t('Organisateur')} />
        <View style={styles.organizer}>
          <Avatar name={hostName} size={44} uri={gig.hostPhotoUrl} />
          <AppText numberOfLines={2} style={styles.flex} variant="title">
            {hostName}
          </AppText>
          {gig.hostIsPremium ? <VerifiedBadge /> : null}
        </View>
        <View style={styles.sectionTitleRow}>
          <Ionicons color={palette.electric} name="location-outline" size={18} />
          <AppText>{gig.place}</AppText>
        </View>
        {gig.neighborhood && gig.neighborhood !== gig.place ? (
          <AppText color={palette.muted} variant="caption">
            {gig.neighborhood}
          </AppText>
        ) : null}
        <View style={styles.chips}>
          {open.map((instrument) => (
            <Tag
              key={instrument}
              label={t('Cherche {{instrument}}', { instrument: t(instrument) })}
            />
          ))}
          {gig.filledInstruments.map((instrument) => (
            <Tag
              color={palette.jam}
              key={instrument}
              label={t('{{instrument}} · pourvu', { instrument: t(instrument) })}
            />
          ))}
        </View>
        {gig.wantedLevels.length > 0 ? (
          <AppText color={palette.muted}>
            {t('Niveau')} :{' '}
            {gig.wantedLevels.map((level) => t(shortProfileLevel(level))).join(' · ')}
          </AppText>
        ) : (
          <AppText color={palette.muted}>{t('Niveau : ouvert à tous')}</AppText>
        )}
        <GigSchoolCriteria ids={gig.wantedSchoolIds ?? []} />
        {gig.fee !== null ? (
          <View style={styles.feeRow}>
            <Ionicons color={palette.jam} name="cash-outline" size={18} />
            <AppText color={palette.jam} variant="mono">
              {gig.fee === 0
                ? t('Sans cachet')
                : new Intl.NumberFormat(locale, {
                    currency: 'CHF',
                    currencyDisplay: 'code',
                    maximumFractionDigits: 2,
                    style: 'currency',
                  }).format(gig.fee)}
              {payment ? ` · ${payment}` : ''}
            </AppText>
          </View>
        ) : null}
        {gig.description ? <AppText>{gig.description}</AppText> : null}
      </Card>

      <PrivateLocationCard gig={gig} />

      {gig.hostId === userId ? (
        <>
          <DispoButton
            icon="create-outline"
            variant="secondary"
            onPress={() => router.push({ pathname: '/gigs/edit', params: { id: gig.id } } as never)}
          >
            {t('Modifier le SOS')}
          </DispoButton>
          <OrganizerPanel gig={gig} onDeleted={onDeleted} onShowMatches={onShowMatches} />
        </>
      ) : (
        <ViewerPanel gig={gig} userId={userId} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  actionButton: { flex: 1 },
  actionsRow: { alignItems: 'stretch', flexDirection: 'row', gap: spacing.xs },
  applicantGroup: { gap: spacing.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  content: { gap: spacing.md },
  feeRow: { alignItems: 'center', flexDirection: 'row', gap: spacing.xs },
  flex: { flexShrink: 1 },
  organizer: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm },
  privateLocationHeader: { gap: spacing.xs, padding: spacing.md },
  privateMap: { height: 150, width: '100%' },
  routeRow: { paddingHorizontal: spacing.md },
  section: { gap: spacing.sm },
  sectionTitleRow: { alignItems: 'center', flexDirection: 'row', gap: spacing.xs },
  statusLine: { alignItems: 'center', flexDirection: 'row' },
  textarea: { minHeight: 84, textAlignVertical: 'top' },
  ticket: { flexDirection: 'row' },
  ticketMain: { flex: 1, gap: spacing.sm, padding: spacing.md },
  ticketMeta: { alignItems: 'center', flexDirection: 'row', gap: spacing.xs },
  ticketStub: {
    alignItems: 'center',
    gap: spacing.xxs,
    justifyContent: 'center',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    width: stubWidth,
  },
});
