import Foundation
import CoreLocation
import SwiftUI
import Supabase
@preconcurrency import UserNotifications
import StoreKit

/// État global de la démo. Charge les données fictives depuis SeedData.json
/// et persiste les actions de l'utilisateur (événements créés, messages,
/// profil, participations) dans UserDefaults.
@MainActor
final class AppStore: ObservableObject {

    /// Position simulée de l'utilisateur : centre de Genève (place du Molard).
    nonisolated static let geneva = CLLocationCoordinate2D(latitude: 46.2044, longitude: 6.1432)

    @Published var musicians: [Musician] = []
    @Published var events: [GigRequest] = []
    @Published var conversations: [Conversation] = []
    @Published var profile: MyProfile

    /// Favoris (par nom — les ids des musiciens seed changent à chaque lancement).
    @Published var favorites: Set<String> = []
    /// Appréciations données par l'utilisateur (par nom de musicien). Positif uniquement :
    /// note de musique (« aimé ») ou note dorée (« coup de cœur »).
    @Published var myAppreciations: [String: Appreciation] = [:]
    /// Abonnement Premium — StoreKit en production, état local de repli en démo.
    @Published var isPremium: Bool = false
    /// Plan choisi (mensuel / annuel), nil si non abonné.
    @Published var premiumPlan: PremiumPlan?
    @Published var showPaywall: Bool = false
    @Published private(set) var storeProducts: [PremiumPlan: Product] = [:]
    @Published private(set) var purchaseInProgress = false
    @Published var hasOnboarded: Bool = false
    /// Préférence d'apparence (système / clair / sombre).
    @Published var theme: AppTheme = .system
    /// Langue de l'interface, choisie dans l'onboarding ou le profil.
    @Published var language: AppLanguage = .systemDefault
    /// Musiciens que je suis (par nom, comme les favoris).
    @Published var following: Set<String> = []
    /// Musiciens avec qui j'ai déjà joué (par nom) — graphe local « a joué avec ».
    /// TODO phase 2b: sync playedWith to Supabase
    @Published var playedWith: Set<String> = []
    /// Onglet actif — utilisé aussi par les raccourcis et les notifications.
    @Published var selectedTab: AppTab = .home
    /// Etats UUID exclusivement serveur; les Sets par nom restent le repli demo.
    private var liveFollowingIDs: Set<UUID> = []
    private var liveFollowerIDs: Set<UUID> = []
    private var liveFollowerCounts: [UUID: Int] = [:]
    private var liveCollaborations: Set<SupabaseBackend.CollaborationRow> = []
    @Published private(set) var blockedUserIDs: Set<UUID> = []
    /// Préférence interne. L'autorisation iOS reste la source de vérité.
    @Published var notificationsEnabled: Bool = false
    @Published private(set) var notificationAuthorizationStatus: UNAuthorizationStatus = .notDetermined
    @Published var pushPreferences = PushPreferences()
    @Published private(set) var pushRegistrationError: String?
    private var pushDeviceToken: String?
    private var notificationObservers: [NSObjectProtocol] = []
    /// SOS déjà vus — pour ne notifier que les vraies nouveautés.
    private var seenGigIDs: Set<UUID> = []
    /// Groupes (messagerie d'équipe Premium) — synchronisés serveur en live
    /// (messages, événements, présence, membres) ; partitions locales.
    @Published var groups: [GroupChat] = []

    // MARK: - Backend (mode live)

    /// Backend Supabase, nil si Secrets.plist est absent (mode démo pur).
    let backend: SupabaseBackend?
    /// Identifiant de l'utilisateur connecté au backend, nil hors ligne.
    @Published var liveUserID: UUID?
    @Published var liveEmail: String?
    /// Erreur backend à montrer à l'utilisateur (bannière discrète).
    @Published var backendError: String?
    /// true une fois la restauration de session terminée — évite d'afficher
    /// l'écran de connexion pendant la vérification au lancement.
    @Published var sessionChecked: Bool = false
    /// true quand l'app affiche les données du serveur et non la démo locale.
    var isLive: Bool { liveUserID != nil }
    private var messageChannel: RealtimeChannelV2?
    private var messageTask: Task<Void, Never>?
    private var groupChannel: RealtimeChannelV2?
    private var groupTask: Task<Void, Never>?
    /// Rafraîchissement des groupes en attente (déclenché par le realtime) —
    /// coalesce les rafales d'événements en un seul rechargement.
    private var pendingGroupRefresh: Task<Void, Never>?
    private var transactionTask: Task<Void, Never>?

    private static let productIDs: [PremiumPlan: String] = [
        .monthly: "ch.dispo.app.premium.monthly",
        .annual: "ch.dispo.app.premium.annual"
    ]

    // MARK: - Admin

    /// Rôle admin — accordé côté serveur uniquement (trigger anti-triche).
    @Published var isAdmin: Bool = false

    /// Lentille admin : prévisualiser l'app comme un utilisateur normal.
    enum AdminLens: String, CaseIterable, Identifiable {
        case reel = "Réel"
        case gratuit = "Gratuit"
        case premium = "Premium"
        var id: String { rawValue }
    }
    @Published var adminLens: AdminLens = .reel

    /// Statut Premium tel que l'interface doit l'afficher. Pour un admin,
    /// la lentille peut simuler un compte gratuit ou premium ; l'état réel
    /// (`isPremium`) et les droits serveur ne changent pas.
    var showsPremium: Bool {
        guard isAdmin else { return isPremium }
        switch adminLens {
        case .reel: return isPremium
        case .gratuit: return false
        case .premium: return true
        }
    }

    private static let eventsKey = "jamconnect.events"
    private static let conversationsKey = "jamconnect.conversations"
    private static let profileKey = "jamconnect.profile"
    private static let favoritesKey = "jamconnect.favorites"
    private static let appreciationsKey = "jamconnect.appreciations"
    private static let premiumKey = "jamconnect.premium"
    private static let premiumPlanKey = "jamconnect.premiumPlan"
    private static let onboardedKey = "jamconnect.onboarded"
    private static let themeKey = "jamconnect.theme"
    private static let languageKey = "jamconnect.language"
    private static let followingKey = "jamconnect.following"
    private static let playedWithKey = "jamconnect.playedWith"
    private static let notificationsKey = "jamconnect.notifications"
    private static let pushPreferencesKey = "dispo.pushPreferences"
    /// Amis de démo (suivent déjà l'utilisateur) — rend le badge « a joué avec » visible.
    private static let demoFollowing: Set<String> = [
        "Marco Fernández", "Yann Broillet", "Léa Zbinden"
    ]
    private static let seenGigsKey = "jamconnect.seenGigs"
    private static let groupsKey = "jamconnect.groups"

    init() {
        backend = BackendConfig.load().map(SupabaseBackend.init)
        let seed = Self.loadSeed()
        musicians = seed.musicians

        // Un concert passé n'a plus besoin de dépannage : on ne garde que l'avenir.
        let savedEvents: [GigRequest]? = Self.load(key: Self.eventsKey)
        if let upcoming = savedEvents?.filter({ $0.date > Date() }), !upcoming.isEmpty {
            events = upcoming
        } else {
            events = Self.projectedSeedEvents(seed.events)
        }
        // Une conversation ouverte sans message envoyé ne doit pas encombrer la liste.
        if let saved: [Conversation] = Self.load(key: Self.conversationsKey) {
            conversations = saved.filter { !$0.messages.isEmpty }
        } else {
            conversations = seed.conversations
        }
        if let saved: MyProfile = Self.load(key: Self.profileKey) {
            profile = saved
        } else {
            profile = Self.defaultProfile
        }
        events.sort { $0.date < $1.date }
        armEarlyAccessTeaser()

        // Reprend la session backend si l'utilisateur était déjà connecté.
        Task {
            await restoreLiveSession()
            await loadStoreProducts()
            await refreshPurchasedEntitlements()
            sessionChecked = true
        }
        transactionTask = Task { [weak self] in
            for await update in Transaction.updates {
                guard case .verified(let transaction) = update else { continue }
                await transaction.finish()
                await self?.refreshPurchasedEntitlements()
            }
        }

        if let saved: Set<String> = Self.load(key: Self.favoritesKey) {
            favorites = saved
        }
        if let saved: [String: Appreciation] = Self.load(key: Self.appreciationsKey) {
            myAppreciations = saved
        }
        isPremium = UserDefaults.standard.bool(forKey: Self.premiumKey)
        premiumPlan = UserDefaults.standard.string(forKey: Self.premiumPlanKey).flatMap(PremiumPlan.init)
        hasOnboarded = UserDefaults.standard.bool(forKey: Self.onboardedKey)
        theme = UserDefaults.standard.string(forKey: Self.themeKey).flatMap(AppTheme.init) ?? .system
        language = UserDefaults.standard.string(forKey: Self.languageKey).flatMap(AppLanguage.init) ?? .systemDefault
        if let saved: Set<String> = Self.load(key: Self.followingKey) {
            following = saved
        } else {
            // Démo : quelques amis mutuels pour le réseau « a joué avec ».
            following = Self.demoFollowing
            Self.save(following, key: Self.followingKey)
        }
        // TODO phase 2b: sync playedWith to Supabase
        if let saved: Set<String> = Self.load(key: Self.playedWithKey) {
            playedWith = saved
        }
        notificationsEnabled = UserDefaults.standard.bool(forKey: Self.notificationsKey)
        if let saved: PushPreferences = Self.load(key: Self.pushPreferencesKey) {
            pushPreferences = saved
        }
        if let saved: Set<UUID> = Self.load(key: Self.seenGigsKey) {
            seenGigIDs = saved
        }
        if let saved: [GroupChat] = Self.load(key: Self.groupsKey) {
            groups = saved
        }
        observePushNotifications()
        Task { await refreshNotificationAuthorization(registerIfAllowed: true) }
        // Reprogramme les rappels de présence au lancement (les triggers
        // locaux survivent au kill, mais on resynchronise après un reset).
        rescheduleAllAttendanceNotifications()
    }

    /// Profil par défaut de la démo.
    private static var defaultProfile: MyProfile {
        MyProfile(
            name: "Ludovic",
            instruments: [.piano],
            genres: [.latin, .jazz],
            level: .avance,
            bio: "Pianiste latin jazz à Genève. Toujours partant pour une descarga !",
            availableDates: [Date(), Calendar.current.date(byAdding: .day, value: 2, to: Date()) ?? Date()]
        )
    }

    /// Les dates du seed sont relatives : on les projette sur les prochains jours.
    private static func projectedSeedEvents(_ seedEvents: [GigRequest]) -> [GigRequest] {
        seedEvents.enumerated().map { index, event -> GigRequest in
            var e = event
            e.date = Calendar.current.date(byAdding: .day, value: index + 1, to: Date().addingTimeInterval(3600 * 4)) ?? e.date
            return e
        }
    }

    /// Garantit qu'une annonce est en avant-première Premium — la killer
    /// feature reste ainsi visible à chaque lancement de la démo.
    private func armEarlyAccessTeaser() {
        let now = Date()
        guard !events.contains(where: { $0.isEarlyAccess(now: now) }) else { return }
        guard let index = events.firstIndex(where: { !$0.isMine && $0.date > now }) else { return }
        events[index].postedAt = now.addingTimeInterval(-7 * 60) // publiée il y a 7 min
        persistEvents()
    }

    // MARK: - Mode live (backend Supabase)

    /// Restaure la session au lancement et charge les données serveur.
    func restoreLiveSession() async {
        guard let userID = await backend?.currentUserID() else { return }
        await didSignIn(userID: userID)
    }

    /// Termine la connexion par lien magique (e-mail → dispo://login-callback).
    func handleAuthCallback(_ url: URL) async {
        guard let backend, url.host() == "login-callback" || url.absoluteString.hasPrefix("dispo://login-callback") else { return }
        do {
            let userID = try await backend.handleAuthCallback(url)
            await didSignIn(userID: userID)
        } catch {
            backendError = tr("Lien de connexion invalide ou expiré.")
        }
    }

    /// À appeler après une connexion réussie (AccountSheet).
    func didSignIn(userID: UUID) async {
        guard let backend else { return }
        liveUserID = userID
        liveEmail = await backend.currentUserEmail()
        backendError = nil

        // Premier passage : si le profil serveur est vide, on pousse le
        // profil local ; sinon le serveur fait foi. Premium et admin
        // viennent toujours du serveur.
        if let rows = try? await backend.fetchProfiles(),
           let mine = rows.first(where: { $0.id == userID }) {
            if mine.name.isEmpty {
                try? await backend.saveProfile(profile, userID: userID)
            } else {
                profile = MyProfile(
                    name: mine.name,
                    instruments: mine.instruments.compactMap(Instrument.init(rawValue:)),
                    genres: mine.genres.compactMap(Genre.init(rawValue:)),
                    level: Level(rawValue: mine.level) ?? .intermediaire,
                    bio: mine.bio,
                    availableDates: mine.parsedDates
                )
            }
            isPremium = mine.isPremium
            isAdmin = mine.isAdmin
        }
        await refreshLiveData()
        await startMessageStream()
        await startGroupStream()
        await refreshNotificationAuthorization(registerIfAllowed: true)
    }

    /// Recharge musiciens, annonces, conversations et groupes depuis le serveur.
    func refreshLiveData() async {
        guard let backend, let userID = liveUserID else { return }
        do {
            async let musiciansTask = backend.fetchMusicians(excluding: userID)
            async let gigsTask = backend.fetchGigs(myID: userID)
            async let conversationsTask = backend.fetchConversations(myID: userID)
            async let profilesTask = backend.fetchProfiles()
            async let followsTask = backend.fetchFollows()
            async let favoritesTask = backend.fetchFavorites(me: userID)
            async let collaborationsTask = backend.fetchCollaborations()
            async let blocksTask = backend.fetchBlockedUsers(me: userID)
            let (allMusicians, g, allConversations, profiles, follows, favoriteIDs, collaborations, blocks) = try await (
                musiciansTask, gigsTask, conversationsTask, profilesTask,
                followsTask, favoritesTask, collaborationsTask, blocksTask
            )
            blockedUserIDs = blocks
            musicians = allMusicians.filter { !blocks.contains($0.id) }
            events = g.sorted { $0.date < $1.date }
            notifyNewGigs(g)
            let blockedNames = Set(profiles.filter { blocks.contains($0.id) }.map(\.name))
            conversations = allConversations.filter { !blockedNames.contains($0.contactName) }.sorted {
                ($0.lastMessage?.date ?? .distantPast) > ($1.lastMessage?.date ?? .distantPast)
            }
            liveFollowingIDs = Set(follows.filter { $0.followerId == userID }.map(\.followingId))
            liveFollowerIDs = Set(follows.filter { $0.followingId == userID }.map(\.followerId))
            liveFollowerCounts = Dictionary(grouping: follows, by: \.followingId).mapValues(\.count)
            liveCollaborations = Set(collaborations)
            let nameByID = Dictionary(uniqueKeysWithValues: profiles.map { ($0.id, $0.name) })
            following = Set(profiles.filter { liveFollowingIDs.contains($0.id) }.map(\.name))
            favorites = Set(profiles.filter { favoriteIDs.contains($0.id) }.map(\.name))
            playedWith = Set(profiles.filter { id in
                collaborations.contains { edge in
                    (edge.aId == userID && edge.bId == id.id) || (edge.bId == userID && edge.aId == id.id)
                }
            }.map(\.name))
            let remoteGroups = try await backend.fetchGroups(
                myID: userID,
                myName: profile.name,
                nameByID: nameByID
            )
            // Les messages viennent du serveur ; seules les partitions
            // (fichiers sur l'appareil) restent locales.
            let localByID = Dictionary(uniqueKeysWithValues: groups.map { ($0.id, $0) })
            groups = remoteGroups.map { remote in
                var merged = remote
                if let local = localByID[remote.id] {
                    merged.docs = local.docs
                }
                return merged
            }
            persistGroups()
            rescheduleAllAttendanceNotifications()
            backendError = nil
        } catch {
            backendError = tr("Connexion au serveur impossible — vérifie le réseau.")
        }
    }

    /// UUID profil pour un nom affiché (moi ou musicien du feed).
    private func profileID(for name: String) -> UUID? {
        if name == profile.name { return liveUserID }
        return musicians.first(where: { $0.name == name })?.id
    }

    /// Exécute une écriture serveur sans bloquer l'UI ; remonte l'erreur.
    private func syncLive(_ work: @escaping () async throws -> Void) {
        guard isLive, let _ = backend else { return }
        Task { [weak self] in
            do {
                try await work()
            } catch {
                await MainActor.run {
                    self?.backendError = self?.tr("La synchro groupe a échoué — réessaie.")
                }
            }
        }
    }

    func signOutLive() async {
        guard let backend else { return }
        if let token = pushDeviceToken {
            try? await backend.deletePushDevice(token: token)
        }
        await backend.signOut()
        liveUserID = nil
        liveEmail = nil
        backendError = nil
        isAdmin = false
        adminLens = .reel
        liveFollowingIDs = []
        liveFollowerIDs = []
        liveFollowerCounts = [:]
        liveCollaborations = []
        blockedUserIDs = []
        messageTask?.cancel()
        messageTask = nil
        if let channel = messageChannel {
            await backend.client.removeChannel(channel)
            messageChannel = nil
        }
        groupTask?.cancel()
        groupTask = nil
        pendingGroupRefresh?.cancel()
        pendingGroupRefresh = nil
        if let channel = groupChannel {
            await backend.client.removeChannel(channel)
            groupChannel = nil
        }
        reloadDemoData()
    }

    /// Recharge la démo locale (seed + actions sauvegardées) après déconnexion.
    private func reloadDemoData() {
        let seed = Self.loadSeed()
        musicians = seed.musicians
        let savedEvents: [GigRequest]? = Self.load(key: Self.eventsKey)
        if let upcoming = savedEvents?.filter({ $0.date > Date() }), !upcoming.isEmpty {
            events = upcoming.sorted { $0.date < $1.date }
        } else {
            events = Self.projectedSeedEvents(seed.events).sorted { $0.date < $1.date }
        }
        if let saved: [Conversation] = Self.load(key: Self.conversationsKey) {
            conversations = saved.filter { !$0.messages.isEmpty }
        } else {
            conversations = seed.conversations
        }
        if let saved: MyProfile = Self.load(key: Self.profileKey) {
            profile = saved
        }
        isPremium = UserDefaults.standard.bool(forKey: Self.premiumKey)
        armEarlyAccessTeaser()
    }

    /// Écoute les nouveaux messages en temps réel et les range dans la bonne
    /// conversation (dédoublonnés — notre propre envoi arrive aussi par ici).
    private func startMessageStream() async {
        guard let backend, messageTask == nil else { return }
        let channel: RealtimeChannelV2
        let stream: AsyncStream<SupabaseBackend.MessageRow>
        do {
            (channel, stream) = try await backend.messageStream()
        } catch {
            backendError = tr("La messagerie en temps reel n'a pas pu demarrer.")
            return
        }
        messageChannel = channel
        messageTask = Task { [weak self] in
            for await row in stream {
                await self?.handleIncomingMessage(row)
            }
        }
    }

    private func handleIncomingMessage(_ row: SupabaseBackend.MessageRow) async {
        guard let userID = liveUserID else { return }
        if let index = conversations.firstIndex(where: { $0.id == row.conversationId }) {
            guard !conversations[index].messages.contains(where: { $0.id == row.id }) else { return }
            let message = row.asMessage(myID: userID)
            withAnimation {
                conversations[index].messages.append(message)
            }
            if !message.isFromMe {
                pushLocal(
                    title: conversations[index].contactName,
                    body: message.text
                )
            }
        } else {
            // Conversation inconnue : quelqu'un vient de m'écrire pour la première fois.
            await refreshLiveData()
        }
    }

    /// Écoute les groupes en temps réel : les messages arrivent en
    /// incrémental, les autres changements (événement créé, présence,
    /// membres, répertoire) déclenchent un rechargement des groupes.
    private func startGroupStream() async {
        guard let backend, groupTask == nil else { return }
        let channel: RealtimeChannelV2
        let stream: AsyncStream<SupabaseBackend.GroupRealtimeEvent>
        do {
            (channel, stream) = try await backend.groupStream()
        } catch {
            backendError = tr("La synchro des groupes en temps réel n'a pas pu démarrer.")
            return
        }
        groupChannel = channel
        groupTask = Task { [weak self] in
            for await event in stream {
                switch event {
                case .message(let row):
                    await self?.handleIncomingGroupMessage(row)
                case .groupsChanged:
                    self?.scheduleGroupRefresh()
                }
            }
        }
    }

    private func handleIncomingGroupMessage(_ row: SupabaseBackend.GroupMessageRow) async {
        guard let userID = liveUserID else { return }
        guard let index = groups.firstIndex(where: { $0.id == row.groupId }) else {
            // Groupe inconnu (on vient de m'y inviter) : recharger la liste.
            await refreshGroups()
            return
        }
        guard !groups[index].messages.contains(where: { $0.id == row.id }) else { return }
        let senderName = row.senderId == userID
            ? profile.name
            : (musicians.first(where: { $0.id == row.senderId })?.name ?? "Musicien")
        let message = GroupMessage(
            id: row.id,
            sender: senderName,
            isFromMe: row.senderId == userID,
            text: row.text,
            date: row.createdAt
        )
        withAnimation {
            groups[index].messages.append(message)
        }
        persistGroups()
        if !message.isFromMe {
            pushLocal(
                title: "\(groups[index].emoji) \(groups[index].name)",
                body: "\(message.sender) : \(message.text)"
            )
        }
    }

    /// Coalesce les rafales d'événements realtime en un seul rechargement.
    private func scheduleGroupRefresh() {
        guard pendingGroupRefresh == nil else { return }
        pendingGroupRefresh = Task { [weak self] in
            try? await Task.sleep(for: .milliseconds(400))
            guard !Task.isCancelled else { return }
            await self?.refreshGroups()
            self?.pendingGroupRefresh = nil
        }
    }

    /// Recharge uniquement les groupes depuis le serveur (plus léger que
    /// refreshLiveData — utilisé par le temps réel).
    private func refreshGroups() async {
        guard let backend, let userID = liveUserID else { return }
        do {
            let profiles = try await backend.fetchProfiles()
            let nameByID = Dictionary(uniqueKeysWithValues: profiles.map { ($0.id, $0.name) })
            let remoteGroups = try await backend.fetchGroups(
                myID: userID,
                myName: profile.name,
                nameByID: nameByID
            )
            let localByID = Dictionary(uniqueKeysWithValues: groups.map { ($0.id, $0) })
            withAnimation {
                groups = remoteGroups.map { remote in
                    var merged = remote
                    if let local = localByID[remote.id] {
                        merged.docs = local.docs
                    }
                    return merged
                }
            }
            persistGroups()
            rescheduleAllAttendanceNotifications()
        } catch {
            // Silencieux : le prochain événement ou refreshLiveData rattrapera.
        }
    }

    /// Change et persiste la préférence d'apparence.
    func setTheme(_ newTheme: AppTheme) {
        theme = newTheme
        UserDefaults.standard.set(newTheme.rawValue, forKey: Self.themeKey)
    }

    // MARK: - Langue

    /// Change la langue de l'interface. L'effet est immédiat sur les vues
    /// (locale d'environnement) et complet au prochain lancement
    /// (AppleLanguages : dates, formats système…).
    func setLanguage(_ newLanguage: AppLanguage) {
        language = newLanguage
        UserDefaults.standard.set(newLanguage.rawValue, forKey: Self.languageKey)
        UserDefaults.standard.set([newLanguage.rawValue], forKey: "AppleLanguages")
    }

    /// Traduit une clé du catalogue dans la langue choisie — pour les
    /// chaînes construites en code (les `Text` littéraux suivent la locale).
    func tr(_ key: String) -> String { language.tr(key) }

    // MARK: - Relations (amis / abonnés)

    /// Musiciens qui me suivent; graphe reel en live, simulation stable en demo.
    var myFollowers: Set<String> {
        if isLive {
            return Set(musicians.filter { liveFollowerIDs.contains($0.id) }.map(\.name))
        }
        return Set(musicians.filter { abs($0.name.stableHash) % 3 == 0 }.map(\.name))
    }

    func socialLink(with name: String) -> SocialLink {
        let followed = following.contains(name)
        let followsMe = myFollowers.contains(name)
        if followed && followsMe { return .friend }
        if followed { return .following }
        if followsMe { return .follower }
        return .none
    }

    func isFollowing(_ musician: Musician) -> Bool {
        isLive ? liveFollowingIDs.contains(musician.id) : following.contains(musician.name)
    }

    func toggleFollow(_ musician: Musician) {
        if let backend, let userID = liveUserID {
            let wasFollowing = liveFollowingIDs.contains(musician.id)
            if wasFollowing {
                liveFollowingIDs.remove(musician.id)
                following.remove(musician.name)
                liveFollowerCounts[musician.id, default: 1] = max(0, liveFollowerCounts[musician.id, default: 1] - 1)
            } else {
                liveFollowingIDs.insert(musician.id)
                following.insert(musician.name)
                liveFollowerCounts[musician.id, default: 0] += 1
            }
            Task {
                do {
                    if wasFollowing {
                        try await backend.unfollow(musician.id, me: userID)
                    } else {
                        try await backend.follow(musician.id, me: userID)
                    }
                } catch {
                    backendError = tr("La relation n'a pas pu etre synchronisee.")
                    await refreshLiveData()
                }
            }
            return
        }
        if following.contains(musician.name) {
            following.remove(musician.name)
        } else {
            following.insert(musician.name)
        }
        Self.save(following, key: Self.followingKey)
    }

    var followingCount: Int { following.count }
    var followersCount: Int { myFollowers.count }

    // MARK: - A joué avec (graphe local)

    func hasPlayedWith(_ musician: Musician) -> Bool {
        playedWith.contains(musician.name)
    }

    func togglePlayedWith(_ musician: Musician) {
        if let backend, let userID = liveUserID {
            let hadPlayed = hasPlayedWith(musician)
            if hadPlayed { playedWith.remove(musician.name) } else { playedWith.insert(musician.name) }
            Task {
                do {
                    if hadPlayed {
                        try await backend.removeCollaboration(with: musician.id, me: userID)
                    } else {
                        try await backend.addCollaboration(with: musician.id, me: userID)
                    }
                    await refreshLiveData()
                } catch {
                    backendError = tr("La collaboration n'a pas pu etre synchronisee.")
                    await refreshLiveData()
                }
            }
            return
        }
        if playedWith.contains(musician.name) {
            playedWith.remove(musician.name)
        } else {
            playedWith.insert(musician.name)
        }
        // TODO phase 2b: sync playedWith to Supabase
        Self.save(playedWith, key: Self.playedWithKey)
    }

    /// Noms des musiciens avec qui `musician` a déjà joué (seed / profil).
    func collaborators(of musician: Musician) -> [String] {
        if isLive {
            let ids = liveCollaborations.reduce(into: Set<UUID>()) { result, edge in
                if edge.aId == musician.id { result.insert(edge.bId) }
                if edge.bId == musician.id { result.insert(edge.aId) }
            }
            return musicians.filter { ids.contains($0.id) }.map(\.name)
        }
        return musician.collaborators
    }

    /// Parmi mes amis, ceux qui apparaissent dans les collaborateurs du profil.
    func friendsWhoPlayedWith(_ musician: Musician) -> [Musician] {
        let names = Set(collaborators(of: musician))
        return musicians
            .filter { names.contains($0.name) && socialLink(with: $0.name) == .friend }
            .sorted { $0.name < $1.name }
    }

    /// true si ce musicien a déjà joué avec au moins un de mes amis.
    func playedWithAFriend(_ musician: Musician) -> Bool {
        !friendsWhoPlayedWith(musician).isEmpty
    }

    // MARK: - Classement des musiciens

    /// Score de relation pour le tri : amis → a joué avec un ami → suivis / abonnés.
    private func relationRank(of musician: Musician) -> Int {
        let link = socialLink(with: musician.name)
        if link == .friend { return 40 }
        if playedWithAFriend(musician) { return 30 }
        return link.rawValue
    }

    /// Ordre du feed et des matchs : les amis / « a joué avec un ami » /
    /// suivis / abonnés d'abord, puis — pour les membres Premium — les
    /// meilleurs niveaux en haut. Les comptes gratuits n'ont ni le tri ni
    /// l'affichage du niveau (c'est un argument d'abonnement).
    func rank(_ a: Musician, _ b: Musician) -> Bool {
        let rankA = relationRank(of: a), rankB = relationRank(of: b)
        if rankA != rankB { return rankA > rankB }
        if showsPremium, a.level != b.level { return a.level > b.level }
        if a.availability.urgencyRank != b.availability.urgencyRank {
            return a.availability.urgencyRank > b.availability.urgencyRank
        }
        return a.distance(from: Self.geneva) < b.distance(from: Self.geneva)
    }

    // MARK: - Social & Premium

    /// Photo d'un musicien seed par nom (avis, conversations).
    func photo(forName name: String) -> String? {
        if let exact = musicians.first(where: { $0.name == name }) { return exact.photo }
        return musicians.first(where: { $0.name.hasPrefix(name + " ") })?.photo
    }

    /// Favori (musicien ou groupe — géré par nom).
    func isFavorite(_ item: Rateable) -> Bool {
        favorites.contains(item.name)
    }

    func toggleFavorite(_ item: Rateable) {
        if let musician = item as? Musician, let backend, let userID = liveUserID {
            let wasFavorite = favorites.contains(musician.name)
            if wasFavorite { favorites.remove(musician.name) } else { favorites.insert(musician.name) }
            Task {
                do {
                    if wasFavorite {
                        try await backend.removeFavorite(musician.id, me: userID)
                    } else {
                        try await backend.addFavorite(musician.id, me: userID)
                    }
                } catch {
                    backendError = tr("Le favori n'a pas pu etre synchronise.")
                    await refreshLiveData()
                }
            }
            return
        }
        if favorites.contains(item.name) {
            favorites.remove(item.name)
        } else {
            favorites.insert(item.name)
        }
        Self.save(favorites, key: Self.favoritesKey)
    }

    func isDemoContact(_ name: String) -> Bool {
        musicians.first(where: { $0.name == name })?.isDemo == true
    }

    func report(_ musician: Musician, reason: String) async -> Bool {
        guard let backend, let userID = liveUserID else { return false }
        do {
            try await backend.report(musician.id, me: userID, reason: reason)
            return true
        } catch {
            backendError = tr("Le signalement n'a pas pu etre envoye.")
            return false
        }
    }

    func block(_ musician: Musician) async -> Bool {
        guard let backend, let userID = liveUserID else { return false }
        do {
            try await backend.block(musician.id, me: userID)
            blockedUserIDs.insert(musician.id)
            musicians.removeAll { $0.id == musician.id }
            conversations.removeAll { $0.contactName == musician.name }
            return true
        } catch {
            backendError = tr("Le blocage n'a pas pu etre applique.")
            return false
        }
    }

    func deleteAccount() async -> Bool {
        guard let backend, liveUserID != nil else { return false }
        do {
            try await backend.deleteMyAccount()
            await signOutLive()
            return true
        } catch {
            backendError = tr("La suppression du compte a echoue. Reessaie plus tard.")
            return false
        }
    }

    /// Filtre local minimal avant les ecritures UGC; les signalements restent
    /// le filet principal pour les variantes et le contexte.
    private func acceptsUserContent(_ text: String) -> Bool {
        let normalized = Self.normalized(text)
        let blockedTerms = ["pornographie", "viol explicite", "menace de mort", "nazi", "pedophile"]
        let accepted = !blockedTerms.contains { normalized.contains($0) }
        if !accepted {
            backendError = tr("Ce contenu ne respecte pas les regles de la communaute.")
        }
        return accepted
    }

    // MARK: - Appréciations (notes de musique)

    /// L'appréciation donnée par l'utilisateur à ce musicien / groupe, s'il y en a une.
    func appreciation(for item: Rateable) -> Appreciation? {
        myAppreciations[item.name]
    }

    /// Donne (ou retire, si nil) une appréciation. Positif uniquement.
    func setAppreciation(_ appreciation: Appreciation?, for item: Rateable) {
        if let appreciation {
            myAppreciations[item.name] = appreciation
        } else {
            myAppreciations.removeValue(forKey: item.name)
        }
        Self.save(myAppreciations, key: Self.appreciationsKey)
    }

    /// Total des notes de musique reçues (avis seed + appréciation de l'utilisateur).
    func noteCount(for item: Rateable) -> Int {
        item.noteCount + (myAppreciations[item.name] != nil ? 1 : 0)
    }

    /// Total des notes dorées reçues (coups de cœur, seed + utilisateur).
    func goldenCount(for item: Rateable) -> Int {
        item.goldenCount + (myAppreciations[item.name] == .golden ? 1 : 0)
    }

    /// « Qui a vu ton profil » — sélection stable de musiciens seed pour la
    /// démo (la vraie donnée viendra du backend en phase 2).
    var profileViewers: [Musician] {
        Array(
            musicians
                .sorted { abs($0.name.stableHash) % 97 < abs($1.name.stableHash) % 97 }
                .prefix(5)
        )
    }

    func displayPrice(for plan: PremiumPlan) -> String {
        storeProducts[plan]?.displayPrice ?? tr("Indisponible")
    }

    func loadStoreProducts() async {
        do {
            let products = try await Product.products(for: Array(Self.productIDs.values))
            storeProducts = Dictionary(uniqueKeysWithValues: products.compactMap { product in
                guard let plan = Self.productIDs.first(where: { $0.value == product.id })?.key else { return nil }
                return (plan, product)
            })
        } catch {
            backendError = tr("Les abonnements App Store sont momentanement indisponibles.")
        }
    }

    func purchasePremium(plan: PremiumPlan) async -> Bool {
        guard let product = storeProducts[plan] else {
            await loadStoreProducts()
            return false
        }
        purchaseInProgress = true
        defer { purchaseInProgress = false }
        do {
            let result = try await product.purchase()
            switch result {
            case .success(.verified(let transaction)):
                await transaction.finish()
                await refreshPurchasedEntitlements()
                return true
            case .success(.unverified), .pending, .userCancelled:
                return false
            @unknown default:
                return false
            }
        } catch {
            backendError = tr("L'achat n'a pas pu etre finalise.")
            return false
        }
    }

    func restorePurchases() async {
        purchaseInProgress = true
        defer { purchaseInProgress = false }
        do {
            try await StoreKit.AppStore.sync()
            await refreshPurchasedEntitlements()
        } catch {
            backendError = tr("La restauration des achats a echoue.")
        }
    }

    func refreshPurchasedEntitlements() async {
        var activePlan: PremiumPlan?
        for await result in Transaction.currentEntitlements {
            guard case .verified(let transaction) = result,
                  transaction.revocationDate == nil,
                  let plan = Self.productIDs.first(where: { $0.value == transaction.productID })?.key
            else { continue }
            activePlan = plan
            if plan == .annual { break }
        }
        isPremium = activePlan != nil
        premiumPlan = activePlan
        UserDefaults.standard.set(isPremium, forKey: Self.premiumKey)
        if let activePlan {
            UserDefaults.standard.set(activePlan.rawValue, forKey: Self.premiumPlanKey)
        } else {
            UserDefaults.standard.removeObject(forKey: Self.premiumPlanKey)
        }
        pushPremiumStatus()
    }

    /// En mode live, le statut Premium vit côté serveur (il conditionne la
    /// RLS de l'avant-première) — on le pousse puis on recharge le feed.
    private func pushPremiumStatus() {
        guard let backend, let userID = liveUserID else { return }
        let premium = isPremium
        Task {
            try? await backend.setPremium(premium, userID: userID)
            await refreshLiveData()
        }
    }

    func completeOnboarding() {
        hasOnboarded = true
        UserDefaults.standard.set(true, forKey: Self.onboardedKey)
    }

    /// Rejoue l'onboarding (outil admin — le profil et les données restent).
    func replayOnboarding() {
        hasOnboarded = false
        UserDefaults.standard.set(false, forKey: Self.onboardedKey)
    }

    // MARK: - Notifications

    var notificationStatusLabel: String {
        if notificationAuthorizationStatus == .denied {
            return tr("Bloquées dans Réglages")
        }
        guard notificationsEnabled else { return tr("Désactivées") }
        switch notificationAuthorizationStatus {
        case .authorized: return tr("Actives")
        case .provisional: return tr("Livraison discrète")
        case .denied: return tr("Bloquées dans Réglages")
        case .notDetermined: return tr("À configurer")
        case .ephemeral: return tr("Temporaires")
        @unknown default: return tr("À vérifier")
        }
    }

    var notificationsNeedSystemSettings: Bool {
        notificationAuthorizationStatus == .denied
    }

    private func observePushNotifications() {
        let center = NotificationCenter.default
        notificationObservers.append(center.addObserver(
            forName: .dispoDidReceivePushToken,
            object: nil,
            queue: .main
        ) { [weak self] notification in
            guard let token = notification.object as? String else { return }
            Task { @MainActor in await self?.didReceivePushToken(token) }
        })
        notificationObservers.append(center.addObserver(
            forName: .dispoDidFailPushRegistration,
            object: nil,
            queue: .main
        ) { [weak self] notification in
            guard let message = notification.object as? String else { return }
            Task { @MainActor in self?.pushRegistrationError = message }
        })
        notificationObservers.append(center.addObserver(
            forName: .dispoDidOpenPush,
            object: nil,
            queue: .main
        ) { [weak self] notification in
            Task { @MainActor in self?.openPushDestination(notification.userInfo ?? [:]) }
        })
    }

    private func openPushDestination(_ userInfo: [AnyHashable: Any]) {
        let rawTab = (userInfo["target_tab"] as? String)
            ?? (userInfo["category"] as? String)
        switch rawTab {
        case "sos": selectedTab = .sos
        case "message", "messages", "groups": selectedTab = .messages
        case "profile": selectedTab = .profile
        default: selectedTab = .home
        }
        Task { try? await UNUserNotificationCenter.current().setBadgeCount(0) }
    }

    func refreshNotificationAuthorization(registerIfAllowed: Bool = false) async {
        let settings = await UNUserNotificationCenter.current().notificationSettings()
        notificationAuthorizationStatus = settings.authorizationStatus
        let allowed = settings.authorizationStatus == .authorized
            || settings.authorizationStatus == .provisional
            || settings.authorizationStatus == .ephemeral
        if notificationsEnabled && allowed && registerIfAllowed {
            UIApplication.shared.registerForRemoteNotifications()
        } else if notificationsEnabled && settings.authorizationStatus == .denied {
            notificationsEnabled = false
            UserDefaults.standard.set(false, forKey: Self.notificationsKey)
        }
    }

    /// Active ou coupe les alertes locales et distantes.
    func setNotifications(_ enabled: Bool) async {
        if enabled {
            let granted = (try? await UNUserNotificationCenter.current()
                .requestAuthorization(options: [.alert, .sound, .badge])) ?? false
            notificationsEnabled = granted
            if granted {
                UIApplication.shared.registerForRemoteNotifications()
                rescheduleAllAttendanceNotifications()
                pushRegistrationError = nil
            }
        } else {
            notificationsEnabled = false
            UNUserNotificationCenter.current().removeAllPendingNotificationRequests()
            UIApplication.shared.unregisterForRemoteNotifications()
            if let backend, let token = pushDeviceToken {
                try? await backend.deletePushDevice(token: token)
            }
        }
        UserDefaults.standard.set(notificationsEnabled, forKey: Self.notificationsKey)
        await refreshNotificationAuthorization()
    }

    func setPushPreference(_ category: PushCategory, enabled: Bool) {
        pushPreferences.set(enabled, for: category)
        Self.save(pushPreferences, key: Self.pushPreferencesKey)
        guard let token = pushDeviceToken else { return }
        Task { await syncPushDevice(token: token) }
    }

    func openNotificationSettings() {
        guard let url = URL(string: UIApplication.openNotificationSettingsURLString) else { return }
        UIApplication.shared.open(url)
    }

    private func didReceivePushToken(_ token: String) async {
        pushDeviceToken = token
        pushRegistrationError = nil
        await syncPushDevice(token: token)
    }

    private func syncPushDevice(token: String) async {
        guard notificationsEnabled, let backend, let userID = liveUserID else { return }
        #if DEBUG
        let environment = "development"
        #else
        let environment = "production"
        #endif
        do {
            try await backend.upsertPushDevice(
                token: token,
                userID: userID,
                environment: environment,
                appVersion: Bundle.main.appVersion,
                locale: language.rawValue,
                preferences: pushPreferences
            )
        } catch {
            pushRegistrationError = tr("L'appareil n'a pas pu être enregistré pour les alertes distantes.")
        }
    }

    /// Bannière de test — vérifie que tout marche (bêta).
    func sendTestNotification() {
        pushLocal(
            title: tr("🚨 Nouveau SOS pour toi"),
            body: tr("Test réussi — les notifications fonctionnent !")
        )
    }

    private func pushLocal(
        title: String,
        body: String,
        identifier: String = UUID().uuidString,
        at date: Date? = nil
    ) {
        guard notificationsEnabled else { return }
        let content = UNMutableNotificationContent()
        content.title = title
        content.body = body
        content.sound = .default
        let trigger: UNNotificationTrigger?
        if let date {
            // Déjà passé : on n'envoie pas (évite une rafale au lancement).
            guard date > Date().addingTimeInterval(5) else { return }
            trigger = UNCalendarNotificationTrigger(
                dateMatching: Calendar.current.dateComponents(
                    [.year, .month, .day, .hour, .minute],
                    from: date
                ),
                repeats: false
            )
        } else {
            trigger = nil
        }
        let request = UNNotificationRequest(
            identifier: identifier,
            content: content,
            trigger: trigger
        )
        UNUserNotificationCenter.current().add(request)
    }

    /// Annule une notif planifiée (ex. après confirmation de présence).
    private func cancelNotification(id: String) {
        UNUserNotificationCenter.current()
            .removePendingNotificationRequests(withIdentifiers: [id])
    }

    /// Notifie les SOS fraîchement arrivés qui matchent mes instruments.
    /// Premier passage silencieux : on mémorise sans arroser l'utilisateur.
    private func notifyNewGigs(_ gigs: [GigRequest]) {
        let isFirstScan = seenGigIDs.isEmpty
        var changed = false
        for gig in gigs where !seenGigIDs.contains(gig.id) {
            seenGigIDs.insert(gig.id)
            changed = true
            guard !isFirstScan, !gig.isMine,
                  !Set(gig.wantedInstruments).isDisjoint(with: profile.instruments)
            else { continue }
            pushLocal(
                title: tr("🚨 Nouveau SOS pour toi"),
                body: "\(gig.title) · \(tr(gig.feeLabel))"
            )
        }
        if changed {
            Self.save(seenGigIDs, key: Self.seenGigsKey)
        }
    }

    // MARK: - Matching SOS

    /// Musiciens compatibles avec un SOS : bon instrument et dispo dépannage.
    /// Ceux qui ont coché la date exacte sortent en premier, puis les
    /// relations (amis / suivis / abonnés), puis — en Premium — le niveau.
    func matches(for gig: GigRequest) -> [SOSMatch] {
        musicians
            .filter { $0.plays(any: gig.wantedInstruments) && $0.isAvailable }
            .map { SOSMatch(musician: $0, dateConfirmed: $0.isAvailable(on: gig.date)) }
            .sorted { a, b in
                if a.dateConfirmed != b.dateConfirmed { return a.dateConfirmed }
                let genreA = a.musician.genres.contains(gig.genre)
                let genreB = b.musician.genres.contains(gig.genre)
                if genreA != genreB { return genreA }
                return rank(a.musician, b.musician)
            }
    }

    // MARK: - Groupes (Premium)

    private func persistGroups() {
        // En live, le serveur fait foi ; on garde une copie locale pour
        // messages / partitions et pour le mode hors-ligne.
        Self.save(groups, key: Self.groupsKey)
    }

    /// Crée un groupe — création réservée aux Premium (l'appelant vérifie,
    /// paywall sinon). Le créateur devient leader — représenté par
    /// leaderName == nil (« moi »), robuste à un futur renommage du profil.
    func createGroup(name: String, emoji: String, members: [String]) {
        // Les membres initiaux forment le noyau permanent du groupe.
        let kinds = Dictionary(uniqueKeysWithValues: members.map { ($0, GroupMemberKind.permanent) })
        let group = GroupChat(
            name: name,
            emoji: emoji,
            leaderName: nil,
            memberNames: members,
            memberKinds: kinds
        )
        groups.insert(group, at: 0)
        persistGroups()
        if let backend, let userID = liveUserID {
            let memberIDs: [(UUID, GroupMemberKind)] = members.compactMap { name in
                guard let id = profileID(for: name) else { return nil }
                return (id, .permanent)
            }
            syncLive {
                _ = try await backend.createGroup(
                    id: group.id,
                    name: name,
                    emoji: emoji,
                    leaderID: userID,
                    memberIDs: memberIDs
                )
            }
        } else {
            scheduleDemoSuggestion(for: group.id)
        }
    }

    /// Suis-je le leader de ce groupe ? leaderName == nil ⇒ moi (le titre ne
    /// dépend pas de mon nom d'affichage, qui peut changer).
    func isLeader(of group: GroupChat) -> Bool {
        group.leaderName == nil
    }

    /// Nom affiché du leader (le mien si c'est moi).
    func leaderDisplayName(of group: GroupChat) -> String {
        group.leaderName ?? profile.name
    }

    /// Puis-je exercer les pouvoirs de leader ? Être leader ne suffit pas :
    /// il faut aussi être Premium (un abonnement expiré fait retomber au
    /// rang de membre — on ne perd pas le titre, juste les commandes).
    func canLead(_ group: GroupChat) -> Bool {
        isLeader(of: group) && showsPremium
    }

    /// Statut Premium d'un membre. En live, c'est le vrai flag serveur
    /// (`profiles.is_premium`) ; en démo, une simulation stable par nom.
    /// Conditionne le transfert de leadership.
    func isPremiumMusician(_ name: String) -> Bool {
        if isLive {
            if name == profile.name { return isPremium }
            return musicians.first(where: { $0.name == name })?.isPremium == true
        }
        return abs(name.stableHash) % 2 == 0
    }

    // MARK: Membres (leader uniquement — l'UI verrouille)

    /// Noms de tous les participants du groupe (leader inclus).
    func roster(of group: GroupChat) -> [String] {
        ([leaderDisplayName(of: group)] + group.memberNames)
            .filter { !$0.isEmpty }
    }

    func inviteMember(_ name: String, to group: GroupChat, kind: GroupMemberKind = .occasional) {
        updateGroup(group.id) {
            guard !$0.memberNames.contains(name) else { return }
            $0.memberNames.append(name)
            $0.memberNames.sort()
            var kinds = $0.memberKinds ?? [:]
            kinds[name] = kind
            $0.memberKinds = kinds
        }
        if let backend, let profileID = profileID(for: name) {
            syncLive { try await backend.inviteMember(profileID, to: group.id, kind: kind) }
        }
    }

    /// Permanent ↔ occasionnel — le noyau fixe du groupe.
    func setMemberKind(_ name: String, _ kind: GroupMemberKind, in group: GroupChat) {
        updateGroup(group.id) {
            var kinds = $0.memberKinds ?? [:]
            kinds[name] = kind
            $0.memberKinds = kinds
        }
        if let backend, let profileID = profileID(for: name) {
            syncLive { try await backend.setMemberKind(profileID, kind, in: group.id) }
        }
    }

    func kickMember(_ name: String, from group: GroupChat) {
        updateGroup(group.id) {
            $0.memberNames.removeAll { $0 == name }
            $0.memberKinds?[name] = nil
            // Un membre viré ne laisse pas de suggestions orphelines — ni dans
            // le répertoire, ni dans les setlists des événements.
            $0.repertoire = $0.songs.filter { $0.isApproved || $0.suggestedBy != name }
            $0.events = $0.events?.map { event in
                var event = event
                event.setlist.removeAll { !$0.isApproved && $0.suggestedBy == name }
                event.attendance?[name] = nil
                return event
            }
        }
        if let backend, let profileID = profileID(for: name) {
            syncLive { try await backend.kickMember(profileID, from: group.id) }
        }
    }

    /// Transfère le leadership — uniquement vers un membre Premium
    /// (statut serveur en live, simulation en démo).
    func transferLeadership(of group: GroupChat, to name: String) {
        guard isPremiumMusician(name) else { return }
        if isLive {
            guard let backend, let profileID = profileID(for: name) else { return }
            updateGroup(group.id) { $0.leaderName = name }
            syncLive { try await backend.transferLeadership(of: group.id, to: profileID) }
            return
        }
        updateGroup(group.id) { $0.leaderName = name }
    }

    // MARK: Répertoire (leader valide, membres suggèrent)

    /// Ajoute un morceau au répertoire du groupe. Le leader ajoute
    /// directement (validé) ; un membre crée une suggestion à valider.
    func addSong(title: String, artist: String, to groupID: GroupChat.ID, eventID: GroupEvent.ID? = nil) {
        // Le leader valide d'office ; sinon c'est une suggestion en attente.
        let approved = groups.first(where: { $0.id == groupID }).map(canLead) ?? true
        let song = Song(
            title: title,
            artist: artist,
            artworkURL: nil,
            suggestedBy: profile.name,
            isApproved: approved
        )
        insertSong(song, in: groupID, eventID: eventID)
        // La pochette arrive en différé (iTunes Search) — le morceau vit sans.
        Task { [weak self] in
            guard let self else { return }
            if let artwork = await Self.fetchArtworkURL(title: title, artist: artist) {
                self.updateSong(song.id, in: groupID, eventID: eventID) { $0.artworkURL = artwork }
            }
        }
    }

    func approveSong(_ song: Song, in groupID: GroupChat.ID, eventID: GroupEvent.ID? = nil) {
        updateSong(song.id, in: groupID, eventID: eventID) { $0.isApproved = true }
    }

    func rejectSong(_ song: Song, in groupID: GroupChat.ID, eventID: GroupEvent.ID? = nil) {
        updateGroup(groupID) { group in
            if let eventID, let index = group.events?.firstIndex(where: { $0.id == eventID }) {
                group.events?[index].setlist.removeAll { $0.id == song.id }
            } else {
                group.repertoire = group.songs.filter { $0.id != song.id }
            }
        }
        syncSongs(groupID: groupID, eventID: eventID)
    }

    private func insertSong(_ song: Song, in groupID: GroupChat.ID, eventID: GroupEvent.ID?) {
        updateGroup(groupID) { group in
            if let eventID {
                // Ciblait un événement précis : s'il a disparu entretemps, on
                // ne bascule pas le morceau vers le répertoire — on abandonne.
                guard let index = group.events?.firstIndex(where: { $0.id == eventID }) else { return }
                group.events?[index].setlist.append(song)
            } else {
                group.repertoire = group.songs + [song]
            }
        }
        syncSongs(groupID: groupID, eventID: eventID)
    }

    private func updateSong(_ songID: Song.ID, in groupID: GroupChat.ID, eventID: GroupEvent.ID?, _ transform: (inout Song) -> Void) {
        updateGroup(groupID) { group in
            if let eventID, let eventIndex = group.events?.firstIndex(where: { $0.id == eventID }) {
                if let songIndex = group.events?[eventIndex].setlist.firstIndex(where: { $0.id == songID }) {
                    transform(&group.events![eventIndex].setlist[songIndex])
                }
            } else if var repertoire = group.repertoire,
                      let songIndex = repertoire.firstIndex(where: { $0.id == songID }) {
                transform(&repertoire[songIndex])
                group.repertoire = repertoire
            }
        }
        syncSongs(groupID: groupID, eventID: eventID)
    }

    /// Pousse répertoire / setlist vers Supabase après une mutation locale.
    private func syncSongs(groupID: GroupChat.ID, eventID: GroupEvent.ID?) {
        guard let backend, isLive,
              let group = groups.first(where: { $0.id == groupID })
        else { return }
        if let eventID,
           let event = group.allEvents.first(where: { $0.id == eventID }) {
            syncLive { try await backend.updateEventSetlist(event.setlist, eventID: eventID) }
        } else {
            syncLive { try await backend.updateGroupRepertoire(group.songs, groupID: groupID) }
        }
    }

    /// Cherche la pochette du morceau (iTunes Search — gratuit, sans clé).
    nonisolated static func fetchArtworkURL(title: String, artist: String) async -> String? {
        struct SearchResponse: Decodable {
            struct Item: Decodable { let artworkUrl100: String? }
            let results: [Item]
        }
        let term = "\(title) \(artist)"
        guard let encoded = term.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed),
              let url = URL(string: "https://itunes.apple.com/search?term=\(encoded)&media=music&entity=song&limit=1")
        else { return nil }
        guard let (data, _) = try? await URLSession.shared.data(from: url),
              let response = try? JSONDecoder().decode(SearchResponse.self, from: data)
        else { return nil }
        // 100 px → 300 px : même CDN, meilleure netteté dans les listes.
        return response.results.first?.artworkUrl100?
            .replacingOccurrences(of: "100x100", with: "300x300")
    }

    // MARK: Événements (leader crée, membres suggèrent la setlist)

    func addEvent(_ event: GroupEvent, to group: GroupChat) {
        var event = event
        // Le leader confirme sa présence d'office ; les autres restent en attente.
        event.attendance = [leaderDisplayName(of: group): .available]
        updateGroup(group.id) {
            $0.events = ($0.events ?? []) + [event]
            $0.events?.sort { $0.date < $1.date }
        }
        scheduleAttendanceReminders(for: event, in: group)
        if let backend, isLive {
            syncLive {
                try await backend.createEvent(event, groupID: group.id)
                await backend.deliverPendingPushNotifications()
            }
        } else {
            scheduleDemoSuggestion(for: group.id, eventID: event.id)
        }
    }

    func removeEvent(_ event: GroupEvent, from group: GroupChat) {
        cancelAttendanceNotifications(for: event)
        updateGroup(group.id) { $0.events?.removeAll { $0.id == event.id } }
        if let backend, isLive {
            syncLive { try await backend.deleteEvent(event.id) }
        }
    }

    // MARK: Présence (RSVP)

    /// Confirme ou refuse sa présence à un événement — un tap.
    func setAttendance(
        _ status: AttendanceStatus,
        for name: String? = nil,
        eventID: GroupEvent.ID,
        in groupID: GroupChat.ID
    ) {
        let member = name ?? profile.name
        guard status == .available || status == .unavailable else { return }
        updateGroup(groupID) { group in
            guard let index = group.events?.firstIndex(where: { $0.id == eventID }) else { return }
            var attendance = group.events?[index].attendance ?? [:]
            attendance[member] = status
            group.events?[index].attendance = attendance
        }
        // Plus besoin du rappel de confirmation pour ce membre.
        cancelNotification(id: Self.confirmReminderID(eventID: eventID, member: member))

        guard let group = groups.first(where: { $0.id == groupID }),
              let event = group.allEvents.first(where: { $0.id == eventID })
        else { return }

        if status == .unavailable {
            scheduleUnavailableAlert(for: event, member: member, in: group)
        } else {
            cancelNotification(id: Self.unavailableAlertID(eventID: eventID, member: member))
        }

        if let backend, isLive, let profileID = profileID(for: member) {
            syncLive { try await backend.setAttendance(status, eventID: eventID, profileID: profileID) }
        }
    }

    /// Membres encore sans réponse pour un événement.
    func pendingAttendance(for event: GroupEvent, in group: GroupChat) -> [String] {
        roster(of: group).filter { event.status(for: $0) == .pending }
    }

    /// Musiciens hors groupe déjà marqués dispo ce jour-là — candidats
    /// remplaçants en un tap depuis l'accueil.
    func availableInvitees(for event: GroupEvent, in group: GroupChat) -> [Musician] {
        let roster = Set(self.roster(of: group))
        return musicians
            .filter { !roster.contains($0.name) && $0.isAvailable(on: event.date) }
            .sorted { rank($0, $1) }
    }

    /// Invite un musicien dispo à un événement : l'ajoute au groupe en
    /// occasionnel + message pré-rempli — zéro étape supplémentaire.
    func inviteAvailable(_ musician: Musician, to event: GroupEvent, in group: GroupChat) async {
        if !group.memberNames.contains(musician.name) {
            inviteMember(musician.name, to: group, kind: .occasional)
        }
        // Pré-marque dispo (il a indiqué sa dispo sur le calendrier).
        setAttendance(.available, for: musician.name, eventID: event.id, in: group.id)

        let conversation = await conversation(with: musician)
        let dateLabel = event.date.formatted(.dateTime.weekday(.wide).day().month(.wide).hour().minute())
        let text = String(
            format: tr("Salut ! On a une place pour « %@ » (%@) le %@ à %@. Tu es dispo — tu nous rejoins ?"),
            event.title, group.name, dateLabel, event.venue
        )
        sendMessage(text, in: conversation)
        pushLocal(
            title: "\(group.emoji) \(group.name)",
            body: String(format: tr("%@ invité·e pour %@"), musician.name, event.title)
        )
    }

    // MARK: Rappels de présence (notifications locales planifiées)

    private static func confirmReminderID(eventID: UUID, member: String) -> String {
        "confirm.\(eventID.uuidString).\(member)"
    }

    private static func unavailableAlertID(eventID: UUID, member: String) -> String {
        "unavailable.\(eventID.uuidString).\(member)"
    }

    /// Rappel à chaque membre pour confirmer — 3 jours avant, ou immédiatement
    /// si l'événement est plus proche.
    private func scheduleAttendanceReminders(for event: GroupEvent, in group: GroupChat) {
        let leader = leaderDisplayName(of: group)
        for member in roster(of: group) where member != leader {
            guard event.status(for: member) == .pending else { continue }
            let remindAt = event.date.addingTimeInterval(-3 * 24 * 3600)
            let when = max(remindAt, Date().addingTimeInterval(10))
            pushLocal(
                title: "\(group.emoji) \(group.name)",
                body: String(
                    format: tr("Confirmes-tu ta présence pour « %@ » le %@ ?"),
                    event.title,
                    event.date.formatted(.dateTime.weekday(.wide).day().month())
                ),
                identifier: Self.confirmReminderID(eventID: event.id, member: member),
                at: when
            )
        }
    }

    /// Alerte leader 2 jours avant si un membre s'est déclaré indispo.
    private func scheduleUnavailableAlert(
        for event: GroupEvent,
        member: String,
        in group: GroupChat
    ) {
        // Notification locale sur cet appareil — le leader (compte courant
        // en démo) reçoit l'alerte pour trouver un remplaçant à temps.
        let alertAt = event.date.addingTimeInterval(-2 * 24 * 3600)
        let when = max(alertAt, Date().addingTimeInterval(15))
        pushLocal(
            title: String(format: tr("⚠️ Remplaçant pour %@"), group.name),
            body: String(
                format: tr("%@ est indispo pour « %@ » — trouve un remplaçant."),
                member, event.title
            ),
            identifier: Self.unavailableAlertID(eventID: event.id, member: member),
            at: when
        )
    }

    private func cancelAttendanceNotifications(for event: GroupEvent) {
        let center = UNUserNotificationCenter.current()
        let ids = (event.attendance ?? [:]).keys.flatMap { member in
            [
                Self.confirmReminderID(eventID: event.id, member: member),
                Self.unavailableAlertID(eventID: event.id, member: member)
            ]
        }
        // Aussi les rappels pour les membres pas encore dans attendance.
        center.removePendingNotificationRequests(withIdentifiers: ids)
        // Filet : tout préfixe de cet événement.
        center.getPendingNotificationRequests { requests in
            let prefix = event.id.uuidString
            let stale = requests
                .map(\.identifier)
                .filter { $0.contains(prefix) }
            center.removePendingNotificationRequests(withIdentifiers: stale)
        }
    }

    /// Reprogramme tous les rappels après un lancement / reset.
    private func rescheduleAllAttendanceNotifications() {
        guard notificationsEnabled else { return }
        for group in groups {
            for event in group.upcomingEvents {
                scheduleAttendanceReminders(for: event, in: group)
                for name in event.unavailableNames {
                    scheduleUnavailableAlert(for: event, member: name, in: group)
                }
            }
        }
    }

    /// Vie de démo : peu après une création (groupe ou événement), un membre
    /// suggère un morceau — le flux « suggestion → validation leader »
    /// devient concret. Temps réel serveur en phase 2b.
    private func scheduleDemoSuggestion(for groupID: GroupChat.ID, eventID: GroupEvent.ID? = nil) {
        Task { [weak self] in
            try? await Task.sleep(for: .seconds(Double.random(in: 8...15)))
            guard let self,
                  let group = self.groups.first(where: { $0.id == groupID }),
                  let member = group.memberNames.randomElement(),
                  let pick = Self.demoSongPool.randomElement()
            else { return }
            var song = Song(
                title: pick.0,
                artist: pick.1,
                artworkURL: nil,
                suggestedBy: member,
                isApproved: false
            )
            song.artworkURL = await Self.fetchArtworkURL(title: pick.0, artist: pick.1)
            self.insertSong(song, in: groupID, eventID: eventID)
            self.pushLocal(
                title: "\(group.emoji) \(group.name)",
                body: "\(member) : \(pick.0) — \(pick.1) ?"
            )
        }
    }

    /// Standards que « suggèrent » les membres en démo (pochettes réelles).
    nonisolated private static let demoSongPool: [(String, String)] = [
        ("Oye Como Va", "Santana"),
        ("Chan Chan", "Buena Vista Social Club"),
        ("Autumn Leaves", "Bill Evans"),
        ("Watermelon Man", "Herbie Hancock"),
        ("Vivir Mi Vida", "Marc Anthony"),
        ("So What", "Miles Davis"),
        ("La Vida Es Un Carnaval", "Celia Cruz"),
        ("Take Five", "Dave Brubeck")
    ]

    func deleteGroup(_ group: GroupChat) {
        for doc in group.docs {
            try? FileManager.default.removeItem(at: Self.mediaURL(for: doc.fileName))
        }
        groups.removeAll { $0.id == group.id }
        persistGroups()
        if let backend, isLive {
            syncLive { try await backend.deleteGroup(group.id) }
        }
    }

    private func updateGroup(_ id: GroupChat.ID, _ transform: (inout GroupChat) -> Void) {
        guard let index = groups.firstIndex(where: { $0.id == id }) else { return }
        transform(&groups[index])
        persistGroups()
    }

    /// Envoie un message dans le groupe. En live il part sur le serveur et
    /// arrive chez tous les membres en temps réel ; en démo, un membre répond
    /// pour rendre la conversation vivante. Jamais de réponse scriptée en
    /// live : les membres sont de vraies personnes et on ne fabrique pas de
    /// propos en leur nom.
    func sendGroupMessage(_ text: String, in group: GroupChat) {
        guard acceptsUserContent(text) else { return }
        let message = GroupMessage(sender: profile.name, isFromMe: true, text: text, date: Date())
        updateGroup(group.id) {
            $0.messages.append(message)
        }
        if let backend, let userID = liveUserID {
            let groupID = group.id
            Task { [weak self] in
                do {
                    try await backend.sendGroupMessage(
                        id: message.id,
                        text: text,
                        groupID: groupID,
                        senderID: userID
                    )
                } catch {
                    // L'envoi a échoué : retirer le message optimiste pour ne
                    // pas laisser croire qu'il est parti.
                    self?.updateGroup(groupID) {
                        $0.messages.removeAll { $0.id == message.id }
                    }
                    self?.backendError = self?.tr("Le message n'a pas pu être envoyé.")
                }
            }
        }
        guard !isLive else { return }
        guard let replier = group.memberNames.randomElement() else { return }
        let reply = Self.scriptedGroupReplies.randomElement() ?? "Ça marche !"
        let groupID = group.id
        Task { [weak self] in
            try? await Task.sleep(for: .seconds(Double.random(in: 1.5...3)))
            guard let self else { return }
            withAnimation {
                self.updateGroup(groupID) {
                    $0.messages.append(GroupMessage(sender: replier, isFromMe: false, text: reply, date: Date()))
                }
            }
        }
    }

    /// Ajoute une partition (fichier importé) au groupe.
    func addDoc(from sourceURL: URL, title: String, to group: GroupChat) {
        let ext = sourceURL.pathExtension.isEmpty ? "pdf" : sourceURL.pathExtension
        let fileName = "group_doc_\(Int(Date().timeIntervalSince1970)).\(ext)"
        // Fichier hors sandbox (Fichiers / iCloud) : accès sécurisé requis.
        let secured = sourceURL.startAccessingSecurityScopedResource()
        defer { if secured { sourceURL.stopAccessingSecurityScopedResource() } }
        do {
            try FileManager.default.copyItem(at: sourceURL, to: Self.mediaURL(for: fileName))
            updateGroup(group.id) {
                $0.docs.insert(
                    GroupDoc(fileName: fileName, title: title, addedBy: profile.name, date: Date()),
                    at: 0
                )
            }
        } catch {
            backendError = tr("Le document n'a pas pu être importé.")
        }
    }

    func removeDoc(_ doc: GroupDoc, from group: GroupChat) {
        try? FileManager.default.removeItem(at: Self.mediaURL(for: doc.fileName))
        updateGroup(group.id) { $0.docs.removeAll { $0.id == doc.id } }
    }

    private static let scriptedGroupReplies: [String] = [
        "Ça marche pour moi 👍",
        "Reçu ! Je bosse la partition ce soir.",
        "Parfait, je note la date.",
        "On cale une répé avant ?",
        "Top. Balance l'heure du soundcheck quand tu l'as.",
        "Je peux amener la sono si besoin."
    ]

    // MARK: - Invitation à un SOS

    /// Musiciens déjà invités, par annonce (mémoire de session).
    @Published var invitedByGig: [UUID: Set<String>] = [:]

    func hasInvited(_ musician: Musician, to gig: GigRequest) -> Bool {
        invitedByGig[gig.id]?.contains(musician.name) ?? false
    }

    /// Invite un musicien à dépanner : ouvre (ou crée) la conversation et
    /// envoie un message d'invitation pré-rempli avec les infos du concert.
    func invite(_ musician: Musician, to gig: GigRequest) async {
        // Marqué avant l'await : un double-tap rapide ne déclenche pas deux
        // invitations (l'ouverture de conversation est asynchrone).
        guard !hasInvited(musician, to: gig) else { return }
        invitedByGig[gig.id, default: []].insert(musician.name)
        let conversation = await conversation(with: musician)
        let dateLabel = gig.date.formatted(.dateTime.weekday(.wide).day().month(.wide).hour().minute())
        let instruments = gig.wantedInstruments.map { tr($0.rawValue) }.joined(separator: " / ")
        let text = String(
            format: tr("Salut ! Je cherche %@ pour « %@ » le %@ à %@ (cachet : %@). Partant·e ?"),
            instruments, gig.title, dateLabel, gig.place, tr(gig.feeLabel)
        )
        sendMessage(text, in: conversation)
    }

    /// Envoie une demande de dépannage structurée à un musicien : ouvre (ou
    /// crée) la conversation et y poste la demande balisée 🚨 avec ses
    /// options (instrument, date, lieu, cachet). Distinct d'un simple
    /// message privé envoyé via « Contacter ».
    func sendSOSRequest(
        to musician: Musician,
        instrument: Instrument,
        date: Date,
        place: String,
        fee: Int?,
        note: String
    ) async -> Conversation {
        let conversation = await conversation(with: musician)
        let dateLabel = date.formatted(.dateTime.weekday(.wide).day().month(.wide).hour().minute())
        var lines = [
            tr("🚨 Demande de dépannage"),
            String(format: tr("🎸 Instrument : %@"), tr(instrument.rawValue)),
            String(format: tr("📅 Date : %@"), dateLabel)
        ]
        let trimmedPlace = place.trimmingCharacters(in: .whitespacesAndNewlines)
        if !trimmedPlace.isEmpty {
            lines.append(String(format: tr("📍 Lieu : %@"), trimmedPlace))
        }
        lines.append(String(format: tr("💰 Cachet : %@"), fee.map { "CHF \($0)" } ?? tr("À discuter")))
        let trimmedNote = note.trimmingCharacters(in: .whitespacesAndNewlines)
        if !trimmedNote.isEmpty {
            lines.append(trimmedNote)
        }
        sendMessage(lines.joined(separator: "\n"), in: conversation)
        return conversation
    }

    // MARK: - Médias du profil (photo + vidéos de démo)

    /// Nombre maximum de vidéos de démo selon l'abonnement.
    var videoLimit: Int { showsPremium ? 6 : 1 }
    var canAddVideo: Bool { profile.videos.count < videoLimit }

    nonisolated private static var documentsURL: URL {
        FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
    }

    nonisolated static func mediaURL(for fileName: String) -> URL {
        documentsURL.appendingPathComponent(fileName)
    }

    /// Enregistre la photo de profil choisie (remplace l'ancienne).
    func setProfilePhoto(_ data: Data) {
        let fileName = "profile_photo_\(Int(Date().timeIntervalSince1970)).jpg"
        if let old = profile.photoFileName {
            try? FileManager.default.removeItem(at: Self.mediaURL(for: old))
        }
        do {
            try data.write(to: Self.mediaURL(for: fileName))
            profile.photoFileName = fileName
            saveProfile()
        } catch {
            backendError = tr("La photo n'a pas pu être enregistrée.")
        }
    }

    func removeProfilePhoto() {
        if let old = profile.photoFileName {
            try? FileManager.default.removeItem(at: Self.mediaURL(for: old))
        }
        profile.photoFileName = nil
        saveProfile()
    }

    /// Ajoute une vidéo de démo (données déjà copiées depuis la photothèque),
    /// datée du jour par défaut. Vérifier `canAddVideo` avant.
    func addDemoVideo(from sourceURL: URL) {
        guard canAddVideo else { return }
        let fileName = "demo_video_\(Int(Date().timeIntervalSince1970)).\(sourceURL.pathExtension.isEmpty ? "mov" : sourceURL.pathExtension)"
        do {
            try FileManager.default.copyItem(at: sourceURL, to: Self.mediaURL(for: fileName))
            saveVideos(profile.videos + [DemoVideo(fileName: fileName, date: Date())])
        } catch {
            backendError = tr("La vidéo n'a pas pu être enregistrée.")
        }
    }

    /// Change la date d'une vidéo (date du concert / de l'enregistrement).
    func setVideoDate(_ date: Date?, for video: DemoVideo) {
        saveVideos(profile.videos.map {
            $0.id == video.id ? DemoVideo(id: $0.id, fileName: $0.fileName, date: date) : $0
        })
    }

    func removeDemoVideo(_ video: DemoVideo) {
        try? FileManager.default.removeItem(at: Self.mediaURL(for: video.fileName))
        saveVideos(profile.videos.filter { $0.id != video.id })
    }

    /// Écrit la liste au nouveau format daté (migre l'ancien au passage).
    private func saveVideos(_ videos: [DemoVideo]) {
        profile.demoVideos = videos
        profile.videoFileNames = nil
        saveProfile()
    }

    // MARK: - Abonnés d'un musicien

    /// Nombre d'abonnés affiché pour un musicien : base stable de démo
    /// (le vrai compteur viendra du graphe serveur en phase 2b) + moi si
    /// je le suis.
    func followerCount(of musician: Musician) -> Int {
        if isLive { return liveFollowerCounts[musician.id, default: 0] }
        return 40 + abs(musician.name.stableHash) % 320 + (isFollowing(musician) ? 1 : 0)
    }

    // MARK: - Recherche universelle

    /// Résultats de la recherche libre (musiciens + annonces SOS).
    struct SearchResults {
        var musicians: [Musician] = []
        var gigs: [GigRequest] = []
        var isEmpty: Bool { musicians.isEmpty && gigs.isEmpty }
    }

    /// Mots vides ignorés — « cherche un pianiste sur Carouge » marche.
    private static let searchStopWords: Set<String> = [
        "un", "une", "le", "la", "les", "de", "du", "des", "d", "l",
        "a", "à", "au", "aux", "en", "sur", "et", "ou", "pour", "avec",
        "qui", "je", "cherche", "recherche", "trouve", "besoin", "veux"
    ]

    /// Sans accents ni majuscules — « anieres » trouve « Anières ».
    nonisolated private static func normalized(_ string: String) -> String {
        string.folding(options: [.diacriticInsensitive, .caseInsensitive], locale: Locale(identifier: "fr"))
            .lowercased()
    }

    /// Recherche libre et approximative : « @marco », « marco », « pianiste
    /// Carouge », « salsa ce soir », « 1227 »… Chaque mot est comparé en
    /// préfixe, en sous-chaîne et avec tolérance aux fautes de frappe.
    /// Si aucun profil ne matche tous les mots, on montre les matchs
    /// partiels plutôt que rien — on doit toujours pouvoir retrouver
    /// quelqu'un, même indisponible.
    func search(_ query: String) -> SearchResults {
        let tokens = Self.normalized(query)
            .split(whereSeparator: { !$0.isLetter && !$0.isNumber && $0 != "@" })
            .map { String($0).replacingOccurrences(of: "@", with: "") }
            .filter { !$0.isEmpty && !Self.searchStopWords.contains($0) }
        guard !tokens.isEmpty else { return SearchResults() }

        let musicians = pickBest(
            self.musicians.map { ($0, matchCount(tokens, in: haystack(for: $0))) },
            tokenCount: tokens.count
        )
        .sorted { a, b in rank(a, b) }
        let gigs = pickBest(
            events.map { ($0, matchCount(tokens, in: haystack(for: $0))) },
            tokenCount: tokens.count
        )
        .sorted { $0.date < $1.date }
        return SearchResults(musicians: musicians, gigs: gigs)
    }

    /// Garde les matchs complets (tous les mots) s'il y en a, sinon se
    /// rabat sur les matchs partiels (au moins un mot).
    private func pickBest<T>(_ scored: [(T, Int)], tokenCount: Int) -> [T] {
        let full = scored.filter { $0.1 == tokenCount }
        if !full.isEmpty { return full.map(\.0) }
        return scored.filter { $0.1 > 0 }.map(\.0)
    }

    /// Nombre de mots de la requête retrouvés dans le texte.
    private func matchCount(_ tokens: [String], in words: [String]) -> Int {
        tokens.reduce(0) { count, token in
            count + (tokenMatches(token, in: words) ? 1 : 0)
        }
    }

    /// Un mot matche en préfixe, en sous-chaîne (≥ 3 lettres) ou à une ou
    /// deux fautes de frappe près (distance d'édition).
    private func tokenMatches(_ token: String, in words: [String]) -> Bool {
        words.contains { word in
            if word.hasPrefix(token) { return true }
            if token.count >= 3 && word.contains(token) { return true }
            if token.count >= 4 && word.count >= 4 && token.hasPrefix(word) { return true }
            if token.count >= 4 {
                let tolerance = token.count >= 7 ? 2 : 1
                if Self.editDistance(token, word, max: tolerance) <= tolerance { return true }
            }
            return false
        }
    }

    /// Distance de Levenshtein bornée (arrêt anticipé au-delà de `max`).
    nonisolated private static func editDistance(_ a: String, _ b: String, max limit: Int) -> Int {
        let aChars = Array(a), bChars = Array(b)
        if abs(aChars.count - bChars.count) > limit { return limit + 1 }
        var previous = Array(0...bChars.count)
        for (i, aChar) in aChars.enumerated() {
            var current = [i + 1]
            var rowMin = i + 1
            for (j, bChar) in bChars.enumerated() {
                let cost = aChar == bChar ? 0 : 1
                let value = Swift.min(previous[j] + cost, previous[j + 1] + 1, current[j] + 1)
                current.append(value)
                rowMin = Swift.min(rowMin, value)
            }
            if rowMin > limit { return limit + 1 }
            previous = current
        }
        return previous[bChars.count]
    }

    /// Tout ce qui décrit un musicien, en mots normalisés.
    private func haystack(for musician: Musician) -> [String] {
        var parts: [String] = [
            musician.name,
            musician.name.handleized,
            // Variante collée du @pseudo — « marcosilva » doit marcher aussi.
            musician.name.handleized.replacingOccurrences(of: ".", with: ""),
            musician.neighborhood
        ]
        for instrument in musician.instruments {
            parts.append(instrument.rawValue)
            parts.append(tr(instrument.rawValue))
            parts.append(contentsOf: instrument.searchAliases)
        }
        for genre in musician.genres {
            parts.append(genre.rawValue)
            parts.append(tr(genre.rawValue))
            parts.append(genre.family.rawValue)
        }
        parts.append(musician.level.rawValue)
        parts.append(musician.availability.badgeLabel)
        return parts.flatMap { (part: String) -> [String] in
            Self.normalized(part).split(separator: " ").map(String.init)
        }
            .flatMap { $0.split(separator: ".").map(String.init) }
    }

    /// Tout ce qui décrit une annonce SOS, en mots normalisés.
    private func haystack(for gig: GigRequest) -> [String] {
        var parts: [String] = [gig.title, gig.place, gig.neighborhood, gig.hostName, "sos"]
        for instrument in gig.wantedInstruments {
            parts.append(instrument.rawValue)
            parts.append(tr(instrument.rawValue))
            parts.append(contentsOf: instrument.searchAliases)
        }
        parts.append(gig.genre.rawValue)
        parts.append(tr(gig.genre.rawValue))
        parts.append(gig.genre.family.rawValue)
        return parts.flatMap { Self.normalized($0).split(separator: " ").map(String.init) }
    }

    // MARK: - Actions

    func addEvent(_ event: GigRequest) {
        guard acceptsUserContent(event.title + " " + event.descriptionText) else { return }
        events.append(event)
        events.sort { $0.date < $1.date }
        persistEvents()
        if let backend, let userID = liveUserID {
            Task {
                do {
                    try await backend.createGig(event, hostID: userID)
                    await backend.deliverPendingPushNotifications()
                }
                catch { backendError = tr("L'annonce n'a pas pu être publiée sur le serveur.") }
            }
        }
    }

    func toggleApply(_ event: GigRequest) {
        guard let index = events.firstIndex(where: { $0.id == event.id }) else { return }
        events[index].applied.toggle()
        persistEvents()
        if let backend, let userID = liveUserID {
            let applied = events[index].applied
            Task {
                do {
                    if applied {
                        try await backend.apply(to: event.id, musicianID: userID)
                        await backend.deliverPendingPushNotifications()
                    } else {
                        try await backend.unapply(from: event.id, musicianID: userID)
                    }
                } catch {
                    backendError = tr("La candidature n'a pas pu être envoyée.")
                }
            }
        }
    }

    func saveProfile() {
        guard acceptsUserContent(profile.name + " " + profile.bio) else { return }
        Self.save(profile, key: Self.profileKey)
        if let backend, let userID = liveUserID {
            let snapshot = profile
            Task { try? await backend.saveProfile(snapshot, userID: userID) }
        }
    }

    /// Envoie un message. En mode live il part sur le serveur (temps réel) ;
    /// en démo, une réponse scriptée rend la conversation vivante.
    func sendMessage(_ text: String, in conversation: Conversation) {
        guard acceptsUserContent(text) else { return }
        guard let index = conversations.firstIndex(where: { $0.id == conversation.id }) else { return }

        if let backend, let userID = liveUserID {
            let conversationID = conversation.id
            Task { [weak self] in
                do {
                    let message = try await backend.sendMessage(text, conversationID: conversationID, senderID: userID)
                    await backend.deliverPendingPushNotifications()
                    guard let self,
                          let i = self.conversations.firstIndex(where: { $0.id == conversationID }),
                          !self.conversations[i].messages.contains(where: { $0.id == message.id })
                    else { return }
                    withAnimation { self.conversations[i].messages.append(message) }
                    if self.isDemoContact(conversation.contactName) {
                        try? await Task.sleep(for: .seconds(1.2))
                        try? await backend.replyAsDemo(conversationID: conversationID)
                    }
                } catch {
                    self?.backendError = self?.tr("Le message n'a pas pu être envoyé.")
                }
            }
            return
        }

        conversations[index].messages.append(Message(text: text, isFromMe: true, date: Date()))
        persistConversations()

        let conversationID = conversation.id
        let reply = Self.scriptedReplies.randomElement() ?? "Super, à bientôt !"
        Task { [weak self] in
            try? await Task.sleep(for: .seconds(Double.random(in: 1.2...2.2)))
            guard let self, let i = self.conversations.firstIndex(where: { $0.id == conversationID }) else { return }
            withAnimation {
                self.conversations[i].messages.append(Message(text: reply, isFromMe: false, date: Date()))
            }
            self.persistConversations()
        }
    }

    /// Ouvre (ou retrouve) une conversation avec un musicien depuis sa fiche.
    /// En mode live, la conversation est créée côté serveur.
    func conversation(with musician: Musician) async -> Conversation {
        if let backend, let userID = liveUserID {
            do {
                let row = try await backend.ensureConversation(with: musician.id, myID: userID)
                if let existing = conversations.first(where: { $0.id == row.id }) {
                    return existing
                }
                let new = Conversation(
                    id: row.id,
                    contactName: musician.name,
                    contactInstrument: musician.instruments.first ?? .voix,
                    messages: []
                )
                conversations.insert(new, at: 0)
                return new
            } catch {
                backendError = tr("Impossible d'ouvrir la conversation.")
                // Repli local pour ne pas bloquer l'utilisateur.
            }
        }
        return openConversation(name: musician.name, instrument: musician.instruments.first ?? .voix)
    }

    private func openConversation(name: String, instrument: Instrument) -> Conversation {
        if let existing = conversations.first(where: { $0.contactName == name }) {
            return existing
        }
        let new = Conversation(contactName: name, contactInstrument: instrument, messages: [])
        conversations.insert(new, at: 0)
        persistConversations()
        return new
    }

    /// Réinitialise la démo (utile pour les présentations).
    /// Jamais en mode live : le reset écraserait l'état d'un vrai compte.
    func resetDemo() {
        guard !isLive else { return }
        UserDefaults.standard.removeObject(forKey: Self.eventsKey)
        UserDefaults.standard.removeObject(forKey: Self.conversationsKey)
        UserDefaults.standard.removeObject(forKey: Self.profileKey)
        UserDefaults.standard.removeObject(forKey: Self.favoritesKey)
        UserDefaults.standard.removeObject(forKey: Self.appreciationsKey)
        UserDefaults.standard.removeObject(forKey: Self.premiumKey)
        UserDefaults.standard.removeObject(forKey: Self.premiumPlanKey)
        UserDefaults.standard.removeObject(forKey: Self.followingKey)
        UserDefaults.standard.removeObject(forKey: Self.playedWithKey)
        UserDefaults.standard.removeObject(forKey: Self.groupsKey)
        favorites = []
        following = Self.demoFollowing
        Self.save(following, key: Self.followingKey)
        playedWith = []
        groups = []
        myAppreciations = [:]
        isPremium = false
        premiumPlan = nil
        let seed = Self.loadSeed()
        musicians = seed.musicians
        events = Self.projectedSeedEvents(seed.events).sorted { $0.date < $1.date }
        conversations = seed.conversations
        profile = Self.defaultProfile
        armEarlyAccessTeaser()
    }

    // MARK: - Persistance

    // En mode live, UserDefaults reste le bac à sable de la démo : on n'y
    // écrit jamais les données serveur.
    private func persistEvents() {
        guard !isLive else { return }
        Self.save(events, key: Self.eventsKey)
    }
    private func persistConversations() {
        guard !isLive else { return }
        Self.save(conversations, key: Self.conversationsKey)
    }

    private static func save<T: Encodable>(_ value: T, key: String) {
        if let data = try? JSONEncoder().encode(value) {
            UserDefaults.standard.set(data, forKey: key)
        }
    }

    private static func load<T: Decodable>(key: String) -> T? {
        guard let data = UserDefaults.standard.data(forKey: key) else { return nil }
        return try? JSONDecoder().decode(T.self, from: data)
    }

    // MARK: - Seed

    private struct Seed: Decodable {
        var musicians: [Musician]
        var events: [GigRequest]
        var conversations: [Conversation]
    }

    private static func loadSeed() -> (musicians: [Musician], events: [GigRequest], conversations: [Conversation]) {
        guard let url = Bundle.main.url(forResource: "SeedData", withExtension: "json"),
              let data = try? Data(contentsOf: url) else {
            assertionFailure("SeedData.json introuvable dans le bundle")
            return ([], [], [])
        }
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        do {
            let seed = try decoder.decode(Seed.self, from: data)
            return (seed.musicians, seed.events, seed.conversations)
        } catch {
            assertionFailure("SeedData.json invalide : \(error)")
            return ([], [], [])
        }
    }

    private static let scriptedReplies: [String] = [
        "Parfait, tu me sauves ! Je t'envoie la setlist tout de suite.",
        "Top. Balance à 18h30, concert à 20h30 — ça joue pour toi ?",
        "Génial 🙏 Le cachet c'est CHF 150, payé le soir même.",
        "Super ! Tu as besoin d'un ampli sur place ou tu amènes le tien ?",
        "Merci mille fois. Je te briefe sur le répertoire par téléphone ?",
        "Nickel. Je te mets sur la liste des musiciens, entrée par les artistes."
    ]
}
