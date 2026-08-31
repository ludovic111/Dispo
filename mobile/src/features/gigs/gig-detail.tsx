import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import * as Location from 'expo-location';
import type { TFunction } from 'i18next';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Linking, Platform, Pressable, StyleSheet, View } from 'react-native';
import MapView, { Marker } from 'react-native-maps';

import {
  GIG_PAYMENT_METHODS,
  gigViewerAction,
  openGigInstruments,
  unslottedGigApplicants,
  type GigApplication,
  type GigDetail,
} from './gig-model';
import {
  useApplyToGig,
  useDeleteGig,
  useGigApplicationDecision,
  useRespondToDirectGig,
  useWithdrawGigApplication,
} from './gig-queries';

import { AppText } from '@/components/ui/app-text';
import { Avatar } from '@/components/ui/avatar';
import { Card } from '@/components/ui/card';
import { FormField } from '@/components/ui/form-field';
import { DispoButton } from '@/components/ui/pressable';
import { Tag } from '@/components/ui/tag';
import { Barcode, TicketCard } from '@/components/ui/ticket-card';
import { useDispoTheme } from '@/theme/theme-context';
import { billetInk, radii, spacing, typography } from '@/theme/tokens';

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
          <View style={styles.sectionTitleRow}>
            <Ionicons color={palette.jam} name="lock-open" size={18} />
            <AppText color={palette.jam} variant="label">
              {t('Rendez-vous privé')}
            </AppText>
          </View>
          <AppText variant="title">{location.exactAddress}</AppText>
          <AppText color={palette.muted} variant="caption">
            {t("Partagé uniquement avec l'organisateur et les personnes acceptées.")}
          </AppText>
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
        <Pressable
          accessibilityRole="link"
          onPress={() => void openMap()}
          style={({ pressed }) => [styles.routeButton, pressed && styles.routeButtonPressed]}
        >
          <Ionicons color={palette.bronze} name="navigate-circle" size={18} />
          <AppText color={palette.bronze} style={styles.smallButtonLabel}>
            {t("Ouvrir l'itinéraire")}
          </AppText>
          <View style={styles.routeSpacer} />
          <Ionicons color={palette.muted} name="open-outline" size={14} />
        </Pressable>
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

function ApplicantRow({ applicant, gigId }: { applicant: GigApplication; gigId: string }) {
  const { palette } = useDispoTheme();
  const { t } = useTranslation();
  const decision = useGigApplicationDecision();
  const run = (value: 'accept' | 'decline' | 'reopen') =>
    decision.mutate({ applicationId: applicant.id, decision: value, gigId });
  const status =
    applicant.status === 'accepted'
      ? { color: palette.jam, label: t('Pris·e') }
      : applicant.status === 'declined'
        ? { color: palette.signal, label: t('Écarté·e') }
        : { color: palette.bronze, label: t('En attente') };

  return (
    <View style={[styles.applicant, { borderColor: palette.border }]}>
      <View style={styles.applicantTop}>
        <Avatar
          name={applicant.musicianName || t('Musicien·ne')}
          size={42}
          uri={applicant.musicianPhotoUrl}
        />
        <View style={styles.applicantText}>
          <AppText style={styles.applicantName}>
            {applicant.musicianName || t('Musicien·ne')}
          </AppText>
          <AppText color={palette.muted} variant="caption">
            {applicant.instrument ? t(applicant.instrument) : t('Instrument à préciser')}
          </AppText>
        </View>
        <Tag color={status.color} label={status.label} />
      </View>
      {applicant.message ? (
        <AppText color={palette.muted} variant="caption">
          « {applicant.message} »
        </AppText>
      ) : null}
      {applicant.status === 'pending' ? (
        <View style={styles.actionsRow}>
          <View style={styles.actionButton}>
            <DispoButton
              loading={decision.isPending}
              onPress={() => run('decline')}
              variant="danger"
            >
              {t('Refuser')}
            </DispoButton>
          </View>
          <View style={styles.actionButton}>
            <DispoButton loading={decision.isPending} onPress={() => run('accept')}>
              {t('Accepter')}
            </DispoButton>
          </View>
        </View>
      ) : null}
      {applicant.status === 'accepted' ? (
        <View style={styles.actionsRow}>
          <View style={styles.actionButton}>
            <DispoButton
              loading={decision.isPending}
              onPress={() => run('reopen')}
              variant="secondary"
            >
              {t('Remettre en attente')}
            </DispoButton>
          </View>
          <View style={styles.actionButton}>
            <DispoButton
              loading={decision.isPending}
              onPress={() => run('decline')}
              variant="danger"
            >
              {t('Libérer')}
            </DispoButton>
          </View>
        </View>
      ) : null}
      {applicant.status === 'declined' ? (
        <DispoButton loading={decision.isPending} onPress={() => run('reopen')} variant="secondary">
          {t('Replacer en attente')}
        </DispoButton>
      ) : null}
      {decision.error ? (
        <AppText color={palette.error} variant="caption">
          {t('La décision n’a pas pu être enregistrée.')}
        </AppText>
      ) : null}
    </View>
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
      <AppText color={palette.bronze} variant="label">
        {t('J’organise')}
      </AppText>
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
                  <AppText variant="title">{t(instrument)}</AppText>
                  {applicants.map((applicant) => (
                    <ApplicantRow applicant={applicant} gigId={gig.id} key={applicant.id} />
                  ))}
                </View>
              );
            })
          )}
          {unslotted.length > 0 ? (
            <View style={styles.applicantGroup}>
              <AppText variant="title">{t('Autre')}</AppText>
              {unslotted.map((applicant) => (
                <ApplicantRow applicant={applicant} gigId={gig.id} key={applicant.id} />
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
  const open = openGigInstruments(gig);
  const [instrument, setInstrument] = useState(open[0] ?? '');
  const [message, setMessage] = useState('');
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
              onPress={() => respond.mutate({ accept: true, gigId: gig.id })}
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

  return (
    <Card style={styles.section}>
      <AppText color={palette.bronze} variant="label">
        {t('Je peux dépanner')}
      </AppText>
      <View style={styles.chips}>
        {open.map((value) => (
          <Pressable
            accessibilityRole="radio"
            accessibilityState={{ selected: instrument === value }}
            key={value}
            onPress={() => setInstrument(value)}
            style={[
              styles.instrumentChoice,
              {
                backgroundColor: instrument === value ? `${palette.electric}22` : palette.inset,
                borderColor: instrument === value ? palette.electric : palette.border,
              },
            ]}
          >
            <AppText color={instrument === value ? palette.electric : palette.text}>
              {t(value)}
            </AppText>
          </Pressable>
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
        disabled={!instrument}
        loading={apply.isPending}
        onPress={() => apply.mutate({ gigId: gig.id, instrument, message, musicianId: userId })}
      >
        {t('Je peux dépanner !')}
      </DispoButton>
      {apply.error ? (
        <AppText color={palette.error}>{t('La candidature n’a pas pu être envoyée.')}</AppText>
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
  const open = openGigInstruments(gig);
  const payment = paymentLabel(gig.paymentMethod, t);
  const hostName = gig.hostName || t(gig.isLocked ? 'Membre Premium requis' : 'Organisateur');

  return (
    <View style={styles.content}>
      <TicketCard>
        <View style={styles.ticket}>
          <View style={styles.ticketMain}>
            <View style={styles.chips}>
              <Tag color="#B33D17" label={gig.targetId ? t('Demande directe') : t('SOS')} />
              <Tag color="#475569" label={t(gig.genre)} />
            </View>
            <AppText color={billetInk} variant="display">
              {gig.title}
            </AppText>
            <View style={styles.ticketMeta}>
              <Ionicons color="rgba(5,8,20,0.62)" name="calendar-outline" size={16} />
              <AppText color="rgba(5,8,20,0.72)">{date}</AppText>
            </View>
            <View style={styles.ticketMeta}>
              <Ionicons color="rgba(5,8,20,0.62)" name="location-outline" size={16} />
              <AppText color="rgba(5,8,20,0.72)">{gig.place}</AppText>
            </View>
          </View>
          <View style={styles.ticketStub}>
            <Barcode seed={gig.id} />
          </View>
        </View>
      </TicketCard>

      <Card style={styles.section}>
        <AppText color={palette.bronze} variant="label">
          {t('Organisateur')}
        </AppText>
        <View style={styles.organizer}>
          <Avatar name={hostName} size={44} uri={gig.hostPhotoUrl} />
          <AppText variant="title">{hostName}</AppText>
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
            {gig.wantedLevels
              .map((level) => t(level === 'Professionnel' ? 'Pro' : level))
              .join(' · ')}
          </AppText>
        ) : (
          <AppText color={palette.muted}>{t('Niveau : ouvert à tous')}</AppText>
        )}
        {gig.fee !== null ? (
          <View style={styles.feeRow}>
            <Ionicons color={palette.jam} name="cash-outline" size={18} />
            <AppText color={palette.jam} style={styles.fee}>
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
        <OrganizerPanel gig={gig} onDeleted={onDeleted} onShowMatches={onShowMatches} />
      ) : (
        <ViewerPanel gig={gig} userId={userId} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  actionButton: { flex: 1 },
  actionsRow: { alignItems: 'stretch', flexDirection: 'row', gap: spacing.xs },
  applicant: { borderTopWidth: 1, gap: spacing.sm, paddingTop: spacing.sm },
  applicantGroup: { gap: spacing.sm },
  applicantName: { fontWeight: '800' },
  applicantText: { flex: 1, gap: 2 },
  applicantTop: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  content: { gap: spacing.md },
  fee: { fontFamily: typography.monoSemibold, fontSize: 16 },
  feeRow: { alignItems: 'center', flexDirection: 'row', gap: spacing.xs },
  instrumentChoice: {
    borderRadius: radii.chip,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  organizer: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm },
  privateLocationHeader: { gap: spacing.xs, padding: spacing.md },
  privateMap: { height: 150, width: '100%' },
  routeButton: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.xs,
    padding: spacing.sm,
  },
  routeButtonPressed: { opacity: 0.72 },
  routeSpacer: { flex: 1 },
  section: { gap: spacing.sm },
  sectionTitleRow: { alignItems: 'center', flexDirection: 'row', gap: spacing.xs },
  smallButtonLabel: { fontSize: 13, fontWeight: '800' },
  statusLine: { alignItems: 'center', flexDirection: 'row' },
  textarea: { minHeight: 84, textAlignVertical: 'top' },
  ticket: { flexDirection: 'row', minHeight: 178 },
  ticketMain: { flex: 1, gap: spacing.sm, padding: spacing.md },
  ticketMeta: { alignItems: 'center', flexDirection: 'row', gap: spacing.xs },
  ticketStub: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.sm,
    width: 74,
  },
});
