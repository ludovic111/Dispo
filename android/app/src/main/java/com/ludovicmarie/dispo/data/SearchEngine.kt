package com.ludovicmarie.dispo.data

data class SearchResults(
    val musicians: List<Musician> = emptyList(),
    val gigs: List<GigRequest> = emptyList(),
) {
    val isEmpty: Boolean get() = musicians.isEmpty() && gigs.isEmpty()
}

/** Accent-insensitive, alias-aware and typo-tolerant universal search. */
object DispoSearchEngine {
    private val stopWords = setOf(
        "un", "une", "le", "la", "les", "de", "du", "des", "d", "l",
        "a", "au", "aux", "en", "sur", "et", "ou", "pour", "avec",
        "qui", "je", "cherche", "recherche", "trouve", "besoin", "veux",
    )

    fun search(query: String, data: DemoData): SearchResults =
        search(query, data.musicians, data.events)

    fun search(
        query: String,
        musicians: List<Musician>,
        gigs: List<GigRequest>,
    ): SearchResults {
        val tokens = tokenizeQuery(query)
        if (tokens.isEmpty()) return SearchResults()

        val musicianMatches = pickBest(
            musicians.map { musician -> musician to matchCount(tokens, haystack(musician)) },
            tokens.size,
        ).sortedWith(
            compareByDescending<Musician> { it.availability.urgencyRank }
                .thenByDescending(Musician::goldenReviewCount)
                .thenBy { it.name.normalizedForSearch() },
        )
        val gigMatches = pickBest(
            gigs.map { gig -> gig to matchCount(tokens, haystack(gig)) },
            tokens.size,
        ).sortedBy(GigRequest::date)

        return SearchResults(musicianMatches, gigMatches)
    }

    internal fun tokenizeQuery(query: String): List<String> = query
        .normalizedForSearch()
        .split(Regex("[^\\p{L}\\p{N}@]+"))
        .map { it.replace("@", "") }
        .filter { it.isNotBlank() && it !in stopWords }

    internal fun editDistance(first: String, second: String, limit: Int): Int {
        if (kotlin.math.abs(first.length - second.length) > limit) return limit + 1
        var previous = IntArray(second.length + 1) { it }

        first.forEachIndexed { firstIndex, firstCharacter ->
            val current = IntArray(second.length + 1)
            current[0] = firstIndex + 1
            var rowMinimum = current[0]
            second.forEachIndexed { secondIndex, secondCharacter ->
                val substitutionCost = if (firstCharacter == secondCharacter) 0 else 1
                current[secondIndex + 1] = minOf(
                    previous[secondIndex] + substitutionCost,
                    previous[secondIndex + 1] + 1,
                    current[secondIndex] + 1,
                )
                rowMinimum = minOf(rowMinimum, current[secondIndex + 1])
            }
            if (rowMinimum > limit) return limit + 1
            previous = current
        }
        return previous[second.length]
    }

    private fun <T> pickBest(scored: List<Pair<T, Int>>, tokenCount: Int): List<T> {
        val complete = scored.filter { (_, score) -> score == tokenCount }
        return (complete.ifEmpty { scored.filter { (_, score) -> score > 0 } }).map(Pair<T, Int>::first)
    }

    private fun matchCount(tokens: List<String>, words: List<String>): Int =
        tokens.count { token -> tokenMatches(token, words) }

    private fun tokenMatches(token: String, words: List<String>): Boolean = words.any { word ->
        when {
            word.startsWith(token) -> true
            token.length >= 3 && token in word -> true
            token.length >= 4 && word.length >= 4 && token.startsWith(word) -> true
            token.length >= 4 -> {
                val tolerance = if (token.length >= 7) 2 else 1
                editDistance(token, word, tolerance) <= tolerance
            }
            else -> false
        }
    }

    private fun haystack(musician: Musician): List<String> {
        val handle = musician.name.handleized()
        return buildList {
            add(musician.name)
            add(handle)
            add(handle.replace(".", ""))
            add(musician.neighborhood)
            musician.instruments.forEach { instrument ->
                add(instrument.wireName)
                addAll(instrument.searchAliases)
            }
            musician.genres.forEach { genre ->
                add(genre.wireName)
                add(genre.family.displayName)
            }
            add(musician.level.wireName)
            add(musician.availability.wireName)
        }.toSearchWords(splitDots = true)
    }

    private fun haystack(gig: GigRequest): List<String> = buildList {
        add(gig.title)
        add(gig.place)
        add(gig.neighborhood)
        add(gig.hostName)
        add("sos")
        gig.wantedInstruments.forEach { instrument ->
            add(instrument.wireName)
            addAll(instrument.searchAliases)
        }
        add(gig.genre.wireName)
        add(gig.genre.family.displayName)
    }.toSearchWords()

    private fun List<String>.toSearchWords(splitDots: Boolean = false): List<String> = flatMap { part ->
        part.normalizedForSearch()
            .split(Regex("[^\\p{L}\\p{N}.]+"))
            .filter(String::isNotBlank)
            .flatMap { word -> if (splitDots) word.split('.').filter(String::isNotBlank) else listOf(word) }
    }
}
