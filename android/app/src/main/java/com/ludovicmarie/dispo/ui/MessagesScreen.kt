package com.ludovicmarie.dispo.ui

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.Send
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.ElevatedCard
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.ludovicmarie.dispo.data.Conversation
import com.ludovicmarie.dispo.data.Message
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale

@Composable
fun MessagesScreen(
    state: DispoUiState,
    onOpenConversation: (String?) -> Unit,
    onSendMessage: (String, String) -> Unit,
    modifier: Modifier = Modifier,
) {
    val conversation = state.data?.conversations
        ?.firstOrNull { it.id == state.selectedConversationId }

    if (conversation != null) {
        ConversationScreen(
            conversation = conversation,
            photo = state.data.musicians
                .firstOrNull { it.name == conversation.contactName }?.photo,
            onBack = { onOpenConversation(null) },
            onSend = { onSendMessage(conversation.id, it) },
            modifier = modifier,
        )
    } else {
        ConversationList(
            conversations = state.data?.conversations.orEmpty(),
            photosByName = state.data?.musicians.orEmpty().associate { it.name to it.photo },
            onOpen = onOpenConversation,
            modifier = modifier,
        )
    }
}

@Composable
private fun ConversationList(
    conversations: List<Conversation>,
    photosByName: Map<String, String?>,
    onOpen: (String) -> Unit,
    modifier: Modifier = Modifier,
) {
    LazyColumn(
        modifier = modifier,
        contentPadding = PaddingValues(start = 20.dp, end = 20.dp, top = 16.dp, bottom = 28.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        item {
            Text("Messages", style = MaterialTheme.typography.headlineMedium)
            Text(
                "Organise les détails du prochain concert",
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Spacer(Modifier.height(8.dp))
        }
        items(conversations, key = Conversation::id) { conversation ->
            ElevatedCard(
                onClick = { onOpen(conversation.id) },
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(22.dp),
                colors = CardDefaults.elevatedCardColors(containerColor = MaterialTheme.colorScheme.surface),
            ) {
                Row(
                    modifier = Modifier.padding(14.dp),
                    horizontalArrangement = Arrangement.spacedBy(14.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    DemoAssetImage(
                        photosByName[conversation.contactName],
                        "Portrait de ${conversation.contactName}",
                        Modifier.size(62.dp).clip(CircleShape),
                    )
                    Column(modifier = Modifier.weight(1f)) {
                        Row(modifier = Modifier.fillMaxWidth()) {
                            Text(
                                conversation.contactName,
                                style = MaterialTheme.typography.titleMedium,
                                modifier = Modifier.weight(1f),
                            )
                            conversation.lastMessage?.let {
                                Text(
                                    it.date.atZone(ZoneId.systemDefault()).format(messageTimeFormatter),
                                    style = MaterialTheme.typography.bodyMedium,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                )
                            }
                        }
                        Text(
                            conversation.contactInstrument.wireName,
                            color = MaterialTheme.colorScheme.primary,
                            fontWeight = FontWeight.SemiBold,
                        )
                        Text(
                            conversation.lastMessage?.text ?: "Commencer la conversation",
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun ConversationScreen(
    conversation: Conversation,
    photo: String?,
    onBack: () -> Unit,
    onSend: (String) -> Unit,
    modifier: Modifier = Modifier,
) {
    var draft by rememberSaveable(conversation.id) { mutableStateOf("") }
    BackHandler(onBack = onBack)

    Column(modifier = modifier.fillMaxSize()) {
        Row(
            modifier = Modifier.fillMaxWidth().padding(horizontal = 8.dp, vertical = 10.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            IconButton(onClick = onBack) {
                Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Retour")
            }
            DemoAssetImage(
                photo,
                "Portrait de ${conversation.contactName}",
                Modifier.size(44.dp).clip(CircleShape),
            )
            Column(Modifier.padding(start = 12.dp)) {
                Text(conversation.contactName, style = MaterialTheme.typography.titleMedium)
                Text(
                    conversation.contactInstrument.wireName,
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.primary,
                )
            }
        }

        LazyColumn(
            modifier = Modifier.weight(1f).fillMaxWidth(),
            contentPadding = PaddingValues(horizontal = 16.dp, vertical = 10.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            if (conversation.messages.isEmpty()) {
                item {
                    Box(
                        modifier = Modifier.fillParentMaxHeight(0.7f).fillMaxWidth(),
                        contentAlignment = Alignment.Center,
                    ) {
                        Column(horizontalAlignment = Alignment.CenterHorizontally) {
                            Text("Dis bonjour 👋", style = MaterialTheme.typography.titleLarge)
                            Text("Discutez du répertoire, de la balance et du cachet.")
                        }
                    }
                }
            }
            items(conversation.messages, key = Message::id) { message ->
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = if (message.isFromMe) Arrangement.End else Arrangement.Start,
                ) {
                    Surface(
                        color = if (message.isFromMe) {
                            MaterialTheme.colorScheme.primary
                        } else {
                            MaterialTheme.colorScheme.surfaceVariant
                        },
                        contentColor = if (message.isFromMe) {
                            MaterialTheme.colorScheme.onPrimary
                        } else {
                            MaterialTheme.colorScheme.onSurfaceVariant
                        },
                        shape = RoundedCornerShape(
                            topStart = 20.dp,
                            topEnd = 20.dp,
                            bottomStart = if (message.isFromMe) 20.dp else 5.dp,
                            bottomEnd = if (message.isFromMe) 5.dp else 20.dp,
                        ),
                        modifier = Modifier.fillMaxWidth(0.82f),
                    ) {
                        Column(Modifier.padding(horizontal = 15.dp, vertical = 10.dp)) {
                            Text(message.text)
                            Text(
                                message.date.atZone(ZoneId.systemDefault()).format(messageTimeFormatter),
                                style = MaterialTheme.typography.bodyMedium,
                                modifier = Modifier.align(Alignment.End),
                                color = if (message.isFromMe) {
                                    MaterialTheme.colorScheme.onPrimary.copy(alpha = 0.68f)
                                } else {
                                    MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.68f)
                                },
                            )
                        }
                    }
                }
            }
        }

        Row(
            modifier = Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 8.dp),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            OutlinedTextField(
                value = draft,
                onValueChange = { draft = it },
                modifier = Modifier.weight(1f),
                placeholder = { Text("Écrire un message…") },
                shape = RoundedCornerShape(22.dp),
                keyboardOptions = KeyboardOptions(imeAction = ImeAction.Send),
                keyboardActions = KeyboardActions(
                    onSend = {
                        onSend(draft)
                        draft = ""
                    },
                ),
                maxLines = 4,
            )
            IconButton(
                onClick = {
                    onSend(draft)
                    draft = ""
                },
                enabled = draft.isNotBlank(),
            ) {
                Icon(Icons.AutoMirrored.Filled.Send, contentDescription = "Envoyer")
            }
        }
    }
}

private val messageTimeFormatter = DateTimeFormatter.ofPattern("HH:mm", Locale.FRENCH)
