package com.ludovicmarie.dispo.ui

import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.LocationOn
import androidx.compose.material.icons.filled.MusicNote
import androidx.compose.material3.AssistChip
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.ElevatedCard
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.ludovicmarie.dispo.R
import com.ludovicmarie.dispo.data.Musician
import com.ludovicmarie.dispo.ui.theme.DispoCoral
import com.ludovicmarie.dispo.ui.theme.DispoPurple
import com.ludovicmarie.dispo.ui.theme.DispoViolet
import java.text.Normalizer
import java.util.Locale

@Composable
fun DemoAssetImage(
    assetName: String?,
    contentDescription: String?,
    modifier: Modifier = Modifier,
    contentScale: ContentScale = ContentScale.Crop,
) {
    val resourceId = remember(assetName) {
        when (assetName) {
            "app_icon" -> R.drawable.app_icon
            "logo_mark" -> R.drawable.logo_mark
            "cover_classique" -> R.drawable.cover_classique
            "cover_electro" -> R.drawable.cover_electro
            "cover_folk" -> R.drawable.cover_folk
            "cover_jazz" -> R.drawable.cover_jazz
            "cover_latin" -> R.drawable.cover_latin
            "cover_rock" -> R.drawable.cover_rock
            "cover_soul" -> R.drawable.cover_soul
            "pfp_anna" -> R.drawable.pfp_anna
            "pfp_antoine" -> R.drawable.pfp_antoine
            "pfp_camille" -> R.drawable.pfp_camille
            "pfp_david" -> R.drawable.pfp_david
            "pfp_elise" -> R.drawable.pfp_elise
            "pfp_hugo" -> R.drawable.pfp_hugo
            "pfp_ingrid" -> R.drawable.pfp_ingrid
            "pfp_julien" -> R.drawable.pfp_julien
            "pfp_karim" -> R.drawable.pfp_karim
            "pfp_lea" -> R.drawable.pfp_lea
            "pfp_marco" -> R.drawable.pfp_marco
            "pfp_mathilde" -> R.drawable.pfp_mathilde
            "pfp_nadia" -> R.drawable.pfp_nadia
            "pfp_pablo" -> R.drawable.pfp_pablo
            "pfp_ricardo" -> R.drawable.pfp_ricardo
            "pfp_sarah" -> R.drawable.pfp_sarah
            "pfp_sofia" -> R.drawable.pfp_sofia
            "pfp_stefan" -> R.drawable.pfp_stefan
            "pfp_tom" -> R.drawable.pfp_tom
            "pfp_yann" -> R.drawable.pfp_yann
            else -> 0
        }
    }
    if (resourceId != 0) {
        Image(
            painter = painterResource(resourceId),
            contentDescription = contentDescription,
            contentScale = contentScale,
            modifier = modifier,
        )
    } else {
        Box(
            modifier = modifier.background(
                Brush.linearGradient(listOf(DispoPurple, DispoViolet)),
            ),
            contentAlignment = Alignment.Center,
        ) {
            Icon(
                imageVector = Icons.Filled.MusicNote,
                contentDescription = null,
                tint = MaterialTheme.colorScheme.onPrimary,
                modifier = Modifier.size(32.dp),
            )
        }
    }
}

@Composable
fun MusicianCard(
    musician: Musician,
    favorite: Boolean,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    ElevatedCard(
        onClick = onClick,
        modifier = modifier.fillMaxWidth(),
        shape = RoundedCornerShape(22.dp),
        colors = CardDefaults.elevatedCardColors(
            containerColor = MaterialTheme.colorScheme.surface,
        ),
    ) {
        Row(
            modifier = Modifier.padding(14.dp),
            horizontalArrangement = Arrangement.spacedBy(14.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Box {
                DemoAssetImage(
                    assetName = musician.photo,
                    contentDescription = "Portrait de ${musician.name}",
                    modifier = Modifier.size(78.dp).clip(RoundedCornerShape(20.dp)),
                )
                if (musician.availability.isAvailable) {
                    Box(
                        modifier = Modifier
                            .align(Alignment.BottomEnd)
                            .size(18.dp)
                            .clip(CircleShape)
                            .background(MaterialTheme.colorScheme.surface)
                            .padding(3.dp)
                            .clip(CircleShape)
                            .background(if (musician.availability.urgencyRank >= 3) DispoCoral else DispoPurple),
                    )
                }
            }
            Column(modifier = Modifier.weight(1f)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(
                        text = musician.name,
                        style = MaterialTheme.typography.titleMedium,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                        modifier = Modifier.weight(1f, fill = false),
                    )
                    if (musician.level.rank >= 2) {
                        Icon(
                            Icons.Filled.CheckCircle,
                            contentDescription = "Profil confirmé",
                            tint = DispoPurple,
                            modifier = Modifier.padding(start = 5.dp).size(16.dp),
                        )
                    }
                }
                Text(
                    musician.instruments.joinToString(" · ") { it.wireName },
                    color = MaterialTheme.colorScheme.primary,
                    fontWeight = FontWeight.SemiBold,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
                Spacer(Modifier.height(4.dp))
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(
                        Icons.Filled.LocationOn,
                        contentDescription = null,
                        modifier = Modifier.size(14.dp),
                        tint = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    Text(
                        " ${musician.neighborhood} · ${musician.availability.wireName}",
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
            }
            if (favorite) {
                Surface(
                    color = MaterialTheme.colorScheme.primaryContainer,
                    shape = CircleShape,
                ) {
                    Text("♥", modifier = Modifier.padding(8.dp), color = DispoPurple)
                }
            }
        }
    }
}

@Composable
fun DemoModeChip(backendConfigured: Boolean) {
    AssistChip(
        onClick = {},
        label = { Text(if (backendConfigured) "Backend prêt" else "Démo hors ligne") },
        leadingIcon = {
            Icon(
                Icons.Filled.CheckCircle,
                contentDescription = null,
                modifier = Modifier.size(16.dp),
            )
        },
    )
}

fun String.normalizedSearchText(): String = Normalizer.normalize(
    lowercase(Locale.FRENCH)
        .replace("œ", "oe")
        .replace("æ", "ae"),
    Normalizer.Form.NFD,
).replace(Regex("\\p{M}+"), "")

fun Musician.matchesQuery(query: String): Boolean {
    val normalized = query.normalizedSearchText().trim()
    if (normalized.isBlank()) return true
    val haystack = buildString {
        append(name).append(' ')
        append(neighborhood).append(' ')
        append(bio).append(' ')
        instruments.forEach { instrument ->
            append(instrument.wireName).append(' ')
            append(instrument.searchAliases.joinToString(" ")).append(' ')
        }
        append(genres.joinToString(" ") { it.wireName })
    }.normalizedSearchText()
    return normalized.split(Regex("\\s+")).all(haystack::contains)
}
