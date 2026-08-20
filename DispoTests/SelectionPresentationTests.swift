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
}
