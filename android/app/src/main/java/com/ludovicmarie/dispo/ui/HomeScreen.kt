package com.ludovicmarie.dispo.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Bolt
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Favorite
import androidx.compose.material.icons.filled.FavoriteBorder
import androidx.compose.material.icons.filled.LocationOn
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.AssistChip
import androidx.compose.material3.Button
import androidx.compose.material3.FilterChip
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.ludovicmarie.dispo.data.Musician
import com.ludovicmarie.dispo.ui.theme.DispoCoral
import com.ludovicmarie.dispo.ui.theme.DispoPurple
import com.ludovicmarie.dispo.ui.theme.DispoViolet
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.layout.PaddingValues

@Composable
fun HomeScreen(
    state: DispoUiState,
    onQueryChange: (String) -> Unit,
    onToggleTonight: () -> Unit,
    onSelectMusician: (String) -> Unit,
    modifier: Modifier = Modifier,
) {
    val musicians = state.data.orEmptyMusicians()
        .asSequence()
        .filter { it.matchesQuery(state.query) }
        .filter { !state.tonightOnly || it.availability.urgencyRank >= 3 }
        .toList()

    LazyColumn(
        modifier = modifier,
        contentPadding = PaddingValues(start = 20.dp, end = 20.dp, top = 16.dp, bottom = 28.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        item {
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.SpaceBetween,
            ) {
                Column {
                    Text("Bonjour Ludovic 👋", style = MaterialTheme.typography.bodyLarge)
                    Text("Qui peut sauver le concert ?", style = MaterialTheme.typography.headlineMedium)
                }
                DemoModeChip(state.backendConfigured)
            }
        }

        item {
            Surface(
                shape = RoundedCornerShape(28.dp),
                color = Color.Transparent,
                modifier = Modifier.fillMaxWidth(),
            ) {
                Box(
                    modifier = Modifier
                        .background(
                            Brush.linearGradient(
                                listOf(DispoPurple, DispoViolet, DispoCoral),
                            ),
                        )
                        .padding(22.dp),
                ) {
                    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        Surface(
                            color = Color.White.copy(alpha = 0.18f),
                            shape = CircleShape,
                        ) {
                            Row(
                                modifier = Modifier.padding(horizontal = 10.dp, vertical = 6.dp),
                                verticalAlignment = Alignment.CenterVertically,
                            ) {
                                Icon(
                                    Icons.Filled.Bolt,
                                    contentDescription = null,
                                    tint = Color.White,
                                    modifier = Modifier.size(16.dp),
                                )
                                Text(
                                    " 8 musiciens disponibles rapidement",
                                    color = Color.White,
                                    style = MaterialTheme.typography.labelLarge,
                                )
                            }
                        }
                        Text(
                            "Un remplacement au pied levé ?",
                            color = Color.White,
                            style = MaterialTheme.typography.titleLarge,
                        )
                        Text(
                            "Trouve le bon instrumentiste autour de Genève en quelques minutes.",
                            color = Color.White.copy(alpha = 0.88f),
                            style = MaterialTheme.typography.bodyMedium,
                        )
                    }
                }
            }
        }

        item {
            OutlinedTextField(
                value = state.query,
                onValueChange = onQueryChange,
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(18.dp),
                singleLine = true,
                placeholder = { Text("Pianiste, jazz, Carouge…") },
                leadingIcon = { Icon(Icons.Filled.Search, contentDescription = null) },
                trailingIcon = if (state.query.isNotBlank()) {
                    {
                        IconButton(onClick = { onQueryChange("") }) {
                            Icon(Icons.Filled.Close, contentDescription = "Effacer la recherche")
                        }
                    }
                } else {
                    null
                },
                keyboardOptions = KeyboardOptions(imeAction = ImeAction.Search),
                keyboardActions = KeyboardActions(onSearch = {}),
            )
        }

        item {
            Row(
                modifier = Modifier.horizontalScroll(rememberScrollState()),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                FilterChip(
                    selected = state.tonightOnly,
                    onClick = onToggleTonight,
                    label = { Text("Dispo rapidement") },
                    leadingIcon = { Icon(Icons.Filled.Bolt, null, Modifier.size(16.dp)) },
                )
                AssistChip(onClick = { onQueryChange("pianiste") }, label = { Text("Piano") })
                AssistChip(onClick = { onQueryChange("jazz") }, label = { Text("Jazz") })
                AssistChip(onClick = { onQueryChange("batterie") }, label = { Text("Batterie") })
            }
        }

        item {
            Row(
                modifier = Modifier.fillMaxWidth().padding(top = 4.dp),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.Bottom,
            ) {
                Text("Musiciens près de toi", style = MaterialTheme.typography.titleLarge)
                Text(
                    "${musicians.size} résultat${if (musicians.size > 1) "s" else ""}",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }

        if (musicians.isEmpty()) {
            item {
                Surface(
                    color = MaterialTheme.colorScheme.surfaceVariant,
                    shape = RoundedCornerShape(22.dp),
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Column(
                        modifier = Modifier.padding(24.dp),
                        horizontalAlignment = Alignment.CenterHorizontally,
                    ) {
                        Text("Aucun musicien trouvé", style = MaterialTheme.typography.titleMedium)
                        Text("Essaie un autre instrument, genre ou quartier.")
                    }
                }
            }
        } else {
            items(musicians, key = Musician::id) { musician ->
                MusicianCard(
                    musician = musician,
                    favorite = musician.id in state.favoriteIds,
                    onClick = { onSelectMusician(musician.id) },
                )
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun MusicianDetailSheet(
    musician: Musician,
    favorite: Boolean,
    onDismiss: () -> Unit,
    onToggleFavorite: () -> Unit,
    onContact: () -> Unit,
) {
    ModalBottomSheet(onDismissRequest = onDismiss) {
        LazyColumn(
            contentPadding = PaddingValues(start = 24.dp, end = 24.dp, bottom = 40.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            item {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(18.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    DemoAssetImage(
                        musician.photo,
                        "Portrait de ${musician.name}",
                        Modifier.size(112.dp).clip(RoundedCornerShape(28.dp)),
                        ContentScale.Crop,
                    )
                    Column(modifier = Modifier.weight(1f)) {
                        Text(
                            musician.name,
                            style = MaterialTheme.typography.headlineMedium,
                            maxLines = 2,
                            overflow = TextOverflow.Ellipsis,
                        )
                        Text(
                            musician.instruments.joinToString(" · ") { it.wireName },
                            color = MaterialTheme.colorScheme.primary,
                            fontWeight = FontWeight.Bold,
                        )
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Icon(
                                Icons.Filled.LocationOn,
                                contentDescription = null,
                                modifier = Modifier.size(16.dp),
                            )
                            Text(" ${musician.neighborhood}")
                        }
                    }
                    IconButton(onClick = onToggleFavorite) {
                        Icon(
                            if (favorite) Icons.Filled.Favorite else Icons.Filled.FavoriteBorder,
                            contentDescription = if (favorite) "Retirer des favoris" else "Ajouter aux favoris",
                            tint = if (favorite) DispoCoral else MaterialTheme.colorScheme.onSurface,
                        )
                    }
                }
            }
            item {
                Row(
                    modifier = Modifier.horizontalScroll(rememberScrollState()),
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    AssistChip(onClick = {}, label = { Text(musician.availability.wireName) })
                    AssistChip(onClick = {}, label = { Text(musician.level.wireName) })
                    musician.genres.take(3).forEach { genre ->
                        AssistChip(onClick = {}, label = { Text(genre.wireName) })
                    }
                }
            }
            item {
                Text("À propos", style = MaterialTheme.typography.titleLarge)
                Spacer(Modifier.height(6.dp))
                Text(musician.bio, style = MaterialTheme.typography.bodyLarge)
            }
            item {
                HorizontalDivider()
                Spacer(Modifier.height(14.dp))
                Text("Répertoire", style = MaterialTheme.typography.titleLarge)
                Spacer(Modifier.height(6.dp))
                musician.repertoire.take(5).forEach { title -> Text("• $title") }
            }
            musician.reviews.firstOrNull()?.let { review ->
                item {
                    Surface(
                        color = MaterialTheme.colorScheme.primaryContainer,
                        shape = RoundedCornerShape(20.dp),
                        modifier = Modifier.fillMaxWidth(),
                    ) {
                        Column(Modifier.padding(18.dp)) {
                            Text("Avis de ${review.author}", fontWeight = FontWeight.Bold)
                            Text("« ${review.comment} »")
                        }
                    }
                }
            }
            item {
                Button(onClick = onContact, modifier = Modifier.fillMaxWidth().height(54.dp)) {
                    Text("Contacter ${musician.name.substringBefore(' ')}")
                }
            }
        }
    }
}

private fun com.ludovicmarie.dispo.data.DemoData?.orEmptyMusicians(): List<Musician> =
    this?.musicians.orEmpty()
