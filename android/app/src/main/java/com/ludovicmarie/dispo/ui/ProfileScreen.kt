package com.ludovicmarie.dispo.ui

import androidx.compose.foundation.background
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
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CalendarMonth
import androidx.compose.material.icons.filled.CloudDone
import androidx.compose.material.icons.filled.CloudOff
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Security
import androidx.compose.material.icons.filled.Star
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.ElevatedCard
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.ludovicmarie.dispo.ui.theme.DispoGold
import com.ludovicmarie.dispo.ui.theme.DispoPurple
import com.ludovicmarie.dispo.ui.theme.DispoViolet

@Composable
fun ProfileScreen(
    state: DispoUiState,
    onSetPremium: (Boolean) -> Unit,
    onResetDemo: () -> Unit,
    modifier: Modifier = Modifier,
) {
    var showPremiumDialog by remember { mutableStateOf(false) }
    var showResetDialog by remember { mutableStateOf(false) }
    var selectedDays by remember { mutableStateOf(setOf(1, 3, 5)) }
    val dayLabels = listOf("L", "M", "M", "J", "V", "S", "D")

    LazyColumn(
        modifier = modifier,
        contentPadding = PaddingValues(start = 20.dp, end = 20.dp, top = 16.dp, bottom = 28.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        item { Text("Mon profil", style = MaterialTheme.typography.headlineMedium) }

        item {
            ElevatedCard(
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(28.dp),
                colors = CardDefaults.elevatedCardColors(containerColor = MaterialTheme.colorScheme.surface),
            ) {
                Column(
                    modifier = Modifier.fillMaxWidth().padding(22.dp),
                    horizontalAlignment = Alignment.CenterHorizontally,
                ) {
                    DemoAssetImage(
                        "logo_mark",
                        "Logo Dispo",
                        Modifier.size(96.dp).clip(CircleShape),
                    )
                    Spacer(Modifier.height(12.dp))
                    Text("Ludovic", style = MaterialTheme.typography.headlineMedium)
                    Text(
                        "Piano · Jazz & Latin · Genève",
                        color = MaterialTheme.colorScheme.primary,
                        fontWeight = FontWeight.SemiBold,
                    )
                    Text("@ludovic", color = MaterialTheme.colorScheme.onSurfaceVariant)
                    Spacer(Modifier.height(18.dp))
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceEvenly,
                    ) {
                        ProfileStat("${state.favoriteIds.size}", "Favoris")
                        ProfileStat("12", "Concerts")
                        ProfileStat("4.9", "Appréciation")
                    }
                }
            }
        }

        item {
            Surface(
                color = Color.Transparent,
                shape = RoundedCornerShape(26.dp),
                modifier = Modifier.fillMaxWidth(),
                onClick = { showPremiumDialog = true },
            ) {
                Box(
                    modifier = Modifier
                        .background(Brush.linearGradient(listOf(DispoPurple, DispoViolet)))
                        .padding(20.dp),
                ) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Surface(color = DispoGold, shape = CircleShape) {
                            Icon(
                                Icons.Filled.Star,
                                contentDescription = null,
                                tint = Color(0xFF2A2100),
                                modifier = Modifier.padding(12.dp).size(24.dp),
                            )
                        }
                        Column(Modifier.weight(1f).padding(horizontal = 14.dp)) {
                            Text(
                                if (state.premiumDemo) "Premium démo actif" else "Passer à Premium",
                                color = Color.White,
                                style = MaterialTheme.typography.titleLarge,
                            )
                            Text(
                                "Priorité SOS, profil mis en avant et matching illimité",
                                color = Color.White.copy(alpha = 0.8f),
                                style = MaterialTheme.typography.bodyMedium,
                            )
                        }
                        Text("›", color = Color.White, style = MaterialTheme.typography.headlineMedium)
                    }
                }
            }
        }

        item {
            SettingsCard(
                icon = { Icon(Icons.Filled.CalendarMonth, null) },
                title = "Mes disponibilités",
                subtitle = "Jours où les groupes peuvent te contacter",
            ) {
                Row(
                    modifier = Modifier.fillMaxWidth().padding(top = 14.dp),
                    horizontalArrangement = Arrangement.SpaceBetween,
                ) {
                    dayLabels.forEachIndexed { index, label ->
                        val selected = index in selectedDays
                        Surface(
                            onClick = {
                                selectedDays = if (selected) selectedDays - index else selectedDays + index
                            },
                            color = if (selected) MaterialTheme.colorScheme.primary else
                                MaterialTheme.colorScheme.surfaceVariant,
                            contentColor = if (selected) MaterialTheme.colorScheme.onPrimary else
                                MaterialTheme.colorScheme.onSurfaceVariant,
                            shape = CircleShape,
                            modifier = Modifier.size(40.dp),
                        ) {
                            Box(contentAlignment = Alignment.Center) {
                                Text(label, fontWeight = FontWeight.Bold)
                            }
                        }
                    }
                }
            }
        }

        item {
            SettingsCard(
                icon = {
                    Icon(
                        if (state.backendConfigured) Icons.Filled.CloudDone else Icons.Filled.CloudOff,
                        contentDescription = null,
                    )
                },
                title = if (state.backendConfigured) "Supabase configuré" else "Mode démo hors ligne",
                subtitle = if (state.backendConfigured) {
                    "La configuration publishable est présente; cette bêta garde encore les données locales."
                } else {
                    "Aucun compte ni donnée personnelle n’est envoyé. Configure local.properties pour le futur mode live."
                },
            )
        }

        item {
            SettingsCard(
                icon = { Icon(Icons.Filled.Security, null) },
                title = "Données et confidentialité",
                subtitle = "La démo conserve seulement les favoris et réglages sur cet appareil. Le mode live devra proposer suppression du compte et politique de confidentialité publique.",
            )
        }

        item {
            OutlinedButton(
                onClick = { showResetDialog = true },
                modifier = Modifier.fillMaxWidth().height(52.dp),
            ) {
                Icon(Icons.Filled.Refresh, null)
                Text(" Réinitialiser la démo")
            }
            Text(
                "Android MVP · 0.9.0 · API 36",
                modifier = Modifier.fillMaxWidth().padding(top = 14.dp),
                textAlign = TextAlign.Center,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                style = MaterialTheme.typography.bodyMedium,
            )
        }
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
    if (showResetDialog) {
        AlertDialog(
            onDismissRequest = { showResetDialog = false },
            icon = { Icon(Icons.Filled.Refresh, null) },
            title = { Text("Réinitialiser la démo ?") },
            text = { Text("Les favoris, candidatures, messages ajoutés et le mode Premium démo seront effacés.") },
            confirmButton = {
                Button(
                    onClick = {
                        onResetDemo()
                        showResetDialog = false
                    },
                ) { Text("Réinitialiser") }
            },
            dismissButton = { TextButton(onClick = { showResetDialog = false }) { Text("Annuler") } },
        )
    }
}

@Composable
private fun ProfileStat(value: String, label: String) {
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        Text(value, style = MaterialTheme.typography.titleLarge)
        Text(label, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}

@Composable
private fun SettingsCard(
    icon: @Composable () -> Unit,
    title: String,
    subtitle: String,
    content: (@Composable () -> Unit)? = null,
) {
    ElevatedCard(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(22.dp),
        colors = CardDefaults.elevatedCardColors(containerColor = MaterialTheme.colorScheme.surface),
    ) {
        Column(Modifier.padding(18.dp)) {
            Row(
                horizontalArrangement = Arrangement.spacedBy(14.dp),
                verticalAlignment = Alignment.Top,
            ) {
                Surface(
                    color = MaterialTheme.colorScheme.primaryContainer,
                    shape = RoundedCornerShape(14.dp),
                ) {
                    Box(Modifier.padding(10.dp)) { icon() }
                }
                Column(modifier = Modifier.weight(1f)) {
                    Text(title, style = MaterialTheme.typography.titleMedium)
                    Text(
                        subtitle,
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
            content?.invoke()
        }
    }
}
