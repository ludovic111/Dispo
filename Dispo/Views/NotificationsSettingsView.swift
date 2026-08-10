import SwiftUI

/// Réglages explicites des alertes locales et APNs. La demande système n'est
/// déclenchée qu'après une action volontaire de l'utilisateur.
struct NotificationsSettingsView: View {
    @EnvironmentObject private var store: AppStore
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            ZStack {
                JCBackground()
                ScrollView {
                    VStack(spacing: 16) {
                        introCard
                        masterCard
                        if store.notificationsEnabled {
                            categoriesCard
                            testCard
                        }
                    }
                    .padding(18)
                }
            }
            .navigationTitle("Notifications")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("OK") { dismiss() }
                        .font(.headline)
                }
            }
            .task {
                await store.refreshNotificationAuthorization(registerIfAllowed: true)
            }
        }
    }

    private var introCard: some View {
        JCCard {
            HStack(alignment: .top, spacing: 13) {
                Image(systemName: "bell.and.waves.left.and.right.fill")
                    .font(.title2)
                    .foregroundStyle(JC.laiton)
                    .frame(width: 36)
                VStack(alignment: .leading, spacing: 5) {
                    Text("Ne rate plus une occasion de jouer")
                        .font(.headline)
                    Text("Choisis seulement les alertes utiles. Un appui sur une notification ouvre directement la bonne conversation ou le bon SOS.")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                }
            }
        }
    }

    private var masterCard: some View {
        JCCard {
            VStack(spacing: 12) {
                Toggle(isOn: Binding(
                    get: { store.notificationsEnabled },
                    set: { enabled in Task { await store.setNotifications(enabled) } }
                )) {
                    VStack(alignment: .leading, spacing: 2) {
                        Text("Autoriser les notifications")
                            .font(.subheadline.weight(.bold))
                        Text(store.notificationStatusLabel)
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                }
                .tint(JC.laiton)

                if store.notificationsNeedSystemSettings {
                    Divider()
                    Button {
                        store.openNotificationSettings()
                    } label: {
                        Label("Ouvrir les réglages iOS", systemImage: "gear")
                            .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.borderedProminent)
                    .tint(JC.laiton)
                }

                if let error = store.pushRegistrationError {
                    Label(error, systemImage: "exclamationmark.triangle.fill")
                        .font(.caption)
                        .foregroundStyle(JC.signal)
                        .frame(maxWidth: .infinity, alignment: .leading)
                }
            }
        }
    }

    private var categoriesCard: some View {
        JCCard {
            VStack(alignment: .leading, spacing: 14) {
                Text("M’alerter pour")
                    .font(.headline)
                categoryToggle(
                    .sos,
                    title: "SOS compatibles",
                    detail: "Un concert cherche ton instrument",
                    icon: "bolt.fill",
                    color: JC.signal
                )
                Divider()
                categoryToggle(
                    .messages,
                    title: "Messages et candidatures",
                    detail: "Une réponse ou une nouvelle candidature",
                    icon: "bubble.left.and.bubble.right.fill",
                    color: JC.bronze
                )
                Divider()
                categoryToggle(
                    .groups,
                    title: "Événements de groupe",
                    detail: "Concerts, répétitions et jams ajoutés",
                    icon: "person.3.fill",
                    color: JC.laiton
                )
            }
        }
    }

    private func categoryToggle(
        _ category: PushCategory,
        title: LocalizedStringKey,
        detail: LocalizedStringKey,
        icon: String,
        color: Color
    ) -> some View {
        Toggle(isOn: Binding(
            get: { store.pushPreferences.isEnabled(category) },
            set: { store.setPushPreference(category, enabled: $0) }
        )) {
            HStack(spacing: 11) {
                Image(systemName: icon)
                    .font(.subheadline.weight(.bold))
                    .foregroundStyle(color)
                    .frame(width: 28)
                VStack(alignment: .leading, spacing: 2) {
                    Text(title)
                        .font(.subheadline.weight(.semibold))
                    Text(detail)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }
        }
        .tint(color)
    }

    private var testCard: some View {
        JCCard {
            VStack(alignment: .leading, spacing: 10) {
                Text("Vérifier sur cet iPhone")
                    .font(.headline)
                Text(store.isLive
                    ? LocalizedStringKey("Le test ci-dessous est local. Les alertes distantes utilisent aussi ton compte Dispo et ce téléphone.")
                    : "En mode démo, seuls les rappels locaux sont disponibles.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                Button {
                    store.sendTestNotification()
                } label: {
                    Label("Envoyer une notification de test", systemImage: "paperplane.fill")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.bordered)
                .tint(JC.laiton)
            }
        }
    }
}
