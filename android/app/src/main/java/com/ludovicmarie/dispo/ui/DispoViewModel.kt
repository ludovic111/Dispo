package com.ludovicmarie.dispo.ui

import android.app.Application
import androidx.core.content.edit
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.ludovicmarie.dispo.BuildConfig
import com.ludovicmarie.dispo.data.AndroidAssetSeedDataSource
import com.ludovicmarie.dispo.data.Conversation
import com.ludovicmarie.dispo.data.DemoData
import com.ludovicmarie.dispo.data.Genre
import com.ludovicmarie.dispo.data.GigRequest
import com.ludovicmarie.dispo.data.Instrument
import com.ludovicmarie.dispo.data.Message
import java.time.Instant
import java.time.temporal.ChronoUnit
import java.util.UUID
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

enum class DispoTab { HOME, SOS, MESSAGES, PROFILE }

data class DispoUiState(
    val isLoading: Boolean = true,
    val error: String? = null,
    val data: DemoData? = null,
    val selectedTab: DispoTab = DispoTab.HOME,
    val query: String = "",
    val tonightOnly: Boolean = false,
    val favoriteIds: Set<String> = emptySet(),
    val appliedEventIds: Set<String> = emptySet(),
    val selectedMusicianId: String? = null,
    val selectedConversationId: String? = null,
    val onboardingComplete: Boolean = false,
    val premiumDemo: Boolean = false,
    val backendConfigured: Boolean = false,
)

class DispoViewModel(application: Application) : AndroidViewModel(application) {
    private val preferences = application.getSharedPreferences(PREFERENCES, 0)
    private val seedDataSource = AndroidAssetSeedDataSource(application)

    private val _state = MutableStateFlow(
        DispoUiState(
            onboardingComplete = preferences.getBoolean(KEY_ONBOARDING, false),
            premiumDemo = preferences.getBoolean(KEY_PREMIUM_DEMO, false),
            favoriteIds = preferences.getStringSet(KEY_FAVORITES, emptySet()).orEmpty(),
            backendConfigured = BuildConfig.SUPABASE_URL.isNotBlank() &&
                BuildConfig.SUPABASE_PUBLISHABLE_KEY.isNotBlank(),
        ),
    )
    val state: StateFlow<DispoUiState> = _state.asStateFlow()

    init {
        loadSeed()
    }

    private fun loadSeed() {
        viewModelScope.launch {
            _state.update { it.copy(isLoading = true, error = null) }
            runCatching {
                withContext(Dispatchers.IO) { seedDataSource.load() }
            }.onSuccess { data ->
                _state.update { it.copy(isLoading = false, data = data) }
            }.onFailure { error ->
                _state.update {
                    it.copy(
                        isLoading = false,
                        error = error.message ?: "Impossible de charger la démo.",
                    )
                }
            }
        }
    }

    fun completeOnboarding() {
        preferences.edit { putBoolean(KEY_ONBOARDING, true) }
        _state.update { it.copy(onboardingComplete = true) }
    }

    fun selectTab(tab: DispoTab) {
        _state.update {
            it.copy(
                selectedTab = tab,
                selectedConversationId = null,
                selectedMusicianId = null,
            )
        }
    }

    fun setQuery(query: String) {
        _state.update { it.copy(query = query) }
    }

    fun toggleTonightOnly() {
        _state.update { it.copy(tonightOnly = !it.tonightOnly) }
    }

    fun openMusician(id: String?) {
        _state.update { it.copy(selectedMusicianId = id) }
    }

    fun toggleFavorite(id: String) {
        val newFavorites = _state.value.favoriteIds.toMutableSet().apply {
            if (!add(id)) remove(id)
        }.toSet()
        preferences.edit { putStringSet(KEY_FAVORITES, newFavorites) }
        _state.update { it.copy(favoriteIds = newFavorites) }
    }

    fun setPremiumDemo(enabled: Boolean) {
        // This flag is intentionally local. It never writes profiles.is_premium.
        preferences.edit { putBoolean(KEY_PREMIUM_DEMO, enabled) }
        _state.update { it.copy(premiumDemo = enabled) }
    }

    fun applyToGig(id: String) {
        _state.update { it.copy(appliedEventIds = it.appliedEventIds + id) }
    }

    fun createGig(title: String, instrument: Instrument, fee: Int?) {
        val cleanTitle = title.trim().ifBlank { "Remplacement ${instrument.wireName}" }
        val event = GigRequest(
            id = UUID.randomUUID().toString(),
            title = cleanTitle,
            hostName = "Ludovic",
            date = Instant.now().plus(1, ChronoUnit.DAYS).plus(4, ChronoUnit.HOURS),
            place = "Genève",
            neighborhood = "Centre",
            genre = Genre.JAZZ,
            wantedInstruments = listOf(instrument),
            fee = fee,
            description = "Annonce créée dans la démo Android.",
            isMine = true,
            postedAt = Instant.now(),
        )
        _state.update { current ->
            val data = current.data ?: return@update current
            current.copy(data = data.copy(events = listOf(event) + data.events))
        }
    }

    fun openConversation(id: String?) {
        _state.update { it.copy(selectedConversationId = id) }
    }

    fun contactMusician(musicianId: String) {
        _state.update { current ->
            val data = current.data ?: return@update current
            val musician = data.musicians.firstOrNull { it.id == musicianId }
                ?: return@update current
            val existing = data.conversations.firstOrNull { it.contactName == musician.name }
            if (existing != null) {
                return@update current.copy(
                    selectedMusicianId = null,
                    selectedConversationId = existing.id,
                    selectedTab = DispoTab.MESSAGES,
                )
            }
            val newConversation = Conversation(
                id = UUID.randomUUID().toString(),
                contactName = musician.name,
                contactInstrument = musician.instruments.first(),
                messages = emptyList(),
            )
            current.copy(
                data = data.copy(conversations = listOf(newConversation) + data.conversations),
                selectedMusicianId = null,
                selectedConversationId = newConversation.id,
                selectedTab = DispoTab.MESSAGES,
            )
        }
    }

    fun sendMessage(conversationId: String, text: String) {
        val cleanText = text.trim()
        if (cleanText.isBlank()) return
        appendMessage(
            conversationId,
            Message(UUID.randomUUID().toString(), cleanText, true, Instant.now()),
        )
        viewModelScope.launch {
            delay(1_100)
            appendMessage(
                conversationId,
                Message(
                    id = UUID.randomUUID().toString(),
                    text = "Super, merci ! On se confirme les détails très vite 🎶",
                    isFromMe = false,
                    date = Instant.now(),
                ),
            )
        }
    }

    private fun appendMessage(conversationId: String, message: Message) {
        _state.update { current ->
            val data = current.data ?: return@update current
            current.copy(
                data = data.copy(
                    conversations = data.conversations.map { conversation ->
                        if (conversation.id == conversationId) {
                            conversation.copy(messages = conversation.messages + message)
                        } else {
                            conversation
                        }
                    },
                ),
            )
        }
    }

    fun resetDemo() {
        preferences.edit {
            remove(KEY_FAVORITES)
            remove(KEY_PREMIUM_DEMO)
        }
        _state.update {
            it.copy(
                favoriteIds = emptySet(),
                appliedEventIds = emptySet(),
                premiumDemo = false,
                query = "",
                tonightOnly = false,
                selectedMusicianId = null,
                selectedConversationId = null,
            )
        }
        loadSeed()
    }

    companion object {
        private const val PREFERENCES = "dispo_demo"
        private const val KEY_ONBOARDING = "onboarding_complete"
        private const val KEY_PREMIUM_DEMO = "premium_demo"
        private const val KEY_FAVORITES = "favorite_ids"
    }
}
