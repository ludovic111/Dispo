package com.ludovicmarie.dispo.data

import java.nio.file.Files
import java.nio.file.Path
import java.time.Duration
import java.time.Instant
import java.time.ZoneId
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

class MatchingEngineTest {
    private val now = Instant.parse("2026-08-24T10:00:00Z")
    private val zone = ZoneId.of("Europe/Zurich")
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
            now,
            zone,
        )
    }

    @Test
    fun `playing a wanted instrument is mandatory and unavailable profiles are excluded`() {
        val pianoGig = data.events.first().copy(
            date = now.plus(Duration.ofHours(2)),
            genre = Genre.JAZZ,
        )
        val matches = SOSMatchingEngine.matches(pianoGig, data.musicians, now, zone)

        assertEquals(listOf("Ingrid Johansson"), matches.map { it.musician.name })
        assertEquals(listOf(Instrument.PIANO), matches.single().matchedInstruments)
        assertTrue(matches.single().dateConfirmed)
        assertTrue(matches.single().exactGenre)
        assertFalse(matches.any { it.musician.name in setOf("Nadia Benali", "Antoine Vullioud") })
    }

    @Test
    fun `confirmed date sorts before a higher level unconfirmed musician`() {
        val drumGig = data.events[1]
        val matches = SOSMatchingEngine.matches(drumGig, data.musicians, now, zone)

        assertEquals(listOf("Hugo Steiner", "David Rochat"), matches.map { it.musician.name })
        assertTrue(matches.first().dateConfirmed)
        assertFalse(matches.last().dateConfirmed)
    }

    @Test
    fun `on request musician remains contactable but date is not confirmed`() {
        val violinGig = data.events[3]
        val anna = data.musicians.single { it.name == "Anna Kowalska" }
        val match = SOSMatchingEngine.score(violinGig, anna, now, zone)

        assertNotNull(match)
        assertFalse(match!!.dateConfirmed)
    }

    @Test
    fun `score exposes an exact additive breakdown`() {
        val gig = data.events[1]
        val hugo = data.musicians.single { it.name == "Hugo Steiner" }
        val score = SOSMatchingEngine.score(gig, hugo, now, zone)!!.score

        assertEquals(
            score.instrumentPoints + score.datePoints + score.genrePoints +
                score.availabilityPoints + score.levelPoints + score.reputationPoints,
            score.total,
        )
    }

    @Test
    fun `unavailable candidate cannot be matched even on the right instrument`() {
        val pianoGig = data.events.first()
        val nadia = data.musicians.single { it.name == "Nadia Benali" }

        assertNull(SOSMatchingEngine.score(pianoGig, nadia, now, zone))
    }
}
