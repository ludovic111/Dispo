import XCTest
@testable import Dispo

final class LocationUXTests: XCTestCase {
    func testCountryMappingAcceptsSupportedISOCodes() {
        XCTAssertEqual(Country(isoCode: "ch"), .switzerland)
        XCTAssertEqual(Country(isoCode: "FR"), .france)
        XCTAssertEqual(Country(isoCode: "JP"), .japan)
        XCTAssertEqual(Country(isoCode: "KR"), .southKorea)
        XCTAssertNil(Country(isoCode: "ZA"))
    }

    func testPlaceDraftBuildsOneConsistentLabel() {
        let place = PlaceDraft(country: .switzerland, postalCode: "1227", city: "Carouge")

        XCTAssertEqual(place.label, "1227 Carouge · CH")
        XCTAssertTrue(place.isComplete)
    }

    func testAvailabilityPlaceKeepsPostalCodeWithoutBreakingOldRows() throws {
        let place = AvailabilityPlace(
            from: Date(timeIntervalSince1970: 0),
            to: Date(timeIntervalSince1970: 86_400),
            country: .portugal,
            postalCode: "1200-109",
            city: "Lisbonne"
        )
        let data = try JSONEncoder().encode(place)
        let decoded = try JSONDecoder().decode(AvailabilityPlace.self, from: data)

        XCTAssertEqual(decoded.postalCode, "1200-109")
        XCTAssertEqual(decoded.label, "1200-109 Lisbonne · PT")

        let oldData = #"{"id":"00000000-0000-0000-0000-000000000001","from":0,"to":86400,"country":"PT","city":"Lisbonne"}"#.data(using: .utf8)!
        let oldDecoded = try JSONDecoder().decode(AvailabilityPlace.self, from: oldData)
        XCTAssertNil(oldDecoded.postalCode)
    }

    func testStructuredVenueRoundTripsThroughLegacyTextColumn() {
        let original = VenueDraft(
            name: "Le Chat Noir",
            place: PlaceDraft(country: .switzerland, postalCode: "1227", city: "Carouge")
        )
        let decoded = VenueDraft(storageLabel: original.label, fallbackCountry: .france)

        XCTAssertEqual(original.label, "Le Chat Noir · 1227 Carouge · CH")
        XCTAssertEqual(decoded, original)
    }
}
