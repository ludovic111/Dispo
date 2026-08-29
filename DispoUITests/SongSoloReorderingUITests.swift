import XCTest

final class SongSoloReorderingUITests: XCTestCase {
    override func setUpWithError() throws {
        continueAfterFailure = false
    }

    func testDraggingFirstSoloHandleAfterThirdReordersVisibleRows() throws {
        let app = XCUIApplication()
        app.launchArguments += [
            "-screenshotRoute", "song-detail-solos",
            "-jamconnect.language", "fr",
            "-AppleLanguages", "(fr)",
            "-AppleLocale", "fr_FR"
        ]
        app.launch()

        XCTAssertTrue(
            app.navigationBars["Autumn Leaves"].waitForExistence(timeout: 8),
            "La route Debug doit ouvrir directement la fiche du morceau."
        )

        let raphael = app.staticTexts["Raphaël Herrera"].firstMatch
        let lea = app.staticTexts["Léa Zbinden"].firstMatch
        let marco = app.staticTexts["Marco Fernández"].firstMatch
        XCTAssertTrue(raphael.waitForExistence(timeout: 3))
        XCTAssertTrue(lea.waitForExistence(timeout: 3))
        XCTAssertTrue(marco.waitForExistence(timeout: 3))

        XCTAssertLessThan(raphael.frame.midY, lea.frame.midY)
        XCTAssertLessThan(lea.frame.midY, marco.frame.midY)

        let handles = app.buttons.matching(
            NSPredicate(format: "label == %@", "Déplacer le solo")
        )
        let firstHandle = handles.element(boundBy: 0)
        let thirdHandle = handles.element(boundBy: 2)
        XCTAssertTrue(firstHandle.waitForExistence(timeout: 3))
        XCTAssertTrue(thirdHandle.waitForExistence(timeout: 3))
        XCTAssertTrue(firstHandle.isHittable)
        XCTAssertTrue(thirdHandle.isHittable)

        // Les coordonnées sont figées dans la fenêtre avant le geste. Une
        // coordonnée attachée à `element(boundBy:)` peut changer de ligne au
        // milieu du réordonnancement et rendre le test aléatoire.
        let firstFrame = firstHandle.frame
        let thirdFrame = thirdHandle.frame
        let appOrigin = app.coordinate(withNormalizedOffset: CGVector(dx: 0, dy: 0))
        let start = appOrigin.withOffset(
            CGVector(dx: firstFrame.midX, dy: firstFrame.midY)
        )
        let destination = appOrigin.withOffset(
            CGVector(dx: thirdFrame.midX, dy: thirdFrame.midY + thirdFrame.height * 0.2)
        )
        start.press(
            forDuration: 0.6,
            thenDragTo: destination,
            withVelocity: .slow,
            thenHoldForDuration: 0.15
        )

        XCTAssertTrue(
            waitUntil(timeout: 4) {
                lea.frame.midY < marco.frame.midY && marco.frame.midY < raphael.frame.midY
            },
            "Le glisser réel doit faire passer Raphaël après Léa et Marco à l'écran."
        )
    }

    func testStationaryLongPressOnSongTileShowsActionsWithoutStartingReorder() throws {
        let app = XCUIApplication()
        app.launchArguments += [
            "-screenshotRoute", "group-repertoire-reorder",
            "-jamconnect.language", "fr",
            "-AppleLanguages", "(fr)",
            "-AppleLocale", "fr_FR"
        ]
        app.launch()

        XCTAssertTrue(
            app.navigationBars["🎸 Repertoire Drag QA"].waitForExistence(timeout: 8)
        )
        let blueBossa = app.staticTexts["Blue Bossa"].firstMatch
        let cantaloupe = app.staticTexts["Cantaloupe Island"].firstMatch
        XCTAssertTrue(blueBossa.waitForExistence(timeout: 3))
        XCTAssertTrue(cantaloupe.waitForExistence(timeout: 3))
        let initialBlueBossaY = blueBossa.frame.midY
        let initialCantaloupeY = cantaloupe.frame.midY

        blueBossa.press(forDuration: 1.2)

        XCTAssertTrue(
            app.buttons["Ouvrir la fiche du morceau"].waitForExistence(timeout: 3),
            "Un appui long immobile doit afficher les options du morceau."
        )
        XCTAssertEqual(blueBossa.frame.midY, initialBlueBossaY, accuracy: 1)
        XCTAssertEqual(cantaloupe.frame.midY, initialCantaloupeY, accuracy: 1)
    }

    func testLongPressingFirstSongTileAndDraggingAfterThirdReordersGroupRepertoire() throws {
        let app = XCUIApplication()
        app.launchArguments += [
            "-screenshotRoute", "group-repertoire-reorder",
            "-jamconnect.language", "fr",
            "-AppleLanguages", "(fr)",
            "-AppleLocale", "fr_FR"
        ]
        app.launch()

        XCTAssertTrue(
            app.navigationBars["🎸 Repertoire Drag QA"].waitForExistence(timeout: 8),
            "La route Debug doit ouvrir directement l'onglet Répertoire du groupe."
        )

        let blueBossa = app.staticTexts["Blue Bossa"].firstMatch
        let cantaloupe = app.staticTexts["Cantaloupe Island"].firstMatch
        let dolphin = app.staticTexts["Dolphin Dance"].firstMatch
        XCTAssertTrue(blueBossa.waitForExistence(timeout: 3))
        XCTAssertTrue(cantaloupe.waitForExistence(timeout: 3))
        XCTAssertTrue(dolphin.waitForExistence(timeout: 3))

        XCTAssertLessThan(blueBossa.frame.midY, cantaloupe.frame.midY)
        XCTAssertLessThan(cantaloupe.frame.midY, dolphin.frame.midY)

        // Il n'y a volontairement plus de poignée : le geste commence sur
        // le contenu de la tuile elle-même.
        XCTAssertTrue(blueBossa.isHittable)
        XCTAssertTrue(dolphin.isHittable)
        let firstFrame = blueBossa.frame
        let thirdFrame = dolphin.frame
        let appOrigin = app.coordinate(withNormalizedOffset: CGVector(dx: 0, dy: 0))
        let start = appOrigin.withOffset(
            CGVector(dx: firstFrame.midX, dy: firstFrame.midY)
        )
        let destination = appOrigin.withOffset(
            CGVector(dx: thirdFrame.midX, dy: thirdFrame.midY + thirdFrame.height * 0.2)
        )
        start.press(
            forDuration: 0.25,
            thenDragTo: destination,
            withVelocity: .slow,
            thenHoldForDuration: 0.15
        )

        XCTAssertTrue(
            waitUntil(timeout: 4) {
                cantaloupe.frame.midY < dolphin.frame.midY && dolphin.frame.midY < blueBossa.frame.midY
            },
            "Le glisser réel doit faire passer Blue Bossa après les deux autres morceaux du répertoire."
        )
    }

    func testCopyingSongToAnotherRepertoireShowsSuccessAndCreatesDuplicateState() throws {
        let app = XCUIApplication()
        app.launchArguments += [
            "-screenshotRoute", "song-detail-copy",
            "-jamconnect.language", "fr",
            "-AppleLanguages", "(fr)",
            "-AppleLocale", "fr_FR"
        ]
        app.launch()

        XCTAssertTrue(app.navigationBars["Autumn Leaves"].waitForExistence(timeout: 8))

        let copyButton = app.buttons["Copier vers un autre répertoire"].firstMatch
        XCTAssertTrue(copyButton.waitForExistence(timeout: 3))
        copyButton.tap()

        XCTAssertTrue(app.navigationBars["Copier le morceau"].waitForExistence(timeout: 3))
        let destination = app.buttons.matching(
            NSPredicate(format: "label CONTAINS %@", "Copy Destination QA")
        ).firstMatch
        XCTAssertTrue(destination.waitForExistence(timeout: 3))
        XCTAssertTrue(destination.isEnabled)
        destination.tap()

        let success = app.alerts["Morceau copié"]
        XCTAssertTrue(success.waitForExistence(timeout: 3))
        XCTAssertTrue(
            success.staticTexts["Autumn Leaves a été copié vers Copy Destination QA."].exists
        )
        success.buttons["OK"].tap()

        // Réouvrir le sélecteur relit le groupe destination : l'état
        // « déjà présent » prouve que la copie existe avec sa nouvelle identité.
        XCTAssertTrue(copyButton.waitForExistence(timeout: 3))
        copyButton.tap()
        XCTAssertTrue(app.navigationBars["Copier le morceau"].waitForExistence(timeout: 3))
        XCTAssertTrue(app.staticTexts["Déjà dans cette destination"].waitForExistence(timeout: 3))
        let duplicateDestination = app.buttons.matching(
            NSPredicate(format: "label CONTAINS %@", "Copy Destination QA")
        ).firstMatch
        XCTAssertTrue(duplicateDestination.exists)
        XCTAssertFalse(duplicateDestination.isEnabled)
    }

    private func waitUntil(timeout: TimeInterval, condition: () -> Bool) -> Bool {
        let deadline = Date().addingTimeInterval(timeout)
        while Date() < deadline {
            if condition() { return true }
            RunLoop.current.run(until: Date().addingTimeInterval(0.1))
        }
        return condition()
    }
}
