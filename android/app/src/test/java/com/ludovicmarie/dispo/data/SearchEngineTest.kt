package com.ludovicmarie.dispo.data

import java.nio.file.Files
import java.nio.file.Path
import java.time.Instant
import java.time.ZoneId
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

class SearchEngineTest {
    private lateinit var data: DemoData

    @Before
    fun loadSeed() {
        val asset = listOf(
            Path.of("src/main/assets/seed_data.json"),
            Path.of("app/src/main/assets/seed_data.json"),
            Path.of("android/app/src/main/assets/seed_data.json"),
        ).first(Files::exists)
        data = SeedDataParser().parse(
            Files.newBufferedReader(asset).use { it.readText() },
            Instant.parse("2026-08-24T10:00:00Z"),
            ZoneId.of("Europe/Zurich"),
        )
    }

    @Test
    fun `instrument job aliases and stop words find a musician`() {
        val results = DispoSearchEngine.search("je cherche un pianiste à Champel", data)

        assertEquals(listOf("Ingrid Johansson"), results.musicians.map { it.name })
    }

    @Test
    fun `search ignores accents in names`() {
        val results = DispoSearchEngine.search("gutierrez", data)

        assertEquals("Pablo Gutiérrez", results.musicians.single().name)
    }

    @Test
    fun `handle search accepts at sign and dots`() {
        val results = DispoSearchEngine.search("@marco.fernandez", data)

        assertEquals("Marco Fernández", results.musicians.single().name)
    }

    @Test
    fun `long tokens tolerate two typos`() {
        val results = DispoSearchEngine.search("saxofone", data)

        assertTrue(results.musicians.any { it.name == "Stefan Meier" })
    }

    @Test
    fun `query falls back to partial matches when no item matches every token`() {
        val results = DispoSearchEngine.search("batteur carouge", data)

        assertTrue(results.musicians.any { it.name == "David Rochat" })
        assertTrue(results.musicians.any { it.name == "Marco Fernández" })
    }

    @Test
    fun `search includes SOS gigs`() {
        val results = DispoSearchEngine.search("violon Fusterie", data)

        assertEquals("Second violon — concert caritatif", results.gigs.single().title)
    }
}
