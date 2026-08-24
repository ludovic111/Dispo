package com.ludovicmarie.dispo.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AccessTime
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Bolt
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.LocationOn
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.AssistChip
import androidx.compose.material3.Button
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.ElevatedCard
import androidx.compose.material3.FilterChip
import androidx.compose.material3.FilledTonalButton
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.produceState
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import com.ludovicmarie.dispo.data.GigRequest
import com.ludovicmarie.dispo.data.Instrument
import com.ludovicmarie.dispo.data.SOSMatch
import com.ludovicmarie.dispo.data.SOSMatchingEngine
import com.ludovicmarie.dispo.ui.theme.DispoCoral
import com.ludovicmarie.dispo.ui.theme.DispoGold
import com.ludovicmarie.dispo.ui.theme.DispoPurple
import java.time.Duration
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale
import kotlinx.coroutines.delay
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items

@Composable
fun SosScreen(
    state: DispoUiState,
    onApply: (String) -> Unit,
    onCreateGig: (String, Instrument, Int?) -> Unit,
    onSetPremium: (Boolean) -> Unit,
    modifier: Modifier = Modifier,
) {
    var showCreateDialog by remember { mutableStateOf(false) }
    var showPremiumDialog by remember { mutableStateOf(false) }
    val now by produceState(initialValue = Instant.now()) {
        while (true) {
            value = Instant.now()
            delay(1_000)
        }
    }

    LazyColumn(
        modifier = modifier,
        contentPadding = PaddingValues(start = 20.dp, end = 20.dp, top = 16.dp, bottom = 28.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        item {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Column {
                    Text("Annonces SOS", style = MaterialTheme.typography.headlineMedium)
                    Text(
                        "Des concerts à sauver près de Genève",
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
                FilledTonalButton(onClick = { showCreateDialog = true }) {
                    Icon(Icons.Filled.Add, null)
                    Text(" Publier")
                }
            }
        }

        item {
            Surface(
                color = Color.Transparent,
                shape = RoundedCornerShape(24.dp),
                modifier = Modifier.fillMaxWidth(),
            ) {
                Box(
                    modifier = Modifier
                        .background(
                            Brush.linearGradient(listOf(Color(0xFF24104D), DispoPurple)),
                        )
                        .padding(20.dp),
                ) {
                    Row(
                        horizontalArrangement = Arrangement.spacedBy(14.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Surface(color = DispoGold, shape = CircleShape) {
                            Icon(
                                Icons.Filled.Bolt,
                                contentDescription = null,
                                tint = Color(0xFF241A00),
                                modifier = Modifier.padding(12.dp).size(24.dp),
                            )
                        }
                        Column(modifier = Modifier.weight(1f)) {
                            Text(
                                if (state.premiumDemo) "Premium démo activé" else "30 minutes d’avance",
                                color = Color.White,
                                fontWeight = FontWeight.Bold,
                                style = MaterialTheme.typography.titleMedium,
                            )
                            Text(
                                if (state.premiumDemo) {
                                    "Toutes les annonces sont visibles immédiatement."
                                } else {
                                    "Les membres Premium voient les nouveaux SOS en premier."
                                },
                                color = Color.White.copy(alpha = 0.8f),
                                style = MaterialTheme.typography.bodyMedium,
                            )
                        }
                        TextButton(onClick = { showPremiumDialog = true }) {
                            Text(if (state.premiumDemo) "Gérer" else "Découvrir", color = Color.White)
                        }
                    }
                }
            }
        }

        items(state.data?.events.orEmpty(), key = GigRequest::id) { gig ->
            val applied = gig.applied || gig.id in state.appliedEventIds
            val matches = if (gig.isMine) {
                SOSMatchingEngine.matches(
                    gig = gig,
                    musicians = state.data?.musicians.orEmpty(),
                    now = now,
                ).take(3)
            } else {
                emptyList()
            }
            GigRequestCard(
                gig = gig,
                now = now,
                premium = state.premiumDemo,
                applied = applied,
                matches = matches,
                onApply = { onApply(gig.id) },
                onUnlock = { showPremiumDialog = true },
            )
        }
    }

    if (showCreateDialog) {
        CreateGigDialog(
            onDismiss = { showCreateDialog = false },
            onCreate = { title, instrument, fee ->
                onCreateGig(title, instrument, fee)
                showCreateDialog = false
            },
        )
    }

    if (showPremiumDialog) {
        PremiumDemoDialog(
            enabled = state.premiumDemo,
            onDismiss = { showPremiumDialog = false },
            onSetPremium = {
                onSetPremium(it)
                showPremiumDialog = false
            },
        )
    }
}

@Composable
private fun GigRequestCard(
    gig: GigRequest,
    now: Instant,
    premium: Boolean,
    applied: Boolean,
    matches: List<SOSMatch>,
    onApply: () -> Unit,
    onUnlock: () -> Unit,
) {
    val locked = gig.isEarlyAccess(now) && !premium
    ElevatedCard(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(24.dp),
        colors = CardDefaults.elevatedCardColors(containerColor = MaterialTheme.colorScheme.surface),
    ) {
        Column(
            modifier = Modifier.padding(18.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(12.dp),
                verticalAlignment = Alignment.Top,
            ) {
                Surface(
                    color = if (gig.isMine) MaterialTheme.colorScheme.primaryContainer else
                        DispoCoral.copy(alpha = 0.14f),
                    shape = RoundedCornerShape(15.dp),
                ) {
                    Icon(
                        if (locked) Icons.Filled.Lock else Icons.Filled.Bolt,
                        contentDescription = null,
                        tint = if (locked) DispoPurple else DispoCoral,
                        modifier = Modifier.padding(11.dp).size(22.dp),
                    )
                }
                Column(modifier = Modifier.weight(1f)) {
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        if (gig.isMine) {
                            Text("MON ANNONCE", color = DispoPurple, fontWeight = FontWeight.Bold)
                        } else {
                            Text(gig.hostName, color = MaterialTheme.colorScheme.primary)
                        }
                    }
                    Text(gig.title, style = MaterialTheme.typography.titleLarge)
                }
                Surface(
                    color = MaterialTheme.colorScheme.secondaryContainer,
                    shape = RoundedCornerShape(12.dp),
                ) {
                    Text(
                        gig.feeLabel,
                        modifier = Modifier.padding(horizontal = 10.dp, vertical = 7.dp),
                        fontWeight = FontWeight.Bold,
                    )
                }
            }

            Row(
                modifier = Modifier.horizontalScroll(rememberScrollState()),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                AssistChip(onClick = {}, label = { Text(gig.wantedInstruments.joinToString { it.wireName }) })
                AssistChip(onClick = {}, label = { Text(gig.genre.wireName) })
            }

            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(Icons.Filled.AccessTime, null, Modifier.size(16.dp))
                Text(" ${formatGigDate(gig.date)}")
                Spacer(Modifier.size(12.dp))
                Icon(Icons.Filled.LocationOn, null, Modifier.size(16.dp))
                Text(" ${gig.neighborhood}")
            }

            if (locked) {
                val remaining = gig.earlyAccessEnd?.let { Duration.between(now, it).seconds }
                    ?.coerceAtLeast(0) ?: 0
                Surface(
                    color = MaterialTheme.colorScheme.primaryContainer,
                    shape = RoundedCornerShape(18.dp),
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Column(
                        modifier = Modifier.padding(16.dp),
                        horizontalAlignment = Alignment.CenterHorizontally,
                    ) {
                        Text("Détails réservés aux membres Premium", fontWeight = FontWeight.Bold)
                        Text("Ouverture pour tous dans ${remaining / 60}:${(remaining % 60).toString().padStart(2, '0')}")
                        Spacer(Modifier.height(8.dp))
                        Button(onClick = onUnlock) { Text("Voir maintenant") }
                    }
                }
            } else {
                Text(gig.description, style = MaterialTheme.typography.bodyMedium)
                if (gig.isMine) {
                    Text("Meilleurs profils compatibles", style = MaterialTheme.typography.titleMedium)
                    if (matches.isEmpty()) {
                        Text(
                            "Aucun profil disponible pour cet instrument : essaie une autre date.",
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    } else {
                        matches.forEach { match ->
                            Surface(
                                color = MaterialTheme.colorScheme.surfaceVariant,
                                shape = RoundedCornerShape(16.dp),
                                modifier = Modifier.fillMaxWidth(),
                            ) {
                                Row(
                                    modifier = Modifier.padding(10.dp),
                                    verticalAlignment = Alignment.CenterVertically,
                                    horizontalArrangement = Arrangement.spacedBy(10.dp),
                                ) {
                                    DemoAssetImage(
                                        match.musician.photo,
                                        "Portrait de ${match.musician.name}",
                                        Modifier.size(42.dp).clip(CircleShape),
                                    )
                                    Column(modifier = Modifier.weight(1f)) {
                                        Text(match.musician.name, fontWeight = FontWeight.Bold)
                                        Text(
                                            buildString {
                                                append(match.matchedInstruments.joinToString { it.wireName })
                                                if (match.exactGenre) append(" · même genre")
                                            },
                                            style = MaterialTheme.typography.bodyMedium,
                                        )
                                    }
                                    Text("${match.score.total}", color = DispoPurple, fontWeight = FontWeight.Bold)
                                }
                            }
                        }
                    }
                } else {
                    Button(
                        onClick = onApply,
                        enabled = !applied,
                        modifier = Modifier.fillMaxWidth(),
                    ) {
                        if (applied) Icon(Icons.Filled.Check, null)
                        Text(if (applied) " Candidature envoyée" else "Je suis disponible")
                    }
                }
            }
        }
    }
}

@Composable
private fun CreateGigDialog(
    onDismiss: () -> Unit,
    onCreate: (String, Instrument, Int?) -> Unit,
) {
    var title by remember { mutableStateOf("") }
    var fee by remember { mutableStateOf("") }
    var instrument by remember { mutableStateOf(Instrument.PIANO) }
    val quickInstruments = listOf(
        Instrument.PIANO,
        Instrument.DRUMS,
        Instrument.BASS,
        Instrument.GUITAR,
        Instrument.VOICE,
    )

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Publier un SOS") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(14.dp)) {
                Text("Crée une annonce de démonstration pour demain à Genève.")
                OutlinedTextField(
                    value = title,
                    onValueChange = { title = it },
                    label = { Text("Titre du remplacement") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth(),
                )
                Row(
                    modifier = Modifier.horizontalScroll(rememberScrollState()),
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    quickInstruments.forEach { choice ->
                        FilterChip(
                            selected = choice == instrument,
                            onClick = { instrument = choice },
                            label = { Text(choice.wireName) },
                        )
                    }
                }
                OutlinedTextField(
                    value = fee,
                    onValueChange = { fee = it.filter(Char::isDigit).take(4) },
                    label = { Text("Cachet CHF (facultatif)") },
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth(),
                )
            }
        },
        confirmButton = {
            Button(onClick = { onCreate(title, instrument, fee.toIntOrNull()) }) {
                Text("Publier")
            }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Annuler") } },
    )
}

@Composable
fun PremiumDemoDialog(
    enabled: Boolean,
    onDismiss: () -> Unit,
    onSetPremium: (Boolean) -> Unit,
) {
    AlertDialog(
        onDismissRequest = onDismiss,
        icon = { Icon(Icons.Filled.Bolt, null, tint = DispoGold, modifier = Modifier.size(42.dp)) },
        title = { Text("Dispo Premium") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Text("• Voir les SOS 30 minutes avant les autres")
                Text("• Publier et matcher sans limite")
                Text("• Mettre ton profil en avant")
                Surface(
                    color = MaterialTheme.colorScheme.surfaceVariant,
                    shape = RoundedCornerShape(14.dp),
                ) {
                    Text(
                        "Mode démo uniquement : aucun paiement n’est effectué et aucun statut Premium n’est envoyé au backend.",
                        modifier = Modifier.padding(12.dp),
                        style = MaterialTheme.typography.bodyMedium,
                    )
                }
            }
        },
        confirmButton = {
            Button(onClick = { onSetPremium(!enabled) }) {
                Text(if (enabled) "Désactiver la démo" else "Activer la démo Premium")
            }
        },
        dismissButton = { OutlinedButton(onClick = onDismiss) { Text("Fermer") } },
    )
}

private val gigDateFormatter = DateTimeFormatter.ofPattern("EEE d MMM · HH:mm", Locale.FRENCH)

private fun formatGigDate(instant: Instant): String =
    instant.atZone(ZoneId.systemDefault()).format(gigDateFormatter).replaceFirstChar(Char::uppercase)
