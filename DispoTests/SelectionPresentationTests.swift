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
}
