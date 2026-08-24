package com.ludovicmarie.dispo.data

import java.time.Instant
import java.time.ZoneId

data class MatchScore(
    val total: Int,
    val instrumentPoints: Int,
    val datePoints: Int,
    val genrePoints: Int,
    val availabilityPoints: Int,
    val levelPoints: Int,
    val reputationPoints: Int,
)

data class SOSMatch(
    val musician: Musician,
    val matchedInstruments: List<Instrument>,
    val dateConfirmed: Boolean,
    val exactGenre: Boolean,
    val score: MatchScore,
) {
    val id: String get() = musician.id
}

/**
 * Deterministic demo matcher. Playing a requested instrument is mandatory;
 * unavailable profiles are excluded. Calendar and exact-genre compatibility
 * are explicit sort tiers, matching the iOS behavior, while [MatchScore]
 * makes the remaining ordering explainable in the UI.
 */
object SOSMatchingEngine {
    fun matches(
        gig: GigRequest,
        musicians: List<Musician>,
        now: Instant = Instant.now(),
        zoneId: ZoneId = ZoneId.systemDefault(),
    ): List<SOSMatch> = musicians
        .mapNotNull { musician -> score(gig, musician, now, zoneId) }
        .sortedWith(
            compareByDescending<SOSMatch>(SOSMatch::dateConfirmed)
                .thenByDescending(SOSMatch::exactGenre)
                .thenByDescending { it.score.total }
                .thenBy { it.musician.name.normalizedForSearch() },
        )

    fun score(
        gig: GigRequest,
        musician: Musician,
        now: Instant = Instant.now(),
        zoneId: ZoneId = ZoneId.systemDefault(),
    ): SOSMatch? {
        if (!musician.availability.isAvailable) return null

        val wanted = gig.wantedInstruments.toSet()
        val matchedInstruments = musician.instruments.distinct().filter(wanted::contains)
        if (matchedInstruments.isEmpty()) return null

        val dateConfirmed = musician.isAvailableOn(gig.date, now, zoneId)
        val exactGenre = gig.genre in musician.genres
        val instrumentPoints = matchedInstruments.size * 40
        val datePoints = if (dateConfirmed) 100 else 0
        val genrePoints = if (exactGenre) 25 else 0
        val availabilityPoints = musician.availability.urgencyRank * 3
        val levelPoints = musician.level.rank * 2
        val reputationPoints = minOf(musician.reviews.size, 10) + musician.goldenReviewCount * 2
        val total = instrumentPoints + datePoints + genrePoints + availabilityPoints +
            levelPoints + reputationPoints

        return SOSMatch(
            musician = musician,
            matchedInstruments = matchedInstruments,
            dateConfirmed = dateConfirmed,
            exactGenre = exactGenre,
            score = MatchScore(
                total = total,
                instrumentPoints = instrumentPoints,
                datePoints = datePoints,
                genrePoints = genrePoints,
                availabilityPoints = availabilityPoints,
                levelPoints = levelPoints,
                reputationPoints = reputationPoints,
            ),
        )
    }
}
