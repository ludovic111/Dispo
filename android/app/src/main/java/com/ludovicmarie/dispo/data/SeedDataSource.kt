package com.ludovicmarie.dispo.data

import android.content.Context
import java.nio.charset.StandardCharsets
import java.time.Duration
import java.time.Instant
import java.time.ZoneId
import java.util.UUID
import kotlinx.serialization.Serializable
import kotlinx.serialization.SerializationException
import kotlinx.serialization.json.Json

private const val SEED_ASSET_NAME = "seed_data.json"

/** Loads the bundled demo without any network or credential dependency. */
class AndroidAssetSeedDataSource(
    private val context: Context,
    private val parser: SeedDataParser = SeedDataParser(),
) {
    fun load(
        now: Instant = Instant.now(),
        zoneId: ZoneId = ZoneId.systemDefault(),
    ): DemoData {
        val rawJson = context.assets.open(SEED_ASSET_NAME).bufferedReader().use { it.readText() }
        return parser.parse(rawJson, now, zoneId)
    }
}

/**
 * Pure JVM parser kept separate from Android assets so the production seed can
 * be checked by local unit tests.
 */
class SeedDataParser(
    private val json: Json = Json { ignoreUnknownKeys = true },
) {
    fun parse(
        rawJson: String,
        now: Instant = Instant.now(),
        zoneId: ZoneId = ZoneId.systemDefault(),
    ): DemoData {
        val dto = try {
            json.decodeFromString<SeedRootDto>(rawJson)
        } catch (error: SerializationException) {
            throw SeedDataException("seed_data.json ne respecte pas le schéma attendu", error)
        }

        val decoded = try {
            dto.toDomain()
        } catch (error: IllegalArgumentException) {
            throw SeedDataException("seed_data.json contient une valeur invalide", error)
        } catch (error: IllegalStateException) {
            throw SeedDataException("seed_data.json contient une valeur inconnue", error)
        }

        check(decoded.musicians.isNotEmpty()) { "Le seed doit contenir au moins un musicien" }
        return DemoSeedProjector.project(decoded, now, zoneId)
    }
}

class SeedDataException(message: String, cause: Throwable) : IllegalStateException(message, cause)

/** Applies the same moving demo timeline as AppStore.projectedSeedEvents on iOS. */
object DemoSeedProjector {
    fun project(data: DemoData, now: Instant, zoneId: ZoneId): DemoData {
        val projectionBase = now.atZone(zoneId).plusHours(4)
        var events = data.events.mapIndexed { index, event ->
            event.copy(date = projectionBase.plusDays((index + 1).toLong()).toInstant())
        }

        if (events.none { it.isEarlyAccess(now) }) {
            val teaserIndex = events.indexOfFirst { !it.isMine && it.date.isAfter(now) }
            if (teaserIndex >= 0) {
                events = events.toMutableList().also {
                    it[teaserIndex] = it[teaserIndex].copy(
                        postedAt = now.minus(Duration.ofMinutes(7)),
                    )
                }
            }
        }

        return data.copy(events = events.sortedBy(GigRequest::date))
    }
}

@Serializable
private data class SeedRootDto(
    val musicians: List<MusicianDto>,
    val bands: List<BandDto> = emptyList(),
    val events: List<GigRequestDto>,
    val conversations: List<ConversationDto>,
)

@Serializable
private data class ReviewDto(
    val author: String,
    val appreciation: String,
    val comment: String,
)

@Serializable
private data class MusicianDto(
    val name: String,
    val age: Int,
    val neighborhood: String,
    val latitude: Double,
    val longitude: Double,
    val instruments: List<String>,
    val genres: List<String>,
    val level: String,
    val bio: String,
    val availability: String,
    val repertoire: List<String>,
    val reviews: List<ReviewDto>,
    val photo: String? = null,
    val socials: Map<String, String> = emptyMap(),
)

@Serializable
private data class BandDto(
    val name: String,
    val neighborhood: String,
    val latitude: Double,
    val longitude: Double,
    val genres: List<String>,
    val level: String,
    val bio: String,
    val availability: String,
    val memberCount: Int,
    val foundedYear: Int,
    val lookingFor: List<String>,
    val repertoire: List<String>,
    val reviews: List<ReviewDto>,
    val photo: String? = null,
)

@Serializable
private data class GigRequestDto(
    val id: String,
    val title: String,
    val hostName: String,
    val date: String,
    val place: String,
    val neighborhood: String,
    val genre: String,
    val wantedInstruments: List<String>,
    val fee: Int? = null,
    val descriptionText: String,
    val applied: Boolean = false,
    val isMine: Boolean = false,
    val postedAt: String? = null,
)

@Serializable
private data class MessageDto(
    val id: String,
    val text: String,
    val isFromMe: Boolean,
    val date: String,
)

@Serializable
private data class ConversationDto(
    val id: String,
    val contactName: String,
    val contactInstrument: String,
    val messages: List<MessageDto>,
)

private fun SeedRootDto.toDomain(): DemoData = DemoData(
    musicians = musicians.map(MusicianDto::toDomain),
    bands = bands.map(BandDto::toDomain),
    events = events.map(GigRequestDto::toDomain),
    conversations = conversations.map(ConversationDto::toDomain),
)

private fun MusicianDto.toDomain(): Musician {
    val musicianId = stableSeedId("musician", name)
    return Musician(
        id = musicianId,
        name = name,
        age = age,
        neighborhood = neighborhood,
        latitude = latitude,
        longitude = longitude,
        instruments = instruments.map(Instrument::fromWire),
        genres = genres.map(Genre::fromWire),
        level = Level.fromWire(level),
        bio = bio,
        availability = Availability.fromWire(availability),
        repertoire = repertoire,
        reviews = reviews.mapIndexed { index, review ->
            review.toDomain(stableSeedId("review", "$musicianId:$index:${review.author}"))
        },
        photo = photo,
        socials = socials.filterValues(String::isNotBlank),
    )
}

private fun BandDto.toDomain(): Band {
    val bandId = stableSeedId("band", name)
    return Band(
        id = bandId,
        name = name,
        neighborhood = neighborhood,
        latitude = latitude,
        longitude = longitude,
        genres = genres.map(Genre::fromWire),
        level = Level.fromWire(level),
        bio = bio,
        availability = Availability.fromWire(availability),
        memberCount = memberCount,
        foundedYear = foundedYear,
        lookingFor = lookingFor.map(Instrument::fromWire),
        repertoire = repertoire,
        reviews = reviews.mapIndexed { index, review ->
            review.toDomain(stableSeedId("review", "$bandId:$index:${review.author}"))
        },
        photo = photo,
    )
}

private fun ReviewDto.toDomain(id: String) = Review(
    id = id,
    author = author,
    appreciation = Appreciation.fromWire(appreciation),
    comment = comment,
)

private fun GigRequestDto.toDomain() = GigRequest(
    id = validatedUuid(id, "events.id"),
    title = title,
    hostName = hostName,
    date = parsedInstant(date, "events.date"),
    place = place,
    neighborhood = neighborhood,
    genre = Genre.fromWire(genre),
    wantedInstruments = wantedInstruments.map(Instrument::fromWire),
    fee = fee,
    description = descriptionText,
    applied = applied,
    isMine = isMine,
    postedAt = postedAt?.let { parsedInstant(it, "events.postedAt") },
)

private fun ConversationDto.toDomain() = Conversation(
    id = validatedUuid(id, "conversations.id"),
    contactName = contactName,
    contactInstrument = Instrument.fromWire(contactInstrument),
    messages = messages.map(MessageDto::toDomain),
)

private fun MessageDto.toDomain() = Message(
    id = validatedUuid(id, "messages.id"),
    text = text,
    isFromMe = isFromMe,
    date = parsedInstant(date, "messages.date"),
)

private fun parsedInstant(raw: String, field: String): Instant = try {
    Instant.parse(raw)
} catch (error: RuntimeException) {
    throw IllegalArgumentException("Date ISO-8601 invalide dans $field: $raw", error)
}

private fun validatedUuid(raw: String, field: String): String = try {
    UUID.fromString(raw).toString()
} catch (error: IllegalArgumentException) {
    throw IllegalArgumentException("UUID invalide dans $field: $raw", error)
}

private fun stableSeedId(namespace: String, value: String): String = UUID.nameUUIDFromBytes(
    "dispo:$namespace:${value.normalizedForSearch()}".toByteArray(StandardCharsets.UTF_8),
).toString()
