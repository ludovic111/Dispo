package com.ludovicmarie.dispo.data

import java.nio.file.Files
import java.nio.file.Path
import java.time.Duration
import java.time.Instant
import java.time.ZoneId
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class SeedDataParserTest {
    private val parser = SeedDataParser()
    private val now = Instant.parse("2026-08-24T10:00:00Z")
    private val zone = ZoneId.of("Europe/Zurich")

    @Test
    fun `production seed decodes with the same cardinalities as iOS`() {
        val data = parseProductionSeed()

        assertEquals(20, data.musicians.size)
        assertEquals(6, data.bands.size)
        assertEquals(5, data.events.size)
        assertEquals(2, data.conversations.size)
        assertEquals(4, data.conversations.sumOf { it.messages.size })

        val marco = data.musicians.first()
        assertEquals("Marco Fernández", marco.name)
        assertEquals(listOf(Instrument.PERCUSSION), marco.instruments)
        assertEquals(listOf(Genre.LATIN_WORLD, Genre.JAZZ), marco.genres)
        assertEquals(Availability.TONIGHT, marco.availability)
        assertEquals("pfp_marco", marco.photo)
        assertEquals("@marco.fernandez", marco.handle)

        val firstGig = data.events.first()
        assertEquals("Cherche pianiste — soirée salsa", firstGig.title)
        assertEquals(listOf(Instrument.PIANO), firstGig.wantedInstruments)
        assertEquals(150, firstGig.fee)
        assertEquals("CHF 150", firstGig.feeLabel)
    }

    @Test
    fun `event dates move to the future and the first gig shows premium early access`() {
        val data = parseProductionSeed()
        val projectionBase = now.atZone(zone).plusHours(4)

        data.events.forEachIndexed { index, gig ->
            assertEquals(
                projectionBase.plusDays((index + 1).toLong()).toInstant(),
                gig.date,
            )
            assertTrue(gig.date.isAfter(now))
        }

        val teaser = data.events.first()
        assertEquals(now.minus(Duration.ofMinutes(7)), teaser.postedAt)
        assertTrue(teaser.isEarlyAccess(now))
        assertFalse(teaser.isEarlyAccess(now.plus(Duration.ofMinutes(24))))
        assertTrue(data.events.drop(1).none { it.postedAt != null })
    }

    @Test
    fun `generated identifiers are stable and distinct`() {
        val first = parseProductionSeed()
        val second = parseProductionSeed()

        assertEquals(first.musicians.map { it.id }, second.musicians.map { it.id })
        assertEquals(
            first.musicians.flatMap { it.reviews }.map { it.id },
            second.musicians.flatMap { it.reviews }.map { it.id },
        )
        assertEquals(first.musicians.size, first.musicians.map { it.id }.distinct().size)
        assertNotEquals(first.musicians[0].id, first.musicians[1].id)
    }

    private fun parseProductionSeed(): DemoData = parser.parse(
        rawJson = Files.newBufferedReader(productionSeedPath()).use { it.readText() },
        now = now,
        zoneId = zone,
    )

    private fun productionSeedPath(): Path {
        val candidates = listOf(
            Path.of("src/main/assets/seed_data.json"),
            Path.of("app/src/main/assets/seed_data.json"),
            Path.of("android/app/src/main/assets/seed_data.json"),
        )
        return candidates.firstOrNull(Files::exists)
            ?: error("Asset seed_data.json introuvable depuis ${Path.of("").toAbsolutePath()}")
    }
}
