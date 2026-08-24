package com.ludovicmarie.dispo.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawing
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Bolt
import androidx.compose.material.icons.filled.ChatBubble
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.MusicNote
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import com.ludovicmarie.dispo.ui.theme.DispoCoral
import com.ludovicmarie.dispo.ui.theme.DispoPurple
import com.ludovicmarie.dispo.ui.theme.DispoViolet

@Composable
fun DispoApp(viewModel: DispoViewModel = viewModel()) {
    val state by viewModel.state.collectAsStateWithLifecycle()

    if (!state.onboardingComplete) {
        OnboardingScreen(onContinue = viewModel::completeOnboarding)
        return
    }

    if (state.isLoading) {
        Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                DemoAssetImage("logo_mark", "Logo Dispo", Modifier.size(92.dp).clip(CircleShape))
                Spacer(Modifier.height(18.dp))
                CircularProgressIndicator()
                Spacer(Modifier.height(10.dp))
                Text("Préparation de la scène…")
            }
        }
        return
    }

    state.error?.let { error ->
        Box(
            modifier = Modifier.fillMaxSize().padding(28.dp),
            contentAlignment = Alignment.Center,
        ) {
            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                Icon(Icons.Filled.MusicNote, null, Modifier.size(54.dp))
                Spacer(Modifier.height(14.dp))
                Text("La démo ne peut pas démarrer", style = MaterialTheme.typography.titleLarge)
                Text(error, textAlign = TextAlign.Center)
                Spacer(Modifier.height(18.dp))
                Button(onClick = viewModel::resetDemo) { Text("Réessayer") }
            }
        }
        return
    }

    Scaffold(
        modifier = Modifier.fillMaxSize(),
        bottomBar = {
            if (state.selectedConversationId == null) {
                DispoNavigationBar(
                    selected = state.selectedTab,
                    onSelect = viewModel::selectTab,
                )
            }
        },
    ) { contentPadding ->
        val screenModifier = Modifier.fillMaxSize().padding(contentPadding)
        when (state.selectedTab) {
            DispoTab.HOME -> HomeScreen(
                state = state,
                onQueryChange = viewModel::setQuery,
                onToggleTonight = viewModel::toggleTonightOnly,
                onSelectMusician = viewModel::openMusician,
                modifier = screenModifier,
            )
            DispoTab.SOS -> SosScreen(
                state = state,
                onApply = viewModel::applyToGig,
                onCreateGig = viewModel::createGig,
                onSetPremium = viewModel::setPremiumDemo,
                modifier = screenModifier,
            )
            DispoTab.MESSAGES -> MessagesScreen(
                state = state,
                onOpenConversation = viewModel::openConversation,
                onSendMessage = viewModel::sendMessage,
                modifier = screenModifier,
            )
            DispoTab.PROFILE -> ProfileScreen(
                state = state,
                onSetPremium = viewModel::setPremiumDemo,
                onResetDemo = viewModel::resetDemo,
                modifier = screenModifier,
            )
        }
    }

    val selectedMusician = state.data?.musicians
        ?.firstOrNull { it.id == state.selectedMusicianId }
    selectedMusician?.let { musician ->
        MusicianDetailSheet(
            musician = musician,
            favorite = musician.id in state.favoriteIds,
            onDismiss = { viewModel.openMusician(null) },
            onToggleFavorite = { viewModel.toggleFavorite(musician.id) },
            onContact = { viewModel.contactMusician(musician.id) },
        )
    }
}

@Composable
private fun DispoNavigationBar(
    selected: DispoTab,
    onSelect: (DispoTab) -> Unit,
) {
    NavigationBar {
        NavigationBarItem(
            selected = selected == DispoTab.HOME,
            onClick = { onSelect(DispoTab.HOME) },
            icon = { Icon(Icons.Filled.Home, contentDescription = null) },
            label = { Text("Accueil") },
        )
        NavigationBarItem(
            selected = selected == DispoTab.SOS,
            onClick = { onSelect(DispoTab.SOS) },
            icon = { Icon(Icons.Filled.Bolt, contentDescription = null) },
            label = { Text("SOS") },
        )
        NavigationBarItem(
            selected = selected == DispoTab.MESSAGES,
            onClick = { onSelect(DispoTab.MESSAGES) },
            icon = { Icon(Icons.Filled.ChatBubble, contentDescription = null) },
            label = { Text("Messages") },
        )
        NavigationBarItem(
            selected = selected == DispoTab.PROFILE,
            onClick = { onSelect(DispoTab.PROFILE) },
            icon = { Icon(Icons.Filled.Person, contentDescription = null) },
            label = { Text("Profil") },
        )
    }
}

@Composable
private fun OnboardingScreen(onContinue: () -> Unit) {
    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(
                Brush.linearGradient(
                    listOf(Color(0xFF1D0F3A), DispoPurple, DispoViolet, DispoCoral),
                ),
            )
            .windowInsetsPadding(WindowInsets.safeDrawing)
            .padding(24.dp),
    ) {
        Column(
            modifier = Modifier.fillMaxSize(),
            verticalArrangement = Arrangement.SpaceBetween,
        ) {
            Column {
                DemoAssetImage(
                    assetName = "logo_mark",
                    contentDescription = "Logo Dispo",
                    modifier = Modifier.size(88.dp).clip(RoundedCornerShape(24.dp)),
                )
                Spacer(Modifier.height(28.dp))
                Text(
                    "Le concert continue.",
                    color = Color.White,
                    style = MaterialTheme.typography.displaySmall,
                )
                Text(
                    "Trouve le bon musicien quand un membre du groupe n’est plus disponible.",
                    color = Color.White.copy(alpha = 0.82f),
                    style = MaterialTheme.typography.titleLarge,
                    modifier = Modifier.padding(top = 10.dp),
                )
            }

            Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                OnboardingFeature(Icons.Filled.Search, "Découvre", "20 musiciens de démonstration autour de Genève")
                OnboardingFeature(Icons.Filled.Bolt, "Réagis", "Publie un SOS et trouve les meilleurs profils")
                OnboardingFeature(Icons.Filled.ChatBubble, "Organise", "Discute du répertoire, du cachet et de la balance")
            }

            Column {
                Button(
                    onClick = onContinue,
                    modifier = Modifier.fillMaxWidth().height(56.dp),
                ) {
                    Text("Explorer la démo Android")
                }
                Text(
                    "Fonctionne hors ligne · aucune inscription nécessaire",
                    modifier = Modifier.fillMaxWidth().padding(top = 12.dp),
                    textAlign = TextAlign.Center,
                    color = Color.White.copy(alpha = 0.72f),
                    style = MaterialTheme.typography.bodyMedium,
                )
            }
        }
    }
}

@Composable
private fun OnboardingFeature(
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    title: String,
    body: String,
) {
    Surface(
        color = Color.White.copy(alpha = 0.13f),
        contentColor = Color.White,
        shape = RoundedCornerShape(20.dp),
        modifier = Modifier.fillMaxWidth(),
    ) {
        Row(
            modifier = Modifier.padding(15.dp),
            horizontalArrangement = Arrangement.spacedBy(14.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Surface(color = Color.White.copy(alpha = 0.16f), shape = CircleShape) {
                Icon(icon, null, Modifier.padding(10.dp).size(22.dp))
            }
            Column {
                Text(title, fontWeight = FontWeight.Bold)
                Text(body, color = Color.White.copy(alpha = 0.78f), style = MaterialTheme.typography.bodyMedium)
            }
        }
    }
}
