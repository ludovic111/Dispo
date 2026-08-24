package com.ludovicmarie.dispo.data

import java.text.Normalizer
import java.time.Duration
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.time.temporal.ChronoUnit
import java.util.Locale

enum class GenreFamily(val displayName: String) {
    JAZZ("Jazz"),
    LATIN_WORLD("Latin & World"),
    CLASSICAL("Classique"),
    ROCK_POP("Rock & Pop"),
    BLUES_COUNTRY("Blues & Country"),
    SOUL_FUNK("Soul & Funk"),
    URBAN("Hip-hop & Urbain"),
    ELECTRONIC("Électronique"),
    FOLK("Folk & Acoustique"),
}

/**
 * Genre values mirror Models.swift exactly. [wireName] is persisted in the
 * iOS seed and in Supabase, so it must not be renamed without a migration.
 */
enum class Genre(val wireName: String, val family: GenreFamily) {
    JAZZ("Jazz", GenreFamily.JAZZ),
    BEBOP("Bebop / Hard bop", GenreFamily.JAZZ),
    SWING("Swing / Big band", GenreFamily.JAZZ),
    JAZZ_FUSION("Jazz fusion", GenreFamily.JAZZ),
    JAZZ_MANOUCHE("Jazz manouche", GenreFamily.JAZZ),
    FREE_JAZZ("Free jazz", GenreFamily.JAZZ),
    SMOOTH_JAZZ("Smooth jazz", GenreFamily.JAZZ),
    LATIN_WORLD("Latin / World", GenreFamily.LATIN_WORLD),
    SALSA("Salsa / Timba", GenreFamily.LATIN_WORLD),
    BOSSA("Bossa nova / MPB", GenreFamily.LATIN_WORLD),
    CUMBIA("Cumbia", GenreFamily.LATIN_WORLD),
    TANGO("Tango", GenreFamily.LATIN_WORLD),
    AFRO_CUBAN("Afro-cubain", GenreFamily.LATIN_WORLD),
    REGGAE("Reggae / Ska", GenreFamily.LATIN_WORLD),
    AFROBEAT("Afrobeat / Highlife", GenreFamily.LATIN_WORLD),
    FLAMENCO("Flamenco", GenreFamily.LATIN_WORLD),
    ORIENTAL("Musique orientale", GenreFamily.LATIN_WORLD),
    BALKAN("Balkan / Klezmer", GenreFamily.LATIN_WORLD),
    CLASSICAL("Classique", GenreFamily.CLASSICAL),
    BAROQUE("Baroque", GenreFamily.CLASSICAL),
    OPERA("Opéra / Lyrique", GenreFamily.CLASSICAL),
    CHAMBER("Musique de chambre", GenreFamily.CLASSICAL),
    CONTEMPORARY("Musique contemporaine", GenreFamily.CLASSICAL),
    ROCK_POP("Rock / Pop", GenreFamily.ROCK_POP),
    INDIE("Indie / Alternatif", GenreFamily.ROCK_POP),
    HARD_ROCK("Hard rock / Metal", GenreFamily.ROCK_POP),
    PUNK("Punk / Garage", GenreFamily.ROCK_POP),
    POP_VARIETY("Pop / Variété", GenreFamily.ROCK_POP),
    FRENCH_SONG("Chanson française", GenreFamily.ROCK_POP),
    BLUES("Blues", GenreFamily.BLUES_COUNTRY),
    COUNTRY("Country / Bluegrass", GenreFamily.BLUES_COUNTRY),
    ROCK_AND_ROLL("Rock'n'roll / Rockabilly", GenreFamily.BLUES_COUNTRY),
    SOUL("Gospel / Soul / R&B", GenreFamily.SOUL_FUNK),
    FUNK("Funk", GenreFamily.SOUL_FUNK),
    DISCO("Disco", GenreFamily.SOUL_FUNK),
    HIP_HOP("Hip-hop / Rap", GenreFamily.URBAN),
    MODERN_RNB("R&B moderne / Neo-soul", GenreFamily.URBAN),
    ELECTRONIC("Électronique", GenreFamily.ELECTRONIC),
    HOUSE("House", GenreFamily.ELECTRONIC),
    TECHNO("Techno", GenreFamily.ELECTRONIC),
    DRUM_AND_BASS("Drum & bass", GenreFamily.ELECTRONIC),
    AMBIENT("Ambient / Downtempo", GenreFamily.ELECTRONIC),
    FOLK_ACOUSTIC("Folk / Acoustique", GenreFamily.FOLK),
    SINGER_SONGWRITER("Singer-songwriter", GenreFamily.FOLK),
    CELTIC("Musique celtique", GenreFamily.FOLK),
    ;

    companion object {
        private val byWireName = entries.associateBy(Genre::wireName)

        fun fromWire(value: String): Genre = byWireName[value]
            ?: error("Genre inconnu dans le seed: $value")
    }
}

/** Instrument values and aliases are kept in sync with Models.swift. */
enum class Instrument(
    val wireName: String,
    val searchAliases: List<String> = emptyList(),
) {
    PIANO("Piano", listOf("pianiste", "claviériste", "keys")),
    SYNTH("Synthé / MAO", listOf("claviériste", "producteur", "beatmaker", "mao")),
    ORGAN("Orgue", listOf("organiste")),
    ACCORDION("Accordéon", listOf("accordéoniste")),
    GUITAR("Guitare", listOf("guitariste")),
    ELECTRIC_GUITAR("Guitare électrique", listOf("guitariste")),
    BASS("Basse", listOf("bassiste")),
    DOUBLE_BASS("Contrebasse", listOf("contrebassiste")),
    VIOLIN("Violon", listOf("violoniste")),
    VIOLA("Alto", listOf("altiste")),
    CELLO("Violoncelle", listOf("violoncelliste", "celliste")),
    HARP("Harpe", listOf("harpiste")),
    BANJO("Banjo", listOf("banjoïste")),
    MANDOLIN("Mandoline", listOf("mandoliniste")),
    UKULELE("Ukulélé"),
    SAXOPHONE("Saxophone", listOf("saxophoniste", "sax", "saxo")),
    TRUMPET("Trompette", listOf("trompettiste")),
    TROMBONE("Trombone", listOf("tromboniste")),
    CLARINET("Clarinette", listOf("clarinettiste")),
    FLUTE("Flûte", listOf("flûtiste")),
    HORN("Cor", listOf("corniste")),
    TUBA("Tuba", listOf("tubiste")),
    HARMONICA("Harmonica", listOf("harmoniciste")),
    DRUMS("Batterie", listOf("batteur", "batteuse", "drummer")),
    PERCUSSION("Percussions", listOf("percussionniste", "percu")),
    CAJON("Cajón", listOf("percussionniste")),
    CONGAS("Congas", listOf("conguero", "percussionniste")),
    TIMBALES("Timbales", listOf("timbalero", "percussionniste")),
    VIBRAPHONE("Vibraphone", listOf("vibraphoniste")),
    VOICE("Voix", listOf("chanteur", "chanteuse", "vocaliste", "voix")),
    CHOIRS("Chœurs", listOf("choriste")),
    BEATBOX("Beatbox", listOf("beatboxer")),
    DJ("DJ / Platines", listOf("deejay", "platines")),
    ;

    companion object {
        private val byWireName = entries.associateBy(Instrument::wireName)

        fun fromWire(value: String): Instrument = byWireName[value]
            ?: error("Instrument inconnu dans le seed: $value")
    }
}

enum class Availability(
    val wireName: String,
    val urgencyRank: Int,
) {
    TONIGHT("Ce soir", 4),
    THIS_WEEK("Cette semaine", 3),
    WEEKEND("Ce week-end", 2),
    ON_REQUEST("Sur demande", 1),
    UNAVAILABLE("Indisponible", 0),
    ;

    val isAvailable: Boolean get() = this != UNAVAILABLE

    fun isAvailableOn(
        gigDate: Instant,
        availableDates: List<Instant> = emptyList(),
        now: Instant,
        zoneId: ZoneId,
    ): Boolean {
        val gigDay = gigDate.atZone(zoneId).toLocalDate()
        if (availableDates.isNotEmpty()) {
            return availableDates.any { it.atZone(zoneId).toLocalDate() == gigDay }
        }

        val today = now.atZone(zoneId).toLocalDate()
        val days = ChronoUnit.DAYS.between(today, gigDay)
        return when (this) {
            TONIGHT -> days == 0L
            THIS_WEEK -> days in 0L..7L
            WEEKEND -> days in 0L..7L && gigDay.dayOfWeek.value >= 6
            ON_REQUEST, UNAVAILABLE -> false
        }
    }

    companion object {
        private val byWireName = entries.associateBy(Availability::wireName)

        fun fromWire(value: String): Availability = byWireName[value]
            ?: error("Disponibilité inconnue dans le seed: $value")
    }
}

enum class Level(val wireName: String, val rank: Int) {
    BEGINNER("Débutant", 0),
    INTERMEDIATE("Intermédiaire", 1),
    ADVANCED("Avancé", 2),
    PROFESSIONAL("Professionnel", 3),
    ;

    companion object {
        private val byWireName = entries.associateBy(Level::wireName)

        fun fromWire(value: String): Level = byWireName[value]
            ?: error("Niveau inconnu dans le seed: $value")
    }
}

enum class Appreciation(val wireName: String) {
    NOTE("note"),
    GOLDEN("golden"),
    ;

    companion object {
        private val byWireName = entries.associateBy(Appreciation::wireName)

        fun fromWire(value: String): Appreciation = byWireName[value]
            ?: error("Appréciation inconnue dans le seed: $value")
    }
}

data class Review(
    val id: String,
    val author: String,
    val appreciation: Appreciation,
    val comment: String,
)

data class Musician(
    val id: String,
    val name: String,
    val age: Int,
    val neighborhood: String,
    val latitude: Double,
    val longitude: Double,
    val instruments: List<Instrument>,
    val genres: List<Genre>,
    val level: Level,
    val bio: String,
    val availability: Availability,
    val availableDates: List<Instant> = emptyList(),
    val repertoire: List<String>,
    val reviews: List<Review>,
    val photo: String?,
    val socials: Map<String, String> = emptyMap(),
) {
    val handle: String get() = "@${name.handleized()}"
    val initials: String
        get() = name.split(Regex("\\s+"))
            .mapNotNull(String::firstOrNull)
            .take(2)
            .joinToString("")

    val goldenReviewCount: Int
        get() = reviews.count { it.appreciation == Appreciation.GOLDEN }

    fun playsAny(wanted: Collection<Instrument>): Boolean =
        instruments.any(wanted.toSet()::contains)

    fun isAvailableOn(gigDate: Instant, now: Instant, zoneId: ZoneId): Boolean =
        availability.isAvailableOn(gigDate, availableDates, now, zoneId)
}

data class Band(
    val id: String,
    val name: String,
    val neighborhood: String,
    val latitude: Double,
    val longitude: Double,
    val genres: List<Genre>,
    val level: Level,
    val bio: String,
    val availability: Availability,
    val memberCount: Int,
    val foundedYear: Int,
    val lookingFor: List<Instrument>,
    val repertoire: List<String>,
    val reviews: List<Review>,
    val photo: String?,
)

data class GigRequest(
    val id: String,
    val title: String,
    val hostName: String,
    val date: Instant,
    val place: String,
    val neighborhood: String,
    val genre: Genre,
    val wantedInstruments: List<Instrument>,
    val fee: Int?,
    val description: String,
    val applied: Boolean = false,
    val isMine: Boolean = false,
    val postedAt: Instant? = null,
) {
    val feeLabel: String get() = fee?.let { "CHF $it" } ?: "À discuter"
    val earlyAccessEnd: Instant? get() = postedAt?.plus(EARLY_ACCESS_WINDOW)

    fun isEarlyAccess(now: Instant): Boolean =
        !isMine && earlyAccessEnd?.let(now::isBefore) == true

    companion object {
        val EARLY_ACCESS_WINDOW: Duration = Duration.ofMinutes(30)
    }
}

data class Message(
    val id: String,
    val text: String,
    val isFromMe: Boolean,
    val date: Instant,
)

data class Conversation(
    val id: String,
    val contactName: String,
    val contactInstrument: Instrument,
    val messages: List<Message>,
) {
    val lastMessage: Message? get() = messages.maxByOrNull(Message::date)
}

data class DemoData(
    val musicians: List<Musician>,
    val bands: List<Band>,
    val events: List<GigRequest>,
    val conversations: List<Conversation>,
)

internal fun String.handleized(): String = normalizedForSearch()
    .map { character -> if (character.isLetterOrDigit()) character else ' ' }
    .joinToString("")
    .split(Regex("\\s+"))
    .filter(String::isNotBlank)
    .joinToString(".")

internal fun String.normalizedForSearch(): String {
    val expandedLigatures = lowercase(Locale.FRENCH)
        .replace("œ", "oe")
        .replace("æ", "ae")
        .replace("ß", "ss")
    return Normalizer.normalize(expandedLigatures, Normalizer.Form.NFD)
        .replace(Regex("\\p{M}+"), "")
}

internal fun LocalDate.isWeekend(): Boolean = dayOfWeek.value >= 6
