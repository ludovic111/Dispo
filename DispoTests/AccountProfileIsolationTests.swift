import XCTest
@testable import Dispo

final class AccountProfileIsolationTests: XCTestCase {
    func testEmptyNewAccountRequiresItsOwnProfile() {
        XCTAssertTrue(
            LiveProfileSetupPolicy.requiresSetup(
                name: "",
                instrumentCount: 0,
                city: nil,
                postalCode: nil
            )
        )
    }

    func testDemoIdentityCannotCompleteAnotherAccountsOnboarding() {
        XCTAssertFalse(
            LiveProfileSetupPolicy.canComplete(
                name: "Ludovic",
                instrumentCount: 1,
                city: nil,
                postalCode: nil
            )
        )
    }

    func testCompleteUserOwnedProfileCanEnterTheApp() {
        XCTAssertTrue(
            LiveProfileSetupPolicy.canComplete(
                name: "Nina Keller",
                instrumentCount: 2,
                city: "Genève",
                postalCode: "1201"
            )
        )
    }
}
