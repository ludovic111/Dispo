import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useQueryClient } from '@tanstack/react-query';
import * as Crypto from 'expo-crypto';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';

import { prepareDemoVideo, removePreparedThumbnail } from './portfolio-media';
import {
  availabilityTripLabel,
  canAddDemoVideo,
  dateFromDayKey,
  dayKey,
  demoVideoLimit,
  PortfolioValidationError,
  upsertAvailabilityTrip,
  type AvailabilityTrip,
  type AvailabilityTripDraft,
  type DemoVideo,
} from './portfolio-model';
import { portfolioKeys, usePortfolio } from './portfolio-queries';
import {
  addDemoVideo,
  removeDemoVideo,
  saveAvailabilityTrips,
  updateDemoVideoDetails,
  type PortfolioState,
} from './portfolio-repository';

import { AppText } from '@/components/ui/app-text';
import { Card } from '@/components/ui/card';
import { FormField } from '@/components/ui/form-field';
import { DispoButton } from '@/components/ui/pressable';
import { ErrorState, LoadingState, Screen, ScreenHeader } from '@/components/ui/screen';
import { HeaderAction, SectionHeader } from '@/components/ui/section';
import { useAuth } from '@/features/auth/auth-context';
import { countryOptions, type CountryOption } from '@/features/onboarding/onboarding-model';
import { canUsePremiumCapability } from '@/features/premium/premium-model';
import { profileKeys } from '@/features/profiles/profile-queries';
import { formatSwiftPlaceholders } from '@/i18n/format';
import { useDispoTheme } from '@/theme/theme-context';
import { radii, spacing } from '@/theme/tokens';

interface VideoDetailsDraft {
  date: Date;
  hasDate: boolean;
  id: string;
  title: string;
}

type BusyAction = 'delete-trip' | 'delete-video' | 'save-trip' | 'save-video' | 'upload' | null;

function formatDay(value: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(dateFromDayKey(value));
}

function errorMessage(error: unknown): string {
  if (error instanceof PortfolioValidationError) {
    if (error.code === 'demo_video_too_long') return 'Vidéo trop longue — 3 minutes maximum.';
    if (error.code === 'demo_video_too_large') {
      return 'Vidéo trop lourde — raccourcis-la et réessaie.';
    }
    if (error.code === 'portfolio_limit_reached') {
      return 'Tu as atteint la limite de vidéos de ton offre.';
    }
    if (error.code === 'trip_invalid_dates') return 'La date de fin doit suivre la date de début.';
    if (error.code === 'trip_invalid_place')
      return 'Renseigne le pays, le code postal et la ville.';
    if (error.code === 'demo_video_unsupported_type') {
      return 'Choisis une vidéo MP4 ou MOV.';
    }
    if (error.code === 'demo_video_invalid_duration') {
      return "La durée de cette vidéo n'a pas pu être vérifiée.";
    }
  }
  return "La modification n'a pas pu être enregistrée — vérifie le réseau.";
}

function DateField({
  label,
  maximumDate,
  minimumDate,
  onChange,
  value,
}: {
  label: string;
  maximumDate?: Date;
  minimumDate?: Date;
  onChange: (value: Date) => void;
  value: Date;
}) {
  const { palette } = useDispoTheme();
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  return (
    <View style={styles.dateField}>
      <AppText color={palette.bronze} variant="label">
        {label}
      </AppText>
      <Pressable
        accessibilityRole="button"
        onPress={() => setOpen(true)}
        style={({ pressed }) => [
          styles.dateButton,
          { backgroundColor: palette.inset, borderColor: palette.border },
          pressed && styles.pressed,
        ]}
      >
        <Ionicons color={palette.bronze} name="calendar-outline" size={17} />
        <AppText>
          {new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(value)}
        </AppText>
      </Pressable>
      {open ? (
        <DateTimePicker
          display={Platform.OS === 'ios' ? 'inline' : 'default'}
          mode="date"
          onDismiss={() => {
            if (Platform.OS !== 'ios') setOpen(false);
          }}
          onValueChange={(_, selected) => {
            if (Platform.OS !== 'ios') setOpen(false);
            onChange(selected);
          }}
          value={value}
          {...(maximumDate ? { maximumDate } : {})}
          {...(minimumDate ? { minimumDate } : {})}
        />
      ) : null}
      {open && Platform.OS === 'ios' ? (
        <Pressable onPress={() => setOpen(false)} style={styles.dateDone}>
          <AppText color={palette.electric} variant="caption">
            {t('OK')}
          </AppText>
        </Pressable>
      ) : null}
    </View>
  );
}

function ModalHeader({
  onCancel,
  onSave,
  saving,
  title,
}: {
  onCancel: () => void;
  onSave: () => void;
  saving: boolean;
  title: string;
}) {
  const { palette } = useDispoTheme();
  const { t } = useTranslation();
  return (
    <View style={[styles.modalHeader, { borderBottomColor: palette.border }]}>
      <Pressable
        accessibilityRole="button"
        disabled={saving}
        onPress={onCancel}
        style={[styles.modalHeaderAction, styles.modalHeaderActionStart]}
      >
        <AppText color={palette.muted}>{t('Annuler')}</AppText>
      </Pressable>
      <AppText variant="title2">{title}</AppText>
      <Pressable
        accessibilityRole="button"
        disabled={saving}
        onPress={onSave}
        style={[styles.modalHeaderAction, styles.modalHeaderActionEnd]}
      >
        <AppText color={palette.electric} style={styles.saveLabel}>
          {saving ? t('Envoi…') : t('OK')}
        </AppText>
      </Pressable>
    </View>
  );
}

export function PortfolioScreen({ section = 'demos' }: { section?: 'demos' | 'trips' }) {
  const { session } = useAuth();
  const userId = session?.user.id ?? '';
  const query = usePortfolio(userId);
  const queryClient = useQueryClient();
  const { palette } = useDispoTheme();
  const { i18n, t } = useTranslation();
  const [busy, setBusy] = useState<BusyAction>(null);
  const [errorText, setErrorText] = useState<string | null>(null);
  const expandedPortfolio = canUsePremiumCapability('expandedPortfolio');
  const [videoDraft, setVideoDraft] = useState<VideoDetailsDraft | null>(null);
  const [tripDraft, setTripDraft] = useState<AvailabilityTripDraft | null>(null);
  const [countryModal, setCountryModal] = useState(false);
  const locale = i18n.resolvedLanguage ?? 'fr';
  const screenTitle = section === 'demos' ? t('Mes démos') : t('Mes voyages');
  const localizedDemoTitle = (video: DemoVideo, index: number) =>
    video.title ?? formatSwiftPlaceholders(t('Vidéo %lld'), index + 1);
  const selectedCountry = useMemo(
    () => countryOptions.find((country) => country.code === tripDraft?.country),
    [tripDraft?.country],
  );
  const close = <HeaderAction icon="close" label={t('Fermer')} onPress={() => router.back()} />;

  const setPortfolio = (next: PortfolioState) => {
    queryClient.setQueryData(portfolioKeys.detail(userId), next);
  };

  const refreshProfile = async () => {
    await queryClient.invalidateQueries({ queryKey: profileKeys.me(userId) });
  };

  const pickVideo = async () => {
    const portfolio = query.data;
    if (!portfolio || busy) return;
    if (!canAddDemoVideo(portfolio.videos.length, expandedPortfolio)) {
      setErrorText(t("Jusqu'à 6 vidéos avec Premium"));
      return;
    }
    setErrorText(null);
    const options: ImagePicker.ImagePickerOptions = {
      allowsEditing: false,
      mediaTypes: ['videos'],
      preferredAssetRepresentationMode:
        ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Compatible,
      quality: 1,
      videoMaxDuration: 181,
    };
    if (Platform.OS === 'ios') {
      options.videoExportPreset = ImagePicker.VideoExportPreset.H264_1280x720;
      options.videoQuality = ImagePicker.UIImagePickerControllerQualityType.IFrame1280x720;
    }
    let result: ImagePicker.ImagePickerResult;
    try {
      result = await ImagePicker.launchImageLibraryAsync(options);
    } catch (error) {
      setErrorText(t(errorMessage(error)));
      return;
    }
    if (result.canceled) return;
    const asset = result.assets[0];
    if (!asset) return;
    setBusy('upload');
    let thumbnailUri: string | null = null;
    try {
      const prepared = await prepareDemoVideo(asset);
      thumbnailUri = prepared.thumbnailUri;
      const created = await addDemoVideo(userId, portfolio.videos, expandedPortfolio, prepared);
      setPortfolio({ ...portfolio, videos: created.videos });
      await refreshProfile();
      setVideoDraft({
        date: dateFromDayKey(created.video.date ?? dayKey(new Date())),
        hasDate: created.video.date !== null,
        id: created.video.id,
        title: created.video.title ?? '',
      });
    } catch (error) {
      setErrorText(t(errorMessage(error)));
    } finally {
      removePreparedThumbnail(thumbnailUri);
      setBusy(null);
    }
  };

  const editVideo = (video: DemoVideo) => {
    setErrorText(null);
    setVideoDraft({
      date: dateFromDayKey(video.date ?? dayKey(new Date())),
      hasDate: video.date !== null,
      id: video.id,
      title: video.title ?? '',
    });
  };

  const saveVideo = async () => {
    const portfolio = query.data;
    if (!portfolio || !videoDraft || busy) return;
    setBusy('save-video');
    setErrorText(null);
    try {
      const videos = await updateDemoVideoDetails(userId, portfolio.videos, videoDraft.id, {
        date: videoDraft.hasDate ? dayKey(videoDraft.date) : null,
        title: videoDraft.title,
      });
      setPortfolio({ ...portfolio, videos });
      await refreshProfile();
      setVideoDraft(null);
    } catch (error) {
      setErrorText(t(errorMessage(error)));
    } finally {
      setBusy(null);
    }
  };

  const confirmRemoveVideo = (video: DemoVideo) => {
    const portfolio = query.data;
    if (!portfolio || busy) return;
    Alert.alert(t('Supprimer cette vidéo ?'), t('Cette action est définitive.'), [
      { style: 'cancel', text: t('Annuler') },
      {
        onPress: () => {
          setBusy('delete-video');
          setErrorText(null);
          void removeDemoVideo(userId, portfolio.videos, video)
            .then(async (videos) => {
              setPortfolio({ ...portfolio, videos });
              await refreshProfile();
            })
            .catch((error: unknown) => setErrorText(t(errorMessage(error))))
            .finally(() => setBusy(null));
        },
        style: 'destructive',
        text: t('Supprimer'),
      },
    ]);
  };

  const newTrip = () => {
    const portfolio = query.data;
    if (!portfolio) return;
    setErrorText(null);
    const from = new Date();
    const to = new Date(from);
    to.setDate(to.getDate() + 7);
    setTripDraft({
      city: '',
      country: portfolio.country || 'CH',
      from: dayKey(from),
      id: Crypto.randomUUID(),
      postalCode: '',
      to: dayKey(to),
    });
  };

  const editTrip = (trip: AvailabilityTrip) => {
    setErrorText(null);
    setTripDraft({
      city: trip.city,
      country: trip.country ?? query.data?.country ?? 'CH',
      from: trip.from,
      id: trip.id,
      postalCode: trip.postalCode ?? '',
      to: trip.to,
    });
  };

  const saveTrip = async () => {
    const portfolio = query.data;
    if (!portfolio || !tripDraft || busy) return;
    setBusy('save-trip');
    setErrorText(null);
    try {
      const candidate = upsertAvailabilityTrip(portfolio.trips, tripDraft);
      const trips = await saveAvailabilityTrips(userId, candidate);
      setPortfolio({ ...portfolio, trips });
      await refreshProfile();
      setTripDraft(null);
    } catch (error) {
      setErrorText(t(errorMessage(error)));
    } finally {
      setBusy(null);
    }
  };

  const confirmRemoveTrip = (trip: AvailabilityTrip) => {
    const portfolio = query.data;
    if (!portfolio || busy) return;
    Alert.alert(t('Supprimer'), availabilityTripLabel(trip), [
      { style: 'cancel', text: t('Annuler') },
      {
        onPress: () => {
          setBusy('delete-trip');
          setErrorText(null);
          void saveAvailabilityTrips(
            userId,
            portfolio.trips.filter((candidate) => candidate.id !== trip.id),
          )
            .then(async (trips) => {
              setPortfolio({ ...portfolio, trips });
              await refreshProfile();
            })
            .catch((error: unknown) => setErrorText(t(errorMessage(error))))
            .finally(() => setBusy(null));
        },
        style: 'destructive',
        text: t('Supprimer'),
      },
    ]);
  };

  if (query.isLoading) {
    return (
      <Screen>
        <ScreenHeader action={close} eyebrow={t('Profil')} title={screenTitle} />
        <LoadingState />
      </Screen>
    );
  }
  if (query.isError) {
    return (
      <Screen>
        <ScreenHeader action={close} eyebrow={t('Profil')} title={screenTitle} />
        <ErrorState message={query.error.message} onRetry={() => void query.refetch()} />
      </Screen>
    );
  }
  if (!query.data) {
    return (
      <Screen>
        <ScreenHeader action={close} eyebrow={t('Profil')} title={screenTitle} />
        <LoadingState />
      </Screen>
    );
  }

  const portfolio = query.data;
  const limit = demoVideoLimit(expandedPortfolio);
  const uploading = busy === 'upload';
  return (
    <Screen>
      <ScreenHeader action={close} eyebrow={t('Profil')} title={screenTitle} />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {errorText ? (
          <View style={[styles.errorBanner, { backgroundColor: `${palette.signal}18` }]}>
            <Ionicons color={palette.signal} name="alert-circle" size={19} />
            <AppText color={palette.signal} style={styles.flex} variant="caption">
              {errorText}
            </AppText>
            <Pressable
              accessibilityLabel={t('Fermer')}
              accessibilityRole="button"
              hitSlop={12}
              onPress={() => setErrorText(null)}
            >
              <Ionicons color={palette.signal} name="close" size={18} />
            </Pressable>
          </View>
        ) : null}

        {section === 'demos' ? (
          <View style={styles.section}>
            <View style={styles.sectionHeadingWithAction}>
              <SectionHeader title={t('Mes démos')} />
              <View style={styles.sectionHeadingAction}>
                <AppText
                  color={palette.muted}
                  variant="caption"
                >{`${portfolio.videos.length}/${limit}`}</AppText>
              </View>
            </View>
            <Card style={styles.card}>
              <AppText color={palette.muted} variant="caption">
                {t(
                  "C'est ce que les organisateurs regardent avant de t'engager — 60 à 90 secondes suffisent.",
                )}
              </AppText>
              <View style={[styles.publicNotice, { backgroundColor: `${palette.electric}12` }]}>
                <Ionicons color={palette.electric} name="globe-outline" size={16} />
                <AppText color={palette.electric} style={styles.flex} variant="caption2">
                  {t('Tes vidéos sont visibles par les autres musiciens sur ton profil.')}
                </AppText>
              </View>

              {portfolio.videos.map((video, index) => (
                <View key={video.id} style={[styles.videoRow, { borderTopColor: palette.border }]}>
                  <Pressable
                    accessibilityLabel={localizedDemoTitle(video, index)}
                    accessibilityRole="button"
                    onPress={() =>
                      router.push({
                        pathname: '/profiles/[id]/video',
                        params: { id: userId, url: video.url },
                      } as never)
                    }
                    style={({ pressed }) => [styles.videoPreview, pressed && styles.pressed]}
                  >
                    {video.thumbUrl ? (
                      <Image
                        contentFit="cover"
                        source={{ uri: video.thumbUrl }}
                        style={styles.thumb}
                      />
                    ) : (
                      <View
                        style={[
                          styles.thumb,
                          styles.thumbFallback,
                          { backgroundColor: palette.inset },
                        ]}
                      >
                        <Ionicons color={palette.bronze} name="videocam" size={22} />
                      </View>
                    )}
                    <View style={styles.playBadge}>
                      <Ionicons color="#FFFFFF" name="play" size={11} />
                    </View>
                  </Pressable>
                  <View style={styles.videoCopy}>
                    <AppText numberOfLines={1} variant="subheadline">
                      {localizedDemoTitle(video, index)}
                    </AppText>
                    {video.date ? (
                      <View style={styles.metaRow}>
                        <Ionicons color={palette.muted} name="calendar-outline" size={12} />
                        <AppText color={palette.muted} variant="caption2">
                          {formatDay(video.date, locale)}
                        </AppText>
                      </View>
                    ) : (
                      <AppText color={palette.muted} variant="caption2">
                        {t('Titre et date : bouton crayon')}
                      </AppText>
                    )}
                  </View>
                  <Pressable
                    accessibilityLabel={t('Modifier le titre et la date')}
                    accessibilityRole="button"
                    onPress={() => editVideo(video)}
                    style={[styles.roundAction, { backgroundColor: `${palette.bronze}18` }]}
                  >
                    <Ionicons color={palette.bronze} name="pencil" size={15} />
                  </Pressable>
                  <Pressable
                    accessibilityLabel={t('Supprimer')}
                    accessibilityRole="button"
                    disabled={Boolean(busy)}
                    onPress={() => confirmRemoveVideo(video)}
                    style={styles.roundAction}
                  >
                    <Ionicons color={palette.muted} name="trash-outline" size={16} />
                  </Pressable>
                </View>
              ))}

              {canAddDemoVideo(portfolio.videos.length, expandedPortfolio) ? (
                <DispoButton
                  icon="add-circle"
                  loading={uploading}
                  onPress={() => void pickVideo()}
                  variant="secondary"
                >
                  {uploading ? t('Envoi en cours…') : t('Ajouter une vidéo')}
                </DispoButton>
              ) : !expandedPortfolio ? (
                <View style={[styles.premiumLock, { backgroundColor: `${palette.electric}12` }]}>
                  <Ionicons color={palette.electric} name="sparkles" size={16} />
                  <AppText color={palette.electric} style={styles.flex} variant="caption">
                    {t("Jusqu'à 6 vidéos avec Premium")}
                  </AppText>
                  <Ionicons color={palette.electric} name="lock-closed" size={14} />
                </View>
              ) : null}
            </Card>
          </View>
        ) : null}

        {section === 'trips' ? (
          <View style={styles.section}>
            <View style={styles.sectionHeadingWithAction}>
              <SectionHeader title={t('Mes voyages')} />
              <Pressable accessibilityRole="button" onPress={newTrip} style={styles.inlineAction}>
                <Ionicons color={palette.electric} name="add-circle" size={17} />
                <AppText color={palette.electric} variant="caption">
                  {t('Ajouter')}
                </AppText>
              </Pressable>
            </View>
            <Card style={styles.card}>
              <AppText color={palette.muted} variant="caption">
                {t(
                  'Pendant cette période, les musiciens et les groupes de cette ville te trouvent dans leurs recherches — pas ceux de chez toi.',
                )}
              </AppText>
              <Pressable
                accessibilityRole="button"
                onPress={() => router.push('/profile/availability' as never)}
                style={[styles.availabilityLink, { backgroundColor: `${palette.jam}12` }]}
              >
                <Ionicons color={palette.jam} name="calendar-outline" size={16} />
                <AppText color={palette.jam} style={styles.flex} variant="caption">
                  {t('Gérer mes disponibilités')}
                </AppText>
                <Ionicons color={palette.jam} name="chevron-forward" size={15} />
              </Pressable>
              {portfolio.trips.length === 0 ? (
                <View style={styles.emptyTrip}>
                  <Ionicons color={palette.bronze} name="airplane-outline" size={25} />
                  <AppText color={palette.muted} style={styles.center} variant="caption">
                    {formatSwiftPlaceholders(
                      t("Rien pour l'instant — tu es cherché·e autour de %@."),
                      [portfolio.postalCode, portfolio.city].filter(Boolean).join(' ') ||
                        t('ta ville'),
                    )}
                  </AppText>
                </View>
              ) : (
                portfolio.trips.map((trip) => (
                  <Pressable
                    key={trip.id}
                    accessibilityRole="button"
                    onPress={() => editTrip(trip)}
                    style={({ pressed }) => [
                      styles.tripRow,
                      { borderTopColor: palette.border },
                      pressed && styles.pressed,
                    ]}
                  >
                    <Ionicons color={palette.electric} name="location-outline" size={18} />
                    <View style={styles.flex}>
                      <AppText variant="caption">{availabilityTripLabel(trip)}</AppText>
                      <AppText color={palette.muted} variant="caption2">
                        {`${formatDay(trip.from, locale)} → ${formatDay(trip.to, locale)}`}
                      </AppText>
                    </View>
                    <Pressable
                      accessibilityLabel={t('Supprimer')}
                      accessibilityRole="button"
                      disabled={Boolean(busy)}
                      onPress={(event) => {
                        event.stopPropagation();
                        confirmRemoveTrip(trip);
                      }}
                      style={styles.roundAction}
                    >
                      <Ionicons color={palette.muted} name="close-circle" size={19} />
                    </Pressable>
                  </Pressable>
                ))
              )}
            </Card>
          </View>
        ) : null}
      </ScrollView>

      <Modal
        animationType="slide"
        onRequestClose={() => setVideoDraft(null)}
        presentationStyle="pageSheet"
        visible={videoDraft !== null}
      >
        <Screen>
          {videoDraft ? (
            <KeyboardAvoidingView
              behavior={Platform.OS === 'ios' ? 'padding' : undefined}
              style={styles.flex}
            >
              <ModalHeader
                onCancel={() => setVideoDraft(null)}
                onSave={() => void saveVideo()}
                saving={busy === 'save-video'}
                title={t('Ma vidéo')}
              />
              <ScrollView
                contentContainerStyle={styles.modalContent}
                keyboardShouldPersistTaps="handled"
              >
                {errorText ? (
                  <AppText color={palette.signal} style={styles.modalError} variant="caption">
                    {errorText}
                  </AppText>
                ) : null}
                <FormField
                  label={t('Titre')}
                  onChangeText={(title) =>
                    setVideoDraft((draft) => (draft ? { ...draft, title } : draft))
                  }
                  placeholder={t('Ex. Solo au Chat Noir')}
                  value={videoDraft.title}
                />
                <Pressable
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: videoDraft.hasDate }}
                  onPress={() =>
                    setVideoDraft((draft) =>
                      draft ? { ...draft, hasDate: !draft.hasDate } : draft,
                    )
                  }
                  style={[
                    styles.toggleRow,
                    { backgroundColor: palette.card, borderColor: palette.border },
                  ]}
                >
                  <Ionicons
                    color={videoDraft.hasDate ? palette.electric : palette.muted}
                    name={videoDraft.hasDate ? 'checkmark-circle' : 'ellipse-outline'}
                    size={21}
                  />
                  <AppText style={styles.flex}>{t('Dater la vidéo')}</AppText>
                </Pressable>
                {videoDraft.hasDate ? (
                  <DateField
                    label={t('Date de la vidéo')}
                    maximumDate={new Date()}
                    onChange={(date) =>
                      setVideoDraft((draft) => (draft ? { ...draft, date } : draft))
                    }
                    value={videoDraft.date}
                  />
                ) : null}
                <AppText color={palette.muted} variant="caption">
                  {t("Le titre et la date s'affichent sur ta grille de démos.")}
                </AppText>
              </ScrollView>
            </KeyboardAvoidingView>
          ) : null}
        </Screen>
      </Modal>

      <Modal
        animationType="slide"
        onRequestClose={() => setTripDraft(null)}
        presentationStyle="pageSheet"
        visible={tripDraft !== null}
      >
        <Screen>
          {tripDraft ? (
            <KeyboardAvoidingView
              behavior={Platform.OS === 'ios' ? 'padding' : undefined}
              style={styles.flex}
            >
              <ModalHeader
                onCancel={() => setTripDraft(null)}
                onSave={() => void saveTrip()}
                saving={busy === 'save-trip'}
                title={t('Je suis ailleurs')}
              />
              <ScrollView
                contentContainerStyle={styles.modalContent}
                keyboardShouldPersistTaps="handled"
              >
                {errorText ? (
                  <AppText color={palette.signal} style={styles.modalError} variant="caption">
                    {errorText}
                  </AppText>
                ) : null}
                <SectionHeader title={t('Quand')} />
                <DateField
                  label={t('Du')}
                  onChange={(date) =>
                    setTripDraft((draft) => {
                      if (!draft) return draft;
                      const from = dayKey(date);
                      return { ...draft, from, to: draft.to < from ? from : draft.to };
                    })
                  }
                  value={dateFromDayKey(tripDraft.from)}
                />
                <DateField
                  label={t('Au')}
                  minimumDate={dateFromDayKey(tripDraft.from)}
                  onChange={(date) =>
                    setTripDraft((draft) => (draft ? { ...draft, to: dayKey(date) } : draft))
                  }
                  value={dateFromDayKey(tripDraft.to)}
                />
                <SectionHeader title={t('Où')} />
                <Pressable
                  onPress={() => setCountryModal(true)}
                  style={[
                    styles.countryButton,
                    { backgroundColor: palette.card, borderColor: palette.border },
                  ]}
                >
                  <AppText style={styles.countryFlag}>{selectedCountry?.flag ?? '🌍'}</AppText>
                  <View style={styles.flex}>
                    <AppText color={palette.muted} variant="caption2">
                      {t('Pays')}
                    </AppText>
                    <AppText>{t(selectedCountry?.label ?? tripDraft.country)}</AppText>
                  </View>
                  <Ionicons color={palette.muted} name="chevron-down" size={17} />
                </Pressable>
                <FormField
                  autoCapitalize="characters"
                  label={t('Code postal')}
                  onChangeText={(postalCode) =>
                    setTripDraft((draft) => (draft ? { ...draft, postalCode } : draft))
                  }
                  placeholder={t('Ex. 1200')}
                  value={tripDraft.postalCode}
                />
                <FormField
                  autoCapitalize="words"
                  label={t('Ville')}
                  onChangeText={(city) =>
                    setTripDraft((draft) => (draft ? { ...draft, city } : draft))
                  }
                  placeholder={t('Ville — ex. Lisbonne')}
                  value={tripDraft.city}
                />
                <AppText color={palette.muted} variant="caption">
                  {t(
                    'Pendant cette période, les musiciens et les groupes de cette ville te trouvent dans leurs recherches — pas ceux de chez toi.',
                  )}
                </AppText>
              </ScrollView>
            </KeyboardAvoidingView>
          ) : null}
        </Screen>
      </Modal>

      <Modal
        animationType="slide"
        onRequestClose={() => setCountryModal(false)}
        presentationStyle="pageSheet"
        visible={countryModal}
      >
        <Screen>
          <View style={[styles.modalHeader, { borderBottomColor: palette.border }]}>
            <Pressable
              accessibilityRole="button"
              onPress={() => setCountryModal(false)}
              style={[styles.modalHeaderAction, styles.modalHeaderActionStart]}
            >
              <AppText color={palette.electric}>{t('Fermer')}</AppText>
            </Pressable>
            <AppText variant="title2">{t('Pays')}</AppText>
            <View style={styles.headerSpacer} />
          </View>
          <FlatList
            contentContainerStyle={styles.countryList}
            data={[...countryOptions] as CountryOption[]}
            keyExtractor={(item) => item.code}
            renderItem={({ item }) => (
              <Pressable
                onPress={() => {
                  setTripDraft((draft) => (draft ? { ...draft, country: item.code } : draft));
                  setCountryModal(false);
                }}
                style={({ pressed }) => [
                  styles.countryRow,
                  { borderBottomColor: palette.border },
                  pressed && styles.pressed,
                ]}
              >
                <AppText style={styles.countryFlag}>{item.flag}</AppText>
                <AppText style={styles.flex}>{t(item.label)}</AppText>
                {tripDraft?.country === item.code ? (
                  <Ionicons color={palette.electric} name="checkmark-circle" size={20} />
                ) : null}
              </Pressable>
            )}
          />
        </Screen>
      </Modal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  availabilityLink: {
    alignItems: 'center',
    borderRadius: radii.button,
    flexDirection: 'row',
    gap: spacing.xs,
    minHeight: 44,
    paddingHorizontal: spacing.sm,
  },
  card: { gap: spacing.sm },
  center: { textAlign: 'center' },
  content: {
    gap: spacing.xl,
    paddingBottom: spacing.xxl,
    paddingHorizontal: spacing.gutter,
  },
  countryButton: {
    alignItems: 'center',
    borderRadius: radii.button,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.sm,
    minHeight: 54,
    paddingHorizontal: spacing.md,
  },
  countryFlag: { fontSize: 23 },
  countryList: { paddingBottom: spacing.xxl, paddingHorizontal: spacing.lg },
  countryRow: {
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: spacing.sm,
    minHeight: 54,
    paddingHorizontal: spacing.xs,
  },
  dateButton: {
    alignItems: 'center',
    borderRadius: radii.button,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.sm,
    minHeight: 48,
    paddingHorizontal: spacing.md,
  },
  dateDone: {
    alignSelf: 'flex-end',
    justifyContent: 'center',
    minHeight: 44,
    paddingHorizontal: spacing.sm,
  },
  dateField: { gap: spacing.xs },
  emptyTrip: { alignItems: 'center', gap: spacing.xs, padding: spacing.md },
  errorBanner: {
    alignItems: 'center',
    borderRadius: radii.button,
    flexDirection: 'row',
    gap: spacing.xs,
    padding: spacing.sm,
  },
  flex: { flex: 1 },
  headerSpacer: { width: 64 },
  inlineAction: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.xxs,
    minHeight: 44,
    padding: spacing.xs,
  },
  metaRow: { alignItems: 'center', flexDirection: 'row', gap: spacing.xxs },
  modalContent: { gap: spacing.md, padding: spacing.gutter, paddingBottom: spacing.xxl },
  modalError: { textAlign: 'center' },
  modalHeader: {
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 58,
    paddingHorizontal: spacing.gutter,
  },
  modalHeaderAction: { justifyContent: 'center', minHeight: 44, minWidth: 64 },
  modalHeaderActionEnd: { alignItems: 'flex-end' },
  modalHeaderActionStart: { alignItems: 'flex-start' },
  playBadge: {
    alignItems: 'center',
    backgroundColor: 'rgba(5,8,20,0.72)',
    borderRadius: radii.round,
    height: 24,
    justifyContent: 'center',
    position: 'absolute',
    width: 24,
  },
  premiumLock: {
    alignItems: 'center',
    borderRadius: radii.button,
    flexDirection: 'row',
    gap: spacing.xs,
    padding: spacing.sm,
  },
  pressed: { opacity: 0.8, transform: [{ scale: 0.98 }] },
  publicNotice: {
    alignItems: 'center',
    borderRadius: radii.button,
    flexDirection: 'row',
    gap: spacing.xs,
    padding: spacing.sm,
  },
  roundAction: {
    alignItems: 'center',
    borderRadius: radii.round,
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  saveLabel: { fontWeight: '800' },
  section: { gap: spacing.sm },
  sectionHeadingAction: { paddingHorizontal: spacing.xs },
  sectionHeadingWithAction: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  thumb: { borderRadius: 10, height: 48, width: 48 },
  thumbFallback: { alignItems: 'center', justifyContent: 'center' },
  toggleRow: {
    alignItems: 'center',
    borderRadius: radii.button,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.sm,
    minHeight: 50,
    paddingHorizontal: spacing.md,
  },
  tripRow: {
    alignItems: 'center',
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: spacing.sm,
    minHeight: 56,
    paddingVertical: spacing.xs,
  },
  videoCopy: { flex: 1, gap: spacing.xxs },
  videoPreview: { alignItems: 'center', justifyContent: 'center' },
  videoRow: {
    alignItems: 'center',
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: spacing.xs,
    paddingVertical: spacing.xs,
  },
});
