import { Ionicons } from '@expo/vector-icons';
import { useQueryClient } from '@tanstack/react-query';
import * as Crypto from 'expo-crypto';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useEffectEvent, useMemo, useRef, useState } from 'react';
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

import { VideoTranscodeError } from '../../../modules/dispo-video-transcoder';

import {
  prepareDemoVideo,
  removePreparedDemoMedia,
  type PreparedDemoVideo,
} from './portfolio-media';
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
  DEMO_VIDEO_MAX_DURATION_MS,
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
import { ListRow } from '@/components/ui/list-row';
import { NativeHeaderButton } from '@/components/ui/native-header-button';
import { DispoButton, IconButton } from '@/components/ui/pressable';
import {
  EmptyState,
  ErrorState,
  LoadingState,
  ModalHeader,
  Screen,
  ScreenHeader,
} from '@/components/ui/screen';
import { HeaderAction } from '@/components/ui/section';
import { BottomSheet, scrimColor } from '@/components/ui/sheet';
import { useAuth } from '@/features/auth/auth-context';
import { countryOptions, type CountryOption } from '@/features/onboarding/onboarding-model';
import { useSubscription } from '@/features/premium/subscription-queries';
import { NativeDatePartField } from '@/features/profiles/native-date-part-field';
import { profileKeys } from '@/features/profiles/profile-queries';
import { formatSwiftPlaceholders } from '@/i18n/format';
import { useDispoTheme } from '@/theme/theme-context';
import {
  minimumTouchTarget,
  onAccent,
  pressedStyle,
  radii,
  spacing,
  surfaceStyle,
  tint,
} from '@/theme/tokens';

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
  if (error instanceof VideoTranscodeError) {
    if (error.code === 'video_transcode_cancelled') return "L'import vidéo a été annulé.";
    if (error.code === 'video_transcoder_unavailable') {
      return 'Mets Dispo à jour pour importer cette vidéo.';
    }
    return "La vidéo n'a pas pu être préparée — réessaie avec un autre fichier.";
  }
  if (error instanceof PortfolioValidationError) {
    if (error.code === 'demo_video_invalid_file') {
      return "Cette vidéo n'a pas pu être lue — choisis un autre fichier.";
    }
    if (error.code === 'demo_video_too_long') return 'Vidéo trop longue — 1 min 30 maximum.';
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

function EditorHeader({
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
  const { t } = useTranslation();
  return (
    <ModalHeader
      leading={<NativeHeaderButton disabled={saving} label={t('Annuler')} onPress={onCancel} />}
      title={title}
      trailing={
        <NativeHeaderButton
          disabled={saving}
          label={saving ? t('Envoi…') : t('OK')}
          onPress={onSave}
        />
      }
    />
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
  const subscription = useSubscription();
  const expandedPortfolio = subscription.data?.tier === 'premium';
  const { add } = useLocalSearchParams<{ add?: string }>();
  const autoAddStarted = useRef(false);
  const [videoDraft, setVideoDraft] = useState<VideoDetailsDraft | null>(null);
  const [videoMenu, setVideoMenu] = useState<{ index: number; video: DemoVideo } | null>(null);
  const [tripDraft, setTripDraft] = useState<AvailabilityTripDraft | null>(null);
  const [countryModal, setCountryModal] = useState(false);
  const videoPreparationRef = useRef<AbortController | null>(null);
  const locale = i18n.resolvedLanguage ?? 'fr';
  const screenTitle = section === 'demos' ? t('Mes démos') : t('Mes voyages');
  const localizedDemoTitle = (video: DemoVideo, index: number) =>
    video.title ?? formatSwiftPlaceholders(t('Vidéo %lld'), index + 1);
  const selectedCountry = useMemo(
    () => countryOptions.find((country) => country.code === tripDraft?.country),
    [tripDraft?.country],
  );
  const close = <HeaderAction icon="close" label={t('Fermer')} onPress={() => router.back()} />;

  useEffect(
    () => () => {
      videoPreparationRef.current?.abort();
    },
    [],
  );

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
      videoMaxDuration: DEMO_VIDEO_MAX_DURATION_MS / 1000,
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
    const controller = new AbortController();
    videoPreparationRef.current = controller;
    let prepared: PreparedDemoVideo | null = null;
    try {
      prepared = await prepareDemoVideo(asset, { signal: controller.signal });
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
      if (videoPreparationRef.current === controller) videoPreparationRef.current = null;
      removePreparedDemoMedia(prepared);
      setBusy(null);
    }
  };

  const pickRequestedVideo = useEffectEvent(() => void pickVideo());
  useEffect(() => {
    if (
      add !== '1' ||
      section !== 'demos' ||
      !query.isSuccess ||
      !subscription.isSuccess ||
      autoAddStarted.current
    )
      return;
    const timer = setTimeout(() => {
      autoAddStarted.current = true;
      pickRequestedVideo();
    }, 350);
    return () => clearTimeout(timer);
  }, [add, query.isSuccess, section, subscription.isSuccess]);

  const editVideo = (video: DemoVideo) => {
    setErrorText(null);
    setVideoDraft({
      date: dateFromDayKey(video.date ?? dayKey(new Date())),
      hasDate: video.date !== null,
      id: video.id,
      title: video.title ?? '',
    });
  };

  const openVideo = (video: DemoVideo, index: number) => {
    router.push({
      pathname: '/profiles/[id]/video',
      params: {
        id: userId,
        title: localizedDemoTitle(video, index),
        url: video.url,
      },
    } as never);
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

  if (query.isLoading || query.isError || !query.data) {
    return (
      <Screen>
        <ScreenHeader action={close} title={screenTitle} />
        {query.isError ? (
          <ErrorState message={query.error.message} onRetry={() => void query.refetch()} />
        ) : (
          <LoadingState />
        )}
      </Screen>
    );
  }

  const portfolio = query.data;
  const limit = demoVideoLimit(expandedPortfolio);
  const uploading = busy === 'upload';
  return (
    <Screen>
      <ScreenHeader
        action={close}
        {...(section === 'demos' ? { subtitle: `${portfolio.videos.length}/${limit}` } : {})}
        title={screenTitle}
      />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {errorText ? (
          <View style={[styles.errorBanner, { backgroundColor: tint(palette.signal, 0.09) }]}>
            <Ionicons color={palette.signal} name="alert-circle" size={19} />
            <AppText color={palette.signal} style={styles.flex} variant="caption">
              {errorText}
            </AppText>
            <IconButton
              accessibilityLabel={t('Fermer')}
              icon="close"
              iconColor={palette.signal}
              onPress={() => setErrorText(null)}
              variant="plain"
            />
          </View>
        ) : null}

        {section === 'demos' ? (
          <Card style={styles.card}>
            <AppText color={palette.muted} variant="caption">
              {t(
                "C'est ce que les organisateurs regardent avant de t'engager — 60 à 90 secondes suffisent.",
              )}
            </AppText>
            <View style={[styles.notice, { backgroundColor: tint(palette.electric, 0.07) }]}>
              <Ionicons color={palette.electric} name="globe-outline" size={16} />
              <AppText color={palette.electric} style={styles.flex} variant="caption2">
                {t('Tes vidéos sont visibles par les autres musiciens sur ton profil.')}
              </AppText>
            </View>

            {portfolio.videos.map((video, index) => (
              <View
                key={video.id}
                style={[styles.videoRow, surfaceStyle(palette, 'muted').container]}
              >
                <Pressable
                  accessibilityHint={t('Ouvre le lecteur vidéo')}
                  accessibilityLabel={`${t('Lire la vidéo')} · ${localizedDemoTitle(video, index)}`}
                  accessibilityRole="button"
                  onPress={() => openVideo(video, index)}
                  style={({ pressed }) => [styles.videoMain, pressed && pressedStyle]}
                >
                  <View style={styles.videoPreview}>
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
                        <Ionicons color={palette.bronze} name="videocam" size={25} />
                      </View>
                    )}
                    <View style={styles.playBadge}>
                      <Ionicons color={onAccent} name="play" size={12} />
                    </View>
                  </View>
                  <View style={styles.videoCopy}>
                    <AppText numberOfLines={2} variant="headline">
                      {localizedDemoTitle(video, index)}
                    </AppText>
                    <AppText color={palette.muted} variant="caption">
                      {video.date ? formatDay(video.date, locale) : t('Sans date')}
                    </AppText>
                  </View>
                </Pressable>
                <IconButton
                  accessibilityLabel={t('Voir plus')}
                  disabled={Boolean(busy)}
                  icon="ellipsis-horizontal"
                  iconColor={palette.muted}
                  onPress={() => setVideoMenu({ index, video })}
                  variant="plain"
                />
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
              <View style={[styles.notice, { backgroundColor: tint(palette.electric, 0.07) }]}>
                <Ionicons color={palette.electric} name="sparkles" size={16} />
                <AppText color={palette.electric} style={styles.flex} variant="caption">
                  {t("Jusqu'à 6 vidéos avec Premium")}
                </AppText>
                <Ionicons color={palette.electric} name="lock-closed" size={14} />
              </View>
            ) : null}
          </Card>
        ) : null}

        {section === 'trips' ? (
          <Card style={styles.card}>
            <AppText color={palette.muted} variant="caption">
              {t(
                'Pendant cette période, les musiciens et les groupes de cette ville te trouvent dans leurs recherches — pas ceux de chez toi.',
              )}
            </AppText>
            <ListRow
              leadingIcon="calendar-outline"
              leadingIconColor={palette.jam}
              onPress={() => router.push('/profile/availability' as never)}
              title={t('Gérer mes disponibilités')}
              tone="plain"
            />
            {portfolio.trips.length === 0 ? (
              <EmptyState
                action={{ label: t('Ajouter'), onPress: newTrip }}
                icon="airplane-outline"
                message={formatSwiftPlaceholders(
                  t("Rien pour l'instant — tu es cherché·e autour de %@."),
                  [portfolio.postalCode, portfolio.city].filter(Boolean).join(' ') || t('ta ville'),
                )}
                title={t('Je suis ailleurs')}
              />
            ) : (
              <>
                {portfolio.trips.map((trip) => (
                  <ListRow
                    accessory={
                      <IconButton
                        accessibilityLabel={t('Supprimer')}
                        disabled={Boolean(busy)}
                        icon="close-circle"
                        iconColor={palette.muted}
                        onPress={() => confirmRemoveTrip(trip)}
                        variant="plain"
                      />
                    }
                    key={trip.id}
                    leadingIcon="location-outline"
                    onPress={() => editTrip(trip)}
                    subtitle={`${formatDay(trip.from, locale)} → ${formatDay(trip.to, locale)}`}
                    title={availabilityTripLabel(trip)}
                    tone="plain"
                  />
                ))}
                <DispoButton icon="add-circle" onPress={newTrip} variant="secondary">
                  {t('Ajouter')}
                </DispoButton>
              </>
            )}
          </Card>
        ) : null}
      </ScrollView>

      <BottomSheet
        onClose={() => setVideoMenu(null)}
        {...(videoMenu ? { title: localizedDemoTitle(videoMenu.video, videoMenu.index) } : {})}
        visible={videoMenu !== null}
      >
        <ListRow
          leadingIcon="pencil-outline"
          onPress={() => {
            const menu = videoMenu;
            setVideoMenu(null);
            if (menu) editVideo(menu.video);
          }}
          title={t('Modifier')}
          tone="plain"
        />
        <ListRow
          leadingIcon="trash-outline"
          leadingIconColor={palette.error}
          onPress={() => {
            const menu = videoMenu;
            setVideoMenu(null);
            if (menu) confirmRemoveVideo(menu.video);
          }}
          title={t('Supprimer')}
          tone="plain"
        />
      </BottomSheet>

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
              <EditorHeader
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
                  <AppText color={palette.signal} style={styles.center} variant="caption">
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
                  style={({ pressed }) => [
                    styles.toggleRow,
                    surfaceStyle(palette, 'muted').container,
                    pressed && pressedStyle,
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
                  <NativeDatePartField
                    label={t('Date de la vidéo')}
                    maximumDate={new Date()}
                    onChange={(date) =>
                      setVideoDraft((draft) => (draft ? { ...draft, date } : draft))
                    }
                    part="date"
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
              <EditorHeader
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
                  <AppText color={palette.signal} style={styles.center} variant="caption">
                    {errorText}
                  </AppText>
                ) : null}
                <View style={styles.dateRow}>
                  <NativeDatePartField
                    label={t('Du')}
                    onChange={(date) =>
                      setTripDraft((draft) => {
                        if (!draft) return draft;
                        const from = dayKey(date);
                        return { ...draft, from, to: draft.to < from ? from : draft.to };
                      })
                    }
                    part="date"
                    value={dateFromDayKey(tripDraft.from)}
                  />
                  <NativeDatePartField
                    label={t('Au')}
                    minimumDate={dateFromDayKey(tripDraft.from)}
                    onChange={(date) =>
                      setTripDraft((draft) => (draft ? { ...draft, to: dayKey(date) } : draft))
                    }
                    part="date"
                    value={dateFromDayKey(tripDraft.to)}
                  />
                </View>
                <ListRow
                  accessibilityLabel={`${t('Pays')}: ${t(selectedCountry?.label ?? tripDraft.country)}`}
                  accessory={<Ionicons color={palette.muted} name="chevron-down" size={17} />}
                  leading={<AppText variant="title2">{selectedCountry?.flag ?? '🌍'}</AppText>}
                  onPress={() => setCountryModal(true)}
                  subtitle={t(selectedCountry?.label ?? tripDraft.country)}
                  title={t('Pays')}
                />
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
          <ModalHeader
            leading={
              <NativeHeaderButton label={t('Fermer')} onPress={() => setCountryModal(false)} />
            }
            title={t('Pays')}
          />
          <FlatList
            contentContainerStyle={styles.countryList}
            data={[...countryOptions] as CountryOption[]}
            keyExtractor={(item) => item.code}
            renderItem={({ item }) => (
              <ListRow
                accessory={
                  tripDraft?.country === item.code ? (
                    <Ionicons color={palette.electric} name="checkmark-circle" size={20} />
                  ) : (
                    <View />
                  )
                }
                leading={<AppText variant="title2">{item.flag}</AppText>}
                onPress={() => {
                  setTripDraft((draft) => (draft ? { ...draft, country: item.code } : draft));
                  setCountryModal(false);
                }}
                title={t(item.label)}
                tone="plain"
              />
            )}
          />
        </Screen>
      </Modal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing.sm },
  center: { textAlign: 'center' },
  content: { gap: spacing.xl, paddingBottom: spacing.xxl, paddingHorizontal: spacing.gutter },
  countryList: { paddingBottom: spacing.xxl, paddingHorizontal: spacing.gutter },
  dateRow: { flexDirection: 'row', gap: spacing.sm },
  errorBanner: {
    alignItems: 'center',
    borderRadius: radii.button,
    flexDirection: 'row',
    gap: spacing.xs,
    paddingLeft: spacing.sm,
    paddingRight: spacing.xxs,
    paddingVertical: spacing.xxs,
  },
  flex: { flex: 1 },
  modalContent: { gap: spacing.md, padding: spacing.gutter, paddingBottom: spacing.xxl },
  notice: {
    alignItems: 'center',
    borderRadius: radii.button,
    flexDirection: 'row',
    gap: spacing.xs,
    padding: spacing.sm,
  },
  playBadge: {
    alignItems: 'center',
    backgroundColor: scrimColor,
    borderRadius: radii.round,
    height: 24,
    justifyContent: 'center',
    position: 'absolute',
    width: 24,
  },
  thumb: { borderRadius: radii.sm, height: 68, width: 68 },
  thumbFallback: { alignItems: 'center', justifyContent: 'center' },
  toggleRow: {
    alignItems: 'center',
    borderRadius: radii.button,
    flexDirection: 'row',
    gap: spacing.sm,
    minHeight: 48,
    paddingHorizontal: spacing.md,
  },
  videoCopy: { flex: 1, gap: spacing.xxs, minWidth: 0 },
  videoMain: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
    gap: spacing.sm,
    minHeight: minimumTouchTarget,
    padding: spacing.sm,
  },
  videoPreview: { alignItems: 'center', justifyContent: 'center' },
  videoRow: {
    alignItems: 'center',
    borderRadius: radii.control,
    flexDirection: 'row',
    overflow: 'hidden',
    paddingRight: spacing.xxs,
  },
});
