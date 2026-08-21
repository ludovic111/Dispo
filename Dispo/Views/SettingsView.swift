import SwiftUI
import AuthenticationServices

/// Réglages de l'application — séparés du profil, rangés par catégories :
/// compte, notifications, préférences, abonnement, aide & infos.
struct SettingsSheet: View {
    @EnvironmentObject private var store: AppStore
    @Environment(\.dismiss) private var dismiss
    @State private var showAccount = false
    @State private var showNotifications = false
    @State private var showLanguageRegion = false
    @State private var showPatchNotes = false
    @State private var showLinkApple = false

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
                locationSection
                premiumSection
                helpSection
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
            .sheet(isPresented: $showLinkApple) {
                LinkAppleSheet()
                    .presentationDetents([.medium])
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
                        store.isLive ? JC.feutrine : JC.bronze
                    )
                    VStack(alignment: .leading, spacing: 2) {
                        // Typé : un ternaire de littéraux donne une String,
                        // et une String n'est jamais localisée.
                        Text(store.isLive ? LocalizedStringKey("Mon compte") : "Se connecter")
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
            // Liaison du compte Apple — connexion en un tap ensuite.
            if store.isLive && AuthForm.isAppleSignInAvailable {
                if store.appleLinked {
                    HStack(spacing: 12) {
                        settingsIcon("applelogo", .primary)
                        Text("Compte Apple")
                            .foregroundStyle(.primary)
                        Spacer()
                        Label("Lié", systemImage: "checkmark.circle.fill")
                            .font(.caption.weight(.bold))
                            .foregroundStyle(JC.feutrine)
                    }
                } else {
                    Button { showLinkApple = true } label: {
                        HStack(spacing: 12) {
                            settingsIcon("applelogo", .primary)
                            VStack(alignment: .leading, spacing: 2) {
                                Text("Lier mon compte Apple")
                                    .foregroundStyle(.primary)
                                Text("Connexion en un tap, sans mot de passe")
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                            }
                            Spacer()
                            chevron
                        }
                    }
                }
            }
        }
    }

    // MARK: - Notifications

    private var notificationsSection: some View {
        Section("Notifications") {
            Button { showNotifications = true } label: {
                HStack(spacing: 12) {
                    settingsIcon("bell.badge.fill", JC.laiton)
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
                settingsIcon(store.theme.symbol, JC.laiton)
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
                    settingsIcon("globe", JC.bronze)
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

    // MARK: - Position

    /// Ce que les autres voient de ma position. Par défaut : niveau ville.
    /// La position exacte est un choix explicite — pour mes amis (suivi
    /// mutuel) ou pour tout le monde.
    private var locationSection: some View {
        Section {
            ForEach(LocationPrecision.allCases) { option in
                Button {
                    store.setLocationPrecision(option)
                } label: {
                    HStack(spacing: 12) {
                        settingsIcon(option.symbol, iconColor(for: option))
                        VStack(alignment: .leading, spacing: 2) {
                            Text(LocalizedStringKey(option.label))
                                .foregroundStyle(.primary)
                            Text(LocalizedStringKey(descriptionKey(for: option)))
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                        Spacer()
                        if store.locationPrecision == option {
                            Image(systemName: "checkmark.circle.fill")
                                .foregroundStyle(JC.laiton)
                        }
                    }
                }
            }
        } header: {
            Text("Ma position")
        } footer: {
            Text("Ta position est relevée quand tu ouvres l'app, jamais en arrière-plan. En approximatif, les autres te situent à ~5 km près — assez pour te trouver dans les recherches, sans révéler ton adresse. En masqué, aucune coordonnée n'est publiée : ton profil reste trouvable par nom, instrument et style.")
        }
    }

    private func iconColor(for option: LocationPrecision) -> Color {
        switch option {
        case .hidden: return .secondary
        case .city: return JC.bronze
        case .exactFriends, .exactEveryone: return JC.laiton
        }
    }

    private func descriptionKey(for option: LocationPrecision) -> String {
        switch option {
        case .hidden: return "Aucune distance affichée — trouvable par nom et instrument"
        case .city: return "Recommandé — visible à ~5 km près"
        case .exactFriends: return "Position précise pour les amis (suivi mutuel)"
        case .exactEveryone: return "Position précise pour tout le réseau"
        }
    }

    // MARK: - Abonnement

    private var premiumSection: some View {
        Section("Abonnement") {
            if AppStore.isBeta {
                // Bêta fermée : rien n'est vendu, rien n'est simulé —
                // tout est simplement ouvert aux testeurs.
                HStack(spacing: 12) {
                    settingsIcon("wrench.and.screwdriver.fill", JC.premiumTint)
                    VStack(alignment: .leading, spacing: 2) {
                        Text("Version bêta — tout est ouvert")
                            .foregroundStyle(.primary)
                        Text("Aucun abonnement pendant les tests. Groupes, alertes en avance et 6 vidéos : c'est offert.")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                }
            } else if store.isPremium {
                HStack(spacing: 12) {
                    settingsIcon("crown.fill", JC.laiton)
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
                            settingsIcon("gearshape.2.fill", JC.bronze)
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
                        settingsIcon("crown.fill", JC.laiton)
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
            // Rien à restaurer tant qu'on ne vend rien.
            if !AppStore.isBeta {
                Button {
                    Task { await store.restorePurchases() }
                } label: {
                    HStack(spacing: 12) {
                        settingsIcon("arrow.clockwise", JC.bronze)
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
    }

    // MARK: - Aide & infos

    private var helpSection: some View {
        Section("Aide & infos") {
            if let supportMail = URL(string: "mailto:ludovic@dispoapp.net") {
                Link(destination: supportMail) {
                    HStack(spacing: 12) {
                        settingsIcon("envelope.fill", JC.laiton)
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
                        settingsIcon("questionmark.circle.fill", JC.bronze)
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
                        settingsIcon("hand.raised.fill", JC.bronze)
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
                    settingsIcon("sparkles", JC.bronze)
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

// MARK: - Liaison du compte Apple

/// Lie le compte Dispo (e-mail) au compte Apple : ensuite, le bouton
/// « Se connecter avec Apple » ouvre ce même compte en un tap.
struct LinkAppleSheet: View {
    @EnvironmentObject private var store: AppStore
    @Environment(\.dismiss) private var dismiss
    @Environment(\.colorScheme) private var colorScheme
    @State private var nonce = ""
    @State private var isLinking = false
    @State private var errorText: String?

    var body: some View {
        NavigationStack {
            ZStack {
                JCBackground()
                VStack(alignment: .leading, spacing: 18) {
                    HStack(spacing: 12) {
                        Image(systemName: "applelogo")
                            .font(.title2.weight(.semibold))
                        Image(systemName: "link")
                            .font(.caption.weight(.bold))
                            .foregroundStyle(.secondary)
                        AvatarView(name: store.profile.name, size: 34)
                    }
                    Text("Lier mon compte Apple")
                        .font(.title3.weight(.heavy))
                    Text("Ton compte Dispo reste le même — tu pourras simplement te reconnecter en un tap avec « Se connecter avec Apple », sans mot de passe.")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)

                    if let errorText {
                        Label(errorText, systemImage: "exclamationmark.triangle.fill")
                            .font(.caption.weight(.semibold))
                            .foregroundStyle(JC.signal)
                    }

                    SignInWithAppleButton(.continue) { request in
                        let raw = AuthForm.randomNonce()
                        nonce = raw
                        request.nonce = AuthForm.sha256(raw)
                    } onCompletion: { result in
                        handle(result)
                    }
                    .signInWithAppleButtonStyle(colorScheme == .dark ? .white : .black)
                    .frame(height: 50)
                    .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
                    .disabled(isLinking)
                    .overlay {
                        if isLinking { ProgressView() }
                    }

                    Spacer(minLength: 0)
                }
                .padding(22)
            }
            .navigationTitle("Compte Apple")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Annuler") { dismiss() }
                }
            }
        }
    }

    private func handle(_ result: Result<ASAuthorization, Error>) {
        guard case .success(let authorization) = result,
              let credential = authorization.credential as? ASAuthorizationAppleIDCredential,
              let tokenData = credential.identityToken,
              let idToken = String(data: tokenData, encoding: .utf8)
        else { return } // Annulé par l'utilisateur : pas d'erreur à afficher.
        isLinking = true
        errorText = nil
        Task {
            let linked = await store.linkAppleAccount(idToken: idToken, nonce: nonce)
            isLinking = false
            if linked {
                dismiss()
            } else {
                errorText = store.tr("La liaison avec Apple a échoué — réessaie.")
            }
        }
    }
}
