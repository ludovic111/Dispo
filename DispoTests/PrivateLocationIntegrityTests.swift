import XCTest
@testable import Dispo

final class PrivateLocationIntegrityTests: XCTestCase {
    func testFailedLoadAndEmptyDraftPreserveServerAddress() {
        XCTAssertEqual(
            ExactAddressMutation.editing(
                currentState: .unknown,
                currentAddress: nil,
                draft: "   ",
                clearRequested: false
            ),
            .preserve
        )
    }

    func testEmptyingKnownFieldDoesNotClearWithoutExplicitAction() {
        XCTAssertEqual(
            ExactAddressMutation.editing(
                currentState: .available,
                currentAddress: "Rue secrète 7",
                draft: "",
                clearRequested: false
            ),
            .preserve
        )
    }

    func testExplicitClearProducesDedicatedRPCFlag() {
        let mutation = ExactAddressMutation.editing(
            currentState: .available,
            currentAddress: "Rue secrète 7",
            draft: "",
            clearRequested: true
        )
        XCTAssertEqual(mutation, .clear)
        XCTAssertTrue(mutation.clearsExactAddress)
        XCTAssertNil(mutation.rpcExactAddress)
    }

    func testTypedAddressReplacesUnknownValueWithoutClearingFirst() {
        let mutation = ExactAddressMutation.editing(
            currentState: .unknown,
            currentAddress: nil,
            draft: "  Nouvelle rue 12  ",
            clearRequested: false
        )
        XCTAssertEqual(mutation, .replace("Nouvelle rue 12"))
        XCTAssertEqual(mutation.rpcExactAddress, "Nouvelle rue 12")
        XCTAssertFalse(mutation.clearsExactAddress)
    }

    func testSuccessfulRPCDistinguishesAbsentFromRestricted() {
        XCTAssertEqual(
            PrivateLocationState.serverValue(rowReturned: true, exactAddress: nil),
            .absent
        )
        XCTAssertEqual(
            PrivateLocationState.serverValue(rowReturned: false, exactAddress: nil),
            .restricted
        )
        XCTAssertEqual(
            PrivateLocationState.serverValue(rowReturned: true, exactAddress: "Rue 1"),
            .available
        )
    }

    func testLegacyCachedAddressResolvesWithoutClaimingNilIsAbsent() {
        let known = GroupEvent(
            kind: .concert,
            title: "Concert",
            venue: "Genève",
            exactAddress: "Rue 1",
            date: Date()
        )
        let unknown = GroupEvent(
            kind: .concert,
            title: "Concert",
            venue: "Genève",
            exactAddress: nil,
            date: Date()
        )
        XCTAssertEqual(known.resolvedPrivateLocationState, .available)
        XCTAssertEqual(unknown.resolvedPrivateLocationState, .unknown)
    }
}
