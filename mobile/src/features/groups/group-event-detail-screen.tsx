import { Ionicons } from '@expo/vector-icons';
import { router, Stack } from 'expo-router';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { GroupEventAutoSos } from './group-event-auto-sos';
import { useMarkEventChangeSeen } from './group-event-changes';
import {
  attendanceFor,
  groupLineupState,
  missingGroupEventRoles,
  type GroupSong,
} from './group-model';
import {
  useCancelGroupEvent,
  useCopyGroupSong,
  useGroup,
  useGroupEventResources,
  useInviteAvailableToGroupEvent,
  useReorderGroupEventSetlist,
  useSaveEventSetlist,
  useSetGroupAttendance,
} from './group-queries';
import { containsGroupSong, copiedGroupSong } from './group-song-copy';
import { GroupSongRow } from './group-song-row';
import { SongReorderList } from './song-reorder-list';

import { AppText } from '@/components/ui/app-text';
import { Avatar } from '@/components/ui/avatar';
import { Card } from '@/components/ui/card';
import { ChoiceChip } from '@/components/ui/choice-chip';
import { DispoButton } from '@/components/ui/pressable';
import { ErrorState, LoadingState, Screen } from '@/components/ui/screen';
import { SectionHeader } from '@/components/ui/section';
import { Tag } from '@/components/ui/tag';
import { useAuth } from '@/features/auth/auth-context';
import type { GigApplication, GigDetail } from '@/features/gigs/gig-model';
import { useGigApplicationDecision } from '@/features/gigs/gig-queries';
import { useDispoTheme } from '@/theme/theme-context';
import { radii, spacing } from '@/theme/tokens';

function ApplicantDecisionRow({
  applicant,
  gigId,
  onChanged,
}: {
  applicant: GigApplication;
  gigId: string;
  onChanged: () => void;
}) {
  const { palette } = useDispoTheme();
  const { t } = useTranslation();
  const decision = useGigApplicationDecision();
  const run = (value: 'accept' | 'decline' | 'reopen') =>
    decision.mutate(
      { applicationId: applicant.id, decision: value, gigId },
      { onSuccess: onChanged },
    );
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
          size={40}
          uri={applicant.musicianPhotoUrl}
        />
        <View style={styles.flex}>
          <AppText style={styles.strong}>{applicant.musicianName || t('Musicien·ne')}</AppText>
          <AppText color={palette.muted} variant="caption2">
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
          <View style={styles.flex}>
            <DispoButton
              loading={decision.isPending}
              onPress={() => run('decline')}
              variant="danger"
            >
              {t('Refuser')}
            </DispoButton>
          </View>
          <View style={styles.flex}>
            <DispoButton loading={decision.isPending} onPress={() => run('accept')}>
              {t('Accepter')}
            </DispoButton>
          </View>
        </View>
      ) : null}
      {applicant.status === 'accepted' ? (
        <DispoButton loading={decision.isPending} onPress={() => run('reopen')} variant="secondary">
          {t('Remettre en attente')}
        </DispoButton>
      ) : null}
    </View>
  );
}

function LinkedSosCard({ gigs, onChanged }: { gigs: GigDetail[]; onChanged: () => void }) {
  const { palette } = useDispoTheme();
  const { t } = useTranslation();
  if (!gigs.length) return null;
  return (
    <Card style={styles.card}>
      <View style={styles.sectionTitleRow}>
        <Ionicons color={palette.signal} name="flash" size={18} />
        <AppText variant="title">{t('SOS en cours pour ce concert')}</AppText>
      </View>
      {gigs.map((gig) => {
        const waiting = gig.applicants.filter((applicant) => applicant.status === 'pending').length;
        return (
          <View key={gig.id} style={[styles.sos, { borderColor: palette.border }]}>
            <View style={styles.titleLine}>
              <AppText style={[styles.flex, styles.strong]}>
                {gig.wantedInstruments.map((instrument) => t(instrument)).join(' · ')}
              </AppText>
              <Tag
                color={
                  gig.filledInstruments.length
                    ? palette.jam
                    : waiting
                      ? palette.signal
                      : palette.bronze
                }
                label={
                  gig.filledInstruments.length
                    ? t('Pourvu')
                    : waiting
                      ? t('{{count}} à traiter', { count: waiting })
                      : t('En attente de candidats')
                }
              />
            </View>
            {gig.applicants.length ? (
              gig.applicants.map((applicant) => (
                <ApplicantDecisionRow
                  applicant={applicant}
                  gigId={gig.id}
                  key={applicant.id}
                  onChanged={onChanged}
                />
              ))
            ) : (
              <AppText color={palette.muted} variant="caption">
                {t('Aucune candidature pour le moment.')}
              </AppText>
            )}
          </View>
        );
      })}
    </Card>
  );
}

export function GroupEventDetailScreen({ eventId, groupId }: { eventId: string; groupId: string }) {
  const { session } = useAuth();
  const { palette } = useDispoTheme();
  const { i18n, t } = useTranslation();
  const query = useGroup(groupId);
  const attendance = useSetGroupAttendance();
  const saveSetlist = useSaveEventSetlist();
  const reorderSetlist = useReorderGroupEventSetlist();
  const copySong = useCopyGroupSong();
  const cancel = useCancelGroupEvent();
  const invite = useInviteAvailableToGroupEvent();
  const group = query.data;
  const event = group?.events.find((item) => item.id === eventId);
  const userId = session?.user.id ?? '';
  const isLeader = group?.leaderId === userId;
  useMarkEventChangeSeen(userId, eventId, event?.scheduleChangedAt);
  const excludedProfileIds = useMemo(
    () => [
      ...(group?.members.map((member) => member.id) ?? []),
      ...(group?.pendingInvitations.map((pending) => pending.profileId) ?? []),
    ],
    [group?.members, group?.pendingInvitations],
  );
  const resources = useGroupEventResources({
    enabled: Boolean(group && event),
    eventDate: event?.date ?? '',
    eventId,
    excludedProfileIds,
    includeLeaderData: isLeader === true,
  });
  const [invitingProfileId, setInvitingProfileId] = useState<string | null>(null);
  const [reorderMode, setReorderMode] = useState(false);
  if (query.isLoading)
    return (
      <Screen nativeHeader>
        <LoadingState label={t('Chargement de la date…')} />
      </Screen>
    );
  if (query.error)
    return (
      <Screen nativeHeader>
        <ErrorState
          message={t('Cette date n’a pas pu être chargée.')}
          onRetry={() => void query.refetch()}
        />
      </Screen>
    );
  if (!group || !event)
    return (
      <Screen nativeHeader>
        <ErrorState message={t('Cette date n’est plus accessible.')} />
      </Screen>
    );

  const myStatus = attendanceFor(event, userId);
  const guests = resources.data?.guests ?? [];
  const linkedGigs = resources.data?.linkedGigs ?? [];
  const replacementRoles = [
    ...guests.flatMap((guest) => (guest.instrument ? [guest.instrument] : [])),
    ...linkedGigs.flatMap((gig) => gig.filledInstruments),
  ];
  const lineup = groupLineupState(event, group.members, new Date(), replacementRoles);
  const missingRoles = missingGroupEventRoles(event, group.members, replacementRoles);
  const availableMembers = group.members.filter(
    (member) => attendanceFor(event, member.id) === 'available',
  );
  const unavailableMembers = group.members.filter(
    (member) => attendanceFor(event, member.id) === 'unavailable',
  );
  const pendingMembers = group.members.filter(
    (member) => attendanceFor(event, member.id) === 'pending',
  );
  const locale = i18n.resolvedLanguage ?? i18n.language ?? 'fr';
  const date = new Intl.DateTimeFormat(locale, { dateStyle: 'full', timeStyle: 'short' }).format(
    new Date(event.date),
  );
  const futureSeriesIds = event.seriesId
    ? group.events
        .filter((item) => item.seriesId === event.seriesId && item.date >= event.date)
        .map((item) => item.id)
    : [event.id];
  const pendingSongs = event.setlist.filter((song) => !song.isApproved);
  const approvedSongs = event.setlist.filter((song) => song.isApproved);
  const reorderActive = reorderMode && isLeader;
  const repertoireChoices = group.repertoire.filter(
    (song) => song.isApproved && !containsGroupSong(event.setlist, song),
  );
  const invitees = [...(resources.data?.availableInvitees ?? [])].sort((left, right) => {
    const leftMatch = left.instruments.some((instrument) => missingRoles.includes(instrument));
    const rightMatch = right.instruments.some((instrument) => missingRoles.includes(instrument));
    return Number(rightMatch) - Number(leftMatch) || left.name.localeCompare(right.name, locale);
  });

  const openSong = (song: GroupSong) =>
    router.push({
      params: { id: group.id, songId: song.id, sourceEventId: event.id },
      pathname: '/groups/[id]/songs/[songId]',
    } as never);
  const saveSuggestion = (song: GroupSong, approved: boolean) => {
    const desired = approved
      ? event.setlist.map((item) => (item.id === song.id ? { ...item, isApproved: true } : item))
      : event.setlist.filter((item) => item.id !== song.id);
    saveSetlist.mutate({ desired, eventId: event.id, original: event.setlist });
  };
  const addFromRepertoire = (song: GroupSong) =>
    copySong.mutate([
      {
        copy: copiedGroupSong(song, { approved: isLeader, suggestedBy: userId }),
        destinationId: `event:${event.id}`,
        eventId: event.id,
        groupId: group.id,
      },
    ]);
  const publishSos = () =>
    router.push({
      params: {
        date: event.date,
        eventId: event.id,
        groupId: group.id,
        instruments: missingRoles.join('|'),
        place: event.publicLocationLabel || event.venue,
        title: t(event.kind),
      },
      pathname: '/gigs/create',
    } as never);

  if (reorderActive) {
    return (
      <Screen nativeHeader>
        <Stack.Screen options={{ title: t(event.kind) }} />
        <SongReorderList
          title={t('Setlist')}
          songs={approvedSongs}
          onDone={() => setReorderMode(false)}
          onSave={(songIds) => reorderSetlist.mutateAsync({ eventId: event.id, songIds })}
          onToggleSet={(song) =>
            saveSetlist.mutateAsync({
              eventId: event.id,
              original: event.setlist,
              desired: event.setlist.map((item) =>
                item.id === song.id ? { ...item, startsSet: !item.startsSet } : item,
              ),
            })
          }
        />
      </Screen>
    );
  }

  return (
    <Screen nativeHeader>
      <Stack.Screen options={{ title: t(event.kind) }} />
      <ScrollView contentContainerStyle={styles.content}>
        <AppText color={palette.muted} variant="caption">
          {group.name}
        </AppText>
        <Card style={styles.card}>
          <View style={styles.titleLine}>
            <Tag
              color={
                event.kind === 'Concert'
                  ? palette.concert
                  : event.kind === 'Jam'
                    ? palette.jam
                    : palette.rehearsal
              }
              label={t(event.kind)}
            />
            {event.recurrence && event.recurrence !== 'Ponctuel' ? (
              <Tag color={palette.rehearsal} label={t(event.recurrence)} />
            ) : null}
          </View>
          <View style={styles.infoRow}>
            <Ionicons color={palette.electric} name="calendar-outline" size={18} />
            <AppText style={styles.flex}>{date}</AppText>
          </View>
          <View style={styles.infoRow}>
            <Ionicons color={palette.electric} name="location-outline" size={18} />
            <AppText style={styles.flex}>{event.publicLocationLabel || event.venue}</AppText>
          </View>
          {event.privateLocationState === 'available' && event.exactAddress ? (
            <View style={[styles.privateAddress, { backgroundColor: `${palette.jam}18` }]}>
              <View style={styles.infoRow}>
                <Ionicons color={palette.jam} name="lock-open" size={18} />
                <View style={styles.flex}>
                  <AppText color={palette.jam} style={styles.strong} variant="caption">
                    {t('Rendez-vous privé')}
                  </AppText>
                  <AppText variant="caption">{event.exactAddress}</AppText>
                </View>
              </View>
            </View>
          ) : event.privateLocationState === 'unknown' ? (
            <Pressable onPress={() => void query.refetch()} style={styles.infoRow}>
              <Ionicons color={palette.signal} name="refresh-circle" size={18} />
              <AppText color={palette.signal} style={styles.flex} variant="caption">
                {t('Adresse privée non chargée — réessaie dans un instant')}
              </AppText>
            </Pressable>
          ) : (
            <View style={styles.infoRow}>
              <Ionicons color={palette.muted} name="lock-closed-outline" size={18} />
              <AppText color={palette.muted} style={styles.flex} variant="caption">
                {isLeader && event.privateLocationState === 'absent'
                  ? t('Aucune adresse privée renseignée')
                  : t('Adresse révélée après confirmation de présence')}
              </AppText>
            </View>
          )}
          {event.reminderLeadDays !== null ? (
            <View style={styles.infoRow}>
              <Ionicons color={palette.bronze} name="notifications-outline" size={17} />
              <AppText color={palette.muted} variant="caption">
                {event.reminderLeadDays === 1
                  ? t('Rappel : la veille')
                  : t('Rappel : {{count}} jours avant', { count: event.reminderLeadDays })}
              </AppText>
            </View>
          ) : null}
        </Card>
        {isLeader ? (
          <Pressable
            onPress={() =>
              router.push(`/groups/${group.id}/events/edit?eventId=${event.id}` as never)
            }
            style={[styles.editButton, { backgroundColor: `${palette.electric}20` }]}
          >
            <Ionicons color={palette.electric} name="create-outline" size={17} />
            <AppText color={palette.electric} style={styles.editText}>
              {t('Modifier la session')}
            </AppText>
          </Pressable>
        ) : null}

        <Card style={styles.card}>
          {lineup !== 'forming' ? (
            <View
              style={[
                styles.lineupBanner,
                { backgroundColor: `${lineup === 'complete' ? palette.jam : palette.signal}18` },
              ]}
            >
              <Ionicons
                color={lineup === 'complete' ? palette.jam : palette.signal}
                name={lineup === 'complete' ? 'checkmark-circle' : 'alert-circle'}
                size={20}
              />
              <View style={styles.flex}>
                <AppText
                  color={lineup === 'complete' ? palette.jam : palette.signal}
                  style={styles.strong}
                  variant="caption"
                >
                  {lineup === 'complete' ? t('Line-up complet') : t('Il manque du monde')}
                </AppText>
                <AppText color={palette.muted} variant="caption2">
                  {lineup === 'complete'
                    ? t('Tout le monde est là — le concert peut se jouer.')
                    : missingRoles.length
                      ? t('Postes à pourvoir : {{roles}}', {
                          roles: missingRoles.map((role) => t(role)).join(', '),
                        })
                      : t('La date limite de réponse est passée.')}
                </AppText>
              </View>
            </View>
          ) : null}
          <View style={styles.sectionTitleRow}>
            <Ionicons color={palette.bronze} name="person-circle-outline" size={19} />
            <AppText style={styles.flex} variant="title">
              {t('Ta présence')}
            </AppText>
            <AppText color={palette.bronze} style={styles.strong} variant="caption">
              {availableMembers.length}/{group.members.length}
            </AppText>
          </View>
          <View style={styles.choiceRow}>
            <View style={styles.flex}>
              <ChoiceChip
                icon="checkmark-circle"
                label={t('Dispo')}
                onPress={() => attendance.mutate({ eventId: event.id, status: 'available' })}
                selected={myStatus === 'available'}
              />
            </View>
            <View style={styles.flex}>
              <ChoiceChip
                icon="close-circle"
                label={t('Indispo')}
                onPress={() => attendance.mutate({ eventId: event.id, status: 'unavailable' })}
                selected={myStatus === 'unavailable'}
              />
            </View>
          </View>
          {myStatus === 'pending' ? (
            <AppText color={palette.muted} variant="caption2">
              {t('Un rappel te sera envoyé pour confirmer.')}
            </AppText>
          ) : myStatus === 'unavailable' ? (
            <AppText color={palette.signal} variant="caption2">
              {t('Le leader est alerté pour trouver un remplaçant.')}
            </AppText>
          ) : null}
          {[
            { color: palette.jam, label: t('Dispo'), members: availableMembers },
            { color: palette.signal, label: t('Indispo'), members: unavailableMembers },
            { color: palette.muted, label: t('En attente'), members: pendingMembers },
          ].map((row) => (
            <View key={row.label} style={styles.attendanceSummary}>
              <View style={styles.summaryTitle}>
                <View style={[styles.dot, { backgroundColor: row.color }]} />
                <AppText color={row.color} style={styles.strong} variant="caption">
                  {row.label} · {row.members.length}
                </AppText>
              </View>
              <AppText color={palette.muted} variant="caption">
                {row.members.length
                  ? row.members
                      .map((member) => (member.id === userId ? t('Toi') : member.name))
                      .join(', ')
                  : '—'}
              </AppText>
            </View>
          ))}
          {resources.isLoading ? (
            <AppText color={palette.muted} variant="caption">
              {t('Chargement des invité·es…')}
            </AppText>
          ) : guests.length ? (
            <View style={styles.guestList}>
              <AppText color={palette.bronze} style={styles.strong} variant="caption">
                {t('Invités')} · {guests.length}
              </AppText>
              {guests.map((guest) => (
                <View key={`${guest.eventId}:${guest.musicianId}`} style={styles.memberRow}>
                  <Avatar name={guest.name} size={28} uri={guest.photoUrl} />
                  <AppText style={[styles.flex, styles.strong]} variant="caption">
                    {guest.name}
                  </AppText>
                  {guest.instrument ? (
                    <AppText color={palette.muted} variant="caption2">
                      {t(guest.instrument)}
                    </AppText>
                  ) : null}
                  <Tag color={palette.bronze} label={t('Invité')} />
                </View>
              ))}
            </View>
          ) : null}
          {resources.isError ? (
            <Pressable onPress={() => void resources.refetch()}>
              <AppText color={palette.signal} variant="caption">
                {t('Les remplaçant·es n’ont pas pu être chargé·es. Réessayer')}
              </AppText>
            </Pressable>
          ) : null}
        </Card>

        {isLeader && lineup !== 'complete' && invitees.length ? (
          <Card style={styles.card}>
            <View style={styles.sectionTitleRow}>
              <Ionicons color={palette.bronze} name="person-add" size={18} />
              <AppText style={styles.flex} variant="title">
                {t('Dispos ce jour-là')}
              </AppText>
              <Tag color={palette.bronze} label={String(invitees.length)} />
            </View>
            <AppText color={palette.muted} variant="caption">
              {t(
                'Un tap envoie une invitation comme invité·e, pré-coche cette date et ouvre le contact direct.',
              )}
            </AppText>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View style={styles.inviteesRow}>
                {invitees.slice(0, 12).map((musician) => {
                  const matching = musician.instruments.filter((instrument) =>
                    missingRoles.includes(instrument),
                  );
                  return (
                    <View key={musician.id} style={styles.invitee}>
                      <Avatar name={musician.name} size={48} uri={musician.photoUrl} />
                      <AppText numberOfLines={1} style={styles.inviteeName} variant="caption2">
                        {musician.name.split(' ')[0]}
                      </AppText>
                      <AppText color={palette.muted} numberOfLines={1} variant="caption2">
                        {(matching[0] ?? musician.instruments[0])
                          ? t(matching[0] ?? musician.instruments[0]!)
                          : t('Musicien·ne')}
                      </AppText>
                      <Pressable
                        disabled={invite.isPending}
                        onPress={() => {
                          setInvitingProfileId(musician.id);
                          invite.mutate(
                            {
                              eventId: event.id,
                              groupId: group.id,
                              invitedBy: userId,
                              message: t(
                                'Salut ! On a une place pour « {{event}} » ({{group}}) le {{date}} à {{venue}}. Tu es dispo — tu nous rejoins ?',
                                { date, event: event.title, group: group.name, venue: event.venue },
                              ),
                              profileId: musician.id,
                            },
                            {
                              onSettled: () => setInvitingProfileId(null),
                              onSuccess: (result) => {
                                if (!result.attendancePrefilled || !result.messageSent) {
                                  Alert.alert(
                                    t('Invitation envoyée'),
                                    t(
                                      'L’invitation est partie. Une aide de présence ou le message direct devra peut-être être repris manuellement.',
                                    ),
                                  );
                                }
                              },
                            },
                          );
                        }}
                        style={[styles.inviteButton, { backgroundColor: palette.bronze }]}
                      >
                        <AppText color="#FFFFFF" style={styles.inviteButtonText}>
                          {invitingProfileId === musician.id ? '…' : t('Inviter')}
                        </AppText>
                      </Pressable>
                    </View>
                  );
                })}
              </View>
            </ScrollView>
            {invite.isError ? (
              <AppText color={palette.signal} variant="caption">
                {t('L’invitation n’a pas pu être envoyée.')}
              </AppText>
            ) : null}
          </Card>
        ) : null}

        {isLeader && resources.isLoading ? (
          <Card style={styles.card}>
            <AppText color={palette.muted} variant="caption">
              {t('Chargement des SOS liés…')}
            </AppText>
          </Card>
        ) : null}
        {isLeader ? (
          <LinkedSosCard gigs={linkedGigs} onChanged={() => void resources.refetch()} />
        ) : null}
        {isLeader ? <GroupEventAutoSos event={event} group={group} /> : null}
        {isLeader ? (
          <DispoButton onPress={publishSos} variant="danger">
            {t('Un membre lâche ? Publier un SOS')}
          </DispoButton>
        ) : null}

        {pendingSongs.length ? (
          <View style={styles.songStack}>
            <SectionHeader
              subtitle={
                isLeader ? t('À valider — c’est toi qui décides') : t('En attente du leader')
              }
              title={t('Suggestions')}
            />
            {pendingSongs.map((song) => (
              <GroupSongRow
                cardStyle={{ borderColor: `${palette.signal}55` }}
                key={song.id}
                members={group.members}
                onPress={() => openSong(song)}
                showDisclosure={!isLeader}
                showListenAction={!isLeader}
                showSoloAction={!isLeader}
                song={song}
                trailing={
                  isLeader ? (
                    <View style={styles.songActions}>
                      <Pressable
                        accessibilityLabel={t('Refuser')}
                        accessibilityRole="button"
                        accessibilityState={{ disabled: saveSetlist.isPending }}
                        disabled={saveSetlist.isPending}
                        onPress={() => saveSuggestion(song, false)}
                        style={styles.songActionButton}
                      >
                        <Ionicons color={palette.muted} name="close-circle" size={24} />
                      </Pressable>
                      <Pressable
                        accessibilityLabel={t('Accepter')}
                        accessibilityRole="button"
                        accessibilityState={{ disabled: saveSetlist.isPending }}
                        disabled={saveSetlist.isPending}
                        onPress={() => saveSuggestion(song, true)}
                        style={styles.songActionButton}
                      >
                        <Ionicons color={palette.jam} name="checkmark-circle" size={24} />
                      </Pressable>
                    </View>
                  ) : (
                    <Tag color={palette.bronze} label={t('En attente')} />
                  )
                }
              />
            ))}
          </View>
        ) : null}

        <View style={styles.songStack}>
          <DispoButton
            icon="add"
            onPress={() =>
              router.push({
                pathname: '/groups/[id]/songs/[songId]',
                params: { id: group.id, songId: 'new', sourceEventId: event.id },
              } as never)
            }
            variant="secondary"
          >
            {isLeader
              ? t('Ajouter un morceau à cet événement')
              : t('Suggérer un morceau pour cet événement')}
          </DispoButton>
          <View style={styles.setlistHeader}>
            <View style={styles.flex}>
              <SectionHeader
                subtitle={t('{{count}} morceaux', { count: approvedSongs.length })}
                title={t('Setlist')}
              />
            </View>
            {isLeader && approvedSongs.length > 1 ? (
              <Pressable
                accessibilityLabel={reorderMode ? t('Terminé') : t('Réorganiser')}
                accessibilityRole="button"
                accessibilityState={{ selected: reorderMode }}
                onPress={() => setReorderMode((current) => !current)}
                style={({ pressed }) => [
                  styles.reorderButton,
                  {
                    backgroundColor: reorderMode ? `${palette.jam}1F` : palette.inset,
                    borderColor: reorderMode ? `${palette.jam}66` : palette.border,
                  },
                  pressed && styles.songActionActive,
                ]}
              >
                <Ionicons
                  color={reorderMode ? palette.jam : palette.electric}
                  name={reorderMode ? 'checkmark' : 'reorder-three'}
                  size={17}
                />
                <AppText
                  color={reorderMode ? palette.jam : palette.electric}
                  style={styles.reorderLabel}
                  variant="caption2"
                >
                  {reorderMode ? t('Terminé') : t('Réorganiser')}
                </AppText>
              </Pressable>
            ) : null}
          </View>
          {approvedSongs.length ? (
            approvedSongs.map((song, index) => (
              <View key={song.id} style={styles.songStack}>
                {(index === 0 && approvedSongs.some((item, i) => i > 0 && item.startsSet)) ||
                (index > 0 && song.startsSet) ? (
                  <AppText color={palette.bronze} variant="label">
                    {t('Set {{number}}', {
                      number:
                        1 +
                        approvedSongs.slice(1, index + 1).filter((item) => item.startsSet).length,
                    })}
                  </AppText>
                ) : null}
                <View style={styles.numberedSongRow}>
                  <AppText color={palette.muted} style={styles.songIndex} variant="caption">
                    {index + 1}.
                  </AppText>
                  <View style={styles.flex}>
                    <GroupSongRow
                      members={group.members}
                      song={song}
                      onPress={() => openSong(song)}
                    />
                  </View>
                </View>
              </View>
            ))
          ) : (
            <AppText color={palette.muted} variant="caption">
              {t('Setlist vide — pioche dans le répertoire du groupe ou ajoute des morceaux.')}
            </AppText>
          )}
        </View>

        {repertoireChoices.length ? (
          <Card style={styles.card}>
            <SectionHeader
              subtitle={
                isLeader ? t('Ajout direct depuis le répertoire') : t('Le leader devra valider')
              }
              title={isLeader ? t('Ajouter à la setlist') : t('Suggérer pour la setlist')}
            />
            {repertoireChoices.map((song) => (
              <Pressable
                disabled={copySong.isPending}
                key={song.id}
                onPress={() => addFromRepertoire(song)}
                style={[styles.songRow, { borderBottomColor: palette.border }]}
              >
                <Ionicons color={palette.bronze} name="add-circle" size={23} />
                <View style={styles.flex}>
                  <AppText style={styles.strong}>{song.title}</AppText>
                  <AppText color={palette.muted} variant="caption2">
                    {song.artist}
                  </AppText>
                </View>
              </Pressable>
            ))}
            {copySong.isError ? (
              <AppText color={palette.signal} variant="caption">
                {t('Le morceau n’a pas pu être ajouté.')}
              </AppText>
            ) : null}
          </Card>
        ) : null}

        {isLeader ? (
          <DispoButton
            loading={cancel.isPending}
            onPress={() =>
              Alert.alert(t('Annuler cette date ?'), t('Le groupe sera prévenu.'), [
                { style: 'cancel', text: t('Garder') },
                {
                  onPress: () => cancel.mutate(event.id, { onSuccess: () => router.back() }),
                  style: 'destructive',
                  text: t('Cette date seulement'),
                },
                ...(futureSeriesIds.length > 1
                  ? [
                      {
                        onPress: () =>
                          cancel.mutate(futureSeriesIds, { onSuccess: () => router.back() }),
                        style: 'destructive' as const,
                        text: t('Cette date et les {{count}} suivantes', {
                          count: futureSeriesIds.length - 1,
                        }),
                      },
                    ]
                  : []),
              ])
            }
            variant="danger"
          >
            {t('Annuler la session')}
          </DispoButton>
        ) : null}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  actionsRow: { flexDirection: 'row', gap: spacing.xs },
  applicant: { borderRadius: radii.button, borderWidth: 1, gap: spacing.xs, padding: spacing.sm },
  applicantTop: { alignItems: 'center', flexDirection: 'row', gap: spacing.xs },
  attendanceSummary: { gap: spacing.xxs },
  card: { gap: spacing.sm },
  choiceRow: { flexDirection: 'row', gap: spacing.xs },
  content: { gap: spacing.sm, padding: spacing.gutter, paddingBottom: spacing.xxl },
  dot: { borderRadius: 999, height: 7, width: 7 },
  editButton: {
    alignItems: 'center',
    alignSelf: 'flex-end',
    borderRadius: 999,
    flexDirection: 'row',
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  editText: { fontSize: 13, fontWeight: '800' },
  flex: { flex: 1 },
  guestList: { gap: spacing.xs },
  infoRow: { alignItems: 'flex-start', flexDirection: 'row', gap: spacing.xs },
  inviteButton: { borderRadius: 999, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs },
  inviteButtonText: { fontSize: 11, fontWeight: '800' },
  invitee: { alignItems: 'center', gap: spacing.xxs, width: 92 },
  inviteeName: { fontWeight: '700', maxWidth: 88 },
  inviteesRow: { flexDirection: 'row', gap: spacing.sm, paddingVertical: spacing.xxs },
  lineupBanner: {
    alignItems: 'center',
    borderRadius: radii.button,
    flexDirection: 'row',
    gap: spacing.xs,
    padding: spacing.sm,
  },
  memberRow: { alignItems: 'center', flexDirection: 'row', gap: spacing.xs },
  numberedSongRow: { alignItems: 'center', flexDirection: 'row', gap: spacing.xs },
  privateAddress: { borderRadius: radii.button, padding: spacing.sm },
  reorderButton: {
    alignItems: 'center',
    borderRadius: radii.chip,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.tight,
    minHeight: 44,
    paddingHorizontal: spacing.sm,
  },
  reorderLabel: { fontWeight: '800' },
  sectionTitleRow: { alignItems: 'center', flexDirection: 'row', gap: spacing.xs },
  setlistHeader: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm },
  songActions: { alignItems: 'center', flexDirection: 'row', gap: spacing.xs },
  songActionButton: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
    minWidth: 44,
  },
  songActionActive: { opacity: 0.72 },
  songIndex: { fontWeight: '800', textAlign: 'right', width: 22 },
  songRow: {
    alignItems: 'center',
    borderBottomWidth: 1,
    flexDirection: 'row',
    gap: spacing.control,
    paddingVertical: spacing.xs,
  },
  songStack: { gap: spacing.xs },
  sos: { borderRadius: radii.button, borderWidth: 1, gap: spacing.sm, padding: spacing.sm },
  strong: { fontWeight: '700' },
  summaryTitle: { alignItems: 'center', flexDirection: 'row', gap: spacing.xs },
  titleLine: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
});
