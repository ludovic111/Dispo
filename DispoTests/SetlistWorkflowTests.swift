import XCTest
import SwiftUI
@testable import Dispo

final class SetlistWorkflowTests: XCTestCase {
    func testOldSongWithoutSolosStillDecodesAsEmptyOrder() throws {
        let data = #"""
        {
          "id":"00000000-0000-0000-0000-000000000001",
          "title":"Afro Blue",
          "artist":"Mongo Santamaría",
          "suggestedBy":"Raphaël",
          "isApproved":true
        }
        """#.data(using: .utf8)!

        let song = try JSONDecoder().decode(Song.self, from: data)

        XCTAssertNil(song.solos)
        XCTAssertEqual(song.soloProfileIDs, [])
    }

    func testSoloUUIDOrderRoundTripsWithoutPersistingNames() throws {
        let first = UUID(uuidString: "10000000-0000-0000-0000-000000000001")!
        let second = UUID(uuidString: "10000000-0000-0000-0000-000000000002")!
        let song = Song(
            title: "Afro Blue",
            artist: "Mongo Santamaría",
            suggestedBy: "Raphaël",
            isApproved: true,
            solos: [first, second]
        )

        let data = try JSONEncoder().encode(song)
        let decoded = try JSONDecoder().decode(Song.self, from: data)

        XCTAssertEqual(decoded.soloProfileIDs, [first, second])
        XCTAssertFalse(String(decoding: data, as: UTF8.self).contains("Raphaël Herrera"))
    }

    func testBackendSoloPayloadUsesLowercaseAndDecodesMixedCase() throws {
        let first = UUID(uuidString: "12000000-0000-0000-0000-0000000000AB")!
        let second = UUID(uuidString: "12000000-0000-0000-0000-0000000000CD")!
        let song = Song(
            title: "Afro Blue",
            artist: "Mongo Santamaría",
            suggestedBy: "Raphaël",
            isApproved: true,
            solos: [first, second]
        )

        let encoded = try JSONEncoder().encode(SupabaseBackend.SongPayload(from: song))
        let json = String(decoding: encoded, as: UTF8.self)
        XCTAssertTrue(json.contains("12000000-0000-0000-0000-0000000000ab"))
        XCTAssertFalse(json.contains("12000000-0000-0000-0000-0000000000AB"))

        let mixedCase = json.replacingOccurrences(
            of: "12000000-0000-0000-0000-0000000000cd",
            with: "12000000-0000-0000-0000-0000000000CD"
        ).data(using: .utf8)!
        let decoded = try JSONDecoder().decode(SupabaseBackend.SongPayload.self, from: mixedCase)
        XCTAssertEqual(decoded.asSong.soloProfileIDs, [first, second])
    }

    func testLiveRosterKeepsDistinctUUIDsForHomonyms() throws {
        let first = SoloistOption(
            id: UUID(uuidString: "11000000-0000-0000-0000-000000000001")!,
            name: "Alex Martin"
        )
        let second = SoloistOption(
            id: UUID(uuidString: "11000000-0000-0000-0000-000000000002")!,
            name: "Alex Martin"
        )
        let group = GroupChat(
            name: "Blue Notes",
            memberNames: [first.name, second.name],
            rosterProfiles: [first, second]
        )

        let data = try JSONEncoder().encode(group)
        let decoded = try JSONDecoder().decode(GroupChat.self, from: data)

        XCTAssertEqual(decoded.rosterProfiles?.map(\.id), [first.id, second.id])
        XCTAssertEqual(decoded.rosterProfiles?.map(\.name), ["Alex Martin", "Alex Martin"])
    }

    func testSuggestionAuthorResolvesUUIDAndKeepsLegacyName() {
        let profileID = UUID(uuidString: "13000000-0000-0000-0000-0000000000AB")!
        let candidates = [SoloistOption(id: profileID, name: "Raphaël Herrera")]

        XCTAssertEqual(
            AppStore.resolvedSuggesterName(
                storedValue: profileID.uuidString.lowercased(),
                candidates: candidates,
                unknownUUIDFallback: "Membre retiré"
            ),
            "Raphaël Herrera"
        )
        XCTAssertEqual(
            AppStore.resolvedSuggesterName(
                storedValue: "Raphaël",
                candidates: candidates,
                unknownUUIDFallback: "Membre retiré"
            ),
            "Raphaël"
        )
        XCTAssertEqual(
            AppStore.resolvedSuggesterName(
                storedValue: "13000000-0000-0000-0000-0000000000CD",
                candidates: candidates,
                unknownUUIDFallback: "Membre retiré"
            ),
            "Membre retiré"
        )
        XCTAssertEqual(
            AppStore.suggestionAuthorStorageValue(
                userID: profileID,
                legacyProfileName: "Raphaël"
            ),
            "13000000-0000-0000-0000-0000000000ab"
        )
        XCTAssertEqual(
            AppStore.suggestionAuthorStorageValue(
                userID: nil,
                legacyProfileName: "Raphaël"
            ),
            "Raphaël"
        )
    }

    func testCopiedSongGetsIndependentIdentityAndKeepsMusicalMetadata() {
        let soloist = UUID(uuidString: "14000000-0000-0000-0000-000000000001")!
        var source = song(
            id: "14000000-0000-0000-0000-000000000002",
            title: "Autumn Leaves"
        )
        source.artist = "Bill Evans"
        source.artworkURL = "https://example.com/cover.jpg"
        source.trackURL = "https://example.com/track"
        source.platformLinks = ["spotify": "https://example.com/spotify"]
        source.catalogID = "apple:123456"
        source.albumTitle = "Portrait in Jazz"
        source.durationMilliseconds = 325_000
        source.releaseYear = 1959
        source.genre = "Jazz"
        source.previewURL = "https://example.com/preview.m4a"
        source.key = "Bb"
        source.tempoBPM = 128
        source.form = "AABB"
        source.chords = "Cm7 | F7 | Bbmaj7"
        source.irealURL = "irealb://Autumn%20Leaves"
        source.irealDisabled = true
        source.solos = [soloist]

        let copy = AppStore.copiedSong(
            from: source,
            suggestedBy: "14000000-0000-0000-0000-000000000003",
            isApproved: false
        )

        XCTAssertNotEqual(copy.id, source.id)
        XCTAssertEqual(copy.title, source.title)
        XCTAssertEqual(copy.artist, source.artist)
        XCTAssertEqual(copy.artworkURL, source.artworkURL)
        XCTAssertEqual(copy.trackURL, source.trackURL)
        XCTAssertEqual(copy.platformLinks, source.platformLinks)
        XCTAssertEqual(copy.catalogID, source.catalogID)
        XCTAssertEqual(copy.albumTitle, source.albumTitle)
        XCTAssertEqual(copy.durationMilliseconds, source.durationMilliseconds)
        XCTAssertEqual(copy.releaseYear, source.releaseYear)
        XCTAssertEqual(copy.genre, source.genre)
        XCTAssertEqual(copy.previewURL, source.previewURL)
        XCTAssertEqual(copy.key, source.key)
        XCTAssertEqual(copy.tempoBPM, source.tempoBPM)
        XCTAssertEqual(copy.form, source.form)
        XCTAssertEqual(copy.chords, source.chords)
        XCTAssertEqual(copy.irealURL, source.irealURL)
        XCTAssertEqual(copy.irealDisabled, source.irealDisabled)
        XCTAssertEqual(copy.suggestedBy, "14000000-0000-0000-0000-000000000003")
        XCTAssertFalse(copy.isApproved)
        XCTAssertTrue(copy.soloProfileIDs.isEmpty)
    }

    func testCatalogIdentityRejectsDifferentTextForTheSameRecording() {
        var source = song(
            id: "15000000-0000-0000-0000-000000000010",
            title: "Song for My Father"
        )
        source.artist = "Horace Silver"
        source.catalogID = "apple:42"
        var localizedTitle = song(
            id: "15000000-0000-0000-0000-000000000011",
            title: "Song for My Father (Remastered)"
        )
        localizedTitle.artist = "The Horace Silver Quintet"
        localizedTitle.catalogID = "APPLE:42"

        XCTAssertTrue(AppStore.containsEquivalentSong(to: source, in: [localizedTitle]))
    }

    func testCopiedSongDuplicateIdentityIgnoresCaseAccentsAndExtraSpaces() {
        var canonical = song(
            id: "15000000-0000-0000-0000-000000000001",
            title: "Été   indien"
        )
        canonical.artist = "Joe Dassin"
        var variant = canonical
        variant.title = "  ete indien  "
        variant.artist = "JOE DASSIN"

        XCTAssertEqual(
            AppStore.normalizedSongIdentity(canonical),
            AppStore.normalizedSongIdentity(variant)
        )
    }

    func testFreshServerSnapshotRejectsConcurrentEquivalentCopy() {
        var source = song(
            id: "16000000-0000-0000-0000-000000000001",
            title: "Été   indien"
        )
        source.artist = "Joe Dassin"
        var concurrentCopy = song(
            id: "16000000-0000-0000-0000-000000000002",
            title: "  ete indien  "
        )
        concurrentCopy.artist = "JOE DASSIN"
        var differentRecording = concurrentCopy
        differentRecording.artist = "Nancy Sinatra"
        let attemptedCopy = AppStore.copiedSong(
            from: source,
            suggestedBy: "16000000-0000-0000-0000-000000000004",
            isApproved: true
        )
        let duplicateIdentity = AppStore.normalizedSongIdentity(source)

        XCTAssertThrowsError(
            try AppStore.applyingRepertoireMutation(
                .add(attemptedCopy),
                to: [concurrentCopy],
                rejectingDuplicateIdentity: duplicateIdentity
            ),
            "Le snapshot serveur frais doit bloquer la copie ajoutée par un autre appareil."
        )
        XCTAssertNoThrow(
            try AppStore.applyingRepertoireMutation(
                .add(attemptedCopy),
                to: [differentRecording],
                rejectingDuplicateIdentity: duplicateIdentity
            )
        )
    }

    func testSongMutationCompletionGateReportsStaleSuccessAsFailureExactlyOnce() {
        var gate = AppStore.SongMutationCompletionGate()
        var callbacks: [Bool] = []

        if let outcome = gate.resolve(
            .succeeded,
            taskCancelled: false,
            sessionMatches: false
        ) {
            callbacks.append(outcome == .succeeded)
        }
        if let outcome = gate.resolve(
            .succeeded,
            taskCancelled: false,
            sessionMatches: true
        ) {
            callbacks.append(outcome == .succeeded)
        }

        XCTAssertEqual(callbacks, [false])
    }

    func testSongMutationCompletionGateReportsCancelledSuccessAsFailureExactlyOnce() {
        var gate = AppStore.SongMutationCompletionGate()
        var callbacks: [Bool] = []

        if let outcome = gate.resolve(
            .succeeded,
            taskCancelled: true,
            sessionMatches: true
        ) {
            callbacks.append(outcome == .succeeded)
        }
        if let outcome = gate.resolve(
            .failed,
            taskCancelled: false,
            sessionMatches: true
        ) {
            callbacks.append(outcome == .succeeded)
        }

        XCTAssertEqual(callbacks, [false])
    }

    func testApprovedSongReorderPreservesPendingSuggestionSlot() {
        let first = song(id: "20000000-0000-0000-0000-000000000001", title: "A")
        let pending = song(id: "20000000-0000-0000-0000-000000000002", title: "Suggestion", approved: false)
        let second = song(id: "20000000-0000-0000-0000-000000000003", title: "B")
        let third = song(id: "20000000-0000-0000-0000-000000000004", title: "C")

        let reordered = AppStore.applyingApprovedSongOrder(
            [third.id, first.id, second.id],
            to: [first, pending, second, third]
        )

        XCTAssertEqual(reordered.map(\.id), [third.id, pending.id, first.id, second.id])
        XCTAssertFalse(reordered[1].isApproved)
    }

    func testDirectDragMovesInBothDirectionsAndKeepsEveryID() {
        let first = UUID(uuidString: "20500000-0000-0000-0000-000000000001")!
        let second = UUID(uuidString: "20500000-0000-0000-0000-000000000002")!
        let third = UUID(uuidString: "20500000-0000-0000-0000-000000000003")!

        let movedDown = OrderedUUIDDragHandle<EmptyView>.moving(
            first,
            beforeOrAt: third,
            in: [first, second, third]
        )
        XCTAssertEqual(movedDown, [second, third, first])

        let movedUp = OrderedUUIDDragHandle<EmptyView>.moving(
            third,
            beforeOrAt: first,
            in: [first, second, third]
        )
        XCTAssertEqual(movedUp, [third, first, second])
        XCTAssertEqual(Set(movedDown), Set([first, second, third]))
    }

    func testFreshSongMutationPreservesRemoteOrderApprovalAndSolos() {
        let soloist = UUID(uuidString: "21000000-0000-0000-0000-000000000010")!
        var remoteFirst = song(
            id: "21000000-0000-0000-0000-000000000001",
            title: "Ancien titre"
        )
        remoteFirst.solos = [soloist]
        remoteFirst.isApproved = true
        let remoteSecond = song(
            id: "21000000-0000-0000-0000-000000000002",
            title: "Deuxième"
        )

        // Cette copie locale est volontairement périmée sur les champs que
        // l'edit n'a pas le droit de toucher.
        var edited = remoteFirst
        edited.title = "Nouveau titre"
        edited.artist = "Nouvel artiste"
        edited.key = "Bb"
        edited.isApproved = false
        edited.solos = nil

        let merged = AppStore.applyingSongMutation(
            .update(edited, fields: [.title, .artist, .key]),
            to: [remoteSecond, remoteFirst]
        )

        XCTAssertEqual(merged.map(\.id), [remoteSecond.id, remoteFirst.id])
        XCTAssertEqual(merged[1].title, "Nouveau titre")
        XCTAssertEqual(merged[1].artist, "Nouvel artiste")
        XCTAssertEqual(merged[1].key, "Bb")
        XCTAssertTrue(merged[1].isApproved)
        XCTAssertEqual(merged[1].soloProfileIDs, [soloist])
    }

    func testStaleEditDraftOnlyMutatesFieldsChangedFromItsBaseline() {
        var baseline = song(
            id: "21500000-0000-0000-0000-000000000001",
            title: "Titre initial"
        )
        baseline.key = "C"
        baseline.chords = "Cmaj7 | Dm7"
        baseline.irealURL = "irealb://ancien"

        var draft = baseline
        draft.title = "Titre modifié"
        let fields = AppStore.changedSongFields(
            from: baseline,
            to: draft,
            candidates: [.title, .artist, .key, .chords, .irealURL, .irealDisabled]
        )
        XCTAssertEqual(fields, [.title])

        var remote = baseline
        remote.artist = "Artiste modifié à distance"
        remote.key = "D"
        remote.chords = "Dmaj7 | Em7"
        remote.irealURL = "irealb://distant"
        let merged = AppStore.applyingSongMutation(
            .update(draft, fields: fields),
            to: [remote]
        )[0]

        XCTAssertEqual(merged.title, "Titre modifié")
        XCTAssertEqual(merged.artist, "Artiste modifié à distance")
        XCTAssertEqual(merged.key, "D")
        XCTAssertEqual(merged.chords, "Dmaj7 | Em7")
        XCTAssertEqual(merged.irealURL, "irealb://distant")
    }

    func testFreshSongMutationDoesNotResurrectRemoteDeletion() {
        let deleted = song(
            id: "22000000-0000-0000-0000-000000000001",
            title: "Supprimé ailleurs"
        )
        let survivor = song(
            id: "22000000-0000-0000-0000-000000000002",
            title: "Toujours là"
        )
        var staleEdit = deleted
        staleEdit.title = "Edit local"

        let merged = AppStore.applyingSongMutation(
            .update(staleEdit, fields: [.title]),
            to: [survivor]
        )

        XCTAssertEqual(merged, [survivor])
    }

    func testApprovalMutationChangesOnlyApprovalOnFreshSong() {
        let soloist = UUID(uuidString: "23000000-0000-0000-0000-000000000010")!
        var remote = song(
            id: "23000000-0000-0000-0000-000000000001",
            title: "Suggestion",
            approved: false
        )
        remote.solos = [soloist]
        var approved = remote
        approved.isApproved = true
        approved.solos = nil

        let merged = AppStore.applyingSongMutation(
            .update(approved, fields: [.isApproved]),
            to: [remote]
        )

        XCTAssertTrue(merged[0].isApproved)
        XCTAssertEqual(merged[0].soloProfileIDs, [soloist])
    }

    func testAgendaFeatureRemovalUsesExactIdentityNotDate() {
        let date = Date(timeIntervalSince1970: 1_787_897_700)
        let featuredEvent = GroupEvent(
            id: UUID(uuidString: "30000000-0000-0000-0000-000000000001")!,
            kind: .repetition,
            title: "Répète",
            venue: "Anières",
            date: date
        )
        let otherRealEvent = GroupEvent(
            id: UUID(uuidString: "30000000-0000-0000-0000-000000000002")!,
            kind: .repetition,
            title: "Répète du soir",
            venue: "Anières",
            date: date
        )
        let groupID = UUID(uuidString: "30000000-0000-0000-0000-000000000010")!
        let featured = AgendaItem(
            source: .group(groupID: groupID, name: "Jam by the lake", emoji: "🎶", event: featuredEvent),
            date: date
        )
        let other = AgendaItem(
            source: .group(groupID: groupID, name: "Jam by the lake", emoji: "🎶", event: otherRealEvent),
            date: date
        )

        let listed = AgendaItem.listItems(from: [featured, other], excludingFeatured: featured)

        XCTAssertEqual(listed.map(\.id), [other.id])
    }

    func testAgendaTimelineExcludesConfirmationAndFeaturedCards() {
        let date = Date(timeIntervalSince1970: 1_787_897_700)
        let groupID = UUID(uuidString: "30000000-0000-0000-0000-000000000010")!
        func item(_ id: String, title: String) -> AgendaItem {
            let event = GroupEvent(
                id: UUID(uuidString: id)!,
                kind: .repetition,
                title: title,
                venue: "Anières",
                date: date
            )
            return AgendaItem(
                source: .group(
                    groupID: groupID,
                    name: "Jam by the lake",
                    emoji: "🎶",
                    event: event
                ),
                date: date
            )
        }
        let confirmation = item(
            "32000000-0000-0000-0000-000000000001",
            title: "Réponse attendue"
        )
        let featured = item(
            "32000000-0000-0000-0000-000000000002",
            title: "Prochaine date"
        )
        let timeline = item(
            "32000000-0000-0000-0000-000000000003",
            title: "Date suivante"
        )

        let listed = AgendaItem.listItems(
            from: [confirmation, featured, timeline],
            excludingFeatured: featured,
            excludingIDs: [confirmation.id]
        )

        XCTAssertEqual(listed.map(\.id), [timeline.id])
    }

    func testAgendaHidesLinkedGigOnlyWhenGroupEventIsVisible() {
        let visibleEventID = UUID(uuidString: "31000000-0000-0000-0000-000000000001")!
        let anotherEventID = UUID(uuidString: "31000000-0000-0000-0000-000000000002")!
        let visible = Set([visibleEventID])

        XCTAssertFalse(
            AgendaItem.shouldIncludeGig(
                linkedEventID: visibleEventID,
                visibleGroupEventIDs: visible
            )
        )
        XCTAssertTrue(
            AgendaItem.shouldIncludeGig(
                linkedEventID: anotherEventID,
                visibleGroupEventIDs: visible
            ),
            "Le SOS reste dans l'agenda d'un non-membre qui ne voit pas l'événement lié."
        )
        XCTAssertTrue(
            AgendaItem.shouldIncludeGig(
                linkedEventID: nil,
                visibleGroupEventIDs: visible
            )
        )
    }

    func testIncomingRequestsExcludeOnlySOSLinkedToVisibleGroupEvent() {
        let visibleEventID = UUID(uuidString: "33000000-0000-0000-0000-000000000001")!
        let hiddenEventID = UUID(uuidString: "33000000-0000-0000-0000-000000000002")!
        let linkedVisible = request(
            id: "33000000-0000-0000-0000-000000000011",
            eventID: visibleEventID
        )
        let linkedHidden = request(
            id: "33000000-0000-0000-0000-000000000012",
            eventID: hiddenEventID
        )
        let standalone = request(
            id: "33000000-0000-0000-0000-000000000013",
            eventID: nil
        )

        let filtered = AppStore.filteredIncomingRequests(
            [linkedVisible, linkedHidden, standalone],
            visibleGroupEventIDs: [visibleEventID]
        )

        XCTAssertEqual(Set(filtered.map(\.id)), Set([linkedHidden.id, standalone.id]))
        XCTAssertFalse(filtered.contains(where: { $0.id == linkedVisible.id }))
    }

    func testGroupSnapshotGuardRejectsPendingAndStaleMultiGroupSnapshots() {
        let userID = UUID(uuidString: "34000000-0000-0000-0000-000000000001")!
        XCTAssertFalse(
            AppStore.canApplyGroupSnapshot(
                snapshotUserID: userID,
                currentUserID: userID,
                snapshotSessionGeneration: 3,
                currentSessionGeneration: 3,
                snapshotRevision: 7,
                currentRevision: 7,
                hasPendingMutations: true,
                snapshotRequestGeneration: 4,
                currentRequestGeneration: 4
            ),
            "Le snapshot du groupe A ne doit pas écraser la mutation optimiste du groupe B."
        )
        XCTAssertFalse(
            AppStore.canApplyGroupSnapshot(
                snapshotUserID: userID,
                currentUserID: userID,
                snapshotSessionGeneration: 3,
                currentSessionGeneration: 3,
                snapshotRevision: 7,
                currentRevision: 8,
                hasPendingMutations: false,
                snapshotRequestGeneration: 4,
                currentRequestGeneration: 4
            ),
            "Un snapshot commencé avant une mutation d'un autre groupe est caduc."
        )
        XCTAssertTrue(
            AppStore.canApplyGroupSnapshot(
                snapshotUserID: userID,
                currentUserID: userID,
                snapshotSessionGeneration: 3,
                currentSessionGeneration: 3,
                snapshotRevision: 8,
                currentRevision: 8,
                hasPendingMutations: false,
                snapshotRequestGeneration: 4,
                currentRequestGeneration: 4
            )
        )
    }

    func testGroupSnapshotGuardRejectsPreviousAccountAndReloginSession() {
        let firstUserID = UUID(uuidString: "34000000-0000-0000-0000-000000000001")!
        let secondUserID = UUID(uuidString: "34000000-0000-0000-0000-000000000002")!

        XCTAssertFalse(
            AppStore.canApplyGroupSnapshot(
                snapshotUserID: firstUserID,
                currentUserID: secondUserID,
                snapshotSessionGeneration: 3,
                currentSessionGeneration: 4,
                snapshotRevision: 8,
                currentRevision: 8,
                hasPendingMutations: false,
                snapshotRequestGeneration: 4,
                currentRequestGeneration: 4
            )
        )
        XCTAssertFalse(
            AppStore.canApplyGroupSnapshot(
                snapshotUserID: firstUserID,
                currentUserID: firstUserID,
                snapshotSessionGeneration: 3,
                currentSessionGeneration: 4,
                snapshotRevision: 8,
                currentRevision: 8,
                hasPendingMutations: false,
                snapshotRequestGeneration: 4,
                currentRequestGeneration: 4
            ),
            "Une reconnexion du même compte doit invalider les anciens fetches."
        )
    }

    func testGroupSnapshotGuardRejectsOutOfOrderRequestCompletion() {
        let userID = UUID(uuidString: "35000000-0000-0000-0000-000000000001")!

        XCTAssertFalse(
            AppStore.canApplyGroupSnapshot(
                snapshotUserID: userID,
                currentUserID: userID,
                snapshotSessionGeneration: 5,
                currentSessionGeneration: 5,
                snapshotRevision: 12,
                currentRevision: 12,
                hasPendingMutations: false,
                snapshotRequestGeneration: 20,
                currentRequestGeneration: 21
            ),
            "R1 ne doit pas réécraser R2 quand les requêtes finissent dans l'ordre inverse."
        )
        XCTAssertTrue(
            AppStore.canApplyGroupSnapshot(
                snapshotUserID: userID,
                currentUserID: userID,
                snapshotSessionGeneration: 5,
                currentSessionGeneration: 5,
                snapshotRevision: 12,
                currentRevision: 12,
                hasPendingMutations: false,
                snapshotRequestGeneration: 21,
                currentRequestGeneration: 21
            )
        )
    }

    private func song(id: String, title: String, approved: Bool = true) -> Song {
        Song(
            id: UUID(uuidString: id)!,
            title: title,
            artist: "Artiste",
            suggestedBy: "Raphaël",
            isApproved: approved
        )
    }

    private func request(id: String, eventID: UUID?) -> GigRequest {
        GigRequest(
            id: UUID(uuidString: id)!,
            title: "Dépannage",
            hostName: "Raphaël",
            hostId: UUID(uuidString: "33000000-0000-0000-0000-000000000020")!,
            date: Date(timeIntervalSince1970: 1_787_897_700),
            place: "Anières",
            neighborhood: "Anières",
            genre: .jazz,
            wantedInstruments: [.piano],
            wantedLevels: nil,
            filledInstruments: nil,
            fee: nil,
            paymentMethod: nil,
            descriptionText: "",
            applied: false,
            myApplicationInstrument: nil,
            myApplicationStatus: nil,
            isMine: false,
            postedAt: nil,
            groupId: UUID(uuidString: "33000000-0000-0000-0000-000000000021")!,
            eventId: eventID,
            targetId: UUID(uuidString: "33000000-0000-0000-0000-000000000022")!,
            targetStatus: .pending
        )
    }
}
