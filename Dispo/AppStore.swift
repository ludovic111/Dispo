import Foundation
import CoreLocation
import SwiftUI
import Supabase
import AVFoundation
@preconcurrency import UserNotifications
import StoreKit
import RevenueCat

/// État global de Dispo. Les données de compte viennent de Supabase ; seules
/// les préférences strictement locales restent dans UserDefaults.
@MainActor
final class AppStore: ObservableObject {

    /// Position de repli (démo, ou live sans géoloc) : centre de Genève (place du Molard).
    nonisolated static let geneva = CLLocationCoordinate2D(latitude: 46.2044, longitude: 6.1432)

    /// Ma position réelle, arrondie à ~100 m (nil tant que l'utilisateur n'a
    /// pas partagé sa géoloc). Reste sur l'appareil : ce qui part sur le
    /// serveur est flouté selon `locationPrecision`. Persistée pour rester
    /// utilisable hors ligne.
    @Published private(set) var myCoordinate: CLLocationCoordinate2D?
    /// Ce que les autres voient de ma position (ville par défaut).
    @Published private(set) var locationPrecision: LocationPrecision = .city
    /// Pays déduit de la position, ou à défaut de la région de l'iPhone.
    /// Les formulaires le proposent mais laissent toujours le modifier.
    @Published private(set) var detectedCountry: Country? = Country(isoCode: Locale.current.region?.identifier)
    private let locationService = LocationService()

    var preferredCountry: Country { detectedCountry ?? profile.country ?? .switzerland }

    /// Grille « niveau ville » (~5 km) appliquée avant toute publication.
    nonisolated static func cityRounded(_ coordinate: CLLocationCoordinate2D) -> CLLocationCoordinate2D {
        CLLocationCoordinate2D(
            latitude: (coordinate.latitude / 0.05).rounded() * 0.05,
            longitude: (coordinate.longitude / 0.05).rounded() * 0.05
        )
    }

    /// Point de référence des distances : ma vraie position en live, Genève en
    /// démo. nil en live tant que la géoloc n'est pas partagée — dans ce cas
    /// ni le filtre rayon ni les « x km » ne s'appliquent.
    var referenceCoordinate: CLLocationCoordinate2D? {
        isLive ? myCoordinate : Self.geneva
    }

    /// Distance en km jusqu'à un musicien, nil si elle ne peut pas être
    /// calculée honnêtement (pas de référence, ou profil sans géoloc en live).
    func distance(to musician: Musician) -> Double? {
        guard let reference = referenceCoordinate else { return nil }
        if isLive && !musician.hasLocation { return nil }
        return musician.distance(from: reference)
    }

    /// Distance affichable : précise (« 2,3 km ») si le musicien partage sa
    /// position exacte, sinon honnêtement approximative (« ≈ 5 km »).
    func distanceLabel(to musician: Musician) -> String? {
        guard let distance = distance(to: musician) else { return nil }
        if !isLive || musician.hasExactLocation {
            return String(format: "%.1f km", distance)
        }
        return String(format: "≈ %.0f km", max(1, distance.rounded()))
    }

    @Published var musicians: [Musician] = []
    @Published var events: [GigRequest] = []
    @Published var conversations: [Conversation] = []
    @Published var profile: MyProfile

    /// Mes notes étoilées données (par nom en démo ; le serveur fait foi en
    /// live via `liveMyRatings`). Noter quelqu'un vaut déclaration « on a
    /// joué ensemble » — les deux systèmes sont fusionnés.
    @Published var myStarRatings: [String: Int] = [:]
    /// Mes notes données côté serveur (UUID du musicien → étoiles).
    private var liveMyRatings: [UUID: Int] = [:]
    /// Ma propre note agrégée (moyenne + nb d'avis), lue du serveur.
    @Published private(set) var myRatingSummary: RatingSummary?
    /// **Bêta fermée.** Pendant la phase de test avec un cercle d'invités,
    /// aucun abonnement n'est vendu : tout est ouvert. Rien n'est simulé —
    /// il n'y a simplement pas de paywall, et le serveur ne fait dépendre
    /// aucune permission de `is_premium` (voir la migration
    /// `v13_beta_pro_rules`). Repasser à `false` le jour de la mise en vente,
    /// en restaurant la même migration côté base.
    static let isBeta = true

    /// Abonnement Premium — RevenueCat en production (StoreKit pur en repli),
    /// état local en démo. Le serveur (webhook RevenueCat) reste seul juge de
    /// `is_premium` côté base. En bêta, toujours vrai.
    @Published var isPremium: Bool = AppStore.isBeta
    /// Plan choisi (mensuel / annuel), nil si non abonné.
    @Published var premiumPlan: PremiumPlan?
    @Published var showPaywall: Bool = false
    @Published private(set) var storeProducts: [PremiumPlan: Product] = [:]
    /// Offre RevenueCat courante (clé API présente dans Secrets.plist).
    @Published private(set) var rcPackages: [PremiumPlan: Package] = [:]
    /// Étiquette d'essai gratuit par plan quand une offre d'intro « free trial »
    /// existe (ex. « 7 jours offerts »). Vide sinon.
    @Published private(set) var trialByPlan: [PremiumPlan: String] = [:]
    @Published private(set) var purchaseInProgress = false
    /// true si le SDK RevenueCat est configuré — sinon repli StoreKit direct.
    let revenueCatEnabled: Bool
    @Published var hasOnboarded: Bool = false
    /// Les nouveautés de cette version, à montrer une fois après la mise à
    /// jour. Piloté par `markWhatsNewSeen()` — jamais au premier lancement.
    @Published var showWhatsNew: Bool = false
    /// Préférence d'apparence (système / clair / sombre).
    @Published var theme: AppTheme = .dark
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
    /// Abonnés par profil (following_id → [follower_id]) — pour lister les
    /// abonnés de n'importe quel profil, pas seulement les miens.
    private var liveFollowersByProfile: [UUID: [UUID]] = [:]
    private var liveCollaborations: Set<SupabaseBackend.CollaborationRow> = []
    @Published private(set) var blockedUserIDs: Set<UUID> = []
    /// Préférence interne. L'autorisation iOS reste la source de vérité.
    @Published var notificationsEnabled: Bool = false
    @Published private(set) var notificationAuthorizationStatus: UNAuthorizationStatus = .notDetermined
    @Published var pushPreferences = PushPreferences()
    @Published private(set) var notifications: [AppNotification] = []
    @Published private(set) var pushRegistrationError: String?
    private var pushDeviceToken: String?
    private var notificationObservers: [NSObjectProtocol] = []
    /// SOS déjà passés dans le fil — pour ne notifier que les vraies
    /// nouveautés (rien à voir avec « ouvert », plus bas).
    private var seenGigIDs: Set<UUID> = []
    /// SOS que j'ai réellement ouverts : tout le reste porte une pastille
    /// « nouveau » dans la liste.
    @Published private(set) var openedGigIDs: Set<UUID> = []
    /// Le fil montre-t-il toutes les annonces, ou seulement celles qui
    /// correspondent à mes instruments et à mon niveau ?
    @Published var sosShowAll: Bool = false {
        didSet { UserDefaults.standard.set(sosShowAll, forKey: Self.sosShowAllKey) }
    }
    /// Groupes (messagerie d'équipe Premium) — synchronisés serveur en live
    /// (messages, pièces jointes, événements, présence, membres et partitions).
    @Published var groups: [GroupChat] = []
    /// Candidatures reçues par annonce (côté organisateur d'un SOS).
    @Published var applicantsByGig: [UUID: [GigApplicant]] = [:]
    /// Invités d'un soir par événement de groupe (remplaçants acceptés).
    @Published private(set) var guestsByEvent: [UUID: [EventGuest]] = [:]

    // MARK: - Backend (mode live)

    /// Backend Supabase, nil si Secrets.plist est absent (mode démo pur).
    let backend: SupabaseBackend?
    /// Identifiant de l'utilisateur connecté au backend, nil hors ligne.
    @Published var liveUserID: UUID?
    /// Jeton monotone de session. L'UUID seul ne suffit pas : une requête
    /// lancée avant déconnexion ne doit pas réinjecter son snapshot après une
    /// reconnexion rapide du même compte.
    private var liveSessionGeneration: UInt64 = 0
    @Published var liveEmail: String?
    /// true si le compte connecté a une identité Apple liée (connexion en
    /// un tap avec « Se connecter avec Apple »).
    @Published private(set) var appleLinked = false
    /// Erreur backend à montrer à l'utilisateur (bannière discrète).
    @Published var backendError: String?
    /// true une fois la restauration de session terminée — évite d'afficher
    /// l'écran de connexion pendant la vérification au lancement.
    @Published var sessionChecked: Bool = false
    /// true quand l'app affiche les données du serveur et non la démo locale.
    var isLive: Bool { liveUserID != nil }
    private var messageChannel: RealtimeChannelV2?
    private var messageTask: Task<Void, Never>?
    /// Les rafales Realtime/refresh ne doivent produire qu'un seul appel
    /// d'accusé de livraison, pas une requête REST par message.
    private var deliveryAcknowledgementTask: Task<Void, Never>?
    private var groupChannel: RealtimeChannelV2?
    private var groupTask: Task<Void, Never>?
    private var notificationChannel: RealtimeChannelV2?
    private var notificationTask: Task<Void, Never>?
    /// Conversation affichée à l'écran (ChatView) — sert à marquer « lu » en
    /// direct et à couper la notification locale du message qu'on regarde.
    private var visibleConversationID: UUID?
    /// Conversations où le contact est en train d'écrire (expiration auto).
    @Published private(set) var typingConversationIDs: Set<UUID> = []
    private var typingChannel: RealtimeChannelV2?
    private var typingTask: Task<Void, Never>?
    private var typingExpiries: [UUID: Task<Void, Never>] = [:]
    private var lastTypingPingAt: Date = .distantPast
    /// Rafraîchissement des groupes en attente (déclenché par le realtime) —
    /// coalesce les rafales d'événements en un seul rechargement.
    private var pendingGroupRefresh: Task<Void, Never>?
    /// Toutes les mutations de morceaux d'un groupe passent dans la même
    /// file. Deux drops rapides ne peuvent donc pas terminer dans l'ordre
    /// inverse, et seul le dernier refresh autorisé touche l'interface.
    private var songMutationTasks: [GroupChat.ID: Task<Void, Never>] = [:]
    private var songMutationGenerations: [GroupChat.ID: Int] = [:]
    /// Révision globale des morceaux, tous groupes confondus. Un snapshot
    /// commencé avant une mutation d'un autre groupe devient lui aussi caduc.
    private var songMutationRevision: UInt64 = 0
    /// Génération globale de lecture des groupes, partagée par le refresh
    /// complet et celui déclenché par Realtime. Seule la dernière requête
    /// démarrée peut appliquer son résultat, même sans mutation locale.
    private var groupSnapshotRequestGeneration: UInt64 = 0
    /// Temps réel des annonces SOS (publication, retrait, candidatures).
    private var gigChannel: RealtimeChannelV2?
    private var gigTask: Task<Void, Never>?
    private var pendingGigRefresh: Task<Void, Never>?
    /// Invitations de groupe reçues — à accepter ou refuser.
    @Published private(set) var myGroupInvitations: [GroupInvitation] = []
    /// Invités en attente de réponse, par groupe (visible des membres).
    @Published private(set) var pendingInvitesByGroup: [UUID: [PendingGroupInvite]] = [:]
    private var transactionTask: Task<Void, Never>?
    /// Écoute des mises à jour d'abonnement RevenueCat (renouvellement,
    /// expiration, achat sur un autre appareil…).
    private var customerInfoTask: Task<Void, Never>?

    private static let productIDs: [PremiumPlan: String] = [
        .monthly: "ch.dispo.app.premium.monthly",
        .annual: "ch.dispo.app.premium.annual"
    ]

    private static let eventsKey = "jamconnect.events"
    private static let conversationsKey = "jamconnect.conversations"
    private static let profileKey = "jamconnect.profile"
    private static let starRatingsKey = "dispo.starRatings"
    private static let premiumKey = "jamconnect.premium"
    private static let premiumPlanKey = "jamconnect.premiumPlan"
    private static let onboardedKey = "jamconnect.onboarded"
    /// Dernière version dont on a montré les nouveautés.
    private static let lastSeenVersionKey = "jamconnect.lastSeenVersion"
    private static let themeKey = "jamconnect.theme"
    private static let languageKey = "jamconnect.language"
    private static let followingKey = "jamconnect.following"
    private static let playedWithKey = "jamconnect.playedWith"
    private static let notificationsKey = "jamconnect.notifications"
    private static let pushPreferencesKey = "dispo.pushPreferences"
    private static let demoAccountsRemovedKey = "dispo.demoAccountsRemoved.v22"
    private static let seenGigsKey = "jamconnect.seenGigs"
    private static let openedGigsKey = "dispo.openedGigs"
    private static let sosShowAllKey = "dispo.sosShowAll"
    private static let groupsKey = "jamconnect.groups"
    private static let myLatitudeKey = "dispo.myLatitude"
    private static let myLongitudeKey = "dispo.myLongitude"
    private static let locationPrecisionKey = "dispo.locationPrecision"

    init() {
        if let rcKey = BackendConfig.revenueCatAPIKey() {
            Purchases.logLevel = .warn
            Purchases.configure(withAPIKey: rcKey)
            revenueCatEnabled = true
        } else {
            revenueCatEnabled = false
        }
        backend = BackendConfig.load().map(SupabaseBackend.init)
        // Une seule fois après la 2.2 : purge les comptes et conversations
        // fictifs qui pouvaient encore survivre dans UserDefaults.
        if !UserDefaults.standard.bool(forKey: Self.demoAccountsRemovedKey) {
            [Self.eventsKey, Self.conversationsKey, Self.followingKey, Self.playedWithKey, Self.groupsKey]
                .forEach(UserDefaults.standard.removeObject(forKey:))
            UserDefaults.standard.set(true, forKey: Self.demoAccountsRemovedKey)
        }
        if let saved: MyProfile = Self.load(key: Self.profileKey) {
            profile = saved
        } else {
            profile = Self.defaultProfile
        }

        // Reprend la session backend si l'utilisateur était déjà connecté.
        Task {
            await restoreLiveSession()
            await loadStoreProducts()
            await refreshPurchasedEntitlements()
            sessionChecked = true
        }
        if revenueCatEnabled {
            // RevenueCat observe et finalise les transactions lui-même ; on
            // écoute seulement l'état client (renouvellements, autre appareil).
            customerInfoTask = Task { [weak self] in
                for await info in Purchases.shared.customerInfoStream {
                    self?.applyCustomerInfo(info)
                }
            }
        } else {
            transactionTask = Task { [weak self] in
                for await update in Transaction.updates {
                    guard case .verified(let transaction) = update else { continue }
                    await transaction.finish()
                    await self?.refreshPurchasedEntitlements()
                }
            }
        }

        if let saved: [String: Int] = Self.load(key: Self.starRatingsKey) {
            myStarRatings = saved
        }
        isPremium = Self.isBeta || UserDefaults.standard.bool(forKey: Self.premiumKey)
        premiumPlan = UserDefaults.standard.string(forKey: Self.premiumPlanKey).flatMap(PremiumPlan.init)
        hasOnboarded = UserDefaults.standard.bool(forKey: Self.onboardedKey)
        prepareWhatsNew()
        theme = UserDefaults.standard.string(forKey: Self.themeKey).flatMap(AppTheme.init) ?? .dark
        language = UserDefaults.standard.string(forKey: Self.languageKey).flatMap(AppLanguage.init) ?? .systemDefault
        if let saved: Set<String> = Self.load(key: Self.followingKey) {
            following = saved
        } else {
            following = []
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
        if let saved: Set<UUID> = Self.load(key: Self.openedGigsKey) {
            openedGigIDs = saved
        }
        sosShowAll = UserDefaults.standard.bool(forKey: Self.sosShowAllKey)
        UserDefaults.standard.removeObject(forKey: Self.groupsKey)
        observePushNotifications()
        Task { await refreshNotificationAuthorization(registerIfAllowed: true) }
        // Reprogramme les rappels de présence au lancement (les triggers
        // locaux survivent au kill, mais on resynchronise après un reset).
        rescheduleAllAttendanceNotifications()

        // Position partagée lors d'une session précédente — restaurée pour que
        // le rayon et les distances fonctionnent dès le lancement.
        if let latitude = UserDefaults.standard.object(forKey: Self.myLatitudeKey) as? Double,
           let longitude = UserDefaults.standard.object(forKey: Self.myLongitudeKey) as? Double {
            myCoordinate = CLLocationCoordinate2D(latitude: latitude, longitude: longitude)
        }
        locationPrecision = UserDefaults.standard.string(forKey: Self.locationPrecisionKey)
            .flatMap(LocationPrecision.init) ?? .city
        locationService.onUpdate = { [weak self] coordinate in
            self?.handleLocationUpdate(coordinate)
        }
        locationService.onCountryUpdate = { [weak self] country in
            self?.detectedCountry = country
        }
        applyThemeToWindows()
    }

    // MARK: - Géolocalisation

    /// Demande la position (autorisation incluse). Appelée à la connexion
    /// live et à chaque retour au premier plan — c'est ce qui te rend
    /// trouvable dans les recherches sans jamais te suivre en arrière-plan.
    func requestLocation() {
        locationService.request()
    }

    /// Dernier refresh « retour au premier plan » — évite de mitrailler le
    /// serveur quand on bascule rapidement entre apps.
    private var lastForegroundRefresh: Date = .distantPast

    /// À chaque retour au premier plan en mode live : position rafraîchie et
    /// données serveur rechargées (au plus une fois par minute).
    func appBecameActive() {
        guard isLive else { return }
        requestLocation()
        Task {
            await startMessageStream()
            await startGroupStream()
            await startGigStream()
            await startNotificationStream()
        }
        guard Date().timeIntervalSince(lastForegroundRefresh) > 60 else { return }
        lastForegroundRefresh = Date()
        Task { await refreshLiveData() }
    }

    /// Nouvelle position (~100 m, jamais plus fin) : gardée sur l'appareil
    /// pour les distances et la carte, puis publiée floutée selon ma
    /// préférence — niveau ville pour tout le monde, position exacte en
    /// plus si je l'ai choisi (amis ou tous).
    private func handleLocationUpdate(_ coordinate: CLLocationCoordinate2D) {
        let changed = myCoordinate?.latitude != coordinate.latitude
            || myCoordinate?.longitude != coordinate.longitude
        myCoordinate = coordinate
        UserDefaults.standard.set(coordinate.latitude, forKey: Self.myLatitudeKey)
        UserDefaults.standard.set(coordinate.longitude, forKey: Self.myLongitudeKey)
        guard changed else { return }
        pushLocationToServer()
    }

    /// Publie ma position selon la préférence courante — ou l'efface
    /// complètement si j'ai choisi de ne pas apparaître sur la carte.
    private func pushLocationToServer() {
        guard let backend, let userID = liveUserID else { return }
        let precision = locationPrecision
        guard precision.sharesLocation else {
            // Masqué : plus aucune coordonnée côté serveur, ni approximative
            // ni exacte. Mon profil reste trouvable par nom et par instrument.
            Task {
                try? await backend.clearCityLocation(userID: userID)
                try? await backend.deleteExactLocation(userID: userID)
            }
            return
        }
        guard let coordinate = myCoordinate else { return }
        let city = Self.cityRounded(coordinate)
        Task {
            try? await backend.updateCityLocation(
                latitude: city.latitude,
                longitude: city.longitude,
                userID: userID
            )
            if precision == .city {
                try? await backend.deleteExactLocation(userID: userID)
            } else {
                try? await backend.upsertExactLocation(
                    latitude: coordinate.latitude,
                    longitude: coordinate.longitude,
                    userID: userID
                )
            }
        }
    }

    /// Change la préférence de partage de position et met le serveur en
    /// cohérence immédiatement (position exacte posée ou effacée).
    func setLocationPrecision(_ precision: LocationPrecision) {
        locationPrecision = precision
        UserDefaults.standard.set(precision.rawValue, forKey: Self.locationPrecisionKey)
        guard let backend, let userID = liveUserID else { return }
        Task {
            do {
                try await backend.updateLocationPrecision(precision, userID: userID)
            } catch {
                backendError = tr("Le réglage de position n'a pas pu être enregistré.")
            }
        }
        pushLocationToServer()
        if precision.sharesLocation && myCoordinate == nil { requestLocation() }
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
        liveSessionGeneration &+= 1
        invalidateGroupWorkForSessionChange()
        // État strictement lié au compte : ne jamais montrer ni rendre
        // ouvrable le cache de la session précédente pendant l'hydratation.
        musicians = []
        events = []
        conversations = []
        groups = []
        notifications = []
        Self.purgeCachedMessageAttachments()
        liveUserID = userID
        liveEmail = await backend.currentUserEmail()
        appleLinked = await backend.isAppleLinked()
        backendError = nil

        // Relie l'abonné RevenueCat au compte Supabase : le webhook serveur
        // pourra alors activer is_premium sur le bon profil.
        if revenueCatEnabled {
            if let result = try? await Purchases.shared.logIn(userID.uuidString) {
                applyCustomerInfo(result.customerInfo)
            }
        }
        // Géoloc réelle : demandée à la connexion (autorisation « pendant
        // l'utilisation »), la démo garde la position simulée de Genève.
        requestLocation()

        // Premier passage : si le profil serveur est vide, on pousse le
        // profil local ; sinon le serveur fait foi. Premium et admin
        // viennent toujours du serveur.
        let initialProfiles = try? await backend.fetchProfiles()
        if let mine = initialProfiles?.first(where: { $0.id == userID }) {
            if mine.name.isEmpty {
                try? await backend.saveProfile(profile, userID: userID)
            } else {
                applyServerProfile(mine)
            }
            isPremium = Self.isBeta || mine.isPremium
            // La préférence de partage de position suit le compte.
            if let precision = mine.locationPrecision.flatMap(LocationPrecision.init(rawValue:)) {
                locationPrecision = precision
                UserDefaults.standard.set(precision.rawValue, forKey: Self.locationPrecisionKey)
            }
        }
        // Realtime d'abord, snapshot ensuite : aucun message n'est perdu
        // entre le SELECT initial et l'ouverture du canal.
        await startMessageStream()
        await startGroupStream()
        await startGigStream()
        await startNotificationStream()
        await refreshLiveData(prefetchedProfiles: initialProfiles)
        await backend.cleanupPendingMessageFiles()
        await refreshNotificationAuthorization(registerIfAllowed: true)
        backfillVideoThumbnails()
    }

    /// Recharge musiciens, annonces, conversations et groupes depuis le serveur.
    func refreshLiveData(
        prefetchedProfiles: [SupabaseBackend.ProfileRow]? = nil
    ) async {
        guard let backend, let userID = liveUserID else { return }
        let snapshotSessionGeneration = liveSessionGeneration
        do {
            let profiles: [SupabaseBackend.ProfileRow]
            if let prefetchedProfiles {
                profiles = prefetchedProfiles
            } else {
                profiles = try await backend.fetchProfiles()
            }
            let allMusicians = profiles
                .filter { $0.id != userID && $0.isDemo != true }
                .compactMap { $0.asMusician() }
            async let gigsTask = backend.fetchGigs(myID: userID)
            async let conversationsTask = backend.fetchConversations(
                myID: userID,
                profiles: profiles
            )
            async let followsTask = backend.fetchFollows()
            async let ratingsTask = backend.fetchMyRatings(me: userID)
            async let collaborationsTask = backend.fetchCollaborations()
            async let blocksTask = backend.fetchBlockedUsers(me: userID)
            async let exactLocationsTask = backend.fetchExactLocations()
            async let notificationsTask = backend.fetchNotifications()
            let (g, allConversations, follows, myRatingRows, collaborations, blocks) = try await (
                gigsTask, conversationsTask,
                followsTask, ratingsTask, collaborationsTask, blocksTask
            )
            let fetchedNotifications = try? await notificationsTask
            let exactLocations = (try? await exactLocationsTask) ?? []
            guard Self.isMatchingLiveSession(
                expectedUserID: userID,
                currentUserID: liveUserID,
                expectedGeneration: snapshotSessionGeneration,
                currentGeneration: liveSessionGeneration
            ) else { return }

            // Aucun état de compte n'est muté avant ce garde : un refresh
            // parti sous A ne peut pas repeupler la session B après ses awaits.
            blockedUserIDs = blocks
            notifications = fetchedNotifications ?? notifications
            syncApplicationBadge()
            // Positions exactes partagées avec moi (RLS) : elles remplacent
            // la position ville des profils concernés.
            let exactByID = Dictionary(
                uniqueKeysWithValues: exactLocations.map { ($0.userId, $0) }
            )
            musicians = allMusicians
                .filter { !blocks.contains($0.id) }
                .map { musician in
                    guard let exact = exactByID[musician.id] else { return musician }
                    var updated = musician
                    updated.latitude = exact.latitude
                    updated.longitude = exact.longitude
                    updated.hasLocation = true
                    updated.hasExactLocation = true
                    return updated
                }
            events = g.sorted { $0.date < $1.date }
            notifyNewGigs(g)
            let blockedNames = Set(profiles.filter { blocks.contains($0.id) }.map(\.name))
            conversations = Self.mergedConversations(
                remote: allConversations.filter { !blockedNames.contains($0.contactName) },
                local: conversations
            ).sorted {
                ($0.lastMessage?.date ?? .distantPast) > ($1.lastMessage?.date ?? .distantPast)
            }
            // Tout ce qui vient d'être chargé est arrivé jusqu'à moi : les
            // expéditeurs peuvent passer leurs coches à « reçu ».
            acknowledgeDelivery()
            liveFollowingIDs = Set(follows.filter { $0.followerId == userID }.map(\.followingId))
            liveFollowerIDs = Set(follows.filter { $0.followingId == userID }.map(\.followerId))
            liveFollowerCounts = Dictionary(grouping: follows, by: \.followingId).mapValues(\.count)
            liveFollowersByProfile = Dictionary(grouping: follows, by: \.followingId).mapValues { $0.map(\.followerId) }
            liveCollaborations = Set(collaborations)
            let nameByID = Dictionary(uniqueKeysWithValues: profiles.map { ($0.id, $0.name) })
            following = Set(profiles.filter { liveFollowingIDs.contains($0.id) }.map(\.name))
            liveMyRatings = Dictionary(uniqueKeysWithValues: myRatingRows.map { ($0.ratedId, $0.stars) })
            playedWith = Set(profiles.filter { id in
                collaborations.contains { edge in
                    (edge.aId == userID && edge.bId == id.id) || (edge.bId == userID && edge.aId == id.id)
                }
            }.map(\.name))
            // Mon propre profil serveur : note agrégée + vidéos hébergées.
            // (On ne réécrit pas les champs éditables — l'édition locale en
            // cours ferait des allers-retours ; ni isPremium, géré par
            // RevenueCat pour éviter un flottement le temps du webhook.)
            if let mine = profiles.first(where: { $0.id == userID }) {
                myRatingSummary = (mine.ratingCount ?? 0) > 0
                    ? RatingSummary(average: mine.ratingAvg ?? 0, count: mine.ratingCount ?? 0)
                    : nil
                profile.demoVideos = (mine.demoVideos ?? []).map(\.asDemoVideo)
                profile.videoFileNames = nil
                // L'URL hébergée fait foi : c'est elle que les autres voient.
                profile.photoURL = mine.photoUrl
            }
            healProfilePhotoIfNeeded()
            let groupSnapshotRevision = songMutationRevision
            groupSnapshotRequestGeneration &+= 1
            let groupSnapshotRequest = groupSnapshotRequestGeneration
            let remoteGroups = try await backend.fetchGroups(
                myID: userID,
                myName: profile.name,
                nameByID: nameByID
            )
            guard Self.isMatchingLiveSession(
                expectedUserID: userID,
                currentUserID: liveUserID,
                expectedGeneration: snapshotSessionGeneration,
                currentGeneration: liveSessionGeneration
            ) else { return }
            if Self.canApplyGroupSnapshot(
                snapshotUserID: userID,
                currentUserID: liveUserID,
                snapshotSessionGeneration: snapshotSessionGeneration,
                currentSessionGeneration: liveSessionGeneration,
                snapshotRevision: groupSnapshotRevision,
                currentRevision: songMutationRevision,
                hasPendingMutations: !songMutationTasks.isEmpty,
                snapshotRequestGeneration: groupSnapshotRequest,
                currentRequestGeneration: groupSnapshotRequestGeneration
            ) {
                // Messages ET partitions viennent du serveur (les partitions
                // sont hébergées depuis la 1.0 — visibles par tout le groupe).
                groups = Self.mergedGroups(remote: remoteGroups, local: groups)
                    .sorted(by: Self.groupHasNewerActivity)
                persistGroups()
                seedGroupLastSeenIfNeeded()
            }
            await refreshGroupInvitations(nameByID: nameByID)
            guard Self.isMatchingLiveSession(
                expectedUserID: userID,
                currentUserID: liveUserID,
                expectedGeneration: snapshotSessionGeneration,
                currentGeneration: liveSessionGeneration
            ) else { return }
            await refreshEventGuests()
            guard Self.isMatchingLiveSession(
                expectedUserID: userID,
                currentUserID: liveUserID,
                expectedGeneration: snapshotSessionGeneration,
                currentGeneration: liveSessionGeneration
            ) else { return }
            loadAllApplicants()
            rescheduleAllAttendanceNotifications()
            runAutoSOSIfNeeded()
            backendError = nil
        } catch {
            guard Self.isMatchingLiveSession(
                expectedUserID: userID,
                currentUserID: liveUserID,
                expectedGeneration: snapshotSessionGeneration,
                currentGeneration: liveSessionGeneration
            ) else { return }
            backendError = tr("Connexion au serveur impossible — vérifie le réseau.")
        }
    }

    /// Reflète mon profil serveur en local, sans perdre les champs qui ne
    /// vivent que sur l'appareil (photo locale, pays / ville choisis).
    private func applyServerProfile(_ mine: SupabaseBackend.ProfileRow) {
        var updated = profile
        updated.name = mine.name
        updated.instruments = mine.instruments.compactMap(Instrument.init(rawValue:))
        updated.genres = mine.genres.compactMap(Genre.init(rawValue:))
        updated.level = Level(rawValue: mine.level) ?? .intermediaire
        updated.bio = mine.bio
        updated.availableDates = mine.parsedDates
        updated.country = Country(isoCode: mine.country) ?? updated.country
        if let city = mine.city, !city.isEmpty { updated.city = city }
        if let postalCode = mine.postalCode, !postalCode.isEmpty { updated.postalCode = postalCode }
        updated.availabilityPlaces = (mine.availabilityPlaces ?? [])
            .compactMap(\.asAvailabilityPlace)
        if let socials = mine.socials, !socials.isEmpty {
            updated.socials = socials
        }
        // Les vidéos hébergées font foi en live (elles suivent le compte).
        updated.demoVideos = (mine.demoVideos ?? []).map(\.asDemoVideo)
        updated.videoFileNames = nil
        // Ma photo hébergée : repli d'affichage si le fichier local manque
        // (nouvel appareil, réinstallation).
        updated.photoURL = mine.photoUrl
        profile = updated
        myRatingSummary = (mine.ratingCount ?? 0) > 0
            ? RatingSummary(average: mine.ratingAvg ?? 0, count: mine.ratingCount ?? 0)
            : nil
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
        // Invalide immédiatement les lectures et écritures démarrées sous la
        // session sortante, avant les awaits de nettoyage réseau.
        liveSessionGeneration &+= 1
        invalidateGroupWorkForSessionChange()
        if let token = pushDeviceToken {
            try? await backend.deletePushDevice(token: token)
        }
        if revenueCatEnabled {
            _ = try? await Purchases.shared.logOut()
        }
        await backend.signOut()
        liveUserID = nil
        liveEmail = nil
        appleLinked = false
        backendError = nil
        liveFollowingIDs = []
        liveFollowerIDs = []
        liveFollowersByProfile = [:]
        liveFollowerCounts = [:]
        liveCollaborations = []
        blockedUserIDs = []
        messageTask?.cancel()
        messageTask = nil
        deliveryAcknowledgementTask?.cancel()
        deliveryAcknowledgementTask = nil
        if let channel = messageChannel {
            await backend.client.removeChannel(channel)
            messageChannel = nil
        }
        groupTask?.cancel()
        groupTask = nil
        if let channel = groupChannel {
            await backend.client.removeChannel(channel)
            groupChannel = nil
        }
        gigTask?.cancel()
        gigTask = nil
        pendingGigRefresh?.cancel()
        pendingGigRefresh = nil
        if let channel = gigChannel {
            await backend.client.removeChannel(channel)
            gigChannel = nil
        }
        notificationTask?.cancel()
        notificationTask = nil
        if let channel = notificationChannel {
            await backend.client.removeChannel(channel)
            notificationChannel = nil
        }
        notifications = []
        syncApplicationBadge()
        myGroupInvitations = []
        pendingInvitesByGroup = [:]
        stopTypingChannel()
        typingExpiries.values.forEach { $0.cancel() }
        typingExpiries = [:]
        typingConversationIDs = []
        visibleConversationID = nil
        publicGroupsByProfile = [:]
        musicians = []
        events = []
        conversations = []
        groups = []
        profile = Self.defaultProfile
        following = []
        playedWith = []
        liveMyRatings = [:]
        myRatingSummary = nil
        [
            Self.eventsKey, Self.conversationsKey, Self.groupsKey, Self.profileKey,
            Self.followingKey, Self.playedWithKey, Self.starRatingsKey,
            Self.groupLastSeenKey
        ].forEach(UserDefaults.standard.removeObject(forKey:))
        Self.purgeCachedMessageAttachments()
        isPremium = Self.isBeta || UserDefaults.standard.bool(forKey: Self.premiumKey)
    }

    /// Écoute les nouveaux messages en temps réel et les range dans la bonne
    /// conversation (dédoublonnés — notre propre envoi arrive aussi par ici).
    private func startMessageStream() async {
        guard let backend, isLive, messageTask == nil else { return }
        let channel: RealtimeChannelV2
        let stream: AsyncStream<SupabaseBackend.MessageEvent>
        do {
            (channel, stream) = try await backend.messageStream()
        } catch {
            backendError = tr("La messagerie en temps reel n'a pas pu demarrer.")
            return
        }
        messageChannel = channel
        messageTask = Task { [weak self] in
            for await event in stream {
                switch event {
                case .inserted(let row): await self?.handleIncomingMessage(row)
                case .updated(let row): self?.handleMessageUpdate(row)
                case .reactionsChanged(let messageID):
                    await self?.refreshMessageReactions(messageID)
                }
            }
            guard !Task.isCancelled, let self, self.isLive else { return }
            self.messageTask = nil
            if let channel = self.messageChannel {
                await backend.client.removeChannel(channel)
                self.messageChannel = nil
            }
            try? await Task.sleep(for: .seconds(3))
            guard !Task.isCancelled else { return }
            await self.startMessageStream()
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
                // Le contact a forcément fini d'écrire.
                setTyping(false, in: row.conversationId)
                if visibleConversationID == row.conversationId {
                    // Je regarde la conversation : lu immédiatement, pas de bannière.
                    markConversationRead(row.conversationId)
                    markLocalRead(row.conversationId)
                } else {
                    acknowledgeDelivery()
                }
            }
            conversations.sort {
                ($0.lastMessage?.date ?? .distantPast) > ($1.lastMessage?.date ?? .distantPast)
            }
        } else {
            // Conversation inconnue : quelqu'un vient de m'écrire pour la première fois.
            await refreshLiveData()
        }
    }

    /// UPDATE realtime sur un message : les coches « reçu / lu » bougent.
    private func handleMessageUpdate(_ row: SupabaseBackend.MessageRow) {
        guard let userID = liveUserID,
              let c = conversations.firstIndex(where: { $0.id == row.conversationId }),
              let m = conversations[c].messages.firstIndex(where: { $0.id == row.id })
        else { return }
        let previous = conversations[c].messages[m]
        let message = row.asMessage(
            myID: userID,
            reactions: row.deletedAt == nil ? previous.reactionSummaries : []
        )
        if row.deletedAt != nil, let attachment = previous.attachment {
            Self.removeCachedMessageAttachment(attachment)
        }
        conversations[c].messages[m] = message
    }

    private func refreshMessageReactions(_ messageID: UUID) async {
        guard let backend, let userID = liveUserID,
              let c = conversations.firstIndex(where: {
                  $0.messages.contains { $0.id == messageID }
              }),
              let m = conversations[c].messages.firstIndex(where: { $0.id == messageID }),
              conversations[c].messages[m].deletedAt == nil
        else { return }
        guard let reactions = try? await backend.fetchMessageReactionSummaries(
            messageID: messageID,
            myID: userID
        ) else { return }
        conversations[c].messages[m].reactions = reactions
    }

    // MARK: - Accusés de réception

    /// Préviens le serveur que tout ce qui m'était destiné est arrivé ici.
    private func acknowledgeDelivery() {
        guard let backend, isLive, deliveryAcknowledgementTask == nil else { return }
        deliveryAcknowledgementTask = Task { [weak self] in
            try? await Task.sleep(for: .milliseconds(450))
            guard !Task.isCancelled else { return }
            try? await backend.markMessagesDelivered()
            self?.deliveryAcknowledgementTask = nil
        }
    }

    /// Marque « lu » côté serveur et reflète l'état en local.
    private func markConversationRead(_ conversationID: UUID) {
        guard let backend, isLive else { return }
        Task { try? await backend.markConversationRead(conversationID) }
    }

    // MARK: - Messages non lus

    /// Dernière visite de chaque groupe (les messages de groupe n'ont pas
    /// d'accusé de lecture serveur — on garde le repère sur l'appareil).
    private static let groupLastSeenKey = "dispo.groups.lastSeen"
    private var groupLastSeen: [String: Date] {
        get { (UserDefaults.standard.dictionary(forKey: Self.groupLastSeenKey) as? [String: Date]) ?? [:] }
        set { UserDefaults.standard.set(newValue, forKey: Self.groupLastSeenKey) }
    }

    /// Messages reçus et pas encore lus dans une conversation. En démo il n'y
    /// a pas d'accusés : rien n'est « non lu ».
    func unreadCount(in conversation: Conversation) -> Int {
        guard isLive else { return 0 }
        return conversation.messages.filter {
            !$0.isFromMe && $0.readAt == nil && $0.deletedAt == nil
        }.count
    }

    /// Messages de groupe arrivés depuis ma dernière visite.
    func unreadCount(in group: GroupChat) -> Int {
        guard let seen = groupLastSeen[group.id.uuidString] else { return 0 }
        return group.messages.filter {
            !$0.isFromMe && $0.date > seen && $0.deletedAt == nil
        }.count
    }

    /// La pastille de l'onglet Messages.
    var totalUnread: Int {
        conversations.reduce(0) { $0 + unreadCount(in: $1) }
            + groups.reduce(0) { $0 + unreadCount(in: $1) }
    }

    /// Un groupe jamais ouvert ne doit pas afficher tout son historique comme
    /// non lu : on pose le repère à maintenant la première fois qu'on le voit.
    private func seedGroupLastSeenIfNeeded() {
        var seen = groupLastSeen
        var changed = false
        for group in groups where seen[group.id.uuidString] == nil {
            seen[group.id.uuidString] = Date()
            changed = true
        }
        if changed { groupLastSeen = seen }
    }

    /// Le groupe vient d'être ouvert : tout ce qui précède est lu.
    func markGroupSeen(_ groupID: GroupChat.ID) {
        var seen = groupLastSeen
        seen[groupID.uuidString] = Date()
        groupLastSeen = seen
        objectWillChange.send()
    }

    /// Reflète « lu » localement, sans attendre l'aller-retour serveur : la
    /// puce doit disparaître à l'instant où on ouvre la conversation.
    private func markLocalRead(_ conversationID: UUID) {
        guard let index = conversations.firstIndex(where: { $0.id == conversationID }) else { return }
        for m in conversations[index].messages.indices
        where !conversations[index].messages[m].isFromMe && conversations[index].messages[m].readAt == nil {
            conversations[index].messages[m].readAt = Date()
        }
    }

    // MARK: - Conversation ouverte & indicateur de saisie

    /// ChatView vient d'apparaître : marquer lu et écouter le typing.
    func chatOpened(_ conversationID: UUID) {
        visibleConversationID = conversationID
        guard isLive else { return }
        markConversationRead(conversationID)
        markLocalRead(conversationID)
        startTypingChannel(conversationID)
    }

    /// ChatView disparaît : plus de « lu » automatique ni d'écoute typing.
    func chatClosed(_ conversationID: UUID) {
        if visibleConversationID == conversationID { visibleConversationID = nil }
        setTyping(false, in: conversationID)
        stopTypingChannel()
    }

    /// Appelé par ChatView à chaque frappe — throttlé pour ne pas mitrailler.
    func userIsTyping(in conversationID: UUID) {
        guard isLive, let backend, let userID = liveUserID,
              let channel = typingChannel,
              Date().timeIntervalSince(lastTypingPingAt) > 2
        else { return }
        lastTypingPingAt = Date()
        Task { await backend.sendTypingPing(on: channel, myID: userID) }
    }

    private func startTypingChannel(_ conversationID: UUID) {
        guard let backend, isLive else { return }
        stopTypingChannel()
        typingTask = Task { [weak self] in
            do {
                let (channel, stream) = try await backend.typingChannel(conversationID: conversationID)
                self?.typingChannel = channel
                for await senderID in stream {
                    guard let self, senderID != self.liveUserID else { continue }
                    self.setTyping(true, in: conversationID)
                }
            } catch {
                // Pas de canal typing : la conversation reste utilisable.
            }
        }
    }

    private func stopTypingChannel() {
        typingTask?.cancel()
        typingTask = nil
        if let channel = typingChannel, let backend {
            typingChannel = nil
            Task { await backend.client.removeChannel(channel) }
        }
    }

    /// Allume/éteint « en train d'écrire » ; l'allumage expire tout seul.
    private func setTyping(_ typing: Bool, in conversationID: UUID) {
        typingExpiries[conversationID]?.cancel()
        typingExpiries[conversationID] = nil
        if typing {
            if !typingConversationIDs.contains(conversationID) {
                withAnimation { _ = typingConversationIDs.insert(conversationID) }
            }
            typingExpiries[conversationID] = Task { [weak self] in
                try? await Task.sleep(for: .seconds(4))
                guard !Task.isCancelled else { return }
                self?.setTyping(false, in: conversationID)
            }
        } else if typingConversationIDs.contains(conversationID) {
            withAnimation { _ = typingConversationIDs.remove(conversationID) }
        }
    }

    /// Écoute les groupes en temps réel : les messages arrivent en
    /// incrémental, les autres changements (événement créé, présence,
    /// membres, répertoire) déclenchent un rechargement des groupes.
    private func startGroupStream() async {
        guard let backend, isLive, groupTask == nil else { return }
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
                case .messageUpdated(let row):
                    self?.handleGroupMessageUpdate(row)
                case .reactionsChanged(let messageID):
                    await self?.refreshGroupMessageReactions(messageID)
                case .groupsChanged:
                    self?.scheduleGroupRefresh()
                }
            }
            guard !Task.isCancelled, let self, self.isLive else { return }
            self.groupTask = nil
            if let channel = self.groupChannel {
                await backend.client.removeChannel(channel)
                self.groupChannel = nil
            }
            try? await Task.sleep(for: .seconds(3))
            guard !Task.isCancelled else { return }
            await self.startGroupStream()
        }
    }

    /// Démarre le temps réel des SOS : publication, retrait ou candidature
    /// → rechargement coalescé du feed (le feed reste juste sans relance).
    private func startGigStream() async {
        guard let backend, gigTask == nil else { return }
        let channel: RealtimeChannelV2
        let stream: AsyncStream<Void>
        do {
            (channel, stream) = try await backend.gigStream()
        } catch {
            // Pas de bannière : le refresh au premier plan rattrape déjà.
            return
        }
        gigChannel = channel
        gigTask = Task { [weak self] in
            for await _ in stream {
                self?.scheduleGigRefresh()
            }
        }
    }

    /// Le centre dans l'app suit la même file que les pushes APNs. Chaque
    /// insertion met immédiatement à jour la cloche et la puce de l'icône.
    private func startNotificationStream() async {
        guard let backend, notificationTask == nil else { return }
        let channel: RealtimeChannelV2
        let stream: AsyncStream<AppNotification>
        do {
            (channel, stream) = try await backend.notificationStream()
        } catch {
            // Le retour au premier plan recharge aussi le centre.
            return
        }
        notificationChannel = channel
        notificationTask = Task { [weak self] in
            for await notification in stream {
                guard let self, notification.userID == self.liveUserID else { continue }
                if !self.notifications.contains(where: { $0.id == notification.id }) {
                    withAnimation { self.notifications.insert(notification, at: 0) }
                    self.syncApplicationBadge()
                }
            }
        }
    }

    /// Coalesce les rafales d'événements SOS en un seul rechargement.
    private func scheduleGigRefresh() {
        guard pendingGigRefresh == nil else { return }
        pendingGigRefresh = Task { [weak self] in
            try? await Task.sleep(for: .milliseconds(400))
            guard !Task.isCancelled else { return }
            await self?.refreshGigs()
            self?.pendingGigRefresh = nil
        }
    }

    /// Recharge uniquement le feed SOS (plus léger que refreshLiveData).
    private func refreshGigs() async {
        guard let backend, let userID = liveUserID else { return }
        let sessionGeneration = liveSessionGeneration
        guard let fresh = try? await backend.fetchGigs(myID: userID) else { return }
        guard Self.isMatchingLiveSession(
            expectedUserID: userID,
            currentUserID: liveUserID,
            expectedGeneration: sessionGeneration,
            currentGeneration: liveSessionGeneration
        ) else { return }
        withAnimation {
            events = fresh.sorted { $0.date < $1.date }
        }
        persistEvents()
        loadAllApplicants()
        await refreshEventGuests()
    }

    private func handleIncomingGroupMessage(_ row: SupabaseBackend.GroupMessageRow) async {
        guard let userID = liveUserID else { return }
        guard let index = groups.firstIndex(where: { $0.id == row.groupId }) else {
            // Groupe inconnu (on vient de m'y inviter) : recharger la liste.
            await refreshGroups()
            return
        }
        if groups[index].messages.contains(where: { $0.id == row.id }) {
            handleGroupMessageUpdate(row)
            return
        }
        let senderName = row.senderId == userID
            ? profile.name
            : (musicians.first(where: { $0.id == row.senderId })?.name ?? "Musicien")
        let message = row.asGroupMessage(
            myID: userID,
            myName: profile.name,
            nameByID: [row.senderId: senderName]
        )
        withAnimation {
            groups[index].messages.append(message)
            groups.sort(by: Self.groupHasNewerActivity)
        }
        persistGroups()
    }

    private func handleGroupMessageUpdate(_ row: SupabaseBackend.GroupMessageRow) {
        guard let userID = liveUserID,
              let g = groups.firstIndex(where: { $0.id == row.groupId }),
              let m = groups[g].messages.firstIndex(where: { $0.id == row.id })
        else { return }
        let previous = groups[g].messages[m]
        let senderName = row.senderId == userID
            ? profile.name
            : (musicians.first(where: { $0.id == row.senderId })?.name ?? previous.sender)
        groups[g].messages[m] = row.asGroupMessage(
            myID: userID,
            myName: profile.name,
            nameByID: [row.senderId: senderName],
            reactions: row.deletedAt == nil ? previous.reactionSummaries : []
        )
        if row.deletedAt != nil, let attachment = previous.attachment {
            Self.removeCachedMessageAttachment(attachment)
        }
        groups.sort(by: Self.groupHasNewerActivity)
        persistGroups()
    }

    private func refreshGroupMessageReactions(_ messageID: UUID) async {
        guard let backend, let userID = liveUserID,
              let g = groups.firstIndex(where: {
                  $0.messages.contains { $0.id == messageID }
              }),
              let m = groups[g].messages.firstIndex(where: { $0.id == messageID }),
              groups[g].messages[m].deletedAt == nil
        else { return }
        guard let reactions = try? await backend.fetchGroupMessageReactionSummaries(
            messageID: messageID,
            myID: userID
        ) else { return }
        groups[g].messages[m].reactions = reactions
        persistGroups()
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
    private func refreshGroups(
        expectedSongMutationRevision: UInt64? = nil
    ) async {
        guard let backend, let userID = liveUserID else { return }
        let snapshotSessionGeneration = liveSessionGeneration
        let snapshotRevision = expectedSongMutationRevision ?? songMutationRevision
        let preflightRequestGeneration = groupSnapshotRequestGeneration
        // Un refresh realtime arrivé pendant un drop pourrait relire l'ancien
        // ordre. La dernière mutation en file fera un unique refresh global.
        guard Self.canApplyGroupSnapshot(
            snapshotUserID: userID,
            currentUserID: liveUserID,
            snapshotSessionGeneration: snapshotSessionGeneration,
            currentSessionGeneration: liveSessionGeneration,
            snapshotRevision: snapshotRevision,
            currentRevision: songMutationRevision,
            hasPendingMutations: !songMutationTasks.isEmpty,
            snapshotRequestGeneration: preflightRequestGeneration,
            currentRequestGeneration: groupSnapshotRequestGeneration
        ) else { return }
        do {
            let profiles = try await backend.fetchProfiles()
            let nameByID = Dictionary(uniqueKeysWithValues: profiles.map { ($0.id, $0.name) })
            groupSnapshotRequestGeneration &+= 1
            let groupSnapshotRequest = groupSnapshotRequestGeneration
            let remoteGroups = try await backend.fetchGroups(
                myID: userID,
                myName: profile.name,
                nameByID: nameByID
            )
            guard Self.canApplyGroupSnapshot(
                snapshotUserID: userID,
                currentUserID: liveUserID,
                snapshotSessionGeneration: snapshotSessionGeneration,
                currentSessionGeneration: liveSessionGeneration,
                snapshotRevision: snapshotRevision,
                currentRevision: songMutationRevision,
                hasPendingMutations: !songMutationTasks.isEmpty,
                snapshotRequestGeneration: groupSnapshotRequest,
                currentRequestGeneration: groupSnapshotRequestGeneration
            ) else { return }
            // Messages ET partitions viennent du serveur — ne rien écraser
            // avec la copie locale (sinon une partition reçue en realtime
            // disparaîtrait aussitôt).
            withAnimation {
                groups = Self.mergedGroups(remote: remoteGroups, local: groups)
                    .sorted(by: Self.groupHasNewerActivity)
            }
            persistGroups()
            rescheduleAllAttendanceNotifications()
            runAutoSOSIfNeeded()
            backfillStreamingLinks()
            await refreshGroupInvitations(nameByID: nameByID)
        } catch {
            // Silencieux : le prochain événement ou refreshLiveData rattrapera.
        }
    }

    /// Décision pure et testable : aucun snapshot de groupes n'est appliqué
    /// tant qu'une mutation est en vol, ni s'il a commencé avant une mutation
    /// d'un autre groupe ou sous une autre session.
    nonisolated static func canApplyGroupSnapshot(
        snapshotUserID: UUID,
        currentUserID: UUID?,
        snapshotSessionGeneration: UInt64,
        currentSessionGeneration: UInt64,
        snapshotRevision: UInt64,
        currentRevision: UInt64,
        hasPendingMutations: Bool,
        snapshotRequestGeneration: UInt64,
        currentRequestGeneration: UInt64
    ) -> Bool {
        Self.isMatchingLiveSession(
            expectedUserID: snapshotUserID,
            currentUserID: currentUserID,
            expectedGeneration: snapshotSessionGeneration,
            currentGeneration: currentSessionGeneration
        )
            && !hasPendingMutations
            && snapshotRevision == currentRevision
            && snapshotRequestGeneration == currentRequestGeneration
    }

    nonisolated private static func isMatchingLiveSession(
        expectedUserID: UUID,
        currentUserID: UUID?,
        expectedGeneration: UInt64,
        currentGeneration: UInt64
    ) -> Bool {
        expectedUserID == currentUserID && expectedGeneration == currentGeneration
    }

    /// Annule immédiatement tout travail de groupes appartenant à la session
    /// précédente. La révision reste monotone afin qu'une ancienne valeur ne
    /// redevienne jamais valide après déconnexion.
    private func invalidateGroupWorkForSessionChange() {
        pendingGroupRefresh?.cancel()
        pendingGroupRefresh = nil
        songMutationTasks.values.forEach { $0.cancel() }
        songMutationTasks = [:]
        songMutationGenerations = [:]
        songMutationRevision &+= 1
    }

    /// Flag anti-chevauchement du backfill Odesli.
    private var streamingBackfillActive = false
    /// Morceaux qu'Odesli ne connaît pas — inutile de les redemander à chaque
    /// synchro (le service a répondu, il n'a simplement pas le morceau).
    private var streamingBackfillGaveUp: Set<UUID> = []

    /// Complète en tâche de fond les liens d'écoute directs (Odesli) des
    /// morceaux de répertoire enregistrés sans eux. Le débit est cadencé par
    /// `OdesliPacer` ; idempotent, se relance à chaque synchro tant qu'il
    /// reste des morceaux à résoudre.
    private func backfillStreamingLinks() {
        guard isLive, !streamingBackfillActive else { return }
        var targets: [(groupID: GroupChat.ID, songID: UUID, appleURL: String)] = []
        for group in Self.deduplicatedGroups(groups) {
            for song in group.songs
            where song.platformLinks == nil && !streamingBackfillGaveUp.contains(song.id) {
                if let track = song.trackURL, !track.isEmpty {
                    targets.append((group.id, song.id, track))
                }
            }
        }
        let batch = Array(targets.prefix(8))
        guard !batch.isEmpty else { return }
        streamingBackfillActive = true
        Task { [weak self] in
            guard let self else { return }
            defer { self.streamingBackfillActive = false }
            for t in batch {
                if let links = await Self.fetchStreamingLinks(appleMusicURL: t.appleURL) {
                    guard var song = self.localSong(t.songID, in: t.groupID, eventID: nil) else {
                        continue
                    }
                    song.platformLinks = links
                    self.updateSong(
                        .update(song, fields: [.platformLinks]),
                        in: t.groupID,
                        eventID: nil
                    )
                } else {
                    self.streamingBackfillGaveUp.insert(t.songID)
                }
            }
        }
    }

    /// Recharge mes invitations reçues + les invités en attente de mes
    /// groupes (accepter / refuser / annuler).
    private func refreshGroupInvitations(nameByID: [UUID: String]) async {
        guard let backend, let userID = liveUserID else { return }
        let sessionGeneration = liveSessionGeneration
        let groupIDs = groups.map(\.id)
        let mine = (try? await backend.fetchMyGroupInvitations()) ?? []
        let pendingRows = (try? await backend.fetchPendingInvites(groupIDs: groupIDs)) ?? []
        guard Self.isMatchingLiveSession(
            expectedUserID: userID,
            currentUserID: liveUserID,
            expectedGeneration: sessionGeneration,
            currentGeneration: liveSessionGeneration
        ) else { return }
        withAnimation {
            myGroupInvitations = mine
            pendingInvitesByGroup = Dictionary(grouping: pendingRows, by: \.groupId)
                .mapValues { rows in
                    rows.compactMap { row in
                        guard let name = nameByID[row.profileId] else { return nil }
                        return PendingGroupInvite(
                            id: row.id,
                            profileID: row.profileId,
                            name: name,
                            kind: GroupMemberKind(dbValue: row.kind) ?? .occasional
                        )
                    }
                    .sorted { $0.name < $1.name }
                }
        }
    }

    /// Change et persiste la préférence d'apparence — effet immédiat sur
    /// toutes les fenêtres, feuilles comprises.
    func setTheme(_ newTheme: AppTheme) {
        theme = newTheme
        UserDefaults.standard.set(newTheme.rawValue, forKey: Self.themeKey)
        applyThemeToWindows()
    }

    /// Applique l'apparence au niveau UIWindow : contrairement à
    /// `preferredColorScheme` (limité à la présentation racine), l'override
    /// UIKit se propage instantanément aux sheets, alertes et barres.
    func applyThemeToWindows() {
        let style: UIUserInterfaceStyle
        switch theme {
        case .system: style = .unspecified
        case .light: style = .light
        case .dark: style = .dark
        }
        for scene in UIApplication.shared.connectedScenes {
            guard let windowScene = scene as? UIWindowScene else { continue }
            for window in windowScene.windows {
                window.overrideUserInterfaceStyle = style
            }
        }
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

    // MARK: - A joué avec (dérivé des notes étoilées)

    func hasPlayedWith(_ musician: Musician) -> Bool {
        playedWith.contains(musician.name)
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
        if isPremium, a.level != b.level { return a.level > b.level }
        if a.availability.urgencyRank != b.availability.urgencyRank {
            return a.availability.urgencyRank > b.availability.urgencyRank
        }
        // Distance croissante quand elle est connue ; les profils sans géoloc
        // passent après ceux dont la distance est fiable.
        switch (distance(to: a), distance(to: b)) {
        case (let da?, let db?): return da < db
        case (.some, nil): return true
        case (nil, .some): return false
        case (nil, nil): return a.name < b.name
        }
    }

    // MARK: - Social & Premium

    /// Photo d'un musicien par nom (avis, conversations, membres de groupe).
    func photo(forName name: String) -> String? {
        // Moi : je ne figure pas dans le feed, il faut me traiter à part —
        // sinon mon avatar retombe sur mes initiales partout sauf sur ma
        // propre fiche.
        if name == profile.name { return myPhotoReference }
        if let exact = musicians.first(where: { $0.name == name }) { return exact.photo }
        return musicians.first(where: { $0.name.hasPrefix(name + " ") })?.photo
    }

    /// Ma photo pour `AvatarView` : le fichier local s'il existe (instantané,
    /// pas de réseau), sinon l'URL hébergée.
    var myPhotoReference: String? {
        if let fileName = profile.photoFileName {
            let path = Self.mediaURL(for: fileName).path
            if FileManager.default.fileExists(atPath: path) { return path }
        }
        return profile.photoURL
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

    // MARK: - Notes étoilées (1–5, anonymes)

    /// Ma note (1–5) donnée à ce musicien, s'il y en a une.
    func myRating(for musician: Musician) -> Int? {
        if isLive { return liveMyRatings[musician.id] }
        return myStarRatings[musician.name]
    }

    /// Note affichée d'un musicien : moyenne + nombre d'avis, anonyme.
    /// Live : agrégat serveur. Démo : avis seed convertis en étoiles
    /// (note = 4, note dorée = 5), fusionnés avec ma note locale.
    func ratingSummary(for musician: Musician) -> RatingSummary? {
        // Un amateur n'a pas de note : il n'affiche que ses collaborations.
        guard canBeRated(musician) else { return nil }
        if isLive {
            guard musician.ratingCount > 0, let avg = musician.ratingAvg else { return nil }
            return RatingSummary(average: avg, count: musician.ratingCount)
        }
        var total = musician.reviews.reduce(0) { $0 + $1.appreciation.stars }
        var count = musician.reviews.count
        if let mine = myRating(for: musician) { total += mine; count += 1 }
        guard count > 0 else { return nil }
        return RatingSummary(average: Double(total) / Double(count), count: count)
    }

    // MARK: Remplacement automatique

    /// Désistements déjà traités (clé « eventID.membre ») — un SOS
    /// automatique ne part qu'une fois par poste libéré.
    private static let handledDropoutsKey = "dispo.autoSOS.handled"

    /// Active ou coupe le remplacement automatique du groupe (leader).
    func setAutoSOS(enabled: Bool, levelRule: AutoSOSLevelRule, in group: GroupChat) {
        guard canLead(group) else { return }
        let stored = levelRule.stored
        updateGroup(group.id) {
            $0.autoSOSEnabled = enabled
            $0.autoSOSMinLevel = stored
        }
        if let backend, isLive {
            syncLive {
                try await backend.updateAutoSOS(
                    enabled: enabled,
                    minLevel: stored,
                    groupID: group.id
                )
            }
        }
    }

    /// Passe en revue mes groupes : pour chaque désistement encore non traité
    /// sur un groupe où j'ai activé le remplacement automatique, publie le SOS
    /// correspondant. Appelé après chaque synchro des groupes — c'est
    /// l'appareil du leader qui décide, lui seul a le droit de publier.
    func runAutoSOSIfNeeded() {
        var handled = Set(UserDefaults.standard.stringArray(forKey: Self.handledDropoutsKey) ?? [])
        var published = false
        for group in groups where group.autoSOSEnabled == true && isLeader(of: group) {
            let rule = group.autoSOSLevelRule
            for event in group.upcomingEvents {
                for member in event.unavailableNames where member != profile.name {
                    let key = "\(event.id.uuidString).\(member)"
                    guard !handled.contains(key) else { continue }
                    handled.insert(key)
                    publishAutoSOS(for: event, in: group, replacing: member, rule: rule)
                    published = true
                }
            }
        }
        if published {
            // On ne garde que les désistements des événements encore à venir :
            // sans ça, la liste grossirait indéfiniment sur l'appareil.
            let liveKeys = Set(groups.flatMap { group in
                group.upcomingEvents.flatMap { event in
                    event.unavailableNames.map { "\(event.id.uuidString).\($0)" }
                }
            })
            UserDefaults.standard.set(
                Array(handled.intersection(liveKeys)),
                forKey: Self.handledDropoutsKey
            )
        }
    }

    /// Publie le SOS qui remplace un membre défaillant : même date, même lieu,
    /// son instrument dans le groupe, et le niveau demandé par le leader.
    private func publishAutoSOS(
        for event: GroupEvent,
        in group: GroupChat,
        replacing member: String,
        rule: AutoSOSLevelRule
    ) {
        // Le poste à pourvoir : son rôle dans le groupe, sinon son premier
        // instrument. Sans instrument connu, on ne devine pas.
        let instrument = group.role(for: member)
            ?? musicians.first(where: { $0.name == member })?.instruments.first
        guard let instrument else { return }
        // « Identique à l'absent » : on demande son niveau sur cet instrument
        // (son niveau global à défaut). « Peu importe » ne demande rien.
        let wantedLevel: Level? = {
            guard rule == .sameAsAbsent,
                  let absent = musicians.first(where: { $0.name == member })
            else { return nil }
            return absent.level(for: instrument) ?? absent.level
        }()
        let levelNote = wantedLevel.map {
            String(format: tr("Niveau recherché : %@."), tr($0.rawValue))
        } ?? ""
        let sos = GigRequest(
            title: String(format: tr("Remplacement — %@"), event.title),
            hostName: profile.name,
            hostId: liveUserID,
            date: event.date,
            place: event.venue,
            neighborhood: profile.cityLabel,
            genre: group.songs.isEmpty ? .jazz : (profile.genres.first ?? .jazz),
            wantedInstruments: [instrument],
            fee: nil,
            descriptionText: String(
                format: tr("%@ s'est désisté·e pour « %@ » (%@). %@"),
                member, event.title, group.name, levelNote
            ).trimmingCharacters(in: .whitespaces),
            isMine: true,
            postedAt: Date(),
            groupId: group.id,
            eventId: event.id
        )
        addEvent(sos)
        pushLocal(
            title: "\(group.emoji) \(group.name)",
            body: String(
                format: tr("SOS publié automatiquement pour remplacer %@ (%@)."),
                member, tr(instrument.rawValue)
            ),
            category: .groups
        )
    }

    // MARK: Séjours ailleurs

    /// Ajoute ou remplace un séjour (« dispo, mais à Lisbonne du 12 au 20 »).
    func saveAvailabilityPlace(_ place: AvailabilityPlace) {
        var places = profile.trips.filter { $0.id != place.id }
        places.append(place)
        profile.availabilityPlaces = places.sorted { $0.from < $1.from }
        saveProfile()
    }

    func removeAvailabilityPlace(_ place: AvailabilityPlace) {
        profile.availabilityPlaces = profile.trips.filter { $0.id != place.id }
        saveProfile()
    }

    /// Les étoiles ne concernent que les professionnels : entre amateurs, il
    /// n'y a que « on a joué ensemble ». Le serveur applique la même règle
    /// (policy `ratings_insert_own`) — ceci n'est que la version affichable.
    func canBeRated(_ musician: Musician) -> Bool { musician.level == .pro }

    /// Puis-je noter ce musicien ? Il faut qu'il soit professionnel ET qu'on
    /// ait déclaré avoir joué ensemble : on ne note pas quelqu'un qu'on n'a
    /// jamais vu jouer.
    func canRate(_ musician: Musician) -> Bool {
        canBeRated(musician) && hasPlayedWith(musician)
    }

    /// Déclare (ou retire) « on a joué ensemble » — sans note. C'est le geste
    /// ouvert à tout le monde ; noter reste réservé aux pros.
    func togglePlayedWith(_ musician: Musician) {
        let wasPlayed = playedWith.contains(musician.name)
        // Retirer la collaboration retire la note qui en dépendait : une note
        // sans « on a joué ensemble » n'a plus de fondement.
        if wasPlayed, myRating(for: musician) != nil {
            removeRating(for: musician)
        }
        if let backend, let userID = liveUserID {
            if wasPlayed {
                playedWith.remove(musician.name)
                liveCollaborations = liveCollaborations.filter {
                    !(($0.aId == userID && $0.bId == musician.id)
                      || ($0.bId == userID && $0.aId == musician.id))
                }
            } else {
                playedWith.insert(musician.name)
            }
            Task {
                do {
                    if wasPlayed {
                        try await backend.removeCollaboration(with: musician.id, me: userID)
                    } else {
                        try await backend.addCollaboration(with: musician.id, me: userID)
                    }
                    await refreshLiveData()
                } catch {
                    backendError = tr("La collaboration n'a pas pu être enregistrée.")
                    await refreshLiveData()
                }
            }
            return
        }
        if wasPlayed { playedWith.remove(musician.name) } else { playedWith.insert(musician.name) }
        Self.save(playedWith, key: Self.playedWithKey)
    }

    /// Note un musicien professionnel (1–5). Il faut avoir déclaré « on a
    /// joué ensemble » d'abord — le serveur applique la même règle.
    func rate(_ musician: Musician, stars: Int) {
        guard canRate(musician) else { return }
        let clamped = min(5, max(1, stars))
        if let backend, let userID = liveUserID {
            let previous = liveMyRatings[musician.id]
            liveMyRatings[musician.id] = clamped
            applyLocalRating(musicianID: musician.id, previous: previous, new: clamped)
            playedWith.insert(musician.name)
            Task {
                do {
                    try await backend.upsertRating(clamped, on: musician.id, me: userID)
                    if previous == nil {
                        try await backend.addCollaboration(with: musician.id, me: userID)
                    }
                    await refreshLiveData()
                } catch {
                    backendError = tr("La note n'a pas pu être enregistrée.")
                    await refreshLiveData()
                }
            }
            return
        }
        myStarRatings[musician.name] = clamped
        playedWith.insert(musician.name)
        Self.save(myStarRatings, key: Self.starRatingsKey)
        Self.save(playedWith, key: Self.playedWithKey)
    }

    /// Retire ma note. La collaboration déclarée, elle, reste : avoir joué
    /// ensemble est un fait, pas un avis — on ne l'efface qu'en le retirant
    /// explicitement.
    func removeRating(for musician: Musician) {
        if let backend, let userID = liveUserID {
            guard let previous = liveMyRatings.removeValue(forKey: musician.id) else { return }
            applyLocalRating(musicianID: musician.id, previous: previous, new: nil)
            Task {
                do {
                    try await backend.deleteRating(on: musician.id, me: userID)
                    await refreshLiveData()
                } catch {
                    backendError = tr("La note n'a pas pu être retirée.")
                    await refreshLiveData()
                }
            }
            return
        }
        myStarRatings.removeValue(forKey: musician.name)
        Self.save(myStarRatings, key: Self.starRatingsKey)
    }

    /// Ajuste l'agrégat local d'un musicien en attendant le serveur.
    private func applyLocalRating(musicianID: UUID, previous: Int?, new: Int?) {
        guard let index = musicians.firstIndex(where: { $0.id == musicianID }) else { return }
        var musician = musicians[index]
        var total = (musician.ratingAvg ?? 0) * Double(musician.ratingCount)
        var count = musician.ratingCount
        if let previous { total -= Double(previous); count -= 1 }
        if let new { total += Double(new); count += 1 }
        musician.ratingCount = max(0, count)
        musician.ratingAvg = musician.ratingCount > 0 ? total / Double(musician.ratingCount) : nil
        musicians[index] = musician
    }

    func displayPrice(for plan: PremiumPlan) -> String {
        if revenueCatEnabled {
            return rcPackages[plan]?.storeProduct.localizedPriceString ?? tr("Indisponible")
        }
        return storeProducts[plan]?.displayPrice ?? tr("Indisponible")
    }

    /// true si le plan est achetable maintenant (offre chargée).
    func planAvailable(_ plan: PremiumPlan) -> Bool {
        revenueCatEnabled ? rcPackages[plan] != nil : storeProducts[plan] != nil
    }

    func loadStoreProducts() async {
        // Bêta : rien n'est en vente. On n'interroge pas l'App Store, donc
        // pas de bandeau d'erreur pour un magasin qu'on n'utilise pas.
        if Self.isBeta { return }
        if revenueCatEnabled {
            do {
                let offerings = try await Purchases.shared.offerings()
                var packages: [PremiumPlan: Package] = [:]
                for package in offerings.current?.availablePackages ?? [] {
                    switch package.packageType {
                    case .annual: packages[.annual] = package
                    case .monthly: packages[.monthly] = package
                    default:
                        if let plan = Self.productIDs.first(where: { $0.value == package.storeProduct.productIdentifier })?.key {
                            packages[plan] = package
                        }
                    }
                }
                rcPackages = packages
                updateTrialLabels()
            } catch {
                backendError = tr("Les abonnements App Store sont momentanement indisponibles.")
            }
            return
        }
        do {
            let products = try await Product.products(for: Array(Self.productIDs.values))
            storeProducts = Dictionary(uniqueKeysWithValues: products.compactMap { product in
                guard let plan = Self.productIDs.first(where: { $0.value == product.id })?.key else { return nil }
                return (plan, product)
            })
            updateTrialLabels()
        } catch {
            backendError = tr("Les abonnements App Store sont momentanement indisponibles.")
        }
    }

    /// Recalcule les étiquettes d'essai gratuit depuis les offres d'intro.
    /// L'éligibilité réelle (un essai par groupe / Apple ID) est appliquée par
    /// StoreKit à l'achat ; ici on la propose dès qu'une offre « free trial »
    /// existe sur le produit.
    private func updateTrialLabels() {
        var result: [PremiumPlan: String] = [:]
        if revenueCatEnabled {
            for (plan, package) in rcPackages {
                if let discount = package.storeProduct.introductoryDiscount, discount.paymentMode == .freeTrial {
                    result[plan] = trialLabel(days: Self.periodDays(discount.subscriptionPeriod))
                }
            }
        } else {
            for (plan, product) in storeProducts {
                if let offer = product.subscription?.introductoryOffer, offer.paymentMode == .freeTrial {
                    result[plan] = trialLabel(days: Self.periodDays(offer.period))
                }
            }
        }
        trialByPlan = result
    }

    private func trialLabel(days: Int) -> String {
        String(format: tr("%d jours offerts"), days)
    }

    /// Étiquette d'essai gratuit à afficher pour un plan (nil si aucun essai).
    func trialLabel(for plan: PremiumPlan) -> String? { trialByPlan[plan] }

    /// Jours (approx.) d'une période d'abonnement RevenueCat.
    nonisolated private static func periodDays(_ p: RevenueCat.SubscriptionPeriod) -> Int {
        switch p.unit {
        case .day: return p.value
        case .week: return p.value * 7
        case .month: return p.value * 30
        case .year: return p.value * 365
        @unknown default: return p.value
        }
    }

    /// Jours (approx.) d'une période d'abonnement StoreKit.
    nonisolated private static func periodDays(_ p: Product.SubscriptionPeriod) -> Int {
        switch p.unit {
        case .day: return p.value
        case .week: return p.value * 7
        case .month: return p.value * 30
        case .year: return p.value * 365
        @unknown default: return p.value
        }
    }

    func purchasePremium(plan: PremiumPlan) async -> Bool {
        if revenueCatEnabled {
            guard let package = rcPackages[plan] else {
                await loadStoreProducts()
                return false
            }
            purchaseInProgress = true
            defer { purchaseInProgress = false }
            do {
                let result = try await Purchases.shared.purchase(package: package)
                guard !result.userCancelled else { return false }
                applyCustomerInfo(result.customerInfo)
                return isPremium
            } catch {
                backendError = tr("L'achat n'a pas pu etre finalise.")
                return false
            }
        }
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
        if revenueCatEnabled {
            do {
                let info = try await Purchases.shared.restorePurchases()
                applyCustomerInfo(info)
            } catch {
                backendError = tr("La restauration des achats a echoue.")
            }
            return
        }
        do {
            try await StoreKit.AppStore.sync()
            await refreshPurchasedEntitlements()
        } catch {
            backendError = tr("La restauration des achats a echoue.")
        }
    }

    /// Identifiant de l'entitlement RevenueCat représentant Premium.
    private static let premiumEntitlementID = "premium"

    /// Applique l'état d'abonnement RevenueCat (achat, renouvellement,
    /// expiration, autre appareil). `is_premium` côté serveur est mis à jour
    /// par le webhook RevenueCat, jamais par le client — on recharge juste le
    /// feed quand le statut change (l'avant-première SOS dépend de la RLS).
    private func applyCustomerInfo(_ info: CustomerInfo) {
        let entitlement = info.entitlements[Self.premiumEntitlementID]
        let active = entitlement?.isActive == true
        let plan = entitlement.flatMap { ent in
            Self.productIDs.first { ent.productIdentifier.hasPrefix($0.value) }?.key
        }
        let changed = active != isPremium
        isPremium = Self.isBeta || active
        premiumPlan = active ? plan : nil
        persistPremiumState()
        if changed, isLive {
            Task { await refreshLiveData() }
        }
    }

    func refreshPurchasedEntitlements() async {
        if revenueCatEnabled {
            if let info = try? await Purchases.shared.customerInfo() {
                applyCustomerInfo(info)
            }
            return
        }
        var activePlan: PremiumPlan?
        for await result in Transaction.currentEntitlements {
            guard case .verified(let transaction) = result,
                  transaction.revocationDate == nil,
                  let plan = Self.productIDs.first(where: { $0.value == transaction.productID })?.key
            else { continue }
            activePlan = plan
            if plan == .annual { break }
        }
        isPremium = Self.isBeta || activePlan != nil
        premiumPlan = activePlan
        persistPremiumState()
    }

    private func persistPremiumState() {
        UserDefaults.standard.set(isPremium, forKey: Self.premiumKey)
        if let premiumPlan {
            UserDefaults.standard.set(premiumPlan.rawValue, forKey: Self.premiumPlanKey)
        } else {
            UserDefaults.standard.removeObject(forKey: Self.premiumPlanKey)
        }
    }

    func completeOnboarding() {
        hasOnboarded = true
        UserDefaults.standard.set(true, forKey: Self.onboardedKey)
    }

    // MARK: - Notifications

    var unreadNotificationCount: Int {
        notifications.lazy.filter(\.isUnread).count
    }

    func markNotificationRead(_ notification: AppNotification) {
        guard notification.isUnread else { return }
        if let index = notifications.firstIndex(where: { $0.id == notification.id }) {
            notifications[index].readAt = Date()
        }
        syncApplicationBadge()
        guard let backend, isLive else { return }
        Task { try? await backend.markNotificationRead(notification.id) }
    }

    func markAllNotificationsRead() {
        let now = Date()
        for index in notifications.indices where notifications[index].readAt == nil {
            notifications[index].readAt = now
        }
        syncApplicationBadge()
        guard let backend, isLive else { return }
        Task { try? await backend.markAllNotificationsRead() }
    }

    func openNotification(_ notification: AppNotification) {
        markNotificationRead(notification)
        var payload: [AnyHashable: Any] = Dictionary(
            uniqueKeysWithValues: notification.data.map { (AnyHashable($0.key), $0.value as Any) }
        )
        payload["category"] = notification.category
        payload["notification_id"] = notification.id.uuidString
        openPushDestination(payload)
    }

    private func syncApplicationBadge() {
        let count = notificationsEnabled ? unreadNotificationCount : 0
        Task { try? await UNUserNotificationCenter.current().setBadgeCount(count) }
    }

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
        if let rawID = userInfo["notification_id"] as? String,
           let id = UUID(uuidString: rawID),
           let notification = notifications.first(where: { $0.id == id }) {
            markNotificationRead(notification)
        }
        let rawTab = (userInfo["target_tab"] as? String)
            ?? (userInfo["category"] as? String)
        switch rawTab {
        case "sos": selectedTab = .sos
        case "message", "messages", "groups": selectedTab = .messages
        case "profile": selectedTab = .profile
        // « agenda » est le nom historique de l'onglet Sessions côté serveur.
        case "agenda", "sessions": selectedTab = .agenda
        default: selectedTab = .home
        }
        syncApplicationBadge()
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
            syncApplicationBadge()
        }
        UserDefaults.standard.set(notificationsEnabled, forKey: Self.notificationsKey)
        await refreshNotificationAuthorization()
    }

    func setPushPreference(_ category: PushCategory, enabled: Bool) {
        pushPreferences.set(enabled, for: category)
        Self.save(pushPreferences, key: Self.pushPreferencesKey)
        if category == .groups { rescheduleAllAttendanceNotifications() }
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
        at date: Date? = nil,
        category: PushCategory? = nil
    ) {
        guard notificationsEnabled else { return }
        if let category, !pushPreferences.isEnabled(category) { return }
        let content = UNMutableNotificationContent()
        content.title = title
        content.body = body
        content.sound = .default
        content.badge = NSNumber(value: max(1, unreadNotificationCount + 1))
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
            guard !isFirstScan, !gig.isMine, gigMatchesMe(gig) else { continue }
            pushLocal(
                title: tr("🚨 Nouveau SOS pour toi"),
                body: "\(gig.title) · \(tr(gig.feeLabel))",
                category: .sos
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
        guard !isLive else { return }
        Self.save(groups, key: Self.groupsKey)
    }

    /// Garde la première version (la plus fraîche dans les réponses serveur)
    /// de chaque groupe. Sert aussi de filet de sécurité aux anciens caches
    /// qui ont pu enregistrer deux fois la même identité pendant un realtime.
    nonisolated private static func deduplicatedGroups(_ values: [GroupChat]) -> [GroupChat] {
        var seen = Set<GroupChat.ID>()
        return values.filter { seen.insert($0.id).inserted }
    }

    /// Fusionne un snapshot avec les deltas Realtime reçus pendant son
    /// chargement. Un refresh lent ne peut ainsi plus effacer un message,
    /// une édition ou une tombstone arrivée entre-temps.
    nonisolated private static func mergedConversations(
        remote: [Conversation],
        local: [Conversation]
    ) -> [Conversation] {
        let localByID = Dictionary(uniqueKeysWithValues: local.map { ($0.id, $0) })
        return remote.map { remoteConversation in
            guard let localConversation = localByID[remoteConversation.id] else {
                return remoteConversation
            }
            var merged = remoteConversation
            var byID = Dictionary(uniqueKeysWithValues: merged.messages.map { ($0.id, $0) })
            for localMessage in localConversation.messages {
                guard let remoteMessage = byID[localMessage.id] else {
                    byID[localMessage.id] = localMessage
                    continue
                }
                let localRevision = [
                    localMessage.editedAt, localMessage.deletedAt,
                    localMessage.deliveredAt, localMessage.readAt
                ].compactMap { $0 }.max() ?? localMessage.date
                let remoteRevision = [
                    remoteMessage.editedAt, remoteMessage.deletedAt,
                    remoteMessage.deliveredAt, remoteMessage.readAt
                ].compactMap { $0 }.max() ?? remoteMessage.date
                if localRevision > remoteRevision {
                    byID[localMessage.id] = localMessage
                } else if localMessage.reactions != nil {
                    var value = remoteMessage
                    value.reactions = localMessage.reactions
                    byID[localMessage.id] = value
                }
            }
            merged.messages = byID.values.sorted {
                ($0.date, $0.id.uuidString) < ($1.date, $1.id.uuidString)
            }
            return merged
        }
    }

    nonisolated private static func mergedGroups(
        remote: [GroupChat],
        local: [GroupChat]
    ) -> [GroupChat] {
        let localByID = Dictionary(uniqueKeysWithValues: local.map { ($0.id, $0) })
        return deduplicatedGroups(remote).map { remoteGroup in
            guard let localGroup = localByID[remoteGroup.id] else { return remoteGroup }
            var merged = remoteGroup
            var byID = Dictionary(uniqueKeysWithValues: merged.messages.map { ($0.id, $0) })
            for localMessage in localGroup.messages {
                guard let remoteMessage = byID[localMessage.id] else {
                    byID[localMessage.id] = localMessage
                    continue
                }
                let localRevision = [localMessage.editedAt, localMessage.deletedAt]
                    .compactMap { $0 }.max() ?? localMessage.date
                let remoteRevision = [remoteMessage.editedAt, remoteMessage.deletedAt]
                    .compactMap { $0 }.max() ?? remoteMessage.date
                if localRevision > remoteRevision {
                    byID[localMessage.id] = localMessage
                } else if localMessage.reactions != nil {
                    var value = remoteMessage
                    value.reactions = localMessage.reactions
                    byID[localMessage.id] = value
                }
            }
            merged.messages = byID.values.sorted {
                ($0.date, $0.id.uuidString) < ($1.date, $1.id.uuidString)
            }
            return merged
        }
    }

    /// La liste des groupes suit l'activité de messagerie, comme une inbox.
    /// Le nom stabilise l'ordre des groupes encore vides.
    nonisolated private static func groupHasNewerActivity(
        _ lhs: GroupChat,
        _ rhs: GroupChat
    ) -> Bool {
        let left = lhs.lastMessage?.date ?? .distantPast
        let right = rhs.lastMessage?.date ?? .distantPast
        if left != right { return left > right }
        return lhs.name.localizedCaseInsensitiveCompare(rhs.name) == .orderedAscending
    }

    /// Crée un groupe — création réservée aux Premium (l'appelant vérifie,
    /// paywall sinon). Le créateur devient leader — représenté par
    /// leaderName == nil (« moi »), robuste à un futur renommage du profil.
    func createGroup(name: String, emoji: String, members: [String]) {
        if let backend, let userID = liveUserID {
            // En live, les musiciens choisis reçoivent une INVITATION (à
            // accepter) — le groupe démarre avec le leader seul.
            let group = GroupChat(
                name: name,
                emoji: emoji,
                leaderName: nil,
                memberNames: [],
                memberKinds: [:]
            )
            groups.insert(group, at: 0)
            persistGroups()
            let memberIDs: [UUID] = members.compactMap { profileID(for: $0) }
            let groupID = group.id
            syncLive { [weak self] in
                _ = try await backend.createGroup(
                    id: groupID,
                    name: name,
                    emoji: emoji,
                    leaderID: userID,
                    memberIDs: []
                )
                for memberID in memberIDs {
                    try await backend.createGroupInvitation(
                        groupID: groupID,
                        profileID: memberID,
                        invitedBy: userID,
                        kind: .permanent
                    )
                }
                await backend.deliverPendingPushNotifications()
                await self?.refreshGroups()
            }
            return
        }
        // Démo : les membres initiaux forment le noyau permanent du groupe.
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
        isLeader(of: group) && isPremium
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

    /// Membres utilisables dans l'ordre des solos. L'interface affiche les
    /// noms, mais seule l'identité Supabase est conservée dans le morceau.
    /// Les anciens caches de démo sans UUID restent simplement non éditables
    /// pour le membre concerné, sans inventer d'identité durable.
    func soloistOptions(for group: GroupChat) -> [SoloistOption] {
        if let profiles = group.rosterProfiles {
            var seen = Set<UUID>()
            return profiles.filter { !$0.name.isEmpty && seen.insert($0.id).inserted }
        }

        // Repli réservé à la démo et aux anciens caches : les groupes chargés
        // du serveur possèdent `rosterProfiles`, donc deux homonymes ne sont
        // jamais réassociés au hasard par leur nom d'affichage.
        var seen = Set<UUID>()
        return roster(of: group).compactMap { name in
            guard let id = profileID(for: name), seen.insert(id).inserted else { return nil }
            return SoloistOption(id: id, name: name)
        }
    }

    /// Nom courant d'un UUID de solo, résolu exclusivement dans les membres
    /// du groupe. Un membre depuis retiré reste visible avec un repli honnête.
    func soloistName(for profileID: UUID, in group: GroupChat) -> String {
        soloistOptions(for: group).first(where: { $0.id == profileID })?.name
            ?? tr("Membre retiré")
    }

    /// Invite un musicien. En live, une INVITATION part — il n'apparaît
    /// dans le groupe qu'après avoir accepté. En démo, ajout direct pour
    /// garder le bac à sable vivant.
    func inviteMember(_ name: String, to group: GroupChat, kind: GroupMemberKind = .occasional) {
        if isLive {
            guard let backend,
                  let userID = liveUserID,
                  let profileID = profileID(for: name),
                  !group.memberNames.contains(name),
                  pendingInvitesByGroup[group.id]?.contains(where: { $0.profileID == profileID }) != true
            else { return }
            // Optimiste : la ligne « en attente » apparaît tout de suite
            // (l'id provisoire est remplacé au prochain rafraîchissement).
            var pending = pendingInvitesByGroup[group.id] ?? []
            pending.append(PendingGroupInvite(id: UUID(), profileID: profileID, name: name, kind: kind))
            pendingInvitesByGroup[group.id] = pending.sorted { $0.name < $1.name }
            let groupID = group.id
            syncLive { [weak self] in
                try await backend.createGroupInvitation(
                    groupID: groupID,
                    profileID: profileID,
                    invitedBy: userID,
                    kind: kind
                )
                await backend.deliverPendingPushNotifications()
                await self?.refreshGroups()
            }
            return
        }
        updateGroup(group.id) {
            guard !$0.memberNames.contains(name) else { return }
            $0.memberNames.append(name)
            $0.memberNames.sort()
            var kinds = $0.memberKinds ?? [:]
            kinds[name] = kind
            $0.memberKinds = kinds
        }
    }

    // MARK: - Invitations de groupe (accepter / refuser / annuler)

    /// Accepte une invitation : la RPC serveur me fait entrer dans le
    /// groupe, qui apparaît aussitôt dans ma liste.
    func acceptGroupInvitation(_ invitation: GroupInvitation) {
        guard let backend, isLive else { return }
        withAnimation { myGroupInvitations.removeAll { $0.id == invitation.id } }
        Task { [weak self] in
            do {
                try await backend.acceptGroupInvitation(invitation.id)
                await self?.refreshGroups()
            } catch {
                self?.backendError = self?.tr("L'invitation n'a pas pu être acceptée — réessaie.")
                await self?.refreshGroups()
            }
        }
    }

    /// Refuse une invitation — elle disparaît (le leader peut réinviter).
    func declineGroupInvitation(_ invitation: GroupInvitation) {
        guard let backend, isLive else { return }
        withAnimation { myGroupInvitations.removeAll { $0.id == invitation.id } }
        syncLive { try await backend.deleteGroupInvitation(invitation.id) }
    }

    /// Annule une invitation en attente (leader du groupe).
    func cancelGroupInvitation(_ invite: PendingGroupInvite, in group: GroupChat) {
        guard let backend, isLive else { return }
        withAnimation { pendingInvitesByGroup[group.id]?.removeAll { $0.id == invite.id } }
        syncLive { try await backend.deleteGroupInvitation(invite.id) }
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

    /// Assigne (ou retire) le rôle/instrument d'un membre dans le groupe.
    func setMemberRole(_ name: String, _ instrument: Instrument?, in group: GroupChat) {
        updateGroup(group.id) {
            var roles = $0.memberRoles ?? [:]
            roles[name] = instrument?.rawValue
            $0.memberRoles = roles
        }
        if let backend, let profileID = profileID(for: name) {
            syncLive { try await backend.setMemberRole(instrument?.rawValue, for: profileID, in: group.id) }
        }
    }

    func kickMember(_ name: String, from group: GroupChat) {
        let removedProfileID = group.rosterProfiles?.first(where: { $0.name == name })?.id
            ?? profileID(for: name)
        updateGroup(group.id) {
            $0.memberNames.removeAll { $0 == name }
            $0.memberKinds?[name] = nil
            // Un membre viré ne laisse pas de suggestions orphelines — ni dans
            // le répertoire, ni dans les setlists des événements.
            $0.repertoire = $0.songs.filter { song in
                let matchesStableID = removedProfileID.map {
                    UUID(uuidString: song.suggestedBy) == $0
                } ?? false
                return song.isApproved
                    || (song.suggestedBy != name && !matchesStableID)
            }
            $0.events = $0.events?.map { event in
                var event = event
                event.setlist.removeAll { song in
                    let matchesStableID = removedProfileID.map {
                        UUID(uuidString: song.suggestedBy) == $0
                    } ?? false
                    return !song.isApproved
                        && (song.suggestedBy == name || matchesStableID)
                }
                event.attendance?[name] = nil
                return event
            }
        }
        if let backend, let profileID = removedProfileID {
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

    /// Résout l'identité stable enregistrée par iOS/Android vers le nom du
    /// profil courant. Les anciennes suggestions stockées directement avec un
    /// nom restent lisibles telles quelles.
    func suggesterName(for song: Song, in groupID: GroupChat.ID?) -> String {
        var candidates = groupID
            .flatMap { id in groups.first(where: { $0.id == id })?.rosterProfiles }
            ?? []
        if let liveUserID {
            candidates.append(SoloistOption(id: liveUserID, name: profile.name))
        }
        candidates.append(contentsOf: musicians.map { SoloistOption(id: $0.id, name: $0.name) })
        return Self.resolvedSuggesterName(
            storedValue: song.suggestedBy,
            candidates: candidates,
            unknownUUIDFallback: tr("Membre retiré")
        )
    }

    nonisolated static func resolvedSuggesterName(
        storedValue: String,
        candidates: [SoloistOption],
        unknownUUIDFallback: String
    ) -> String {
        guard let profileID = UUID(uuidString: storedValue) else {
            return storedValue
        }
        return candidates.first(where: { $0.id == profileID })?.name
            ?? unknownUUIDFallback
    }

    nonisolated static func suggestionAuthorStorageValue(
        userID: UUID?,
        legacyProfileName: String
    ) -> String {
        userID?.uuidString.lowercased() ?? legacyProfileName
    }

    /// Ajoute un morceau au répertoire du groupe. Le leader ajoute
    /// directement (validé) ; un membre crée une suggestion à valider.
    func addSong(
        title: String,
        artist: String,
        key: String? = nil,
        to groupID: GroupChat.ID,
        eventID: GroupEvent.ID? = nil
    ) {
        // Le leader valide d'office ; sinon c'est une suggestion en attente.
        let approved = groups.first(where: { $0.id == groupID }).map(canLead) ?? true
        let song = Song(
            title: title,
            artist: artist,
            artworkURL: nil,
            suggestedBy: Self.suggestionAuthorStorageValue(
                userID: liveUserID,
                legacyProfileName: profile.name
            ),
            isApproved: approved,
            key: key?.isEmpty == true ? nil : key
        )
        insertSong(song, in: groupID, eventID: eventID)
        // Pochette + lien d'écoute arrivent en différé (iTunes Search) — le
        // morceau vit sans.
        Task { [weak self] in
            guard let self else { return }
            let info = await Self.fetchTrackInfo(title: title, artist: artist)
            if info.artworkURL != nil || info.trackURL != nil || info.platformLinks != nil {
                guard var refreshed = self.localSong(song.id, in: groupID, eventID: eventID) else {
                    return
                }
                refreshed.artworkURL = info.artworkURL
                refreshed.trackURL = info.trackURL
                refreshed.platformLinks = info.platformLinks
                self.updateSong(
                    .update(refreshed, fields: [.artworkURL, .trackURL, .platformLinks]),
                    in: groupID,
                    eventID: eventID
                )
            }
        }
    }

    /// Modifie l'identité et la tonalité d'un morceau déjà ajouté. Toutes ses
    /// copies (répertoire et setlists) restent strictement identiques.
    func editSong(
        _ song: Song,
        title: String,
        artist: String,
        key: String?,
        in group: GroupChat
    ) {
        guard canLead(group) else { return }
        var updated = song
        updated.title = title
        updated.artist = artist
        updated.key = key?.isEmpty == true ? nil : key
        let fields = Self.changedSongFields(
            from: song,
            to: updated,
            candidates: [.title, .artist, .key]
        )
        guard !fields.isEmpty else { return }
        let mutation = SongCollectionMutation.update(updated, fields: fields)
        applySongMutationEverywhere(mutation, in: group.id)
        syncSongEverywhere(mutation, in: group.id)

        guard title != song.title || artist != song.artist else { return }
        Task { [weak self] in
            guard let self else { return }
            let info = await Self.fetchTrackInfo(title: title, artist: artist)
            guard let currentGroup = self.groups.first(where: { $0.id == group.id }),
                  var refreshed = currentGroup.songs.first(where: { $0.id == song.id })
                    ?? currentGroup.allEvents.flatMap(\.setlist).first(where: { $0.id == song.id })
            else { return }
            refreshed.artworkURL = info.artworkURL
            refreshed.trackURL = info.trackURL
            refreshed.platformLinks = info.platformLinks
            let mutation = SongCollectionMutation.update(
                refreshed,
                fields: [.artworkURL, .trackURL, .platformLinks]
            )
            self.applySongMutationEverywhere(mutation, in: group.id)
            self.syncSongEverywhere(mutation, in: group.id)
        }
    }

    /// Champs qu'une action iOS a réellement le droit de modifier. La fusion
    /// repart d'un snapshot serveur frais et laisse tous les autres champs
    /// (validation, solos, auteur...) tels qu'ils sont à distance.
    struct SongMutationFields: OptionSet {
        let rawValue: Int

        init(rawValue: Int) { self.rawValue = rawValue }

        static let title = Self(rawValue: 1 << 0)
        static let artist = Self(rawValue: 1 << 1)
        static let artworkURL = Self(rawValue: 1 << 2)
        static let trackURL = Self(rawValue: 1 << 3)
        static let platformLinks = Self(rawValue: 1 << 4)
        static let isApproved = Self(rawValue: 1 << 5)
        static let key = Self(rawValue: 1 << 6)
        static let chords = Self(rawValue: 1 << 7)
        static let irealURL = Self(rawValue: 1 << 8)
        static let irealDisabled = Self(rawValue: 1 << 9)
    }

    enum SongCollectionMutation {
        case add(Song)
        case remove(Song.ID)
        case update(Song, fields: SongMutationFields)

        var songID: Song.ID {
            switch self {
            case let .add(song), let .update(song, _): return song.id
            case let .remove(songID): return songID
            }
        }
    }

    /// Applique uniquement l'intention explicite à une collection serveur
    /// fraîche. L'ordre n'est jamais reconstruit depuis le cache iOS, et une
    /// suppression distante n'est jamais ressuscitée par un simple edit.
    nonisolated static func applyingSongMutation(
        _ mutation: SongCollectionMutation,
        to freshSongs: [Song]
    ) -> [Song] {
        switch mutation {
        case let .add(song):
            guard !freshSongs.contains(where: { $0.id == song.id }) else { return freshSongs }
            return freshSongs + [song]
        case let .remove(songID):
            return freshSongs.filter { $0.id != songID }
        case let .update(desired, fields):
            return freshSongs.map { current in
                guard current.id == desired.id else { return current }
                var merged = current
                if fields.contains(.title) { merged.title = desired.title }
                if fields.contains(.artist) { merged.artist = desired.artist }
                if fields.contains(.artworkURL) { merged.artworkURL = desired.artworkURL }
                if fields.contains(.trackURL) { merged.trackURL = desired.trackURL }
                if fields.contains(.platformLinks) { merged.platformLinks = desired.platformLinks }
                if fields.contains(.isApproved) { merged.isApproved = desired.isApproved }
                if fields.contains(.key) { merged.key = desired.key }
                if fields.contains(.chords) { merged.chords = desired.chords }
                if fields.contains(.irealURL) { merged.irealURL = desired.irealURL }
                if fields.contains(.irealDisabled) { merged.irealDisabled = desired.irealDisabled }
                return merged
            }
        }
    }

    /// Calcule l'intention d'un formulaire à partir de sa valeur d'ouverture.
    /// Un champ resté intact n'entre pas dans le diff, même si sa valeur locale
    /// est devenue périmée pendant que la feuille était affichée.
    nonisolated static func changedSongFields(
        from baseline: Song,
        to desired: Song,
        candidates: SongMutationFields
    ) -> SongMutationFields {
        var changed: SongMutationFields = []
        if candidates.contains(.title), baseline.title != desired.title { changed.insert(.title) }
        if candidates.contains(.artist), baseline.artist != desired.artist { changed.insert(.artist) }
        if candidates.contains(.artworkURL), baseline.artworkURL != desired.artworkURL {
            changed.insert(.artworkURL)
        }
        if candidates.contains(.trackURL), baseline.trackURL != desired.trackURL {
            changed.insert(.trackURL)
        }
        if candidates.contains(.platformLinks), baseline.platformLinks != desired.platformLinks {
            changed.insert(.platformLinks)
        }
        if candidates.contains(.isApproved), baseline.isApproved != desired.isApproved {
            changed.insert(.isApproved)
        }
        if candidates.contains(.key), baseline.key != desired.key { changed.insert(.key) }
        if candidates.contains(.chords), baseline.chords != desired.chords { changed.insert(.chords) }
        if candidates.contains(.irealURL), baseline.irealURL != desired.irealURL {
            changed.insert(.irealURL)
        }
        if candidates.contains(.irealDisabled), baseline.irealDisabled != desired.irealDisabled {
            changed.insert(.irealDisabled)
        }
        return changed
    }

    private func applySongMutationEverywhere(
        _ mutation: SongCollectionMutation,
        in groupID: GroupChat.ID
    ) {
        updateGroup(groupID) { chat in
            chat.repertoire = Self.applyingSongMutation(mutation, to: chat.songs)
            for eventIndex in (chat.events ?? []).indices {
                let current = chat.events?[eventIndex].setlist ?? []
                chat.events?[eventIndex].setlist = Self.applyingSongMutation(mutation, to: current)
            }
        }
    }

    private func syncSongEverywhere(_ mutation: SongCollectionMutation, in groupID: GroupChat.ID) {
        guard let backend, isLive else { return }
        enqueueSongMutation(in: groupID) { [weak self] session in
            let collections = try await backend.fetchGroupSongCollections(groupID: groupID)
            guard let self, self.isCurrentSongMutationSession(session) else { return }

            if collections.repertoire.contains(where: { $0.id == mutation.songID }) {
                let desired = Self.applyingSongMutation(mutation, to: collections.repertoire)
                if desired != collections.repertoire {
                    try await backend.mergeGroupRepertoireSnapshot(
                        originalSongs: collections.repertoire,
                        desiredSongs: desired,
                        groupID: groupID
                    )
                }
            }

            for eventID in collections.eventSetlists.keys.sorted(by: {
                $0.uuidString < $1.uuidString
            }) {
                guard self.isCurrentSongMutationSession(session),
                      let original = collections.eventSetlists[eventID],
                      original.contains(where: { $0.id == mutation.songID })
                else { continue }
                let desired = Self.applyingSongMutation(mutation, to: original)
                if desired != original {
                    try await backend.mergeEventSetlistSnapshot(
                        originalSongs: original,
                        desiredSongs: desired,
                        eventID: eventID
                    )
                }
            }
        }
    }

    func approveSong(_ song: Song, in groupID: GroupChat.ID, eventID: GroupEvent.ID? = nil) {
        var approved = song
        approved.isApproved = true
        updateSong(
            .update(approved, fields: [.isApproved]),
            in: groupID,
            eventID: eventID
        )
    }

    /// Réordonne uniquement les morceaux validés d'une setlist. Les
    /// suggestions gardent leur place relative et ne peuvent pas disparaître
    /// pendant un glisser-déposer.
    nonisolated static func applyingApprovedSongOrder(
        _ orderedIDs: [Song.ID],
        to setlist: [Song]
    ) -> [Song] {
        let approved = setlist.filter(\.isApproved)
        let allowed = Set(approved.map(\.id))
        var seen = Set<Song.ID>()
        var normalized = orderedIDs.filter { allowed.contains($0) && seen.insert($0).inserted }
        normalized.append(contentsOf: approved.map(\.id).filter { seen.insert($0).inserted })

        let byID = Dictionary(uniqueKeysWithValues: approved.map { ($0.id, $0) })
        var ordered = normalized.compactMap { byID[$0] }.makeIterator()
        return setlist.map { song in
            guard song.isApproved else { return song }
            return ordered.next() ?? song
        }
    }

    /// Persistance automatique de l'ordre choisi au doigt. La même colonne
    /// JSONB `setlist` est déjà partagée par iOS et Android : aucun nouveau
    /// schéma n'est requis.
    func reorderApprovedSetlist(
        _ orderedIDs: [Song.ID],
        eventID: GroupEvent.ID,
        in groupID: GroupChat.ID
    ) {
        guard let group = groups.first(where: { $0.id == groupID }), canLead(group) else { return }
        updateGroup(groupID) { group in
            guard let eventIndex = group.events?.firstIndex(where: { $0.id == eventID }) else { return }
            let current = group.events?[eventIndex].setlist ?? []
            group.events?[eventIndex].setlist = Self.applyingApprovedSongOrder(orderedIDs, to: current)
        }
        guard let backend, isLive else { return }
        enqueueSongMutation(in: groupID) { _ in
            try await backend.reorderEventSetlist(orderedIDs, eventID: eventID)
        }
    }

    /// Même interaction dans le répertoire principal du groupe. Les
    /// suggestions non validées restent à leur place relative.
    func reorderApprovedRepertoire(
        _ orderedIDs: [Song.ID],
        in groupID: GroupChat.ID
    ) {
        guard let group = groups.first(where: { $0.id == groupID }), canLead(group) else { return }
        updateGroup(groupID) { group in
            group.repertoire = Self.applyingApprovedSongOrder(orderedIDs, to: group.songs)
        }
        guard let backend, isLive else { return }
        enqueueSongMutation(in: groupID) { _ in
            try await backend.reorderGroupRepertoire(orderedIDs, groupID: groupID)
        }
    }

    /// Ajoute, retire ou réordonne les solos d'un morceau. Les UUID hors du
    /// groupe sont ignorés et chaque profil ne peut apparaître qu'une fois.
    /// Le changement suit le morceau dans le répertoire et toutes ses setlists.
    func setSongSolos(
        _ profileIDs: [UUID],
        songID: Song.ID,
        in groupID: GroupChat.ID
    ) {
        guard let group = groups.first(where: { $0.id == groupID }), canLead(group) else { return }
        let allowed = Set(soloistOptions(for: group).map(\.id))
        var seen = Set<UUID>()
        let normalized = profileIDs.filter { allowed.contains($0) && seen.insert($0).inserted }

        updateGroup(groupID) { group in
            if let index = group.repertoire?.firstIndex(where: { $0.id == songID }) {
                group.repertoire?[index].solos = normalized.isEmpty ? nil : normalized
            }
            for eventIndex in (group.events ?? []).indices {
                if let index = group.events?[eventIndex].setlist.firstIndex(where: { $0.id == songID }) {
                    group.events?[eventIndex].setlist[index].solos = normalized.isEmpty ? nil : normalized
                }
            }
        }
        guard let backend, isLive else { return }
        enqueueSongMutation(in: groupID) { _ in
            try await backend.setGroupSongSolos(
                normalized,
                songID: songID,
                groupID: groupID
            )
        }
    }

    func rejectSong(_ song: Song, in groupID: GroupChat.ID, eventID: GroupEvent.ID? = nil) {
        updateSong(.remove(song.id), in: groupID, eventID: eventID)
    }

    private func insertSong(_ song: Song, in groupID: GroupChat.ID, eventID: GroupEvent.ID?) {
        updateSong(.add(song), in: groupID, eventID: eventID)
    }

    private func localSong(
        _ songID: Song.ID,
        in groupID: GroupChat.ID,
        eventID: GroupEvent.ID?
    ) -> Song? {
        guard let group = groups.first(where: { $0.id == groupID }) else { return nil }
        if let eventID {
            return group.allEvents.first(where: { $0.id == eventID })?
                .setlist.first(where: { $0.id == songID })
        }
        return group.songs.first(where: { $0.id == songID })
    }

    private func updateSong(
        _ mutation: SongCollectionMutation,
        in groupID: GroupChat.ID,
        eventID: GroupEvent.ID?
    ) {
        updateGroup(groupID) { group in
            if let eventID, let eventIndex = group.events?.firstIndex(where: { $0.id == eventID }) {
                let current = group.events?[eventIndex].setlist ?? []
                group.events?[eventIndex].setlist = Self.applyingSongMutation(mutation, to: current)
            } else if eventID == nil {
                group.repertoire = Self.applyingSongMutation(mutation, to: group.songs)
            }
        }
        syncSongs(groupID: groupID, eventID: eventID, mutation: mutation)
    }

    /// Relit la collection dans la file, applique seulement l'intention locale,
    /// puis confie au RPC le diff `original` → `desired`. Une écriture distante
    /// reçue pendant l'attente (ordre, validation, solos, suggestion) survit.
    private func syncSongs(
        groupID: GroupChat.ID,
        eventID: GroupEvent.ID?,
        mutation: SongCollectionMutation
    ) {
        guard let backend, isLive else { return }
        enqueueSongMutation(in: groupID) { [weak self] session in
            let collections = try await backend.fetchGroupSongCollections(groupID: groupID)
            guard let self, self.isCurrentSongMutationSession(session) else { return }

            if let eventID {
                // L'événement peut avoir été supprimé à distance pendant
                // l'attente : dans ce cas l'action n'est pas redirigée ailleurs.
                guard let original = collections.eventSetlists[eventID] else { return }
                let desired = Self.applyingSongMutation(mutation, to: original)
                guard desired != original else { return }
                try await backend.mergeEventSetlistSnapshot(
                    originalSongs: original,
                    desiredSongs: desired,
                    eventID: eventID
                )
            } else {
                let original = collections.repertoire
                let desired = Self.applyingSongMutation(mutation, to: original)
                guard desired != original else { return }
                try await backend.mergeGroupRepertoireSnapshot(
                    originalSongs: original,
                    desiredSongs: desired,
                    groupID: groupID
                )
            }
        }
    }

    /// Sérialise les écritures JSON/RPC par groupe. Les snapshots anciens
    /// partent avant les nouveaux, jamais après ; un refresh dont la génération
    /// a été dépassée n'a pas le droit de restaurer un ordre obsolète.
    private struct SongMutationSession {
        let userID: UUID
        let generation: UInt64
    }

    private func isCurrentSongMutationSession(_ session: SongMutationSession) -> Bool {
        Self.isMatchingLiveSession(
            expectedUserID: session.userID,
            currentUserID: liveUserID,
            expectedGeneration: session.generation,
            currentGeneration: liveSessionGeneration
        )
    }

    private func enqueueSongMutation(
        in groupID: GroupChat.ID,
        _ work: @escaping (SongMutationSession) async throws -> Void
    ) {
        guard let mutationUserID = liveUserID else { return }
        let mutationSessionGeneration = liveSessionGeneration
        let session = SongMutationSession(
            userID: mutationUserID,
            generation: mutationSessionGeneration
        )
        let predecessor = songMutationTasks[groupID]
        let generation = (songMutationGenerations[groupID] ?? 0) + 1
        songMutationGenerations[groupID] = generation
        songMutationRevision &+= 1

        let task = Task { [weak self] in
            _ = await predecessor?.result
            guard let self,
                  !Task.isCancelled,
                  Self.isMatchingLiveSession(
                      expectedUserID: mutationUserID,
                      currentUserID: self.liveUserID,
                      expectedGeneration: mutationSessionGeneration,
                      currentGeneration: self.liveSessionGeneration
                  )
            else { return }
            do {
                try await work(session)
            } catch {
                guard Self.isMatchingLiveSession(
                    expectedUserID: mutationUserID,
                    currentUserID: self.liveUserID,
                    expectedGeneration: mutationSessionGeneration,
                    currentGeneration: self.liveSessionGeneration
                ) else { return }
                self.backendError = self.tr("La synchro groupe a échoué — réessaie.")
            }
            guard !Task.isCancelled,
                  Self.isMatchingLiveSession(
                      expectedUserID: mutationUserID,
                      currentUserID: self.liveUserID,
                      expectedGeneration: mutationSessionGeneration,
                      currentGeneration: self.liveSessionGeneration
                  )
            else { return }
            if self.songMutationGenerations[groupID] == generation {
                self.songMutationTasks[groupID] = nil
            }
            // Tous groupes confondus, seul le dernier travail terminé relit le
            // serveur. Une mutation démarrée pendant ce fetch changera la
            // révision et empêchera automatiquement son snapshot de s'appliquer.
            if self.songMutationTasks.isEmpty {
                let finalRevision = self.songMutationRevision
                await self.refreshGroups(expectedSongMutationRevision: finalRevision)
            }
        }
        songMutationTasks[groupID] = task
    }

    /// Cherche la pochette et le lien Apple Music du morceau (iTunes
    /// Search — gratuit, sans clé). Le lien direct alimente le menu
    /// « Écouter sur… » ; les autres plateformes passent par leur recherche.
    nonisolated static func fetchTrackInfo(
        title: String,
        artist: String
    ) async -> (artworkURL: String?, trackURL: String?, platformLinks: [String: String]?) {
        struct SearchResponse: Decodable {
            struct Item: Decodable {
                let artworkUrl100: String?
                let trackViewUrl: String?
            }
            let results: [Item]
        }
        let term = "\(title) \(artist)"
        guard let encoded = term.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed),
              let url = URL(string: "https://itunes.apple.com/search?term=\(encoded)&media=music&entity=song&limit=1")
        else { return (nil, nil, nil) }
        guard let (data, _) = try? await URLSession.shared.data(from: url),
              let response = try? JSONDecoder().decode(SearchResponse.self, from: data),
              let item = response.results.first
        else { return (nil, nil, nil) }
        // 100 px → 300 px : même CDN, meilleure netteté dans les listes.
        let artwork = item.artworkUrl100?.replacingOccurrences(of: "100x100", with: "300x300")
        let trackURL = item.trackViewUrl
        // Liens directs multi-plateformes (Odesli), à partir du lien Apple Music.
        let links = await fetchStreamingLinks(appleMusicURL: trackURL)
        return (artwork, trackURL, links)
    }

    /// Résout les liens directs par plateforme (Spotify, YouTube Music,
    /// Deezer, Apple Music) via l'API publique song.link / Odesli — gratuite,
    /// sans clé. S'appuie sur un lien Apple Music déjà connu. nil si
    /// indisponible (introuvable, hors-ligne, quota) → repli sur la recherche.
    nonisolated static func fetchStreamingLinks(appleMusicURL: String?) async -> [String: String]? {
        guard let appleMusicURL, !appleMusicURL.isEmpty,
              let encoded = appleMusicURL.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed),
              let url = URL(string: "https://api.song.link/v1-alpha.1/links?url=\(encoded)&userCountry=CH&songIfSingle=true")
        else { return nil }
        struct Response: Decodable {
            struct Link: Decodable { let url: String }
            let linksByPlatform: [String: Link]
        }
        // Trois tentatives : un quota atteint (429) ou un hoquet du service
        // ne doit pas condamner le morceau à n'avoir que des liens de
        // recherche. Un 404 (morceau inconnu d'Odesli), lui, est définitif.
        for attempt in 0..<3 {
            await OdesliPacer.shared.wait()
            guard let (data, response) = try? await URLSession.shared.data(from: url) else {
                try? await Task.sleep(for: .seconds(Double(attempt + 1) * 4))
                continue
            }
            let status = (response as? HTTPURLResponse)?.statusCode ?? 0
            if status == 429 || status >= 500 {
                try? await Task.sleep(for: .seconds(Double(attempt + 1) * 8))
                continue
            }
            guard status == 200,
                  let decoded = try? JSONDecoder().decode(Response.self, from: data)
            else { return nil }
            let by = decoded.linksByPlatform
            var out: [String: String] = [:]
            if let s = by["spotify"]?.url { out[StreamingPlatform.spotify.rawValue] = s }
            if let y = by["youtubeMusic"]?.url ?? by["youtube"]?.url { out[StreamingPlatform.youtubeMusic.rawValue] = y }
            if let d = by["deezer"]?.url { out[StreamingPlatform.deezer.rawValue] = d }
            if let a = by["appleMusic"]?.url { out[StreamingPlatform.appleMusic.rawValue] = a }
            return out.isEmpty ? nil : out
        }
        return nil
    }

    // MARK: Événements (leader crée, membres suggèrent la setlist)

    func addEvent(_ event: GroupEvent, to group: GroupChat) {
        addEvents([event], to: group)
    }

    /// Ajoute un événement ou toute une série (répétition hebdomadaire…).
    /// Les occurrences partagent titre, lieu et rythme mais gardent chacune
    /// leur setlist et leur feuille de présence.
    func addEvents(_ events: [GroupEvent], to group: GroupChat) {
        guard !events.isEmpty else { return }
        let leader = leaderDisplayName(of: group)
        // Le leader confirme sa présence d'office ; les autres restent en attente.
        let prepared = events.map { event -> GroupEvent in
            var copy = event
            copy.attendance = [leader: .available]
            return copy
        }
        updateGroup(group.id) {
            $0.events = ($0.events ?? []) + prepared
            $0.events?.sort { $0.date < $1.date }
        }
        // Une seule passe, plafonnée : programmer un rappel par occurrence
        // ferait 52 notifications pour une répétition hebdomadaire.
        rescheduleAllAttendanceNotifications()
        if let backend, isLive {
            syncLive {
                try await backend.createEvents(prepared, groupID: group.id)
                await backend.deliverPendingPushNotifications()
            }
        }
    }

    /// Portée d'une modification d'événement : cette date, ou toute la suite
    /// de la série.
    enum EventEditScope {
        case thisDate
        case futureOccurrences
    }

    /// Modifie une date déjà créée (leader) : heure, jour, titre, lieu.
    ///
    /// Sur toute une série, on ne déplace pas les jours — un « chaque jeudi »
    /// reste un « chaque jeudi » — on reporte seulement l'HEURE, le titre et
    /// le lieu sur les occurrences à venir. C'est ce qu'on veut dire quand on
    /// dit « la répé passe à 20 h ». Une occurrence isolée, elle, se déplace
    /// où on veut.
    ///
    /// Quand le JOUR d'une date change, les réponses de présence sont
    /// effacées et redemandées : « je suis dispo jeudi » ne dit rien de
    /// samedi. Un simple changement d'heure les conserve.
    func updateEvent(
        _ event: GroupEvent,
        in group: GroupChat,
        date: Date,
        title: String,
        venue: String,
        scope: EventEditScope
    ) {
        guard canLead(group) else { return }
        let calendar = Calendar.current
        let time = calendar.dateComponents([.hour, .minute], from: date)
        let leader = leaderDisplayName(of: group)

        // Les dates concernées : celle-ci seule, ou toutes celles de la série
        // encore à venir (celle-ci comprise).
        let targets: [GroupEvent]
        if scope == .futureOccurrences, let seriesID = event.seriesID {
            let now = Date()
            targets = group.allEvents
                .filter { $0.seriesID == seriesID && ($0.date > now || $0.id == event.id) }
                .sorted { $0.date < $1.date }
        } else {
            targets = [event]
        }
        guard !targets.isEmpty else { return }

        /// La nouvelle date d'une occurrence donnée.
        func newDate(for occurrence: GroupEvent) -> Date {
            guard scope == .futureOccurrences, occurrence.id != event.id else { return date }
            // Même jour, nouvelle heure.
            return calendar.date(
                bySettingHour: time.hour ?? 0,
                minute: time.minute ?? 0,
                second: 0,
                of: occurrence.date
            ) ?? occurrence.date
        }

        var updated: [GroupEvent] = []
        var dayChanged: [UUID] = []
        for occurrence in targets {
            let target = newDate(for: occurrence)
            let movedToAnotherDay = !calendar.isDate(target, inSameDayAs: occurrence.date)
            var copy = occurrence
            copy.date = target
            copy.title = title
            copy.venue = venue
            if movedToAnotherDay {
                dayChanged.append(occurrence.id)
                // On repart d'une feuille de présence vierge — sauf le leader,
                // qui vient de choisir la date.
                copy.attendance = [leader: .available]
            }
            updated.append(copy)
        }

        let byID = Dictionary(uniqueKeysWithValues: updated.map { ($0.id, $0) })
        updateGroup(group.id) { group in
            guard var events = group.events else { return }
            for index in events.indices {
                if let replacement = byID[events[index].id] { events[index] = replacement }
            }
            events.sort { $0.date < $1.date }
            group.events = events
        }
        rescheduleAllAttendanceNotifications()

        guard let backend, isLive else { return }
        let groupID = group.id
        let anchorID = updated.first?.id ?? event.id
        let count = updated.count
        let resetIDs = dayChanged
        let leaderID = profileID(for: leader)
        syncLive {
            try await backend.updateEventSchedules(updated, groupID: groupID)
            if !resetIDs.isEmpty, let leaderID {
                try await backend.resetAttendance(eventIDs: resetIDs, keeping: leaderID)
            }
            try await backend.notifyEventMoved(eventID: anchorID, dates: count)
            await backend.deliverPendingPushNotifications()
        }
    }

    /// Annule une session et prévient les autres membres côté serveur. Le
    /// retrait local est immédiat ; le prochain refresh réconcilie si l'appel
    /// échoue (et `syncLive` affiche déjà l'erreur).
    func cancelEvent(_ event: GroupEvent, from group: GroupChat) {
        cancelAttendanceNotifications(for: event)
        updateGroup(group.id) { $0.events?.removeAll { $0.id == event.id } }
        if let backend, isLive {
            syncLive {
                try await backend.cancelGroupEvents([event.id])
                await backend.deliverPendingPushNotifications()
            }
        }
    }

    /// Combien de dates de cette série restent à venir (celle-ci comprise).
    func remainingOccurrences(of event: GroupEvent, in group: GroupChat) -> Int {
        guard let seriesID = event.seriesID else { return 1 }
        let now = Date()
        return group.allEvents.filter { $0.seriesID == seriesID && $0.date > now }.count
    }

    /// Change le délai de rappel d'un événement (leader). Le nouveau délai
    /// est synchronisé : chaque appareil replanifiera son rappel local.
    func setReminderLead(_ days: Int, forEventID eventID: GroupEvent.ID, in groupID: GroupChat.ID) {
        guard let group = groups.first(where: { $0.id == groupID }), canLead(group) else { return }
        updateGroup(groupID) { group in
            guard let index = group.events?.firstIndex(where: { $0.id == eventID }) else { return }
            group.events?[index].reminderLeadDays = days
        }
        if let group = groups.first(where: { $0.id == groupID }),
           let event = group.allEvents.first(where: { $0.id == eventID }) {
            scheduleMyEventReminder(for: event, in: group)
            for name in event.unavailableNames {
                scheduleUnavailableAlert(for: event, member: name, in: group)
            }
        }
        if let backend, isLive {
            syncLive { try await backend.updateEventReminderLead(days, eventID: eventID) }
        }
    }

    /// Annule toutes les dates encore à venir d'une série et envoie une seule
    /// notification récapitulative. Les occurrences passées restent : elles
    /// font partie de l'histoire du groupe.
    func cancelSeries(of event: GroupEvent, from group: GroupChat) {
        guard let seriesID = event.seriesID else {
            cancelEvent(event, from: group)
            return
        }
        let now = Date()
        let doomed = group.allEvents.filter { $0.seriesID == seriesID && $0.date > now }
        guard !doomed.isEmpty else { return }
        for event in doomed { cancelAttendanceNotifications(for: event) }
        let ids = Set(doomed.map(\.id))
        let orderedIDs = doomed.sorted { $0.date < $1.date }.map(\.id)
        updateGroup(group.id) { $0.events?.removeAll { ids.contains($0.id) } }
        if let backend, isLive {
            syncLive {
                try await backend.cancelGroupEvents(orderedIDs)
                await backend.deliverPendingPushNotifications()
            }
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
        guard let group = groups.first(where: { $0.id == groupID }),
              let event = group.allEvents.first(where: { $0.id == eventID })
        else { return }

        // Mon rappel change de ton (confirmation → simple rappel) ou disparaît.
        if member == profile.name {
            scheduleMyEventReminder(for: event, in: group)
        }
        if status == .unavailable {
            scheduleUnavailableAlert(for: event, member: member, in: group)
        } else {
            cancelNotification(id: Self.unavailableAlertID(eventID: eventID, member: member))
        }

        if let backend, isLive, let profileID = profileID(for: member) {
            syncLive { try await backend.setAttendance(status, eventID: eventID, profileID: profileID) }
        }
    }

    /// « 3 j », « 5 h », « 20 min » — le temps qui reste, en une pastille.
    /// nil quand la date est passée.
    func countdown(to date: Date, now: Date = Date()) -> String? {
        let seconds = date.timeIntervalSince(now)
        guard seconds > 0 else { return nil }
        if seconds >= 48 * 3600 {
            return String(format: tr("%lld j"), Int64(seconds / 86400))
        }
        if seconds >= 3600 {
            return String(format: tr("%lld h"), Int64(seconds / 3600))
        }
        return String(format: tr("%lld min"), max(1, Int64(seconds / 60)))
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
            body: String(format: tr("%@ invité·e pour %@"), musician.name, event.title),
            category: .groups
        )
    }

    // MARK: Rappels d'événement (notifications locales planifiées)
    //
    // Chaque appareil planifie SES propres rappels à partir des événements
    // synchronisés : c'est le seul moyen fiable d'atteindre un membre (une
    // notification locale ne part que sur l'appareil qui la programme).
    // Le délai choisi par le leader voyage avec l'événement, donc tout le
    // monde est prévenu au même moment.

    private static func eventReminderID(eventID: UUID) -> String {
        "event.\(eventID.uuidString)"
    }

    private static func unavailableAlertID(eventID: UUID, member: String) -> String {
        "unavailable.\(eventID.uuidString).\(member)"
    }

    /// Mon rappel pour un événement : « confirme ta présence » tant que je
    /// n'ai pas répondu, sinon un simple rappel avant le jour J. Programmé
    /// au délai voulu par le leader (2 jours par défaut).
    private func scheduleMyEventReminder(for event: GroupEvent, in group: GroupChat) {
        let id = Self.eventReminderID(eventID: event.id)
        cancelNotification(id: id)
        guard event.date > Date() else { return }
        let when = event.date.addingTimeInterval(-Double(event.reminderLead) * 24 * 3600)
        let dateLabel = event.date.formatted(.dateTime.weekday(.wide).day().month().hour().minute())
        let body: String
        switch event.status(for: profile.name) {
        case .pending:
            body = String(
                format: tr("Confirmes-tu ta présence pour « %@ » le %@ ?"),
                event.title, dateLabel
            )
        case .available:
            body = String(format: tr("« %@ » — %@ à %@."), event.title, dateLabel, event.venue)
        case .unavailable:
            return  // Je ne viens pas : pas de rappel.
        }
        pushLocal(
            title: "\(group.emoji) \(group.name)",
            body: body,
            identifier: id,
            at: when,
            category: .groups
        )
    }

    /// Alerte le leader, au même délai, si un membre s'est déclaré indispo —
    /// le temps de trouver un remplaçant. Ne se programme que sur l'appareil
    /// du leader, qui voit les réponses arriver en temps réel.
    private func scheduleUnavailableAlert(
        for event: GroupEvent,
        member: String,
        in group: GroupChat
    ) {
        let id = Self.unavailableAlertID(eventID: event.id, member: member)
        cancelNotification(id: id)
        guard isLeader(of: group), member != profile.name, event.date > Date() else { return }
        let when = event.date.addingTimeInterval(-Double(event.reminderLead) * 24 * 3600)
        pushLocal(
            title: String(format: tr("⚠️ Remplaçant pour %@"), group.name),
            body: String(
                format: tr("%@ est indispo pour « %@ » — trouve un remplaçant."),
                member, event.title
            ),
            identifier: id,
            at: when,
            category: .groups
        )
    }

    private func cancelAttendanceNotifications(for event: GroupEvent) {
        let center = UNUserNotificationCenter.current()
        center.removePendingNotificationRequests(
            withIdentifiers: [Self.eventReminderID(eventID: event.id)]
        )
        // Filet : tout ce qui porte l'identifiant de cet événement.
        center.getPendingNotificationRequests { requests in
            let prefix = event.id.uuidString
            let stale = requests.map(\.identifier).filter { $0.contains(prefix) }
            center.removePendingNotificationRequests(withIdentifiers: stale)
        }
    }

    /// Combien de rappels d'événement on programme au maximum. iOS ne garde
    /// que 64 notifications locales en attente par app : une répétition
    /// hebdomadaire sur un an les mangerait toutes d'un coup — et noierait
    /// l'utilisateur sous des rappels pour des dates dans six mois. On ne
    /// programme donc que les prochaines ; les suivantes prennent le relais
    /// à chaque synchro, au fur et à mesure que les dates passent.
    private static let maxScheduledEventReminders = 16

    /// Reprogramme les rappels après un lancement, une synchro ou un
    /// changement de présence. Idempotent : chaque rappel a un identifiant
    /// stable, une nouvelle planification remplace l'ancienne. Tout ce qui
    /// dépasse l'horizon est retiré du centre de notifications.
    private func rescheduleAllAttendanceNotifications() {
        guard notificationsEnabled, pushPreferences.groups else {
            pruneEventNotifications(keeping: [])
            return
        }
        let upcoming = groups
            .flatMap { group in group.upcomingEvents.map { (group: group, event: $0) } }
            .sorted { $0.event.date < $1.event.date }
        var keep = Set<String>()
        for entry in upcoming.prefix(Self.maxScheduledEventReminders) {
            scheduleMyEventReminder(for: entry.event, in: entry.group)
            keep.insert(Self.eventReminderID(eventID: entry.event.id))
            for name in entry.event.unavailableNames {
                scheduleUnavailableAlert(for: entry.event, member: name, in: entry.group)
                keep.insert(Self.unavailableAlertID(eventID: entry.event.id, member: name))
            }
        }
        pruneEventNotifications(keeping: keep)
    }

    /// Retire les rappels d'événement devenus caducs : dates passées, séries
    /// supprimées, occurrences repoussées au-delà de l'horizon.
    private func pruneEventNotifications(keeping keep: Set<String>) {
        let center = UNUserNotificationCenter.current()
        center.getPendingNotificationRequests { requests in
            let stale = requests.map(\.identifier).filter { identifier in
                (identifier.hasPrefix("event.") || identifier.hasPrefix("unavailable."))
                    && !keep.contains(identifier)
            }
            guard !stale.isEmpty else { return }
            center.removePendingNotificationRequests(withIdentifiers: stale)
        }
    }

    func deleteGroup(_ group: GroupChat) {
        for doc in group.docs {
            if !doc.fileName.isEmpty {
                try? FileManager.default.removeItem(at: Self.mediaURL(for: doc.fileName))
            }
            try? FileManager.default.removeItem(at: Self.docCacheURL(for: doc))
        }
        groups.removeAll { $0.id == group.id }
        persistGroups()
        if let backend, isLive {
            let docPaths = group.docs.compactMap(\.remotePath)
            let leaderID = liveUserID
            syncLive {
                // Les lignes `group_docs` partent en cascade avec le groupe ;
                // les fichiers du bucket (partitions + photo) sont nettoyés au mieux.
                try? await backend.deleteGroupDocFiles(paths: docPaths)
                if let leaderID {
                    try? await backend.deleteGroupPhoto(leaderID: leaderID, groupID: group.id)
                }
                try await backend.deleteGroup(group.id)
            }
        }
    }

    private func updateGroup(_ id: GroupChat.ID, _ transform: (inout GroupChat) -> Void) {
        guard let index = groups.firstIndex(where: { $0.id == id }) else { return }
        transform(&groups[index])
        persistGroups()
    }

    /// true pendant le téléversement d'un fichier de conversation.
    @Published private(set) var messageAttachmentUploadInProgress = false

    /// Envoie un message dans le groupe. En live il part sur le serveur et
    /// arrive chez tous les membres en temps réel ; en démo, un membre répond
    /// pour rendre la conversation vivante. Jamais de réponse scriptée en
    /// live : les membres sont de vraies personnes et on ne fabrique pas de
    /// propos en leur nom.
    func sendGroupMessage(
        _ text: String,
        attachment outgoing: OutgoingMessageAttachment? = nil,
        in group: GroupChat,
        completion: ((Bool) -> Void)? = nil
    ) {
        let clean = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard outgoing != nil || (!clean.isEmpty && acceptsUserContent(clean)) else {
            completion?(false)
            return
        }
        if let backend, let userID = liveUserID {
            let groupID = group.id
            Task { [weak self] in
                var uploaded: MessageAttachment?
                var optimisticMessageID: UUID?
                if outgoing != nil { self?.messageAttachmentUploadInProgress = true }
                defer { self?.messageAttachmentUploadInProgress = false }
                do {
                    if let outgoing {
                        uploaded = try await backend.uploadGroupMessageAttachment(
                            outgoing.data,
                            fileName: outgoing.fileName,
                            contentType: outgoing.contentType,
                            ext: outgoing.fileExtension,
                            groupID: groupID,
                            senderID: userID
                        )
                        if let uploaded {
                            try? outgoing.data.write(to: Self.messageAttachmentCacheURL(for: uploaded))
                        }
                    }
                    let message = GroupMessage(
                        sender: self?.profile.name ?? "",
                        isFromMe: true,
                        text: clean,
                        date: Date(),
                        attachment: uploaded
                    )
                    optimisticMessageID = message.id
                    self?.updateGroup(groupID) { $0.messages.append(message) }
                    let authoritative = try await backend.sendGroupMessage(
                        id: message.id,
                        text: clean,
                        attachment: uploaded,
                        groupID: groupID,
                        senderID: userID
                    )
                    self?.handleGroupMessageUpdate(authoritative)
                    // Livre les notifications que le trigger vient de mettre
                    // en file pour les autres membres du groupe.
                    await backend.deliverPendingPushNotifications()
                    completion?(true)
                } catch {
                    // L'envoi a échoué : retirer le message optimiste pour ne
                    // pas laisser croire qu'il est parti.
                    self?.updateGroup(groupID) {
                        guard let optimisticMessageID else { return }
                        $0.messages.removeAll { $0.id == optimisticMessageID }
                    }
                    if let path = uploaded?.remotePath {
                        try? await backend.deleteMessageAttachment(path: path)
                    }
                    self?.backendError = self?.tr("Le message n'a pas pu être envoyé.")
                    completion?(false)
                }
            }
            return
        }

        var localAttachment: MessageAttachment?
        if let outgoing {
            let fileName = "message_\(UUID().uuidString.lowercased()).\(outgoing.fileExtension)"
            let target = Self.mediaURL(for: fileName)
            do {
                try outgoing.data.write(to: target)
                localAttachment = MessageAttachment(
                    remotePath: "local:\(fileName)",
                    fileName: outgoing.fileName,
                    contentType: outgoing.contentType,
                    byteCount: outgoing.byteCount
                )
            } catch {
                backendError = tr("Le fichier n'a pas pu être envoyé.")
                completion?(false)
                return
            }
        }
        let message = GroupMessage(
            sender: profile.name,
            isFromMe: true,
            text: clean,
            date: Date(),
            attachment: localAttachment
        )
        updateGroup(group.id) { $0.messages.append(message) }
        completion?(true)
    }

    /// true pendant l'envoi d'une partition au serveur.
    @Published private(set) var docUploadInProgress = false

    /// Taille maximale d'une partition envoyée (limite du bucket : 20 Mo).
    nonisolated private static let maxDocBytes = 20 * 1024 * 1024

    /// Ajoute une partition (fichier importé) au groupe. En live elle est
    /// téléversée dans le bucket privé du groupe — tous les membres peuvent
    /// alors l'ouvrir ; en démo, simple copie locale.
    func addDoc(
        from sourceURL: URL,
        title: String,
        to group: GroupChat,
        songID: UUID? = nil,
        instrument: Instrument? = nil
    ) {
        let ext = sourceURL.pathExtension.isEmpty ? "pdf" : sourceURL.pathExtension.lowercased()
        // Fichier hors sandbox (Fichiers / iCloud) : accès sécurisé requis.
        let secured = sourceURL.startAccessingSecurityScopedResource()
        let data: Data
        do {
            data = try Data(contentsOf: sourceURL)
            if secured { sourceURL.stopAccessingSecurityScopedResource() }
        } catch {
            if secured { sourceURL.stopAccessingSecurityScopedResource() }
            backendError = tr("Le document n'a pas pu être importé.")
            return
        }

        guard let backend, let userID = liveUserID else {
            // Mode démo : copie locale, comme avant.
            let fileName = "group_doc_\(Int(Date().timeIntervalSince1970)).\(ext)"
            do {
                try data.write(to: Self.mediaURL(for: fileName))
                updateGroup(group.id) {
                    $0.docs.insert(
                        GroupDoc(
                            fileName: fileName,
                            title: title,
                            addedBy: profile.name,
                            date: Date(),
                            ext: ext,
                            songID: songID,
                            instrument: instrument?.rawValue
                        ),
                        at: 0
                    )
                }
            } catch {
                backendError = tr("Le document n'a pas pu être importé.")
            }
            return
        }

        guard data.count <= Self.maxDocBytes else {
            backendError = tr("Document trop lourd — 20 Mo maximum.")
            return
        }
        docUploadInProgress = true
        let groupID = group.id
        let myName = profile.name
        Task { [weak self] in
            defer { self?.docUploadInProgress = false }
            do {
                let doc = GroupDoc(
                    fileName: "", title: title, addedBy: myName, date: Date(), ext: ext,
                    songID: songID, instrument: instrument?.rawValue
                )
                let path = try await backend.uploadGroupDoc(data, ext: ext, docID: doc.id, groupID: groupID)
                var hosted = doc
                hosted.remotePath = path
                try await backend.insertGroupDoc(hosted, groupID: groupID, addedBy: userID)
                // Copie en cache : l'aperçu s'ouvre sans re-télécharger.
                try? data.write(to: Self.docCacheURL(for: hosted))
                self?.updateGroup(groupID) { $0.docs.insert(hosted, at: 0) }
            } catch {
                self?.backendError = self?.tr("La partition n'a pas pu être envoyée — vérifie le réseau.")
            }
        }
    }

    /// Ajoute une partition prise en photo. Même chemin que l'import de
    /// fichier, mais les données sont déjà en mémoire (photothèque, appareil).
    func addPhotoDoc(
        _ data: Data,
        title: String,
        to group: GroupChat,
        songID: UUID? = nil,
        instrument: Instrument? = nil
    ) {
        guard data.count <= Self.maxDocBytes else {
            backendError = tr("Document trop lourd — 20 Mo maximum.")
            return
        }
        guard let backend, let userID = liveUserID else {
            let fileName = "group_doc_\(Int(Date().timeIntervalSince1970)).jpg"
            do {
                try data.write(to: Self.mediaURL(for: fileName))
                updateGroup(group.id) {
                    $0.docs.insert(
                        GroupDoc(
                            fileName: fileName, title: title, addedBy: profile.name,
                            date: Date(), ext: "jpg",
                            songID: songID, instrument: instrument?.rawValue
                        ),
                        at: 0
                    )
                }
            } catch {
                backendError = tr("Le document n'a pas pu être importé.")
            }
            return
        }
        docUploadInProgress = true
        let groupID = group.id
        let myName = profile.name
        Task { [weak self] in
            defer { self?.docUploadInProgress = false }
            do {
                let doc = GroupDoc(
                    fileName: "", title: title, addedBy: myName, date: Date(), ext: "jpg",
                    songID: songID, instrument: instrument?.rawValue
                )
                let path = try await backend.uploadGroupDoc(data, ext: "jpg", docID: doc.id, groupID: groupID)
                var hosted = doc
                hosted.remotePath = path
                try await backend.insertGroupDoc(hosted, groupID: groupID, addedBy: userID)
                try? data.write(to: Self.docCacheURL(for: hosted))
                self?.updateGroup(groupID) { $0.docs.insert(hosted, at: 0) }
            } catch {
                self?.backendError = self?.tr("La partition n'a pas pu être envoyée — vérifie le réseau.")
            }
        }
    }

    // MARK: Commentaires de morceau

    /// Poste un commentaire sur un morceau — ouvert à tous les membres.
    func addSongComment(_ text: String, songID: UUID, in group: GroupChat) {
        let clean = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !clean.isEmpty, acceptsUserContent(clean) else { return }
        let comment = SongComment(
            songID: songID, author: profile.name, isMine: true, text: clean, date: Date()
        )
        updateGroup(group.id) { $0.songComments = ($0.songComments ?? []) + [comment] }
        guard let backend, let userID = liveUserID else { return }
        let groupID = group.id
        Task { [weak self] in
            do {
                try await backend.insertSongComment(
                    id: comment.id, groupID: groupID, songID: songID,
                    authorID: userID, text: clean
                )
            } catch {
                // L'envoi a échoué : on retire la bulle plutôt que de laisser
                // croire que le groupe l'a reçue.
                self?.updateGroup(groupID) {
                    $0.songComments?.removeAll { $0.id == comment.id }
                }
                self?.backendError = self?.tr("Le commentaire n'a pas pu être envoyé.")
            }
        }
    }

    /// Retire un commentaire (le sien, ou n'importe lequel si on est leader).
    func removeSongComment(_ comment: SongComment, in group: GroupChat) {
        guard comment.isMine || canLead(group) else { return }
        updateGroup(group.id) { $0.songComments?.removeAll { $0.id == comment.id } }
        if let backend, isLive {
            syncLive { try await backend.deleteSongComment(comment.id) }
        }
    }

    /// Enregistre tonalité, grille d'accords et lien iReal Pro d'un morceau
    /// (leader). Le reste du morceau est inchangé.
    func updateSongDetails(
        _ song: Song,
        key: String?,
        chords: String?,
        irealURL: String?,
        irealDisabled: Bool? = nil,
        in group: GroupChat
    ) {
        guard canLead(group) else { return }
        var updated = song
        updated.key = key?.isEmpty == true ? nil : key
        updated.chords = chords?.isEmpty == true ? nil : chords
        updated.irealURL = irealURL?.isEmpty == true ? nil : irealURL
        if let irealDisabled { updated.irealDisabled = irealDisabled }
        let fields = Self.changedSongFields(
            from: song,
            to: updated,
            candidates: [.key, .chords, .irealURL, .irealDisabled]
        )
        guard !fields.isEmpty else { return }
        let mutation = SongCollectionMutation.update(updated, fields: fields)
        applySongMutationEverywhere(mutation, in: group.id)
        // Le morceau vit aussi dans les setlists : on republie celles qui le
        // contiennent, sinon la version transposée n'y arriverait jamais.
        syncSongEverywhere(mutation, in: group.id)
    }

    func removeDoc(_ doc: GroupDoc, from group: GroupChat) {
        if !doc.fileName.isEmpty {
            try? FileManager.default.removeItem(at: Self.mediaURL(for: doc.fileName))
        }
        try? FileManager.default.removeItem(at: Self.docCacheURL(for: doc))
        updateGroup(group.id) { $0.docs.removeAll { $0.id == doc.id } }
        if let backend, isLive, let path = doc.remotePath {
            syncLive {
                try await backend.deleteGroupDoc(doc.id)
                try? await backend.deleteGroupDocFiles(paths: [path])
            }
        }
    }

    /// Emplacement de la copie locale (cache) d'une partition hébergée.
    nonisolated static func docCacheURL(for doc: GroupDoc) -> URL {
        let caches = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)[0]
        return caches.appendingPathComponent(doc.cacheFileName)
    }

    /// URL locale d'une partition, prête pour l'aperçu : cache si déjà
    /// téléchargée, sinon téléchargement depuis le bucket privé (RLS :
    /// réservé aux membres du groupe).
    func localURL(for doc: GroupDoc) async -> URL? {
        if doc.remotePath == nil {
            return Self.mediaURL(for: doc.fileName)
        }
        let target = Self.docCacheURL(for: doc)
        if FileManager.default.fileExists(atPath: target.path) { return target }
        guard let backend, let path = doc.remotePath else { return nil }
        do {
            let data = try await backend.downloadGroupDoc(path: path)
            try data.write(to: target)
            return target
        } catch {
            backendError = tr("La partition n'a pas pu être ouverte — vérifie le réseau.")
            return nil
        }
    }

    /// Copie locale d'une pièce jointe. Le hash du chemin évite d'exposer le
    /// nom saisi dans un chemin de fichier et garde une extension lisible par
    /// Quick Look.
    nonisolated static func messageAttachmentCacheURL(for attachment: MessageAttachment) -> URL {
        let caches = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)[0]
        let key = attachment.remotePath.unicodeScalars.reduce(UInt64(5381)) {
            (($0 << 5) &+ $0) &+ UInt64($1.value)
        }
        return caches.appendingPathComponent("message_\(String(key, radix: 16)).\(attachment.fileExtension)")
    }

    nonisolated private static func removeCachedMessageAttachment(_ attachment: MessageAttachment) {
        let target = messageAttachmentCacheURL(for: attachment)
        try? FileManager.default.removeItem(at: target)
    }

    nonisolated private static func purgeCachedMessageAttachments() {
        let caches = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)[0]
        guard let urls = try? FileManager.default.contentsOfDirectory(
            at: caches,
            includingPropertiesForKeys: nil
        ) else { return }
        for url in urls where url.lastPathComponent.hasPrefix("message_") {
            try? FileManager.default.removeItem(at: url)
        }
    }

    /// URL locale prête pour Quick Look, depuis le cache ou le bucket privé.
    func localURL(for attachment: MessageAttachment) async -> URL? {
        if attachment.remotePath.hasPrefix("local:") {
            return Self.mediaURL(for: String(attachment.remotePath.dropFirst("local:".count)))
        }
        let target = Self.messageAttachmentCacheURL(for: attachment)
        if FileManager.default.fileExists(atPath: target.path) { return target }
        guard let backend else { return nil }
        do {
            let data = try await backend.downloadMessageAttachment(path: attachment.remotePath)
            try data.write(to: target, options: .atomic)
            return target
        } catch {
            backendError = tr("Le fichier n'a pas pu être ouvert — vérifie le réseau.")
            return nil
        }
    }

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

    /// Demande de dépannage adressée à UN musicien. Ce n'est plus un message
    /// à écrire puis à relancer : c'est un vrai SOS, visible de lui seul, qu'il
    /// accepte ou refuse d'un tap. Le reste se fait tout seul — notification à
    /// l'envoi, poste pourvu à l'acceptation, réponse notifiée à l'auteur.
    func sendDirectSOS(
        to musician: Musician,
        instrument: Instrument,
        date: Date,
        place: String,
        neighborhood: String? = nil,
        fee: Int?,
        paymentMethod: String?,
        note: String
    ) {
        let trimmedPlace = place.trimmingCharacters(in: .whitespacesAndNewlines)
        let town = (neighborhood ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        let request = GigRequest(
            title: String(format: tr("Dépannage — %@"), tr(instrument.rawValue)),
            hostName: profile.name,
            hostId: liveUserID,
            date: date,
            place: trimmedPlace.isEmpty ? tr("À préciser") : trimmedPlace,
            neighborhood: town.isEmpty ? profile.cityLabel : town,
            genre: profile.genres.first ?? musician.genres.first ?? .jazz,
            wantedInstruments: [instrument],
            fee: fee,
            paymentMethod: paymentMethod,
            descriptionText: note.trimmingCharacters(in: .whitespacesAndNewlines),
            isMine: true,
            postedAt: Date(),
            targetId: musician.id,
            targetStatus: .pending
        )
        addEvent(request)
    }

    // MARK: - Médias du profil (photo + vidéos de démo)

    /// Nombre maximum de vidéos de démo selon l'abonnement.
    var videoLimit: Int { isPremium ? 6 : 1 }
    var canAddVideo: Bool { profile.videos.count < videoLimit }
    /// true pendant la compression + l'envoi d'une vidéo au serveur.
    @Published private(set) var videoUploadInProgress = false

    nonisolated private static var documentsURL: URL {
        FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
    }

    nonisolated static func mediaURL(for fileName: String) -> URL {
        documentsURL.appendingPathComponent(fileName)
    }

    /// Enregistre la photo de profil choisie (remplace l'ancienne). En live
    /// elle est aussi téléversée pour être visible des autres musiciens.
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
            return
        }
        Task { await publishProfilePhoto(data) }
    }

    /// Téléverse la photo et écrit son URL sur le profil serveur. C'est cette
    /// URL — et elle seule — que les autres voient : tant qu'elle manque, la
    /// photo n'existe que sur cet appareil.
    @discardableResult
    private func publishProfilePhoto(_ data: Data, silent: Bool = false) async -> Bool {
        guard let backend, let userID = liveUserID else { return false }
        do {
            let url = try await backend.uploadAvatar(data, userID: userID)
            try await backend.updatePhotoURL(url.absoluteString, userID: userID)
            profile.photoURL = url.absoluteString
            Self.save(profile, key: Self.profileKey)
            return true
        } catch {
            if !silent {
                backendError = tr("La photo n'a pas pu être publiée sur ton profil réseau.")
            }
            return false
        }
    }

    /// Envoi de photo en cours — évite de republier en boucle à chaque synchro.
    private var photoPublishInFlight = false

    /// Rattrape une photo restée prisonnière de l'appareil : j'ai bien choisi
    /// une photo, mais le serveur n'en a aucune (envoi tombé, hors ligne au
    /// moment du choix, ou photo posée par une version qui ne l'hébergeait
    /// pas encore). On la republie en silence — sinon personne d'autre ne la
    /// voit jamais, et elle disparaît à la réinstallation.
    private func healProfilePhotoIfNeeded() {
        guard isLive, !photoPublishInFlight,
              profile.photoURL == nil,
              let fileName = profile.photoFileName,
              let data = try? Data(contentsOf: Self.mediaURL(for: fileName))
        else { return }
        photoPublishInFlight = true
        Task { [weak self] in
            await self?.publishProfilePhoto(data, silent: true)
            self?.photoPublishInFlight = false
        }
    }

    func removeProfilePhoto() {
        if let old = profile.photoFileName {
            try? FileManager.default.removeItem(at: Self.mediaURL(for: old))
        }
        profile.photoFileName = nil
        profile.photoURL = nil
        saveProfile()
        if let backend, let userID = liveUserID {
            Task { try? await backend.updatePhotoURL(nil, userID: userID) }
        }
    }

    /// Erreurs d'import vidéo, montrées telles quelles à l'utilisateur.
    enum VideoImportError: Error {
        case tooLong
        case tooLarge
        case exportFailed
    }

    /// Ajoute une vidéo de démo. En live : compression 720p puis envoi sur le
    /// serveur (visible par tous) ; en démo : simple copie locale.
    /// Vérifier `canAddVideo` avant.
    @discardableResult
    func addDemoVideo(from sourceURL: URL) async -> DemoVideo? {
        guard canAddVideo else { return nil }
        guard let backend, let userID = liveUserID else {
            let fileName = "demo_video_\(Int(Date().timeIntervalSince1970)).\(sourceURL.pathExtension.isEmpty ? "mov" : sourceURL.pathExtension)"
            do {
                try FileManager.default.copyItem(at: sourceURL, to: Self.mediaURL(for: fileName))
                let video = DemoVideo(fileName: fileName, date: Date())
                saveVideos(profile.videos + [video])
                return video
            } catch {
                backendError = tr("La vidéo n'a pas pu être enregistrée.")
                return nil
            }
        }
        videoUploadInProgress = true
        defer { videoUploadInProgress = false }
        do {
            let compressed = try await Self.compressVideoForUpload(sourceURL)
            defer { try? FileManager.default.removeItem(at: compressed) }
            let data = try Data(contentsOf: compressed)
            guard data.count <= Self.maxVideoBytes else { throw VideoImportError.tooLarge }
            let (path, url) = try await backend.uploadDemoVideo(data, userID: userID)
            // Miniature générée sur place — son absence ne bloque jamais l'envoi.
            var thumbURL: String?
            if let thumbData = await Self.generateVideoThumbnail(from: compressed) {
                thumbURL = (try? await backend.uploadDemoVideoThumbnail(thumbData, userID: userID))?
                    .url.absoluteString
            }
            let video = DemoVideo(
                fileName: "",
                date: Date(),
                storagePath: path,
                remoteURL: url.absoluteString,
                thumbURL: thumbURL
            )
            let updated = profile.videos + [video]
            // Sync serveur AVANT de valider en local : si le serveur refuse
            // (RLS, quota, taille jsonb), on nettoie les fichiers tout juste
            // envoyés et on N'affiche PAS une vidéo fantôme qui disparaîtrait
            // au prochain rafraîchissement.
            do {
                try await backend.updateDemoVideos(updated.filter { $0.storagePath?.isEmpty == false }, userID: userID)
            } catch {
                var paths = [path]
                if let thumbPath = Self.storagePath(fromPublicURL: thumbURL) { paths.append(thumbPath) }
                try? await backend.deleteDemoVideoFiles(paths: paths)
                throw error
            }
            profile.demoVideos = updated
            profile.videoFileNames = nil
            saveProfile()
            return video
        } catch VideoImportError.tooLong {
            backendError = tr("Vidéo trop longue — 3 minutes maximum.")
        } catch VideoImportError.tooLarge {
            backendError = tr("Vidéo trop lourde — raccourcis-la et réessaie.")
        } catch {
            backendError = tr("La vidéo n'a pas pu être enregistrée.") + " (\(error.localizedDescription))"
        }
        return nil
    }

    /// Taille maximale d'une vidéo envoyée (limite du bucket : 50 Mo).
    nonisolated private static let maxVideoBytes = 50 * 1024 * 1024

    /// Compresse la vidéo pour l'envoi : 720p à débit maîtrisé (HEVC, repli
    /// H.264) et piste audio copiée TELLE QUELLE — le son n'est jamais
    /// recompressé. Une démo de 3 minutes pèse ainsi ~45 Mo au lieu du
    /// fichier caméra brut. Repli ultime : préréglage 720p système.
    nonisolated private static func compressVideoForUpload(
        _ sourceURL: URL,
        maxDuration: Double = 181,
        bitRate: Int = 2_000_000
    ) async throws -> URL {
        let asset = AVURLAsset(url: sourceURL)
        let duration = try await asset.load(.duration)
        guard duration.seconds <= maxDuration else { throw VideoImportError.tooLong }
        // HEVC d'abord (meilleure qualité au même poids), H.264 sinon.
        if let output = try? await exportDownscaled(asset, codec: .hevc, bitRate: bitRate) {
            return output
        }
        if let output = try? await exportDownscaled(asset, codec: .h264, bitRate: bitRate) {
            return output
        }
        if #available(iOS 18.0, *) {
            guard let session = AVAssetExportSession(asset: asset, presetName: AVAssetExportPreset1280x720) else {
                throw VideoImportError.exportFailed
            }
            session.shouldOptimizeForNetworkUse = true
            let output = URL.temporaryDirectory.appendingPathComponent("upload_\(UUID().uuidString).mp4")
            try await session.export(to: output, as: .mp4)
            return output
        }
        throw VideoImportError.exportFailed
    }

    /// Ré-encode la piste vidéo en ≤ 720p (~2 Mbit/s) et copie la piste
    /// audio sans la toucher (passthrough AAC). AVAssetReader + Writer :
    /// disponible sur toutes les versions d'iOS supportées.
    nonisolated private static func exportDownscaled(
        _ asset: AVURLAsset,
        codec: AVVideoCodecType,
        bitRate: Int
    ) async throws -> URL {
        guard let videoTrack = try await asset.loadTracks(withMediaType: .video).first else {
            throw VideoImportError.exportFailed
        }
        let audioTrack = try await asset.loadTracks(withMediaType: .audio).first
        let (naturalSize, transform, frameRate) = try await videoTrack.load(
            .naturalSize, .preferredTransform, .nominalFrameRate
        )

        // Dimensions affichées (orientation appliquée), plafonnées à 720p.
        let displayed = naturalSize.applying(transform)
        let displayWidth = abs(displayed.width)
        let displayHeight = abs(displayed.height)
        guard displayWidth > 0, displayHeight > 0 else { throw VideoImportError.exportFailed }
        let scale = min(
            1,
            1280 / max(displayWidth, displayHeight),
            720 / min(displayWidth, displayHeight)
        )
        let renderWidth = (displayWidth * scale / 2).rounded(.down) * 2
        let renderHeight = (displayHeight * scale / 2).rounded(.down) * 2

        // Composition : oriente puis met à l'échelle chaque frame, en
        // plafonnant la cadence à 30 i/s (largement assez pour une démo).
        let fps = frameRate > 0 ? min(30, frameRate) : 30
        let composition = AVMutableVideoComposition()
        composition.renderSize = CGSize(width: renderWidth, height: renderHeight)
        composition.frameDuration = CMTime(value: 1, timescale: CMTimeScale(fps.rounded()))
        let instruction = AVMutableVideoCompositionInstruction()
        instruction.timeRange = CMTimeRange(start: .zero, duration: try await asset.load(.duration))
        let layer = AVMutableVideoCompositionLayerInstruction(assetTrack: videoTrack)
        layer.setTransform(transform.concatenating(CGAffineTransform(scaleX: scale, y: scale)), at: .zero)
        instruction.layerInstructions = [layer]
        composition.instructions = [instruction]

        let reader = try AVAssetReader(asset: asset)
        let videoOutput = AVAssetReaderVideoCompositionOutput(
            videoTracks: [videoTrack],
            videoSettings: [kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_420YpCbCr8BiPlanarVideoRange]
        )
        videoOutput.videoComposition = composition
        videoOutput.alwaysCopiesSampleData = false
        guard reader.canAdd(videoOutput) else { throw VideoImportError.exportFailed }
        reader.add(videoOutput)

        var audioOutput: AVAssetReaderTrackOutput?
        if let audioTrack {
            // outputSettings nil = échantillons compressés d'origine (AAC),
            // recopiés tels quels dans le fichier de sortie.
            let output = AVAssetReaderTrackOutput(track: audioTrack, outputSettings: nil)
            output.alwaysCopiesSampleData = false
            if reader.canAdd(output) {
                reader.add(output)
                audioOutput = output
            }
        }

        let outputURL = URL.temporaryDirectory.appendingPathComponent("upload_\(UUID().uuidString).mp4")
        try? FileManager.default.removeItem(at: outputURL)
        let writer = try AVAssetWriter(outputURL: outputURL, fileType: .mp4)
        writer.shouldOptimizeForNetworkUse = true

        var compression: [String: Any] = [
            AVVideoAverageBitRateKey: bitRate,
            AVVideoMaxKeyFrameIntervalKey: 60,
            AVVideoExpectedSourceFrameRateKey: Int(fps.rounded())
        ]
        if codec == .h264 {
            compression[AVVideoProfileLevelKey] = AVVideoProfileLevelH264HighAutoLevel
        }
        let videoInput = AVAssetWriterInput(mediaType: .video, outputSettings: [
            AVVideoCodecKey: codec,
            AVVideoWidthKey: renderWidth,
            AVVideoHeightKey: renderHeight,
            AVVideoCompressionPropertiesKey: compression
        ])
        videoInput.expectsMediaDataInRealTime = false
        guard writer.canAdd(videoInput) else { throw VideoImportError.exportFailed }
        writer.add(videoInput)

        var audioInput: AVAssetWriterInput?
        if let audioOutput,
           let format = try? await audioOutput.track.load(.formatDescriptions).first {
            // outputSettings nil + format source = passthrough (zéro
            // recompression du son).
            let input = AVAssetWriterInput(mediaType: .audio, outputSettings: nil, sourceFormatHint: format)
            input.expectsMediaDataInRealTime = false
            if writer.canAdd(input) {
                writer.add(input)
                audioInput = input
            }
        }

        guard reader.startReading() else { throw VideoImportError.exportFailed }
        guard writer.startWriting() else {
            reader.cancelReading()
            throw VideoImportError.exportFailed
        }
        writer.startSession(atSourceTime: .zero)

        await withTaskGroup(of: Void.self) { group in
            group.addTask {
                await Self.pump(from: videoOutput, to: videoInput, label: "video-writer")
            }
            if let audioOutput, let audioInput {
                group.addTask {
                    await Self.pump(from: audioOutput, to: audioInput, label: "audio-writer")
                }
            }
        }

        guard reader.status != .failed else {
            writer.cancelWriting()
            throw VideoImportError.exportFailed
        }
        await writer.finishWriting()
        guard writer.status == .completed else { throw VideoImportError.exportFailed }
        return outputURL
    }

    /// Prépare une vidéo de message : 720p, environ 1 Mbit/s, 2 minutes au
    /// maximum. Même avec l'audio, le résultat reste sous la limite privée de
    /// 20 Mo du bucket `message-files`.
    nonisolated static func compressedMessageVideo(
        from sourceURL: URL
    ) async throws -> OutgoingMessageAttachment {
        let compressed = try await compressVideoForUpload(
            sourceURL,
            maxDuration: 120,
            bitRate: 1_000_000
        )
        defer { try? FileManager.default.removeItem(at: compressed) }
        let data = try Data(contentsOf: compressed, options: .mappedIfSafe)
        guard !data.isEmpty else { throw OutgoingMessageAttachment.ImportError.empty }
        guard data.count <= OutgoingMessageAttachment.maxBytes else {
            throw OutgoingMessageAttachment.ImportError.tooLarge
        }
        return OutgoingMessageAttachment(
            data: data,
            fileName: "Vidéo.mp4",
            contentType: "video/mp4",
            fileExtension: "mp4"
        )
    }

    /// Reader + writer d'une piste pendant l'export — tout l'accès se fait
    /// sur la file série d'AVFoundation, d'où le @unchecked Sendable.
    private final class PumpBox: @unchecked Sendable {
        let output: AVAssetReaderOutput
        let input: AVAssetWriterInput
        /// Le callback peut être rappelé après la fin : le drapeau (protégé
        /// par la file série) évite de terminer deux fois la continuation.
        var finished = false

        init(output: AVAssetReaderOutput, input: AVAssetWriterInput) {
            self.output = output
            self.input = input
        }
    }

    /// Recopie tous les échantillons d'une sortie de lecture vers une entrée
    /// d'écriture, au rythme accepté par l'encodeur.
    nonisolated private static func pump(
        from output: AVAssetReaderOutput,
        to input: AVAssetWriterInput,
        label: String
    ) async {
        let queue = DispatchQueue(label: "dispo.export.\(label)")
        let box = PumpBox(output: output, input: input)
        await withCheckedContinuation { (continuation: CheckedContinuation<Void, Never>) in
            box.input.requestMediaDataWhenReady(on: queue) {
                guard !box.finished else { return }
                while box.input.isReadyForMoreMediaData {
                    guard let sample = box.output.copyNextSampleBuffer() else {
                        box.finished = true
                        box.input.markAsFinished()
                        continuation.resume()
                        return
                    }
                    if !box.input.append(sample) {
                        // L'écrivain a signalé une erreur : on s'arrête, le
                        // statut du writer fera échouer l'export proprement.
                        box.finished = true
                        box.input.markAsFinished()
                        continuation.resume()
                        return
                    }
                }
            }
        }
    }

    /// Change la date d'une vidéo (date du concert / de l'enregistrement).
    func setVideoDate(_ date: Date?, for video: DemoVideo) {
        saveVideos(profile.videos.map {
            guard $0.id == video.id else { return $0 }
            var updated = $0
            updated.date = date
            return updated
        })
    }

    /// Change le titre d'une vidéo (vide = retour à « Vidéo N »).
    func setVideoTitle(_ title: String?, for video: DemoVideo) {
        let trimmed = title?.trimmingCharacters(in: .whitespacesAndNewlines)
        saveVideos(profile.videos.map {
            guard $0.id == video.id else { return $0 }
            var updated = $0
            updated.title = (trimmed?.isEmpty == false) ? trimmed : nil
            return updated
        })
    }

    func removeDemoVideo(_ video: DemoVideo) {
        if !video.fileName.isEmpty {
            try? FileManager.default.removeItem(at: Self.mediaURL(for: video.fileName))
        }
        if let backend, isLive {
            var paths: [String] = []
            if let path = video.storagePath, !path.isEmpty { paths.append(path) }
            if let thumbPath = Self.storagePath(fromPublicURL: video.thumbURL) {
                paths.append(thumbPath)
            }
            if !paths.isEmpty {
                Task { try? await backend.deleteDemoVideoFiles(paths: paths) }
            }
        }
        saveVideos(profile.videos.filter { $0.id != video.id })
    }

    /// Retrouve le chemin Storage d'une miniature depuis son URL publique.
    nonisolated private static func storagePath(fromPublicURL urlString: String?) -> String? {
        guard let urlString,
              let range = urlString.range(of: "/demo-videos/") else { return nil }
        let tail = String(urlString[range.upperBound...])
        return tail.split(separator: "?").first.map(String.init)
    }

    /// Génère une miniature JPEG (~720 px) d'une vidéo, locale ou distante.
    nonisolated static func generateVideoThumbnail(from url: URL) async -> Data? {
        let asset = AVURLAsset(url: url)
        let generator = AVAssetImageGenerator(asset: asset)
        generator.appliesPreferredTrackTransform = true
        generator.maximumSize = CGSize(width: 720, height: 720)
        let time = CMTime(seconds: 1, preferredTimescale: 600)
        guard let cgImage = try? await generator.image(at: time).image else { return nil }
        return UIImage(cgImage: cgImage).jpegData(compressionQuality: 0.75)
    }

    /// Complète les miniatures manquantes de MES vidéos déjà en ligne
    /// (envoyées avant la 0.9.6) — silencieux, au mieux.
    private func backfillVideoThumbnails() {
        guard let backend, let userID = liveUserID else { return }
        let missing = profile.videos.filter {
            $0.thumbURL == nil && ($0.remoteURL?.isEmpty == false)
        }
        guard !missing.isEmpty else { return }
        Task { [weak self] in
            var updates: [UUID: String] = [:]
            for video in missing {
                guard let remote = video.remoteURL, let url = URL(string: remote),
                      let data = await Self.generateVideoThumbnail(from: url),
                      let uploaded = try? await backend.uploadDemoVideoThumbnail(data, userID: userID)
                else { continue }
                updates[video.id] = uploaded.url.absoluteString
            }
            guard !updates.isEmpty, let self else { return }
            self.saveVideos(self.profile.videos.map {
                guard let thumb = updates[$0.id] else { return $0 }
                var updated = $0
                updated.thumbURL = thumb
                return updated
            })
        }
    }

    /// Écrit la liste au nouveau format daté (migre l'ancien au passage) et
    /// la pousse sur le profil serveur en live.
    private func saveVideos(_ videos: [DemoVideo]) {
        profile.demoVideos = videos
        profile.videoFileNames = nil
        saveProfile()
        if let backend, let userID = liveUserID {
            let hosted = videos.filter { $0.storagePath?.isEmpty == false }
            Task {
                do {
                    try await backend.updateDemoVideos(hosted, userID: userID)
                } catch {
                    backendError = tr("Les vidéos n'ont pas pu être synchronisées.")
                }
            }
        }
    }

    // MARK: - Abonnés d'un musicien

    /// Nombre d'abonnés affiché pour un musicien : base stable de démo
    /// (le vrai compteur viendra du graphe serveur en phase 2b) + moi si
    /// je le suis.
    func followerCount(of musician: Musician) -> Int {
        if isLive { return liveFollowerCounts[musician.id, default: 0] }
        return 40 + abs(musician.name.stableHash) % 320 + (isFollowing(musician) ? 1 : 0)
    }

    /// Abonnés d'un profil, en objets Musician (feuille cliquable).
    /// Live : graphe serveur (bloqués retirés). Démo : échantillon stable
    /// dimensionné sur `followerCount(of:)`.
    func followers(of musician: Musician) -> [Musician] {
        if isLive {
            let ids = Set(liveFollowersByProfile[musician.id] ?? [])
            return musicians
                .filter { ids.contains($0.id) && !blockedUserIDs.contains($0.id) }
                .sorted { $0.name < $1.name }
        }
        let pool = musicians.filter { $0.id != musician.id }
        let count = min(followerCount(of: musician), pool.count)
        let seed = musician.name
        return Array(
            pool.sorted { abs(($0.name + seed).stableHash) < abs(($1.name + seed).stableHash) }
                .prefix(count)
        )
    }

    /// Mes abonnés en objets Musician (feuille de mon profil).
    var myFollowerMusicians: [Musician] {
        if isLive, let myID = liveUserID {
            let ids = Set(liveFollowersByProfile[myID] ?? [])
            return musicians
                .filter { ids.contains($0.id) && !blockedUserIDs.contains($0.id) }
                .sorted { $0.name < $1.name }
        }
        return musicians.filter { myFollowers.contains($0.name) }.sorted { $0.name < $1.name }
    }

    // MARK: - Groupes : photo, visibilité, profils publics

    /// Groupes publics par profil, chargés à l'ouverture d'une fiche.
    @Published private(set) var publicGroupsByProfile: [UUID: [PublicGroup]] = [:]

    /// Charge (une fois) les groupes publics d'un musicien pour sa fiche.
    func loadPublicGroups(of musicianID: UUID) async {
        guard isLive, let backend, publicGroupsByProfile[musicianID] == nil else { return }
        let groups = (try? await backend.fetchPublicGroups(of: musicianID)) ?? []
        publicGroupsByProfile[musicianID] = groups
    }

    /// Photo du groupe (leader uniquement — l'UI verrouille). Hébergée dans
    /// le dossier Storage du leader, puis visible par tous les membres.
    func setGroupPhoto(_ data: Data, in group: GroupChat) {
        guard let backend, let userID = liveUserID else {
            backendError = tr("Connecte-toi pour ajouter une photo de groupe.")
            return
        }
        let groupID = group.id
        Task { [weak self] in
            do {
                let url = try await backend.uploadGroupPhoto(data, leaderID: userID, groupID: groupID)
                try await backend.updateGroupPhotoURL(url.absoluteString, groupID: groupID)
                self?.updateGroup(groupID) { $0.photoURL = url.absoluteString }
            } catch {
                self?.backendError = self?.tr("La photo du groupe n'a pas pu être envoyée.")
            }
        }
    }

    /// Rend le groupe visible (ou non) sur les profils de ses membres.
    func setGroupVisibility(_ isPublic: Bool, in group: GroupChat) {
        updateGroup(group.id) { $0.isPublic = isPublic }
        if let backend, isLive {
            syncLive { try await backend.setGroupVisibility(isPublic, groupID: group.id) }
        }
    }

    /// Renomme le groupe (leader uniquement — l'UI verrouille, la RLS
    /// serveur aussi). Le nouveau nom arrive chez les membres en realtime.
    func renameGroup(_ newName: String, in group: GroupChat) {
        let trimmed = newName.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty, trimmed != group.name, acceptsUserContent(trimmed) else { return }
        updateGroup(group.id) { $0.name = trimmed }
        if let backend, isLive {
            syncLive { try await backend.renameGroup(trimmed, groupID: group.id) }
        }
    }

    // MARK: - Liaison du compte Apple

    /// Lie l'identité Apple au compte connecté. Ensuite, le bouton
    /// « Se connecter avec Apple » ouvre ce compte en un tap.
    func linkAppleAccount(idToken: String, nonce: String) async -> Bool {
        guard let backend, isLive else { return false }
        do {
            try await backend.linkApple(idToken: idToken, nonce: nonce)
            appleLinked = true
            return true
        } catch {
            backendError = tr("La liaison avec Apple a échoué — réessaie.")
            return false
        }
    }

    // MARK: - Divers

    /// Musicien du feed correspondant à une conversation (fiche profil
    /// ouvrable depuis le chat). UUID serveur d'abord, nom en repli (démo).
    func musician(for conversation: Conversation) -> Musician? {
        if let id = conversation.contactID,
           let match = musicians.first(where: { $0.id == id }) {
            return match
        }
        return musicians.first(where: { $0.name == conversation.contactName })
    }

    /// Active la sortie audio même si l'iPhone est en mode silencieux —
    /// sans elle, les vidéos de démo semblent muettes (catégorie ambiante).
    nonisolated static func activatePlaybackAudio() {
        let session = AVAudioSession.sharedInstance()
        try? session.setCategory(.playback, mode: .moviePlayback)
        try? session.setActive(true)
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
        parts.append(musician.level.label)
        parts.append(musician.availability.badgeLabel)
        // Le rawValue en plus du libellé : « ce soir » doit continuer de
        // trouver les dispos du jour alors que le badge dit « aujourd'hui ».
        parts.append(musician.availability.rawValue)
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

    /// Postuler à un SOS sur un instrument précis (le poste choisi). Optimiste
    /// mais SÛR : si l'envoi échoue on annule proprement (fini le bouton qui
    /// « revient » tout seul) et on affiche l'erreur réelle. Rien ne part dans
    /// la messagerie : la candidature EST l'objet, l'organisateur la traite
    /// depuis « Mes SOS » et reçoit une notification.
    func applyToGig(_ event: GigRequest, instrument: Instrument?) {
        guard let index = events.firstIndex(where: { $0.id == event.id }), !events[index].applied else { return }
        events[index].applied = true
        events[index].myApplicationInstrument = instrument
        events[index].myApplicationStatus = .pending
        persistEvents()
        guard let backend, let userID = liveUserID else { return }
        let gigID = event.id
        Task { [weak self] in
            guard let self else { return }
            do {
                try await backend.apply(to: gigID, musicianID: userID, instrument: instrument)
                await backend.deliverPendingPushNotifications()
            } catch {
                if let i = self.events.firstIndex(where: { $0.id == gigID }) {
                    self.events[i].applied = false
                    self.events[i].myApplicationInstrument = nil
                    self.events[i].myApplicationStatus = nil
                    self.persistEvents()
                }
                self.backendError = self.tr("La candidature n'a pas pu être envoyée.") + " (\(error.localizedDescription))"
            }
        }
    }

    /// Retire ma candidature à un SOS.
    func withdrawApplication(_ event: GigRequest) {
        guard let index = events.firstIndex(where: { $0.id == event.id }) else { return }
        events[index].applied = false
        events[index].myApplicationInstrument = nil
        events[index].myApplicationStatus = nil
        persistEvents()
        guard let backend, let userID = liveUserID else { return }
        let gigID = event.id
        Task {
            do { try await backend.unapply(from: gigID, musicianID: userID) }
            catch { backendError = tr("La candidature n'a pas pu être retirée.") }
        }
    }

    /// Charge les candidatures d'une de MES annonces (organisateur). Le profil
    /// du candidat vient du serveur avec la candidature : un musicien absent
    /// de mon fil (hors rayon, filtré…) doit quand même apparaître ici.
    func loadApplicants(for gig: GigRequest) {
        guard let backend, isLive, gig.isMine else { return }
        let gigID = gig.id
        Task { [weak self] in
            guard let self, let rows = try? await backend.fetchApplicants(gigID: gigID) else { return }
            let applicants: [GigApplicant] = rows.compactMap { row in
                let musician = row.profiles?.asMusician()
                    ?? self.musicians.first(where: { $0.id == row.musicianId })
                guard let musician else { return nil }
                return GigApplicant(
                    id: row.id,
                    musician: musician,
                    instrument: Instrument(rawValue: row.instrument ?? ""),
                    status: GigApplicationStatus(rawValue: row.status ?? "pending") ?? .pending
                )
            }
            self.applicantsByGig[gigID] = applicants
        }
    }

    /// Charge les candidatures de TOUTES mes annonces — la page SOS affiche la
    /// gestion en ligne, elle a besoin de tout d'un coup.
    func loadAllApplicants() {
        for gig in myGigs { loadApplicants(for: gig) }
    }

    /// L'organisateur accepte un candidat : le poste devient pourvu, les
    /// concurrents sur cet instrument sont refusés (côté serveur), et le
    /// musicien retenu est prévenu par notification.
    func acceptApplicant(_ applicant: GigApplicant, in gig: GigRequest) {
        decide(applicant, in: gig, action: { try await $0.acceptApplication(applicant.id) },
               failure: "Le candidat n'a pas pu être accepté.")
    }

    /// L'organisateur écarte un candidat (il est prévenu). Refuser quelqu'un
    /// de déjà pris libère son poste : l'annonce se rouvre.
    func declineApplicant(_ applicant: GigApplicant, in gig: GigRequest) {
        decide(applicant, in: gig, action: { try await $0.declineApplication(applicant.id) },
               failure: "Le candidat n'a pas pu être écarté.")
    }

    /// Remet un candidat en attente : le poste redevient ouvert (erreur de
    /// clic, ou remplaçant qui se décommande).
    func reopenApplicant(_ applicant: GigApplicant, in gig: GigRequest) {
        decide(applicant, in: gig, action: { try await $0.reopenApplication(applicant.id) },
               failure: "Le poste n'a pas pu être rouvert.")
    }

    /// Trame commune des décisions de l'organisateur : appel serveur, envoi
    /// des notifications en attente, puis rechargement des candidats et du fil.
    private func decide(
        _ applicant: GigApplicant,
        in gig: GigRequest,
        action: @escaping (SupabaseBackend) async throws -> Void,
        failure: String
    ) {
        guard let backend, isLive else { return }
        Task { [weak self] in
            guard let self else { return }
            do {
                try await action(backend)
                await backend.deliverPendingPushNotifications()
                self.loadApplicants(for: gig)
                await self.refreshGigs()
            } catch {
                self.backendError = self.tr(failure) + " (\(error.localizedDescription))"
            }
        }
    }

    /// Retire une de mes annonces (les candidatures partent avec).
    func cancelGig(_ gig: GigRequest) {
        guard gig.isMine else { return }
        withAnimation { events.removeAll { $0.id == gig.id } }
        applicantsByGig[gig.id] = nil
        persistEvents()
        guard let backend, isLive else { return }
        Task { [weak self] in
            guard let self else { return }
            do { try await backend.deleteGig(gig.id) }
            catch {
                self.backendError = self.tr("L'annonce n'a pas pu être retirée.")
                await self.refreshGigs()
            }
        }
    }

    /// Le musicien visé par une demande de dépannage répond — un tap, tout le
    /// reste est automatique (poste pourvu, organisateur notifié).
    func respondToDirectRequest(_ gig: GigRequest, accept: Bool) {
        guard let index = events.firstIndex(where: { $0.id == gig.id }) else { return }
        let previous = events[index].targetStatus
        withAnimation { events[index].targetStatus = accept ? .accepted : .declined }
        if accept {
            events[index].applied = true
            events[index].myApplicationInstrument = gig.wantedInstruments.first
            events[index].myApplicationStatus = .accepted
        }
        persistEvents()
        guard let backend, isLive else { return }
        let gigID = gig.id
        Task { [weak self] in
            guard let self else { return }
            do {
                try await backend.respondToDirectGig(gigID, accept: accept)
                await backend.deliverPendingPushNotifications()
                await self.refreshGigs()
            } catch {
                if let i = self.events.firstIndex(where: { $0.id == gigID }) {
                    self.events[i].targetStatus = previous
                    self.events[i].applied = false
                    self.events[i].myApplicationStatus = nil
                    self.persistEvents()
                }
                self.backendError = self.tr("La réponse n'a pas pu être envoyée.")
            }
        }
    }

    // MARK: - Mes SOS (organisateur et candidat)

    /// Mes annonces en cours, la date la plus proche d'abord.
    var myGigs: [GigRequest] {
        events.filter { $0.isMine && !$0.isDirect }.sorted { $0.date < $1.date }
    }

    /// Les demandes que j'ai adressées à quelqu'un et qui attendent sa réponse
    /// (ou viennent d'être tranchées).
    var mySentRequests: [GigRequest] {
        events.filter { $0.isMine && $0.isDirect }.sorted { $0.date < $1.date }
    }

    /// Les demandes de dépannage qui m'ont été adressées, en attente d'abord.
    var incomingRequests: [GigRequest] {
        let visibleGroupEventIDs = Set(
            Self.deduplicatedGroups(groups)
                .flatMap(\.upcomingEvents)
                .map(\.id)
        )
        return Self.filteredIncomingRequests(
            events,
            visibleGroupEventIDs: visibleGroupEventIDs
        )
    }

    /// Une demande directe créée depuis une date de groupe partage l'identité
    /// de cette date. Si le membre voit déjà l'événement, seule sa carte de
    /// présence doit rester ; un non-membre qui ne voit pas l'événement garde
    /// bien sa demande ciblée.
    nonisolated static func filteredIncomingRequests(
        _ events: [GigRequest],
        visibleGroupEventIDs: Set<GroupEvent.ID>
    ) -> [GigRequest] {
        events
            .filter {
                $0.isDirect
                    && !$0.isMine
                    && AgendaItem.shouldIncludeGig(
                        linkedEventID: $0.eventId,
                        visibleGroupEventIDs: visibleGroupEventIDs
                    )
            }
            .sorted {
                let a = $0.targetStatus == .pending ? 0 : 1
                let b = $1.targetStatus == .pending ? 0 : 1
                return a == b ? $0.date < $1.date : a < b
            }
    }

    /// Les annonces auxquelles j'ai postulé (hors demandes ciblées).
    var myApplications: [GigRequest] {
        events.filter { $0.applied && !$0.isMine && !$0.isDirect }.sorted { $0.date < $1.date }
    }

    // MARK: - Nouveautés de la version

    /// Décide, au lancement, s'il faut montrer les nouveautés.
    ///
    /// Trois cas :
    /// - installation neuve (personne n'a encore fait l'onboarding) : on
    ///   enregistre la version en silence, on ne montre rien ;
    /// - mise à jour depuis une version qui n'enregistrait pas encore rien
    ///   (≤ 1.6) : on montre, c'est justement pour ça qu'on l'a écrit ;
    /// - relancement de la même version : rien.
    private func prepareWhatsNew() {
        let current = Bundle.main.appVersion
        let seen = UserDefaults.standard.string(forKey: Self.lastSeenVersionKey)
        guard seen != current else { return }
        guard hasOnboarded else {
            UserDefaults.standard.set(current, forKey: Self.lastSeenVersionKey)
            return
        }
        // Rien à raconter sur une version sans notes : on note et on passe.
        guard PatchNote.all.contains(where: { $0.version == current }) else {
            UserDefaults.standard.set(current, forKey: Self.lastSeenVersionKey)
            return
        }
        showWhatsNew = true
    }

    /// Les nouveautés ont été vues : on ne les represente plus pour cette
    /// version (elles restent lisibles dans Réglages → Nouveautés).
    func markWhatsNewSeen() {
        UserDefaults.standard.set(Bundle.main.appVersion, forKey: Self.lastSeenVersionKey)
        showWhatsNew = false
    }

    /// La pastille de l'onglet SOS ne compte QUE les nouvelles annonces qui
    /// me correspondent (instrument + niveau), jamais mes propres annonces ni
    /// leurs candidats. « J'ai créé deux SOS » n'est pas une notification.
    ///
    /// Le compteur ignore volontairement la bascule « Tout » : regarder les
    /// annonces hors profil ne doit pas transformer le badge en bruit.
    var sosTodoCount: Int {
        feedGigs.filter(gigMatchesMe).filter(isUnseenGig).count
    }

    /// La pastille de l'onglet Sessions : tout ce qui attend un mot de moi —
    /// les dates de groupe que je n'ai pas confirmées et les dépannages qu'on
    /// me demande.
    var sessionsTodoCount: Int {
        agendaToConfirm.count + incomingRequests.filter { $0.targetStatus == .pending }.count
    }

    /// Candidats en attente d'une décision sur une annonce donnée.
    func pendingApplicants(for gig: GigRequest) -> [GigApplicant] {
        (applicantsByGig[gig.id] ?? []).filter { $0.status == .pending }
    }

    // MARK: - Le fil des annonces (ce que je vois, ce qui est nouveau)

    /// Les annonces publiques du fil : celles des AUTRES, et seulement celles
    /// où il reste un poste à prendre.
    ///
    /// Mes propres annonces n'y figurent plus (1.7) — elles vivent dans
    /// « Mes SOS », où je les gère ; les voir deux fois ne servait qu'à
    /// gonfler le compteur. Une annonce complète disparaît de même : il n'y a
    /// plus rien à y faire. Ce que j'ai postulé reste suivi dans Sessions.
    var feedGigs: [GigRequest] {
        events.filter { gig in
            guard !gig.isDirect, !gig.isMine, !gig.isFilled else { return false }
            return true
        }
    }

    /// Ce SOS me correspond-il ? Mon instrument, et le niveau demandé s'il y
    /// en a un — avec mon niveau sur CET instrument, pas le niveau global.
    func gigMatchesMe(_ gig: GigRequest) -> Bool {
        gig.matches(instruments: profile.instruments) { instrument in
            profile.level(for: instrument) ?? profile.level
        }
    }

    /// Le fil tel qu'il s'affiche : par défaut, seulement ce qui me
    /// correspond ; « Tout » lève le filtre sans rien cacher définitivement.
    var visibleGigs: [GigRequest] {
        sosShowAll ? feedGigs : feedGigs.filter(gigMatchesMe)
    }

    /// Annonces qui me correspondent mais que le filtre ne montre pas — sert
    /// à dire honnêtement « 3 autres annonces ne correspondent pas à ton
    /// profil » plutôt que de faire disparaître le fil en silence.
    var filteredOutCount: Int {
        sosShowAll ? 0 : feedGigs.count - visibleGigs.count
    }

    /// Une annonce jamais ouverte porte une pastille.
    func isUnseenGig(_ gig: GigRequest) -> Bool {
        !gig.isMine && !openedGigIDs.contains(gig.id)
    }

    /// Nombre d'annonces neuves (visibles et jamais ouvertes).
    var unseenGigCount: Int {
        visibleGigs.filter(isUnseenGig).count
    }

    /// L'annonce a été ouverte : la pastille s'éteint, définitivement.
    func markGigOpened(_ id: UUID) {
        guard !openedGigIDs.contains(id) else { return }
        openedGigIDs.insert(id)
        // Les annonces disparues (concert passé, poste pourvu) n'ont plus à
        // occuper de place : on ne retient que ce que le fil connaît encore.
        let alive = Set(events.map(\.id))
        openedGigIDs.formIntersection(alive.union([id]))
        Self.save(openedGigIDs, key: Self.openedGigsKey)
    }

    // MARK: - Agenda (« Mes événements »)

    /// Tout ce qui m'attend, dans l'ordre : les dates de mes groupes, les
    /// dépannages qu'on m'a confiés, les SOS que j'organise et les
    /// candidatures en attente de réponse. C'est la page « Mes événements ».
    var agenda: [AgendaItem] {
        var items: [AgendaItem] = []
        var visibleGroupEventIDs = Set<GroupEvent.ID>()
        for group in Self.deduplicatedGroups(groups) {
            for event in group.upcomingEvents {
                visibleGroupEventIDs.insert(event.id)
                items.append(
                    AgendaItem(
                        source: .group(
                            groupID: group.id,
                            name: group.name,
                            emoji: group.emoji,
                            event: event
                        ),
                        date: event.date
                    )
                )
            }
        }
        for gig in events where !gig.isMine && gig.date > Date()
            && AgendaItem.shouldIncludeGig(
                linkedEventID: gig.eventId,
                visibleGroupEventIDs: visibleGroupEventIDs
            ) {
            if gig.myApplicationStatus == .accepted || gig.targetStatus == .accepted {
                items.append(AgendaItem(source: .playing(gig: gig), date: gig.date))
            } else if gig.applied && gig.myApplicationStatus == .pending {
                items.append(AgendaItem(source: .applied(gig: gig), date: gig.date))
            }
        }
        for gig in events where gig.isMine && gig.date > Date()
            && AgendaItem.shouldIncludeGig(
                linkedEventID: gig.eventId,
                visibleGroupEventIDs: visibleGroupEventIDs
            ) {
            items.append(AgendaItem(source: .hosting(gig: gig), date: gig.date))
        }
        return items.sorted { $0.date < $1.date }
    }

    /// Les dates de groupe où l'on attend encore ma réponse — la pastille de
    /// l'onglet Agenda, et le premier bloc de la page.
    var agendaToConfirm: [AgendaItem] {
        agenda.filter { item in
            guard case .group(_, _, _, let event) = item.source else { return false }
            return event.status(for: profile.name) == .pending
        }
    }

    /// Mon statut de présence sur une date de groupe.
    func myAttendance(for event: GroupEvent) -> AttendanceStatus {
        event.status(for: profile.name)
    }

    /// La prochaine chose qui m'attend, quelle qu'elle soit.
    var nextAgendaItem: AgendaItem? { agenda.first }

    /// Ce que j'ai joué : les dates de groupe passées (12 mois) où je n'étais
    /// pas indisponible. Les SOS passés, eux, ne remontent plus du serveur —
    /// la vue du fil s'arrête à aujourd'hui.
    var pastAgenda: [AgendaItem] {
        let now = Date()
        let floor = Calendar.current.date(byAdding: .month, value: -12, to: now) ?? now
        var items: [AgendaItem] = []
        for group in groups {
            for event in group.allEvents
            where event.date <= now && event.date >= floor
                && event.status(for: profile.name) != .unavailable {
                items.append(
                    AgendaItem(
                        source: .group(
                            groupID: group.id,
                            name: group.name,
                            emoji: group.emoji,
                            event: event
                        ),
                        date: event.date
                    )
                )
            }
        }
        return items.sorted { $0.date > $1.date }
    }

    // MARK: - Line-up d'un événement de groupe

    /// Instruments pourvus par un SOS publié pour cet événement — le
    /// remplaçant trouvé compte comme un poste tenu.
    func replacements(for event: GroupEvent) -> [Instrument] {
        events
            .filter { $0.eventId == event.id }
            .flatMap { $0.filledInstruments ?? [] }
    }

    /// L'état du line-up : complet (vert), en retard (rouge), ou en cours.
    func lineupState(_ event: GroupEvent, in group: GroupChat) -> LineupState {
        group.lineupState(
            for: event,
            roster: roster(of: group),
            replacements: replacements(for: event)
        )
    }

    /// Le line-up de l'événement est-il complet (tout le monde est là, ou
    /// remplacé) ? C'est ce qui fait passer la carte au vert.
    func isLineupComplete(_ event: GroupEvent, in group: GroupChat) -> Bool {
        lineupState(event, in: group).isComplete
    }

    /// Postes encore à trouver pour cet événement (remplaçants compris).
    func missingRoles(_ event: GroupEvent, in group: GroupChat) -> [Instrument] {
        group.missingRoles(for: event, replacements: replacements(for: event))
    }

    /// Les SOS publiés pour cet événement de groupe — le leader les gère
    /// depuis l'événement lui-même.
    func gigs(for event: GroupEvent) -> [GigRequest] {
        events.filter { $0.eventId == event.id }.sorted { $0.date < $1.date }
    }

    /// Les invités d'un soir de cet événement (remplaçants acceptés). Ils ne
    /// sont pas membres du groupe : ils n'existent que sur cette date.
    func guests(for event: GroupEvent) -> [EventGuest] {
        (guestsByEvent[event.id] ?? []).sorted { $0.name < $1.name }
    }

    /// Recharge les invités des événements de tous mes groupes.
    func refreshEventGuests() async {
        guard let backend, let userID = liveUserID else { return }
        let sessionGeneration = liveSessionGeneration
        guard let rows = try? await backend.fetchEventGuests() else { return }
        guard Self.isMatchingLiveSession(
            expectedUserID: userID,
            currentUserID: liveUserID,
            expectedGeneration: sessionGeneration,
            currentGeneration: liveSessionGeneration
        ) else { return }
        let guests = rows.map {
            EventGuest(
                eventID: $0.eventId,
                groupID: $0.groupId,
                musicianID: $0.musicianId,
                name: $0.name,
                instrument: Instrument(rawValue: $0.instrument ?? ""),
                photoURL: $0.photoUrl
            )
        }
        guestsByEvent = Dictionary(grouping: guests, by: \.eventID)
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
    /// sans backend, il reste uniquement dans le cache local de développement.
    func sendMessage(
        _ text: String,
        attachment outgoing: OutgoingMessageAttachment? = nil,
        in conversation: Conversation,
        completion: ((Bool) -> Void)? = nil
    ) {
        let clean = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard outgoing != nil || (!clean.isEmpty && acceptsUserContent(clean)) else {
            completion?(false)
            return
        }
        guard let index = conversations.firstIndex(where: { $0.id == conversation.id }) else {
            completion?(false)
            return
        }

        if let backend, let userID = liveUserID {
            let conversationID = conversation.id
            Task { [weak self] in
                var uploaded: MessageAttachment?
                if outgoing != nil { self?.messageAttachmentUploadInProgress = true }
                defer { self?.messageAttachmentUploadInProgress = false }
                do {
                    if let outgoing {
                        uploaded = try await backend.uploadConversationAttachment(
                            outgoing.data,
                            fileName: outgoing.fileName,
                            contentType: outgoing.contentType,
                            ext: outgoing.fileExtension,
                            conversationID: conversationID,
                            senderID: userID
                        )
                        if let uploaded {
                            try? outgoing.data.write(to: Self.messageAttachmentCacheURL(for: uploaded))
                        }
                    }
                    let message = try await backend.sendMessage(
                        clean,
                        attachment: uploaded,
                        conversationID: conversationID,
                        senderID: userID
                    )
                    await backend.deliverPendingPushNotifications()
                    guard let self,
                          let i = self.conversations.firstIndex(where: { $0.id == conversationID }),
                          !self.conversations[i].messages.contains(where: { $0.id == message.id })
                    else {
                        completion?(true)
                        return
                    }
                    withAnimation { self.conversations[i].messages.append(message) }
                    completion?(true)
                } catch {
                    if let path = uploaded?.remotePath {
                        try? await backend.deleteMessageAttachment(path: path)
                    }
                    self?.backendError = self?.tr("Le message n'a pas pu être envoyé.")
                    completion?(false)
                }
            }
            return
        }

        var localAttachment: MessageAttachment?
        if let outgoing {
            let fileName = "message_\(UUID().uuidString.lowercased()).\(outgoing.fileExtension)"
            do {
                try outgoing.data.write(to: Self.mediaURL(for: fileName))
                localAttachment = MessageAttachment(
                    remotePath: "local:\(fileName)",
                    fileName: outgoing.fileName,
                    contentType: outgoing.contentType,
                    byteCount: outgoing.byteCount
                )
            } catch {
                backendError = tr("Le fichier n'a pas pu être envoyé.")
                completion?(false)
                return
            }
        }
        conversations[index].messages.append(Message(
            text: clean,
            isFromMe: true,
            date: Date(),
            deliveredAt: Date(),
            attachment: localAttachment
        ))
        persistConversations()
        completion?(true)
    }

    func editMessage(_ message: Message, text: String, in conversationID: UUID) {
        let clean = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !clean.isEmpty, clean.count <= 4000, acceptsUserContent(clean),
              message.isFromMe, message.deletedAt == nil,
              let backend,
              let c = conversations.firstIndex(where: { $0.id == conversationID }),
              let m = conversations[c].messages.firstIndex(where: { $0.id == message.id })
        else { return }
        let previous = conversations[c].messages[m]
        conversations[c].messages[m].text = clean
        conversations[c].messages[m].editedAt = Date()
        Task { [weak self] in
            do {
                try await backend.updateMessage(message.id, text: clean)
            } catch {
                guard let self,
                      let c = self.conversations.firstIndex(where: { $0.id == conversationID }),
                      let m = self.conversations[c].messages.firstIndex(where: { $0.id == message.id })
                else { return }
                self.conversations[c].messages[m] = previous
                self.backendError = self.tr("Le message n'a pas pu être modifié.")
            }
        }
    }

    func deleteMessage(_ message: Message, in conversationID: UUID) {
        guard message.isFromMe, message.deletedAt == nil, let backend,
              let c = conversations.firstIndex(where: { $0.id == conversationID }),
              let m = conversations[c].messages.firstIndex(where: { $0.id == message.id })
        else { return }
        let previous = conversations[c].messages[m]
        conversations[c].messages[m].text = ""
        conversations[c].messages[m].attachment = nil
        conversations[c].messages[m].deletedAt = Date()
        conversations[c].messages[m].reactions = []
        Task { [weak self] in
            do {
                try await backend.deleteMessage(message.id)
                if let attachment = previous.attachment {
                    Self.removeCachedMessageAttachment(attachment)
                }
            } catch {
                guard let self,
                      let c = self.conversations.firstIndex(where: { $0.id == conversationID }),
                      let m = self.conversations[c].messages.firstIndex(where: { $0.id == message.id })
                else { return }
                self.conversations[c].messages[m] = previous
                self.backendError = self.tr("Le message n'a pas pu être supprimé.")
            }
        }
    }

    func toggleReaction(_ emoji: String, on message: Message, in conversationID: UUID) {
        guard MessageReaction.choices.contains(emoji), message.deletedAt == nil,
              let backend, liveUserID != nil,
              let c = conversations.firstIndex(where: { $0.id == conversationID }),
              let m = conversations[c].messages.firstIndex(where: { $0.id == message.id })
        else { return }
        let previous = conversations[c].messages[m].reactionSummaries
        let removing = previous.contains { $0.emoji == emoji && $0.isMine }
        conversations[c].messages[m].reactions = Self.toggledReactions(previous, emoji: emoji)
        Task { [weak self] in
            do {
                try await backend.setMessageReaction(
                    messageID: message.id,
                    emoji: removing ? nil : emoji
                )
            } catch {
                guard let self,
                      let c = self.conversations.firstIndex(where: { $0.id == conversationID }),
                      let m = self.conversations[c].messages.firstIndex(where: { $0.id == message.id })
                else { return }
                self.conversations[c].messages[m].reactions = previous
                self.backendError = self.tr("La réaction n'a pas pu être envoyée.")
            }
        }
    }

    func editGroupMessage(_ message: GroupMessage, text: String, groupID: UUID) {
        let clean = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !clean.isEmpty, clean.count <= 4000, acceptsUserContent(clean),
              message.isFromMe, message.deletedAt == nil, let backend,
              let g = groups.firstIndex(where: { $0.id == groupID }),
              let m = groups[g].messages.firstIndex(where: { $0.id == message.id })
        else { return }
        let previous = groups[g].messages[m]
        groups[g].messages[m].text = clean
        groups[g].messages[m].editedAt = Date()
        Task { [weak self] in
            do {
                try await backend.updateGroupMessage(message.id, text: clean)
            } catch {
                guard let self,
                      let g = self.groups.firstIndex(where: { $0.id == groupID }),
                      let m = self.groups[g].messages.firstIndex(where: { $0.id == message.id })
                else { return }
                self.groups[g].messages[m] = previous
                self.backendError = self.tr("Le message n'a pas pu être modifié.")
            }
        }
    }

    func deleteGroupMessage(_ message: GroupMessage, groupID: UUID) {
        guard message.isFromMe, message.deletedAt == nil, let backend,
              let g = groups.firstIndex(where: { $0.id == groupID }),
              let m = groups[g].messages.firstIndex(where: { $0.id == message.id })
        else { return }
        let previous = groups[g].messages[m]
        groups[g].messages[m].text = ""
        groups[g].messages[m].attachment = nil
        groups[g].messages[m].deletedAt = Date()
        groups[g].messages[m].reactions = []
        Task { [weak self] in
            do {
                try await backend.deleteGroupMessage(message.id)
                if let attachment = previous.attachment {
                    Self.removeCachedMessageAttachment(attachment)
                }
            } catch {
                guard let self,
                      let g = self.groups.firstIndex(where: { $0.id == groupID }),
                      let m = self.groups[g].messages.firstIndex(where: { $0.id == message.id })
                else { return }
                self.groups[g].messages[m] = previous
                self.backendError = self.tr("Le message n'a pas pu être supprimé.")
            }
        }
    }

    func toggleGroupReaction(_ emoji: String, on message: GroupMessage, groupID: UUID) {
        guard MessageReaction.choices.contains(emoji), message.deletedAt == nil,
              let backend, liveUserID != nil,
              let g = groups.firstIndex(where: { $0.id == groupID }),
              let m = groups[g].messages.firstIndex(where: { $0.id == message.id })
        else { return }
        let previous = groups[g].messages[m].reactionSummaries
        let removing = previous.contains { $0.emoji == emoji && $0.isMine }
        groups[g].messages[m].reactions = Self.toggledReactions(previous, emoji: emoji)
        Task { [weak self] in
            do {
                try await backend.setGroupMessageReaction(
                    messageID: message.id,
                    emoji: removing ? nil : emoji
                )
            } catch {
                guard let self,
                      let g = self.groups.firstIndex(where: { $0.id == groupID }),
                      let m = self.groups[g].messages.firstIndex(where: { $0.id == message.id })
                else { return }
                self.groups[g].messages[m].reactions = previous
                self.backendError = self.tr("La réaction n'a pas pu être envoyée.")
            }
        }
    }

    nonisolated private static func toggledReactions(
        _ current: [MessageReaction],
        emoji: String
    ) -> [MessageReaction] {
        var result = current
        if let previousMine = result.firstIndex(where: \.isMine) {
            if result[previousMine].emoji == emoji {
                result[previousMine].count -= 1
                result[previousMine].isMine = false
            } else {
                result[previousMine].count -= 1
                result[previousMine].isMine = false
                if let target = result.firstIndex(where: { $0.emoji == emoji }) {
                    result[target].count += 1
                    result[target].isMine = true
                } else {
                    result.append(MessageReaction(emoji: emoji, count: 1, isMine: true))
                }
            }
        } else if let target = result.firstIndex(where: { $0.emoji == emoji }) {
            result[target].count += 1
            result[target].isMine = true
        } else {
            result.append(MessageReaction(emoji: emoji, count: 1, isMine: true))
        }
        return MessageReaction.choices.compactMap { choice in
            result.first(where: { $0.emoji == choice && $0.count > 0 })
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
                    messages: [],
                    contactID: musician.id
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

}

// MARK: - Cadence des appels Odesli (liens d'écoute directs)

/// L'API publique song.link / Odesli est gratuite et sans clé, mais elle
/// tolère une dizaine de requêtes par minute : au-delà elle répond 429, et
/// les morceaux n'obtiennent jamais leurs vrais liens (Spotify, YouTube
/// Music, Deezer) — ils retombent sur une simple recherche. Cet acteur
/// sérialise les appels de toute l'app et garde un intervalle minimum entre
/// deux, ce qui permet de remplir un répertoire entier sans brûler le quota.
actor OdesliPacer {
    static let shared = OdesliPacer()

    /// ~9 requêtes par minute : sous le seuil, avec de la marge.
    private let interval: TimeInterval = 6.5
    private var nextSlot = Date.distantPast

    /// Attend son tour, puis rend la main.
    func wait() async {
        let now = Date()
        let slot = max(now, nextSlot)
        nextSlot = slot.addingTimeInterval(interval)
        let delay = slot.timeIntervalSince(now)
        guard delay > 0 else { return }
        try? await Task.sleep(for: .seconds(delay))
    }
}
