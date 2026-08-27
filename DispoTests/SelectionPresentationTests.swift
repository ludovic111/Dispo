import XCTest
@testable import Dispo

final class SelectionPresentationTests: XCTestCase {
    func testDiscoveryTaxonomyUsesOrInsideAGroupAndAndBetweenGroups() {
        var filters = DiscoveryFilters()
        filters.instruments = [.guitare, .basse]
        filters.genres = [.jazz, .rock]
        filters.levels = [.avance, .pro]

        XCTAssertTrue(filters.matchesTaxonomy(
            instruments: [.basse],
            genres: [.jazz],
            levelsByInstrument: [.basse: .avance],
            fallbackLevel: .avance
        ))
        XCTAssertFalse(filters.matchesTaxonomy(
            instruments: [.batterie],
            genres: [.jazz],
            levelsByInstrument: [.batterie: .avance],
            fallbackLevel: .avance
        ))
        XCTAssertFalse(filters.matchesTaxonomy(
            instruments: [.guitare],
            genres: [.classique],
            levelsByInstrument: [.guitare: .avance],
            fallbackLevel: .avance
        ))
        XCTAssertFalse(filters.matchesTaxonomy(
            instruments: [.guitare],
            genres: [.rock],
            levelsByInstrument: [.guitare: .debutant],
            fallbackLevel: .debutant
        ))
    }

    func testEventKindsHaveDistinctStableSymbols() {
        let symbols = GroupEventKind.allCases.map(\.symbol)

        XCTAssertEqual(Set(symbols).count, GroupEventKind.allCases.count)
        XCTAssertTrue(symbols.allSatisfy { !$0.isEmpty })
    }

    func testSongExposesCompactKeyLabel() {
        let song = Song(
            title: "Autumn Leaves",
            artist: "Joseph Kosma",
            suggestedBy: "Ludovic",
            isApproved: true,
            key: "Bb"
        )

        XCTAssertEqual(song.keyBadgeLabel, "B♭")
    }

    func testAllSelectableKeysRoundTripThroughSongStorage() {
        let labels = MusicalKey.allKeys.map(\.label)

        XCTAssertEqual(labels.count, 24)
        XCTAssertEqual(Set(labels).count, 24)
        XCTAssertTrue(labels.allSatisfy { MusicalKey($0)?.label == $0 })
    }

    func testMessageMediaUsesExplicitNotificationLabels() {
        let photo = MessageAttachment(
            remotePath: "photo",
            fileName: "IMG.jpg",
            contentType: "image/jpeg",
            byteCount: 42
        )
        let video = MessageAttachment(
            remotePath: "video",
            fileName: "clip.mp4",
            contentType: "video/mp4",
            byteCount: 84
        )

        XCTAssertEqual(photo.notificationLabel, "📷 Photo")
        XCTAssertEqual(video.notificationLabel, "🎥 Vidéo")
        XCTAssertEqual(video.iconName, "video.fill")
    }

    func testPushPreferencesApplyToEveryCategory() {
        var preferences = PushPreferences()

        for category in PushCategory.allCases {
            preferences.set(false, for: category)
            XCTAssertFalse(preferences.isEnabled(category))
            preferences.set(true, for: category)
            XCTAssertTrue(preferences.isEnabled(category))
        }
    }

    func testPressableMotionPolicyPreservesSignatureFeedback() {
        let state = PressableMotionPolicy.state(
            isPressed: true,
            reduceMotion: false,
            pressedScale: 0.97
        )

        XCTAssertEqual(state.scale, 0.97, accuracy: 0.0001)
        XCTAssertEqual(state.opacity, 0.94, accuracy: 0.0001)
        XCTAssertTrue(state.animatesTransition)
    }

    func testPressableMotionPolicyUsesInstantOpacityForReducedMotion() {
        let pressed = PressableMotionPolicy.state(
            isPressed: true,
            reduceMotion: true,
            pressedScale: 0.97
        )
        let released = PressableMotionPolicy.state(
            isPressed: false,
            reduceMotion: true,
            pressedScale: 0.97
        )

        XCTAssertEqual(pressed.scale, 1)
        XCTAssertEqual(pressed.opacity, 0.96, accuracy: 0.0001)
        XCTAssertFalse(pressed.animatesTransition)
        XCTAssertEqual(released, PressableMotionState(scale: 1, opacity: 1, animatesTransition: false))
    }

    func testSchoolMessageAvatarIsResolvedBySenderUUIDForHomonyms() {
        let firstID = UUID(uuidString: "11111111-1111-4111-8111-111111111111")!
        let secondID = UUID(uuidString: "22222222-2222-4222-8222-222222222222")!
        let members = [
            MusicSchoolMember(
                profileID: firstID,
                name: "Camille Martin",
                photoURL: "https://example.test/camille-a.jpg",
                instruments: [.piano],
                level: .intermediaire,
                role: .student,
                roleLabel: nil,
                verificationLevel: .selfDeclared,
                isPrimary: false,
                joinedAt: Date()
            ),
            MusicSchoolMember(
                profileID: secondID,
                name: "Camille Martin",
                photoURL: "https://example.test/camille-b.jpg",
                instruments: [.guitare],
                level: .avance,
                role: .teacher,
                roleLabel: nil,
                verificationLevel: .verified,
                isPrimary: true,
                joinedAt: Date()
            ),
        ]
        let row = SupabaseBackend.SchoolMessageRow(
            id: UUID(),
            channelId: UUID(),
            senderId: secondID,
            text: "Message du second Camille",
            createdAt: Date(),
            editedAt: nil,
            deletedAt: nil
        )

        let message = row.asMessage(members: members)

        XCTAssertEqual(message.senderID, secondID)
        XCTAssertEqual(message.senderName, "Camille Martin")
        XCTAssertEqual(message.senderPhotoURL, "https://example.test/camille-b.jpg")
    }
}
