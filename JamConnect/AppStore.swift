import Foundation
import CoreLocation
import SwiftUI
import Supabase
import UserNotifications

/// Affiche les notifications en bannière même quand l'app est au premier plan.
final class NotificationDelegate: NSObject, UNUserNotificationCenterDelegate {
    func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        willPresent notification: UNNotification
    ) async -> UNNotificationPresentationOptions {
        [.banner, .sound]
    }
}

/// État global de la démo. Charge les données fictives depuis SeedData.json
/// et persiste les actions de l'utilisateur (événements créés, messages,
/// profil, participations) dans UserDefaults.
@MainActor
final class AppStore: ObservableObject {

    /// Position simulée de l'utilisateur : centre de Genève (place du Molard).
    nonisolated static let geneva = CLLocationCoordinate2D(latitude: 46.2044, longitude: 6.1432)

    @Published var musicians: [Musician] = []
    @Published var bands: [Band] = []
    @Published var events: [GigRequest] = []
    @Published var conversations: [Conversation] = []
    @Published var profile: MyProfile

    /// Favoris (par nom — les ids des musiciens seed changent à chaque lancement).
    @Published var favorites: Set<String> = []
    /// Appréciations données par l'utilisateur (par nom de musicien). Positif uniquement :
    /// note de musique (« aimé ») ou note dorée (« coup de cœur »).
    @Published var myAppreciations: [String: Appreciation] = [:]
    /// Abonnement Premium — simulé dans la démo.
    @Published var isPremium: Bool = false
    /// Plan choisi (mensuel / annuel), nil si non abonné.
    @Published var premiumPlan: PremiumPlan?
    @Published var showPaywall: Bool = false
    @Published var hasOnboarded: Bool = false
    /// Préférence d'apparence (système / clair / sombre).
    @Published var theme: AppTheme = .system
    /// Langue de l'interface, choisie dans l'onboarding ou le profil.
    @Published var language: AppLanguage = .systemDefault
    /// Musiciens que je suis (par nom, comme les favoris).
    @Published var following: Set<String> = []
    /// Notifications locales activées (nouveaux SOS compatibles, messages).
    @Published var notificationsEnabled: Bool = false
    private let notificationDelegate = NotificationDelegate()
    /// SOS déjà vus — pour ne notifier que les vraies nouveautés.
    private var seenGigIDs: Set<UUID> = []

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
    private static let notificationsKey = "jamconnect.notifications"
    private static let seenGigsKey = "jamconnect.seenGigs"

    init() {
        backend = BackendConfig.load().map(SupabaseBackend.init)
        let seed = Self.loadSeed()
        musicians = seed.musicians
        bands = seed.bands

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
            sessionChecked = true
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
        }
        notificationsEnabled = UserDefaults.standard.bool(forKey: Self.notificationsKey)
        if let saved: Set<UUID> = Self.load(key: Self.seenGigsKey) {
            seenGigIDs = saved
        }
        UNUserNotificationCenter.current().delegate = notificationDelegate
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
    }

    /// Recharge musiciens, annonces et conversations depuis le serveur.
    func refreshLiveData() async {
        guard let backend, let userID = liveUserID else { return }
        do {
            async let musiciansTask = backend.fetchMusicians(excluding: userID)
            async let gigsTask = backend.fetchGigs(myID: userID)
            async let conversationsTask = backend.fetchConversations(myID: userID)
            let (m, g, c) = try await (musiciansTask, gigsTask, conversationsTask)
            musicians = m
            events = g.sorted { $0.date < $1.date }
            notifyNewGigs(g)
            conversations = c.sorted {
                ($0.lastMessage?.date ?? .distantPast) > ($1.lastMessage?.date ?? .distantPast)
            }
            bands = [] // les groupes ne font pas partie du mode live (résidu jam)
            backendError = nil
        } catch {
            backendError = tr("Connexion au serveur impossible — vérifie le réseau.")
        }
    }

    func signOutLive() async {
        guard let backend else { return }
        await backend.signOut()
        liveUserID = nil
        liveEmail = nil
        backendError = nil
        isAdmin = false
        adminLens = .reel
        messageTask?.cancel()
        messageTask = nil
        if let channel = messageChannel {
            await backend.client.removeChannel(channel)
            messageChannel = nil
        }
        reloadDemoData()
    }

    /// Recharge la démo locale (seed + actions sauvegardées) après déconnexion.
    private func reloadDemoData() {
        let seed = Self.loadSeed()
        musicians = seed.musicians
        bands = seed.bands
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
        let (channel, stream) = await backend.messageStream()
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

    /// Musiciens qui me suivent. Simulation stable côté démo (le vrai graphe
    /// social viendra du backend en phase 2b).
    var myFollowers: Set<String> {
        Set(musicians.filter { abs($0.name.stableHash) % 3 == 0 }.map(\.name))
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
        following.contains(musician.name)
    }

    func toggleFollow(_ musician: Musician) {
        if following.contains(musician.name) {
            following.remove(musician.name)
        } else {
            following.insert(musician.name)
        }
        Self.save(following, key: Self.followingKey)
    }

    var followingCount: Int { following.count }
    var followersCount: Int { myFollowers.count }

    // MARK: - Classement des musiciens

    /// Ordre du feed et des matchs : les amis / suivis / abonnés d'abord,
    /// puis — pour les membres Premium — les meilleurs niveaux en haut.
    /// Les comptes gratuits n'ont ni le tri ni l'affichage du niveau
    /// (c'est un argument d'abonnement).
    func rank(_ a: Musician, _ b: Musician) -> Bool {
        let linkA = socialLink(with: a.name), linkB = socialLink(with: b.name)
        if linkA != linkB { return linkA > linkB }
        if showsPremium, a.level != b.level { return a.level > b.level }
        if a.availability.urgencyRank != b.availability.urgencyRank {
            return a.availability.urgencyRank > b.availability.urgencyRank
        }
        return a.distance(from: Self.geneva) < b.distance(from: Self.geneva)
    }

    // MARK: - Social & Premium

    /// Photo d'un musicien ou groupe seed par nom (avis, conversations).
    func photo(forName name: String) -> String? {
        if let exact = musicians.first(where: { $0.name == name }) { return exact.photo }
        if let musician = musicians.first(where: { $0.name.hasPrefix(name + " ") }) { return musician.photo }
        if let band = bands.first(where: { $0.name == name }) { return band.photo }
        return bands.first(where: { $0.name.hasPrefix(name + " ") })?.photo
    }

    /// Favori (musicien ou groupe — géré par nom).
    func isFavorite(_ item: Rateable) -> Bool {
        favorites.contains(item.name)
    }

    func toggleFavorite(_ item: Rateable) {
        if favorites.contains(item.name) {
            favorites.remove(item.name)
        } else {
            favorites.insert(item.name)
        }
        Self.save(favorites, key: Self.favoritesKey)
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

    /// Souscription simulée — le vrai paiement passera par StoreKit / App Store en phase 2.
    func subscribePremium(plan: PremiumPlan) {
        isPremium = true
        premiumPlan = plan
        UserDefaults.standard.set(true, forKey: Self.premiumKey)
        UserDefaults.standard.set(plan.rawValue, forKey: Self.premiumPlanKey)
        pushPremiumStatus()
    }

    func cancelPremium() {
        isPremium = false
        premiumPlan = nil
        UserDefaults.standard.set(false, forKey: Self.premiumKey)
        UserDefaults.standard.removeObject(forKey: Self.premiumPlanKey)
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

    /// Active / coupe les notifications locales. Les alertes serveur (APNs,
    /// avant-première Premium à distance) arrivent avec le Developer Program
    /// en phase 2b — même interrupteur, même tuyauterie.
    func setNotifications(_ enabled: Bool) async {
        if enabled {
            let granted = (try? await UNUserNotificationCenter.current()
                .requestAuthorization(options: [.alert, .sound, .badge])) ?? false
            notificationsEnabled = granted
        } else {
            notificationsEnabled = false
        }
        UserDefaults.standard.set(notificationsEnabled, forKey: Self.notificationsKey)
    }

    /// Bannière de test — vérifie que tout marche (bêta).
    func sendTestNotification() {
        pushLocal(
            title: tr("🚨 Nouveau SOS pour toi"),
            body: tr("Test réussi — les notifications fonctionnent !")
        )
    }

    private func pushLocal(title: String, body: String) {
        guard notificationsEnabled else { return }
        let content = UNMutableNotificationContent()
        content.title = title
        content.body = body
        content.sound = .default
        let request = UNNotificationRequest(
            identifier: UUID().uuidString,
            content: content,
            trigger: nil
        )
        UNUserNotificationCenter.current().add(request)
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
        40 + abs(musician.name.stableHash) % 320 + (isFollowing(musician) ? 1 : 0)
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

    /// Recherche libre : chaque mot de la requête doit matcher (préfixe)
    /// un mot du profil / de l'annonce. « @marco », « pianiste Carouge »,
    /// « salsa ce soir », « 1227 »…
    func search(_ query: String) -> SearchResults {
        let tokens = Self.normalized(query)
            .split(whereSeparator: { !$0.isLetter && !$0.isNumber && $0 != "@" })
            .map { String($0).replacingOccurrences(of: "@", with: "") }
            .filter { !$0.isEmpty && !Self.searchStopWords.contains($0) }
        guard !tokens.isEmpty else { return SearchResults() }

        let musicians = self.musicians
            .filter { matches(tokens, in: haystack(for: $0)) }
            .sorted { rank($0, $1) }
        let gigs = events
            .filter { matches(tokens, in: haystack(for: $0)) }
            .sorted { $0.date < $1.date }
        return SearchResults(musicians: musicians, gigs: gigs)
    }

    /// true si chaque mot de la requête matche un mot du texte (préfixe).
    private func matches(_ tokens: [String], in words: [String]) -> Bool {
        tokens.allSatisfy { token in
            words.contains { word in
                word.hasPrefix(token) || (token.count >= 4 && token.hasPrefix(word) && word.count >= 4)
            }
        }
    }

    /// Tout ce qui décrit un musicien, en mots normalisés.
    private func haystack(for musician: Musician) -> [String] {
        var parts: [String] = [musician.name, musician.name.handleized, musician.neighborhood]
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
        return parts.flatMap { Self.normalized($0).split(separator: " ").map(String.init) }
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
        events.append(event)
        events.sort { $0.date < $1.date }
        persistEvents()
        if let backend, let userID = liveUserID {
            Task {
                do { try await backend.createGig(event, hostID: userID) }
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
        Self.save(profile, key: Self.profileKey)
        if let backend, let userID = liveUserID {
            let snapshot = profile
            Task { try? await backend.saveProfile(snapshot, userID: userID) }
        }
    }

    /// Envoie un message. En mode live il part sur le serveur (temps réel) ;
    /// en démo, une réponse scriptée rend la conversation vivante.
    func sendMessage(_ text: String, in conversation: Conversation) {
        guard let index = conversations.firstIndex(where: { $0.id == conversation.id }) else { return }

        if let backend, let userID = liveUserID {
            let conversationID = conversation.id
            Task { [weak self] in
                do {
                    let message = try await backend.sendMessage(text, conversationID: conversationID, senderID: userID)
                    guard let self,
                          let i = self.conversations.firstIndex(where: { $0.id == conversationID }),
                          !self.conversations[i].messages.contains(where: { $0.id == message.id })
                    else { return }
                    withAnimation { self.conversations[i].messages.append(message) }
                } catch {
                    self?.backendError = tr("Le message n'a pas pu être envoyé.")
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
    func resetDemo() {
        UserDefaults.standard.removeObject(forKey: Self.eventsKey)
        UserDefaults.standard.removeObject(forKey: Self.conversationsKey)
        UserDefaults.standard.removeObject(forKey: Self.profileKey)
        UserDefaults.standard.removeObject(forKey: Self.favoritesKey)
        UserDefaults.standard.removeObject(forKey: Self.appreciationsKey)
        UserDefaults.standard.removeObject(forKey: Self.premiumKey)
        UserDefaults.standard.removeObject(forKey: Self.premiumPlanKey)
        UserDefaults.standard.removeObject(forKey: Self.followingKey)
        favorites = []
        following = []
        myAppreciations = [:]
        isPremium = false
        premiumPlan = nil
        let seed = Self.loadSeed()
        musicians = seed.musicians
        bands = seed.bands
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
        var bands: [Band]?
        var events: [GigRequest]
        var conversations: [Conversation]
    }

    private static func loadSeed() -> (musicians: [Musician], bands: [Band], events: [GigRequest], conversations: [Conversation]) {
        guard let url = Bundle.main.url(forResource: "SeedData", withExtension: "json"),
              let data = try? Data(contentsOf: url) else {
            assertionFailure("SeedData.json introuvable dans le bundle")
            return ([], [], [], [])
        }
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        do {
            let seed = try decoder.decode(Seed.self, from: data)
            return (seed.musicians, seed.bands ?? [], seed.events, seed.conversations)
        } catch {
            assertionFailure("SeedData.json invalide : \(error)")
            return ([], [], [], [])
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
