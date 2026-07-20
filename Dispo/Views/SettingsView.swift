import SwiftUI

/// Réglages de l'application — séparés du profil, rangés par catégories :
/// compte, notifications, préférences, abonnement, aide & infos.
struct SettingsSheet: View {
    @EnvironmentObject private var store: AppStore
    @Environment(\.dismiss) private var dismiss
    @State private var showAccount = false
    @State private var showNotifications = false
    @State private var showLanguageRegion = false
    @State private var showPatchNotes = false
    @State private var showResetConfirmation = false

    /// Pages d'assistance du site, dans la langue de l'interface.
    private var supportURL: URL? {
        URL(string: store.language == .french
            ? "https://dispoapp.net/support-fr"
            : "https://dispoapp.net/support-en")
    }

    private var privacyURL: URL? {
        URL(string: store.language == .french
            ? "https://dispoapp.net/privacy"
            : "https://dispoapp.net/privacy-en")
    }

    var body: some View {
        NavigationStack {
            Form {
                accountSection
                notificationsSection
                preferencesSection
                premiumSection
                helpSection
                if !store.isLive { demoSection }
                footerSection
            }
            .scrollContentBackground(.hidden)
            .background(JC.bg)
            .navigationTitle("Réglages")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("OK") { dismiss() }.font(.headline)
                }
            }
            .sheet(isPresented: $showAccount) { AccountSheet() }
            .sheet(isPresented: $showNotifications) { NotificationsSettingsView() }
            .sheet(isPresented: $showLanguageRegion) { LanguageRegionSheet() }
            .sheet(isPresented: $showPatchNotes) { PatchNotesView() }
            .confirmationDialog(
                "Réinitialiser toutes les données de la démo ?",
                isPresented: $showResetConfirmation,
                titleVisibility: .visible
            ) {
                Button("Réinitialiser", role: .destructive) { store.resetDemo() }
            }
        }
    }

    // MARK: - Compte

    private var accountSection: some View {
        Section("Compte") {
            Button { showAccount = true } label: {
                HStack(spacing: 12) {
                    settingsIcon(
                        store.isLive ? "person.crop.circle.badge.checkmark" : "person.crop.circle.badge.plus",
                        store.isLive ? .green : JC.violet
                    )
                    VStack(alignment: .leading, spacing: 2) {
                        Text(store.isLive ? "Mon compte" : "Se connecter")
                            .foregroundStyle(.primary)
                        if let email = store.liveEmail {
                            Text(verbatim: email)
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                    }
                    Spacer()
                    chevron
                }
            }
        }
    }

    // MARK: - Notifications

    private var notificationsSection: some View {
        Section("Notifications") {
            Button { showNotifications = true } label: {
                HStack(spacing: 12) {
                    settingsIcon("bell.badge.fill", JC.coral)
                    Text("Notifications")
                        .foregroundStyle(.primary)
                    Spacer()
                    Text(store.notificationStatusLabel)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                    chevron
                }
            }
        }
    }

    // MARK: - Préférences

    private var preferencesSection: some View {
        Section("Préférences") {
            HStack(spacing: 12) {
                settingsIcon(store.theme.symbol, JC.gold)
                Picker("Apparence", selection: Binding(
                    get: { store.theme },
                    set: { store.setTheme($0) }
                )) {
                    ForEach(AppTheme.allCases) { option in
                        Text(LocalizedStringKey(option.label)).tag(option)
                    }
                }
            }
            Button { showLanguageRegion = true } label: {
                HStack(spacing: 12) {
                    settingsIcon("globe", JC.violet)
                    Text("Langue & région")
                        .foregroundStyle(.primary)
                    Spacer()
                    Text(verbatim: "\(store.language.flag) \(store.profile.cityLabel)")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                    chevron
                }
            }
        }
    }

    // MARK: - Abonnement

    private var premiumSection: some View {
        Section("Abonnement") {
            if store.isPremium {
                HStack(spacing: 12) {
                    settingsIcon("crown.fill", JC.gold)
                    VStack(alignment: .leading, spacing: 2) {
                        Text("Premium actif")
                            .foregroundStyle(.primary)
                        if let plan = store.premiumPlan {
                            Text(LocalizedStringKey(plan.title))
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                    }
                }
                if let manageURL = URL(string: "https://apps.apple.com/account/subscriptions") {
                    Link(destination: manageURL) {
                        HStack(spacing: 12) {
                            settingsIcon("gearshape.2.fill", JC.violet)
                            Text("Gérer mon abonnement")
                                .foregroundStyle(.primary)
                            Spacer()
                            Image(systemName: "arrow.up.right")
                                .font(.caption.weight(.bold))
                                .foregroundStyle(.tertiary)
                        }
                    }
                }
            } else {
                Button {
                    dismiss()
                    store.showPaywall = true
                } label: {
                    HStack(spacing: 12) {
                        settingsIcon("crown.fill", JC.gold)
                        VStack(alignment: .leading, spacing: 2) {
                            Text("Découvrir Premium")
                                .foregroundStyle(.primary)
                            Text("Alertes en avance, groupes, 6 vidéos")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                        Spacer()
                        chevron
                    }
                }
            }
            Button {
                Task { await store.restorePurchases() }
            } label: {
                HStack(spacing: 12) {
                    settingsIcon("arrow.clockwise", JC.violet)
                    Text("Restaurer mes achats")
                        .foregroundStyle(.primary)
                    Spacer()
                    if store.purchaseInProgress {
                        ProgressView().controlSize(.small)
                    }
                }
            }
            .disabled(store.purchaseInProgress)
        }
    }

    // MARK: - Aide & infos

    private var helpSection: some View {
        Section("Aide & infos") {
            if let supportMail = URL(string: "mailto:ludovic@dispoapp.net") {
                Link(destination: supportMail) {
                    HStack(spacing: 12) {
                        settingsIcon("envelope.fill", JC.coral)
                        Text("Contacter le support")
                            .foregroundStyle(.primary)
                        Spacer()
                        Text(verbatim: "ludovic@dispoapp.net")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                }
            }
            if let supportURL {
                Link(destination: supportURL) {
                    HStack(spacing: 12) {
                        settingsIcon("questionmark.circle.fill", JC.violet)
                        Text("Centre d'aide")
                            .foregroundStyle(.primary)
                        Spacer()
                        Image(systemName: "arrow.up.right")
                            .font(.caption.weight(.bold))
                            .foregroundStyle(.tertiary)
                    }
                }
            }
            if let privacyURL {
                Link(destination: privacyURL) {
                    HStack(spacing: 12) {
                        settingsIcon("hand.raised.fill", .teal)
                        Text("Confidentialité")
                            .foregroundStyle(.primary)
                        Spacer()
                        Image(systemName: "arrow.up.right")
                            .font(.caption.weight(.bold))
                            .foregroundStyle(.tertiary)
                    }
                }
            }
            Button { showPatchNotes = true } label: {
                HStack(spacing: 12) {
                    settingsIcon("sparkles", JC.violet)
                    Text("Nouveautés")
                        .foregroundStyle(.primary)
                    Spacer()
                    Text(verbatim: "v\(Bundle.main.appVersion)")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                    chevron
                }
            }
        }
    }

    // MARK: - Démo (bac à sable local uniquement)

    private var demoSection: some View {
        Section {
            Button(role: .destructive) {
                showResetConfirmation = true
            } label: {
                HStack(spacing: 12) {
                    settingsIcon("arrow.counterclockwise", .red)
                    Text("Réinitialiser la démo")
                }
            }
        } footer: {
            Text("Efface les données d'exemple de cet appareil. Disponible uniquement hors connexion.")
        }
    }

    private var footerSection: some View {
        Section {
        } footer: {
            Text(verbatim: "Dispo v\(Bundle.main.appVersion) · dispoapp.net")
                .frame(maxWidth: .infinity)
                .multilineTextAlignment(.center)
        }
    }

    // MARK: - Éléments partagés

    private var chevron: some View {
        Image(systemName: "chevron.right")
            .font(.caption.weight(.bold))
            .foregroundStyle(.tertiary)
    }

    private func settingsIcon(_ symbol: String, _ color: Color) -> some View {
        ZStack {
            RoundedRectangle(cornerRadius: 8, style: .continuous)
                .fill(color.opacity(0.14))
                .frame(width: 30, height: 30)
            Image(systemName: symbol)
                .font(.system(size: 13, weight: .semibold))
                .foregroundStyle(color)
        }
    }
}
