import Foundation
import Supabase

/// Couche d'accès au backend Supabase : auth (code par e-mail), profils,
/// annonces SOS, candidatures et messagerie temps réel.
/// Toute la sécurité (RLS, avant-première Premium) est appliquée côté serveur.
final class SupabaseBackend: Sendable {

    let client: SupabaseClient

    init(config: BackendConfig) {
        client = SupabaseClient(supabaseURL: config.url, supabaseKey: config.anonKey)
    }

    // MARK: - Auth

    /// Session en cours (rafraîchie si besoin), nil si déconnecté.
    func currentUserID() async -> UUID? {
        (try? await client.auth.session)?.user.id
    }

    func currentUserEmail() async -> String? {
        (try? await client.auth.session)?.user.email
    }

    // MARK: - Notifications push

    private struct PushDevicePayload: Encodable {
        let token: String
        let userId: UUID
        let platform: String
        let environment: String
        let appVersion: String
        let locale: String
        let notificationsEnabled: Bool
        let sosEnabled: Bool
        let messagesEnabled: Bool
        let groupsEnabled: Bool
        let lastSeenAt: Date

        enum CodingKeys: String, CodingKey {
            case token, platform, environment, locale
            case userId = "user_id"
            case appVersion = "app_version"
            case notificationsEnabled = "notifications_enabled"
            case sosEnabled = "sos_enabled"
            case messagesEnabled = "messages_enabled"
            case groupsEnabled = "groups_enabled"
            case lastSeenAt = "last_seen_at"
        }
    }

    func upsertPushDevice(
        token: String,
        userID: UUID,
        environment: String,
        appVersion: String,
        locale: String,
        preferences: PushPreferences
    ) async throws {
        let payload = PushDevicePayload(
            token: token,
            userId: userID,
            platform: "ios",
            environment: environment,
            appVersion: appVersion,
            locale: locale,
            notificationsEnabled: true,
            sosEnabled: preferences.sos,
            messagesEnabled: preferences.messages,
            groupsEnabled: preferences.groups,
            lastSeenAt: Date()
        )
        try await client.from("push_devices")
            .upsert(payload, onConflict: "token")
            .execute()
    }

    func deletePushDevice(token: String) async throws {
        try await client.from("push_devices")
            .delete()
            .eq("token", value: token)
            .execute()
    }

    private struct PushDeliveryResponse: Decodable {
        let sent: Int?
        let failed: Int?
        let skipped: Int?
    }

    /// Demande au backend de livrer uniquement les notifications que les
    /// triggers viennent de créer pour l'utilisateur authentifié.
    func deliverPendingPushNotifications() async {
        let _: PushDeliveryResponse? = try? await client.functions.invoke(
            "push",
            options: FunctionInvokeOptions(body: ["source": "ios"])
        )
    }

    /// URL de retour des liens d'auth (réinitialisation de mot de passe…).
    static let authCallbackURL = URL(string: "dispo://login-callback")

    /// Crée un compte e-mail + mot de passe. La confirmation d'e-mail est
    /// désactivée : la session s'ouvre immédiatement.
    func signUp(email: String, password: String) async throws -> UUID {
        let response = try await client.auth.signUp(email: email, password: password)
        return response.user.id
    }

    /// Connexion e-mail + mot de passe.
    func signIn(email: String, password: String) async throws -> UUID {
        let session = try await client.auth.signIn(email: email, password: password)
        return session.user.id
    }

    /// Envoie l'e-mail de réinitialisation du mot de passe.
    func requestPasswordReset(email: String) async throws {
        try await client.auth.resetPasswordForEmail(email, redirectTo: Self.authCallbackURL)
    }

    /// Termine une connexion par lien (réinitialisation) via onOpenURL.
    func handleAuthCallback(_ url: URL) async throws -> UUID {
        let session = try await client.auth.session(from: url)
        return session.user.id
    }

    /// Sign in with Apple : échange le jeton d'identité Apple contre une
    /// session Supabase (flux natif, aucun secret côté app).
    func signInWithApple(idToken: String, nonce: String) async throws -> UUID {
        let session = try await client.auth.signInWithIdToken(
            credentials: OpenIDConnectCredentials(provider: .apple, idToken: idToken, nonce: nonce)
        )
        return session.user.id
    }

    /// Lie l'identité Apple au compte déjà connecté (flux natif) : ensuite,
    /// « Se connecter avec Apple » ouvre ce même compte.
    func linkApple(idToken: String, nonce: String) async throws {
        _ = try await client.auth.linkIdentityWithIdToken(
            credentials: OpenIDConnectCredentials(provider: .apple, idToken: idToken, nonce: nonce)
        )
    }

    /// true si le compte connecté a déjà une identité Apple liée.
    func isAppleLinked() async -> Bool {
        ((try? await client.auth.userIdentities()) ?? [])
            .contains { $0.provider == "apple" }
    }

    func signOut() async {
        try? await client.auth.signOut()
    }

    // MARK: - Lignes (DTO snake_case ↔ modèles de l'app)

    struct ProfileRow: Codable {
        var id: UUID
        var name: String
        var age: Int?
        var neighborhood: String
        var latitude: Double?
        var longitude: Double?
        var instruments: [String]
        var genres: [String]
        var level: String
        var bio: String
        /// Dates de dispo au format Postgres « yyyy-MM-dd ».
        var availableDates: [String]
        var repertoire: [String]
        var photoUrl: String?
        var isPremium: Bool
        var isDemo: Bool?
        /// Pseudos réseaux sociaux (jsonb côté serveur).
        var socials: [String: String]?
        /// Niveau par instrument (jsonb côté serveur).
        var instrumentLevels: [String: String]?
        /// Note moyenne étoilée (maintenue par trigger — anonyme).
        var ratingAvg: Double?
        var ratingCount: Int?
        /// Vidéos de démo hébergées (jsonb côté serveur).
        var demoVideos: [DemoVideoPayload]?
        /// Préférence de partage de position (city / exact_friends / exact_everyone).
        var locationPrecision: String?

        enum CodingKeys: String, CodingKey {
            case id, name, age, neighborhood, latitude, longitude
            case instruments, genres, level, bio, repertoire, socials
            case availableDates = "available_dates"
            case photoUrl = "photo_url"
            case isPremium = "is_premium"
            case isDemo = "is_demo"
            case ratingAvg = "rating_avg"
            case ratingCount = "rating_count"
            case demoVideos = "demo_videos"
            case locationPrecision = "location_precision"
            case instrumentLevels = "instrument_levels"
        }

        var parsedDates: [Date] {
            availableDates.compactMap { SupabaseBackend.dayFormatter.date(from: $0) }
        }

        // Un nom suffit pour exister dans l'app : la géoloc est en phase 2b
        // et un profil sans instruments doit rester trouvable (recherche
        // par nom / @pseudo, page profil des potes, même indisponibles).
        var isComplete: Bool {
            !name.isEmpty
        }

        func asMusician() -> Musician? {
            guard isComplete else { return nil }
            let dates = parsedDates
            return Musician(
                id: id,
                name: name,
                age: age ?? 0,
                neighborhood: neighborhood,
                // Sans géoloc partagée, le profil est posé au centre de Genève
                // pour rester visible sur la carte — mais `hasLocation: false`
                // interdit d'afficher une distance ou de filtrer par rayon.
                latitude: latitude ?? AppStore.geneva.latitude,
                longitude: longitude ?? AppStore.geneva.longitude,
                instruments: instruments.compactMap(Instrument.init(rawValue:)),
                genres: genres.compactMap(Genre.init(rawValue:)),
                level: Level(rawValue: level) ?? .intermediaire,
                bio: bio,
                availability: .derived(from: dates),
                availableDates: dates,
                repertoire: repertoire,
                reviews: [],
                photo: photoUrl,
                socials: socials,
                instrumentLevels: instrumentLevels,
                isDemo: isDemo ?? false,
                isPremium: isPremium,
                hasLocation: latitude != nil && longitude != nil,
                ratingAvg: ratingAvg,
                ratingCount: ratingCount ?? 0,
                demoVideos: (demoVideos ?? []).map(\.asDemoVideo)
            )
        }
    }

    /// Forme JSON d'une vidéo de démo dans `profiles.demo_videos`.
    struct DemoVideoPayload: Codable, Hashable {
        var id: UUID
        var path: String
        var url: String
        /// « yyyy-MM-dd » — nil si non renseignée.
        var date: String?
        /// Titre choisi par le musicien (nil = « Vidéo N »).
        var title: String?
        /// URL publique de la miniature (nil pour les vidéos d'avant 0.9.6).
        var thumb: String?

        init(from video: DemoVideo) {
            id = video.id
            path = video.storagePath ?? ""
            url = video.remoteURL ?? ""
            date = video.date.map { SupabaseBackend.dayFormatter.string(from: $0) }
            title = video.title
            thumb = video.thumbURL
        }

        var asDemoVideo: DemoVideo {
            DemoVideo(
                id: id,
                fileName: "",
                title: title,
                date: date.flatMap { SupabaseBackend.dayFormatter.date(from: $0) },
                storagePath: path,
                remoteURL: url,
                thumbURL: thumb
            )
        }
    }

    /// Position exacte d'un profil (table `profile_locations`, RLS : on ne
    /// reçoit que ce que chacun a choisi de partager avec nous).
    struct ExactLocationRow: Codable, Hashable {
        var userId: UUID
        var latitude: Double
        var longitude: Double
        enum CodingKeys: String, CodingKey {
            case latitude, longitude
            case userId = "user_id"
        }
    }

    struct FollowRow: Codable, Hashable {
        var followerId: UUID
        var followingId: UUID
        enum CodingKeys: String, CodingKey {
            case followerId = "follower_id"
            case followingId = "following_id"
        }
    }

    struct RatingRow: Codable, Hashable {
        var raterId: UUID
        var ratedId: UUID
        var stars: Int
        enum CodingKeys: String, CodingKey {
            case stars
            case raterId = "rater_id"
            case ratedId = "rated_id"
        }
    }

    struct CollaborationRow: Codable, Hashable {
        var aId: UUID
        var bId: UUID
        enum CodingKeys: String, CodingKey {
            case aId = "a_id"
            case bId = "b_id"
        }
    }

    struct BlockRow: Codable, Hashable {
        var blockerId: UUID
        var blockedId: UUID
        enum CodingKeys: String, CodingKey {
            case blockerId = "blocker_id"
            case blockedId = "blocked_id"
        }
    }

    struct GigFeedRow: Codable {
        var id: UUID
        var hostId: UUID
        var title: String?
        var date: Date
        var place: String?
        var neighborhood: String?
        var genre: String
        var wantedInstruments: [String]
        var fee: Int?
        var description: String?
        var postedAt: Date
        var isLocked: Bool
        var paymentMethod: String?

        enum CodingKeys: String, CodingKey {
            case id, date, genre, fee, description, title, place, neighborhood
            case hostId = "host_id"
            case wantedInstruments = "wanted_instruments"
            case postedAt = "posted_at"
            case isLocked = "is_locked"
            case paymentMethod = "payment_method"
        }

        func asGigRequest(hostName: String, isMine: Bool, applied: Bool) -> GigRequest {
            GigRequest(
                id: id,
                title: title ?? "Nouveau SOS",
                hostName: hostName,
                date: date,
                place: place ?? "",
                neighborhood: neighborhood ?? "",
                genre: Genre(rawValue: genre) ?? .jazz,
                wantedInstruments: wantedInstruments.compactMap(Instrument.init(rawValue:)),
                fee: fee,
                paymentMethod: paymentMethod,
                descriptionText: description ?? "",
                applied: applied,
                isMine: isMine,
                postedAt: postedAt
            )
        }
    }

    struct ConversationRow: Codable {
        var id: UUID
        var participantA: UUID
        var participantB: UUID

        enum CodingKeys: String, CodingKey {
            case id
            case participantA = "participant_a"
            case participantB = "participant_b"
        }

        func other(than me: UUID) -> UUID { participantA == me ? participantB : participantA }
    }

    struct MessageRow: Codable {
        var id: UUID
        var conversationId: UUID
        var senderId: UUID
        var text: String
        var createdAt: Date
        var deliveredAt: Date?
        var readAt: Date?

        enum CodingKeys: String, CodingKey {
            case id, text
            case conversationId = "conversation_id"
            case senderId = "sender_id"
            case createdAt = "created_at"
            case deliveredAt = "delivered_at"
            case readAt = "read_at"
        }

        func asMessage(myID: UUID) -> Message {
            Message(
                id: id, text: text, isFromMe: senderId == myID, date: createdAt,
                deliveredAt: deliveredAt, readAt: readAt
            )
        }
    }

    // MARK: - Profils

    func fetchProfiles() async throws -> [ProfileRow] {
        try await client.from("profiles").select().execute().value
    }

    /// Musiciens du feed (profils complets, sauf moi). La note étoilée
    /// arrive agrégée sur le profil (moyenne + nombre, jamais le détail).
    func fetchMusicians(excluding myID: UUID) async throws -> [Musician] {
        let profiles = try await fetchProfiles()
        return profiles
            .filter { $0.id != myID }
            .compactMap { $0.asMusician() }
    }

    /// Formateur des colonnes Postgres `date` (« 2026-07-08 »).
    static let dayFormatter: DateFormatter = {
        let formatter = DateFormatter()
        formatter.dateFormat = "yyyy-MM-dd"
        formatter.locale = Locale(identifier: "en_US_POSIX")
        return formatter
    }()

    /// Pousse mon profil local vers le backend. Les coordonnées ne passent
    /// jamais par ici : seule `updateLocation` (géoloc réelle, arrondie) les
    /// écrit — plus de placeholder Genève en base.
    func saveProfile(_ profile: MyProfile, userID: UUID) async throws {
        struct Update: Encodable {
            let name: String
            let instruments: [String]
            let genres: [String]
            let level: String
            let bio: String
            let available_dates: [String]
            let socials: [String: String]
            let neighborhood: String
            let instrument_levels: [String: String]
        }
        let update = Update(
            name: profile.name,
            instruments: profile.instruments.map(\.rawValue),
            genres: profile.genres.map(\.rawValue),
            level: profile.level.rawValue,
            bio: profile.bio,
            available_dates: profile.availableDates.map { Self.dayFormatter.string(from: $0) },
            socials: profile.socials ?? [:],
            // La ville choisie (« 1200 Genève ») — c'est ce que les autres
            // voient sur ma fiche et mes cartes.
            neighborhood: profile.cityLabel,
            instrument_levels: profile.instrumentLevels ?? [:]
        )
        try await client.from("profiles").update(update).eq("id", value: userID).execute()
    }

    /// Écrit ma position publique niveau ville (déjà floutée par AppStore).
    func updateCityLocation(latitude: Double, longitude: Double, userID: UUID) async throws {
        try await client.from("profiles")
            .update(["latitude": latitude, "longitude": longitude])
            .eq("id", value: userID)
            .execute()
    }

    /// Écrit ma préférence de partage de position.
    func updateLocationPrecision(_ precision: LocationPrecision, userID: UUID) async throws {
        try await client.from("profiles")
            .update(["location_precision": precision.rawValue])
            .eq("id", value: userID)
            .execute()
    }

    /// Pose (ou met à jour) ma position exacte — lisible uniquement selon
    /// ma préférence (amis mutuels ou tout le monde), RLS côté serveur.
    func upsertExactLocation(latitude: Double, longitude: Double, userID: UUID) async throws {
        struct Upsert: Encodable {
            let user_id: UUID
            let latitude: Double
            let longitude: Double
        }
        try await client.from("profile_locations")
            .upsert(Upsert(user_id: userID, latitude: latitude, longitude: longitude))
            .execute()
    }

    /// Efface ma position exacte (retour au niveau ville pour tout le monde).
    func deleteExactLocation(userID: UUID) async throws {
        try await client.from("profile_locations")
            .delete()
            .eq("user_id", value: userID)
            .execute()
    }

    /// Positions exactes que j'ai le droit de voir (les miennes + celles
    /// partagées avec moi) — la RLS filtre côté serveur.
    func fetchExactLocations() async throws -> [ExactLocationRow] {
        try await client.from("profile_locations").select().execute().value
    }

    // MARK: - Vidéos de démo (Supabase Storage)

    /// Bucket public des vidéos de démo.
    static let demoVideosBucket = "demo-videos"

    /// Téléverse une vidéo compressée et retourne son URL publique.
    /// Chemin : `<userID>/<uuid>.mp4` — les policies Storage n'autorisent
    /// l'écriture que dans son propre dossier.
    func uploadDemoVideo(_ data: Data, userID: UUID) async throws -> (path: String, url: URL) {
        let path = "\(userID.uuidString.lowercased())/\(UUID().uuidString.lowercased()).mp4"
        try await client.storage.from(Self.demoVideosBucket).upload(
            path,
            data: data,
            options: FileOptions(contentType: "video/mp4")
        )
        let url = try client.storage.from(Self.demoVideosBucket).getPublicURL(path: path)
        return (path, url)
    }

    /// Téléverse la miniature JPEG d'une vidéo de démo (même bucket, même
    /// dossier) et retourne son URL publique.
    func uploadDemoVideoThumbnail(_ data: Data, userID: UUID) async throws -> (path: String, url: URL) {
        let path = "\(userID.uuidString.lowercased())/\(UUID().uuidString.lowercased()).jpg"
        try await client.storage.from(Self.demoVideosBucket).upload(
            path,
            data: data,
            options: FileOptions(cacheControl: "86400", contentType: "image/jpeg")
        )
        let url = try client.storage.from(Self.demoVideosBucket).getPublicURL(path: path)
        return (path, url)
    }

    /// Supprime le fichier d'une vidéo retirée du profil.
    func deleteDemoVideoFile(path: String) async throws {
        _ = try await client.storage.from(Self.demoVideosBucket).remove(paths: [path])
    }

    /// Supprime plusieurs fichiers du bucket vidéos (vidéo + miniature).
    func deleteDemoVideoFiles(paths: [String]) async throws {
        guard !paths.isEmpty else { return }
        _ = try await client.storage.from(Self.demoVideosBucket).remove(paths: paths)
    }

    /// Pousse la liste des vidéos de démo sur mon profil (jsonb).
    func updateDemoVideos(_ videos: [DemoVideo], userID: UUID) async throws {
        struct Update: Encodable { let demo_videos: [DemoVideoPayload] }
        try await client.from("profiles")
            .update(Update(demo_videos: videos.map(DemoVideoPayload.init(from:))))
            .eq("id", value: userID)
            .execute()
    }

    // MARK: - Photo de profil (Supabase Storage)

    /// Bucket public des photos de profil.
    static let avatarsBucket = "avatars"

    /// Téléverse ma photo de profil (JPEG déjà compressé) et retourne son
    /// URL publique — horodatée pour invalider les caches à chaque envoi.
    func uploadAvatar(_ data: Data, userID: UUID) async throws -> URL {
        let path = "\(userID.uuidString.lowercased())/avatar.jpg"
        try await client.storage.from(Self.avatarsBucket).upload(
            path,
            data: data,
            options: FileOptions(cacheControl: "3600", contentType: "image/jpeg", upsert: true)
        )
        let base = try client.storage.from(Self.avatarsBucket).getPublicURL(path: path)
        var components = URLComponents(url: base, resolvingAgainstBaseURL: false)
        components?.queryItems = [URLQueryItem(name: "v", value: "\(Int(Date().timeIntervalSince1970))")]
        return components?.url ?? base
    }

    /// Écrit (ou efface) l'URL publique de ma photo de profil.
    func updatePhotoURL(_ url: String?, userID: UUID) async throws {
        struct Update: Encodable { let photo_url: String? }
        try await client.from("profiles")
            .update(Update(photo_url: url))
            .eq("id", value: userID)
            .execute()
    }

    // MARK: - Graphe social et securite

    func fetchFollows() async throws -> [FollowRow] {
        try await client.from("follows").select().execute().value
    }

    func follow(_ targetID: UUID, me: UUID) async throws {
        try await client.from("follows")
            .insert(["follower_id": me.uuidString, "following_id": targetID.uuidString])
            .execute()
    }

    func unfollow(_ targetID: UUID, me: UUID) async throws {
        try await client.from("follows").delete()
            .eq("follower_id", value: me).eq("following_id", value: targetID).execute()
    }

    // MARK: - Notes étoilées (anonymes)

    /// Mes notes données (RLS : personne d'autre ne peut lire le détail —
    /// les autres ne voient que la moyenne agrégée sur le profil).
    func fetchMyRatings(me: UUID) async throws -> [RatingRow] {
        try await client.from("ratings")
            .select().eq("rater_id", value: me).execute().value
    }

    /// Pose (ou met à jour) ma note 1–5 sur un musicien.
    func upsertRating(_ stars: Int, on targetID: UUID, me: UUID) async throws {
        struct Upsert: Encodable {
            let rater_id: UUID
            let rated_id: UUID
            let stars: Int
        }
        try await client.from("ratings")
            .upsert(Upsert(rater_id: me, rated_id: targetID, stars: stars))
            .execute()
    }

    /// Retire ma note sur un musicien.
    func deleteRating(on targetID: UUID, me: UUID) async throws {
        try await client.from("ratings").delete()
            .eq("rater_id", value: me).eq("rated_id", value: targetID).execute()
    }

    func fetchCollaborations() async throws -> [CollaborationRow] {
        try await client.from("collaborations").select().execute().value
    }

    func addCollaboration(with targetID: UUID, me: UUID) async throws {
        let a = min(me.uuidString, targetID.uuidString)
        let b = max(me.uuidString, targetID.uuidString)
        // Upsert : re-déclarer une collaboration existante ne casse rien.
        try await client.from("collaborations").upsert(["a_id": a, "b_id": b]).execute()
    }

    func removeCollaboration(with targetID: UUID, me: UUID) async throws {
        let a = min(me.uuidString, targetID.uuidString)
        let b = max(me.uuidString, targetID.uuidString)
        try await client.from("collaborations").delete()
            .eq("a_id", value: a).eq("b_id", value: b).execute()
    }

    func fetchBlockedUsers(me: UUID) async throws -> Set<UUID> {
        let rows: [BlockRow] = try await client.from("blocks")
            .select().eq("blocker_id", value: me).execute().value
        return Set(rows.map(\.blockedId))
    }

    func block(_ targetID: UUID, me: UUID) async throws {
        try await client.from("blocks")
            .upsert(["blocker_id": me.uuidString, "blocked_id": targetID.uuidString])
            .execute()
    }

    func unblock(_ targetID: UUID, me: UUID) async throws {
        try await client.from("blocks").delete()
            .eq("blocker_id", value: me).eq("blocked_id", value: targetID).execute()
    }

    func report(_ targetID: UUID, me: UUID, reason: String, messageID: UUID? = nil) async throws {
        struct Insert: Encodable {
            let reporter_id: UUID
            let reported_id: UUID
            let message_id: UUID?
            let reason: String
        }
        try await client.from("reports").insert(Insert(
            reporter_id: me, reported_id: targetID, message_id: messageID, reason: reason
        )).execute()
    }

    func deleteMyAccount() async throws {
        try await client.rpc("delete_my_account").execute()
    }

    func replyAsDemo(conversationID: UUID) async throws {
        try await client.rpc("reply_as_demo", params: ["conv_id": conversationID.uuidString]).execute()
    }

    // MARK: - Annonces SOS

    /// Feed des annonces à venir. Les annonces en avant-première arrivent
    /// masquées (is_locked) pour les non-Premium — décision du serveur.
    func fetchGigs(myID: UUID) async throws -> [GigRequest] {
        async let feedTask: [GigFeedRow] = client.from("gig_requests_feed")
            .select().order("date").execute().value
        async let profilesTask = fetchProfiles()
        async let applicationsTask: [ApplicationRow] = client.from("gig_applications")
            .select().eq("musician_id", value: myID).execute().value

        let (feed, profiles, applications) = try await (feedTask, profilesTask, applicationsTask)
        let nameByID = Dictionary(uniqueKeysWithValues: profiles.map { ($0.id, $0.name) })
        let appliedGigs = Set(applications.map(\.gigId))

        return feed.map { row in
            row.asGigRequest(
                hostName: row.isLocked ? "Membre Premium requis" : (nameByID[row.hostId] ?? "Organisateur"),
                isMine: row.hostId == myID,
                applied: appliedGigs.contains(row.id)
            )
        }
    }

    struct ApplicationRow: Codable {
        var gigId: UUID
        enum CodingKeys: String, CodingKey { case gigId = "gig_id" }
    }

    func createGig(_ gig: GigRequest, hostID: UUID) async throws {
        struct Insert: Encodable {
            let id: UUID
            let host_id: UUID
            let title: String
            let date: Date
            let place: String
            let neighborhood: String
            let genre: String
            let wanted_instruments: [String]
            let fee: Int?
            let payment_method: String?
            let description: String
        }
        let insert = Insert(
            id: gig.id,
            host_id: hostID,
            title: gig.title,
            date: gig.date,
            place: gig.place,
            neighborhood: gig.neighborhood,
            genre: gig.genre.rawValue,
            wanted_instruments: gig.wantedInstruments.map(\.rawValue),
            fee: gig.fee,
            payment_method: gig.paymentMethod,
            description: gig.descriptionText
        )
        try await client.from("gig_requests").insert(insert).execute()
    }

    func apply(to gigID: UUID, musicianID: UUID) async throws {
        try await client.from("gig_applications")
            .insert(["gig_id": gigID.uuidString, "musician_id": musicianID.uuidString])
            .execute()
    }

    func unapply(from gigID: UUID, musicianID: UUID) async throws {
        try await client.from("gig_applications")
            .delete()
            .eq("gig_id", value: gigID)
            .eq("musician_id", value: musicianID)
            .execute()
    }

    // MARK: - Messagerie

    /// Retrouve ou crée la conversation avec un autre musicien.
    func ensureConversation(with otherID: UUID, myID: UUID) async throws -> ConversationRow {
        let a = min(myID.uuidString, otherID.uuidString)
        let b = max(myID.uuidString, otherID.uuidString)
        let existing: [ConversationRow] = try await client.from("conversations")
            .select()
            .eq("participant_a", value: a)
            .eq("participant_b", value: b)
            .execute().value
        if let found = existing.first { return found }
        do {
            return try await client.from("conversations")
                .insert(["participant_a": a, "participant_b": b])
                .select().single().execute().value
        } catch {
            // Une course entre deux ouvertures simultanees peut faire gagner
            // l'autre INSERT sur la contrainte unique. On relit alors la ligne.
            let retried: [ConversationRow] = try await client.from("conversations")
                .select()
                .eq("participant_a", value: a)
                .eq("participant_b", value: b)
                .execute().value
            if let found = retried.first { return found }
            throw error
        }
    }

    /// Toutes mes conversations, mappées vers le modèle de l'app.
    func fetchConversations(myID: UUID) async throws -> [Conversation] {
        let rows: [ConversationRow] = try await client.from("conversations").select().execute().value
        guard !rows.isEmpty else { return [] }

        async let profilesTask = fetchProfiles()
        async let messagesTask: [MessageRow] = client.from("messages")
            .select()
            .in("conversation_id", values: rows.map(\.id.uuidString))
            .order("created_at")
            .execute().value
        let (profiles, messages) = try await (profilesTask, messagesTask)

        let profileByID = Dictionary(uniqueKeysWithValues: profiles.map { ($0.id, $0) })
        let messagesByConversation = Dictionary(grouping: messages, by: \.conversationId)

        return rows.map { row in
            let otherID = row.other(than: myID)
            let other = profileByID[otherID]
            return Conversation(
                id: row.id,
                contactName: other?.name ?? "Musicien",
                contactInstrument: other?.instruments.first.flatMap(Instrument.init(rawValue:)) ?? .voix,
                messages: (messagesByConversation[row.id] ?? []).map { $0.asMessage(myID: myID) },
                contactID: otherID
            )
        }
    }

    // MARK: - Accusés de réception

    /// Marque « reçu » tout ce qui vient d'arriver pour moi (toutes conversations).
    func markMessagesDelivered() async throws {
        try await client.rpc("mark_messages_delivered").execute()
    }

    /// Marque « lu » les messages de l'autre dans cette conversation.
    func markConversationRead(_ conversationID: UUID) async throws {
        try await client.rpc(
            "mark_conversation_read",
            params: ["conv_id": conversationID.uuidString]
        ).execute()
    }

    @discardableResult
    func sendMessage(_ text: String, conversationID: UUID, senderID: UUID) async throws -> Message {
        let row: MessageRow = try await client.from("messages")
            .insert([
                "conversation_id": conversationID.uuidString,
                "sender_id": senderID.uuidString,
                "text": text,
            ])
            .select().single().execute().value
        return row.asMessage(myID: senderID)
    }

    /// Évènement du flux messages : nouveau message, ou accusés mis à jour.
    enum MessageEvent {
        case inserted(MessageRow)
        case updated(MessageRow)
    }

    /// Flux temps réel des messages (le serveur ne pousse que ceux de mes
    /// conversations, RLS oblige) : INSERT pour les nouveaux, UPDATE pour les
    /// accusés « reçu / lu ».
    func messageStream() async throws -> (channel: RealtimeChannelV2, stream: AsyncStream<MessageEvent>) {
        let channel = client.channel("messages-live")
        let inserts = channel.postgresChange(InsertAction.self, schema: "public", table: "messages")
        let updates = channel.postgresChange(UpdateAction.self, schema: "public", table: "messages")
        try await channel.subscribeWithError()
        let stream = AsyncStream<MessageEvent> { continuation in
            let insertTask = Task {
                for await insert in inserts {
                    if let row = try? insert.decodeRecord(as: MessageRow.self, decoder: Self.realtimeDecoder) {
                        continuation.yield(.inserted(row))
                    }
                }
            }
            let updateTask = Task {
                for await update in updates {
                    if let row = try? update.decodeRecord(as: MessageRow.self, decoder: Self.realtimeDecoder) {
                        continuation.yield(.updated(row))
                    }
                }
            }
            continuation.onTermination = { _ in
                insertTask.cancel()
                updateTask.cancel()
            }
        }
        return (channel, stream)
    }

    // MARK: - Indicateur de saisie

    /// Canal broadcast éphémère « X est en train d'écrire » d'une
    /// conversation. Rien n'est persisté : de simples pings, filtrés côté
    /// réception par l'UUID de l'expéditeur.
    func typingChannel(
        conversationID: UUID
    ) async throws -> (channel: RealtimeChannelV2, stream: AsyncStream<UUID>) {
        let channel = client.channel("typing-\(conversationID.uuidString)")
        let broadcasts = channel.broadcastStream(event: "typing")
        try await channel.subscribeWithError()
        let stream = AsyncStream<UUID> { continuation in
            let task = Task {
                for await payload in broadcasts {
                    // Le payload arrive soit à plat, soit enveloppé sous "payload".
                    let object = payload["payload"]?.objectValue ?? payload
                    if let raw = object["user_id"]?.stringValue, let id = UUID(uuidString: raw) {
                        continuation.yield(id)
                    }
                }
            }
            continuation.onTermination = { _ in task.cancel() }
        }
        return (channel, stream)
    }

    /// Signale que je suis en train d'écrire dans cette conversation.
    func sendTypingPing(on channel: RealtimeChannelV2, myID: UUID) async {
        await channel.broadcast(event: "typing", message: ["user_id": .string(myID.uuidString)])
    }

    /// Décodeur pour les payloads realtime (dates ISO 8601, avec ou sans fractions).
    static let realtimeDecoder: JSONDecoder = {
        let decoder = JSONDecoder()
        let withFractions = ISO8601DateFormatter()
        withFractions.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        let plain = ISO8601DateFormatter()
        decoder.dateDecodingStrategy = .custom { decoder in
            let value = try decoder.singleValueContainer().decode(String.self)
            if let date = withFractions.date(from: value) ?? plain.date(from: value) {
                return date
            }
            throw DecodingError.dataCorrupted(.init(
                codingPath: decoder.codingPath,
                debugDescription: "Date invalide : \(value)"
            ))
        }
        return decoder
    }()

    // MARK: - Groupes (noyau fixe + présence)

    struct MusicGroupRow: Codable {
        var id: UUID
        var name: String
        var emoji: String
        var leaderId: UUID
        var repertoire: [SongPayload]
        var photoUrl: String?
        var isPublic: Bool?

        enum CodingKeys: String, CodingKey {
            case id, name, emoji, repertoire
            case leaderId = "leader_id"
            case photoUrl = "photo_url"
            case isPublic = "is_public"
        }
    }

    struct GroupMemberRow: Codable {
        var groupId: UUID
        var profileId: UUID
        var kind: String

        enum CodingKeys: String, CodingKey {
            case kind
            case groupId = "group_id"
            case profileId = "profile_id"
        }
    }

    struct GroupEventRow: Codable {
        var id: UUID
        var groupId: UUID
        var kind: String
        var title: String
        var venue: String
        var date: Date
        var setlist: [SongPayload]

        enum CodingKeys: String, CodingKey {
            case id, kind, title, venue, date, setlist
            case groupId = "group_id"
        }
    }

    struct EventAttendanceRow: Codable {
        var eventId: UUID
        var profileId: UUID
        var status: String

        enum CodingKeys: String, CodingKey {
            case status
            case eventId = "event_id"
            case profileId = "profile_id"
        }
    }

    struct GroupMessageRow: Codable {
        var id: UUID
        var groupId: UUID
        var senderId: UUID
        var text: String
        var createdAt: Date

        enum CodingKeys: String, CodingKey {
            case id, text
            case groupId = "group_id"
            case senderId = "sender_id"
            case createdAt = "created_at"
        }

        func asGroupMessage(myID: UUID, myName: String, nameByID: [UUID: String]) -> GroupMessage {
            GroupMessage(
                id: id,
                sender: senderId == myID ? myName : (nameByID[senderId] ?? "Musicien"),
                isFromMe: senderId == myID,
                text: text,
                date: createdAt
            )
        }
    }

    /// Forme JSON des morceaux (répertoire / setlist) côté Postgres.
    struct SongPayload: Codable, Hashable {
        var id: UUID
        var title: String
        var artist: String
        var artworkURL: String?
        var trackURL: String?
        var suggestedBy: String
        var isApproved: Bool

        enum CodingKeys: String, CodingKey {
            case id, title, artist
            case artworkURL = "artwork_url"
            case trackURL = "track_url"
            case suggestedBy = "suggested_by"
            case isApproved = "is_approved"
        }

        init(from song: Song) {
            id = song.id
            title = song.title
            artist = song.artist
            artworkURL = song.artworkURL
            trackURL = song.trackURL
            suggestedBy = song.suggestedBy
            isApproved = song.isApproved
        }

        var asSong: Song {
            Song(
                id: id,
                title: title,
                artist: artist,
                artworkURL: artworkURL,
                trackURL: trackURL,
                suggestedBy: suggestedBy,
                isApproved: isApproved
            )
        }
    }

    /// Charge les groupes dont je suis membre (RLS), avec membres, événements,
    /// présence et messages. Seules les partitions restent locales à l'appareil.
    func fetchGroups(myID: UUID, myName: String, nameByID: [UUID: String]) async throws -> [GroupChat] {
        let groupRows: [MusicGroupRow] = try await client.from("music_groups")
            .select()
            .order("created_at", ascending: false)
            .execute().value
        guard !groupRows.isEmpty else { return [] }

        let groupIDs = groupRows.map(\.id.uuidString)
        async let membersTask: [GroupMemberRow] = client.from("group_members")
            .select()
            .in("group_id", values: groupIDs)
            .execute().value
        async let eventsTask: [GroupEventRow] = client.from("group_events")
            .select()
            .in("group_id", values: groupIDs)
            .order("date")
            .execute().value
        let (members, events) = try await (membersTask, eventsTask)
        // Tolérant si la migration group_messages n'est pas encore appliquée :
        // les groupes restent utilisables, juste sans historique de messages.
        let groupMessages: [GroupMessageRow] = (try? await client.from("group_messages")
            .select()
            .in("group_id", values: groupIDs)
            .order("created_at")
            .execute().value) ?? []
        // Partitions hébergées — même tolérance le temps de la migration.
        let groupDocs: [GroupDocRow] = (try? await client.from("group_docs")
            .select()
            .in("group_id", values: groupIDs)
            .order("created_at", ascending: false)
            .execute().value) ?? []

        let eventIDs = events.map(\.id.uuidString)
        let attendance: [EventAttendanceRow]
        if eventIDs.isEmpty {
            attendance = []
        } else {
            attendance = try await client.from("event_attendance")
                .select()
                .in("event_id", values: eventIDs)
                .execute().value
        }

        let membersByGroup = Dictionary(grouping: members, by: \.groupId)
        let eventsByGroup = Dictionary(grouping: events, by: \.groupId)
        let attendanceByEvent = Dictionary(grouping: attendance, by: \.eventId)
        let messagesByGroup = Dictionary(grouping: groupMessages, by: \.groupId)
        let docsByGroup = Dictionary(grouping: groupDocs, by: \.groupId)

        return groupRows.map { row in
            let leaderName = row.leaderId == myID ? nil : nameByID[row.leaderId]
            let memberRows = (membersByGroup[row.id] ?? [])
                .filter { $0.profileId != row.leaderId }
            let memberNames = memberRows.compactMap { nameByID[$0.profileId] }.sorted()
            var kinds: [String: GroupMemberKind] = [:]
            for member in memberRows {
                if let name = nameByID[member.profileId],
                   let kind = GroupMemberKind(dbValue: member.kind) {
                    kinds[name] = kind
                }
            }

            let mappedEvents: [GroupEvent] = (eventsByGroup[row.id] ?? []).map { event in
                var attendanceMap: [String: AttendanceStatus] = [:]
                for entry in attendanceByEvent[event.id] ?? [] {
                    let name = entry.profileId == myID ? myName : (nameByID[entry.profileId] ?? "")
                    guard !name.isEmpty, let status = AttendanceStatus(dbValue: entry.status) else { continue }
                    attendanceMap[name] = status
                }
                return GroupEvent(
                    id: event.id,
                    kind: GroupEventKind(rawValue: event.kind) ?? .jam,
                    title: event.title,
                    venue: event.venue,
                    date: event.date,
                    setlist: event.setlist.map(\.asSong),
                    attendance: attendanceMap
                )
            }

            return GroupChat(
                id: row.id,
                name: row.name,
                emoji: row.emoji,
                photoURL: row.photoUrl,
                isPublic: row.isPublic ?? false,
                leaderName: leaderName,
                memberNames: memberNames,
                memberKinds: kinds,
                messages: (messagesByGroup[row.id] ?? []).map {
                    $0.asGroupMessage(myID: myID, myName: myName, nameByID: nameByID)
                },
                docs: (docsByGroup[row.id] ?? []).map {
                    $0.asGroupDoc(myID: myID, myName: myName, nameByID: nameByID)
                },
                repertoire: row.repertoire.map(\.asSong),
                events: mappedEvents
            )
        }
    }

    @discardableResult
    func createGroup(
        id: UUID = UUID(),
        name: String,
        emoji: String,
        leaderID: UUID,
        memberIDs: [(UUID, GroupMemberKind)]
    ) async throws -> UUID {
        struct Insert: Encodable {
            let id: UUID
            let name: String
            let emoji: String
            let leader_id: UUID
        }
        try await client.from("music_groups")
            .insert(Insert(id: id, name: name, emoji: emoji, leader_id: leaderID))
            .execute()
        // Le trigger ajoute déjà le leader ; on invite les autres.
        for (memberID, kind) in memberIDs where memberID != leaderID {
            try await inviteMember(memberID, to: id, kind: kind)
        }
        return id
    }

    func inviteMember(_ profileID: UUID, to groupID: UUID, kind: GroupMemberKind) async throws {
        struct Insert: Encodable {
            let group_id: UUID
            let profile_id: UUID
            let kind: String
        }
        try await client.from("group_members")
            .upsert(Insert(group_id: groupID, profile_id: profileID, kind: kind.dbValue))
            .execute()
    }

    // MARK: - Invitations de groupe (l'invité doit accepter)

    /// Ligne renvoyée par la RPC `my_group_invitations` (mes invitations,
    /// avec les infos du groupe que la RLS ne me laisse pas encore lire).
    struct MyInvitationRow: Codable {
        var id: UUID
        var groupId: UUID
        var groupName: String
        var groupEmoji: String
        var groupPhotoUrl: String?
        var invitedByName: String
        var kind: String
        var createdAt: Date

        enum CodingKeys: String, CodingKey {
            case id, kind
            case groupId = "group_id"
            case groupName = "group_name"
            case groupEmoji = "group_emoji"
            case groupPhotoUrl = "group_photo_url"
            case invitedByName = "invited_by_name"
            case createdAt = "created_at"
        }

        var asInvitation: GroupInvitation {
            GroupInvitation(
                id: id,
                groupID: groupId,
                groupName: groupName,
                groupEmoji: groupEmoji,
                groupPhotoURL: groupPhotoUrl,
                invitedByName: invitedByName,
                kind: GroupMemberKind(dbValue: kind) ?? .occasional,
                date: createdAt
            )
        }
    }

    /// Ligne brute de `group_invitations` (invitations en attente de mes
    /// groupes — visible des membres).
    struct GroupInvitationRow: Codable {
        var id: UUID
        var groupId: UUID
        var profileId: UUID
        var kind: String

        enum CodingKeys: String, CodingKey {
            case id, kind
            case groupId = "group_id"
            case profileId = "profile_id"
        }
    }

    /// Mes invitations reçues, prêtes à afficher.
    func fetchMyGroupInvitations() async throws -> [GroupInvitation] {
        let rows: [MyInvitationRow] = try await client
            .rpc("my_group_invitations")
            .execute().value
        return rows.map(\.asInvitation)
    }

    /// Invitations en attente des groupes donnés (côté membres/leader).
    func fetchPendingInvites(groupIDs: [UUID]) async throws -> [GroupInvitationRow] {
        guard !groupIDs.isEmpty else { return [] }
        return try await client.from("group_invitations")
            .select()
            .in("group_id", values: groupIDs.map(\.uuidString))
            .execute().value
    }

    /// Invite un musicien (RLS : leader uniquement) — il devra accepter.
    func createGroupInvitation(groupID: UUID, profileID: UUID, invitedBy: UUID, kind: GroupMemberKind) async throws {
        struct Insert: Encodable {
            let group_id: UUID
            let profile_id: UUID
            let invited_by: UUID
            let kind: String
        }
        try await client.from("group_invitations")
            .insert(Insert(group_id: groupID, profile_id: profileID, invited_by: invitedBy, kind: kind.dbValue))
            .execute()
    }

    /// Accepte une invitation : la RPC (SECURITY DEFINER) fait entrer
    /// l'invité dans `group_members` puis supprime l'invitation.
    func acceptGroupInvitation(_ invitationID: UUID) async throws {
        try await client
            .rpc("accept_group_invitation", params: ["invitation_id": invitationID.uuidString])
            .execute()
    }

    /// Refuse (invité) ou annule (leader) une invitation.
    func deleteGroupInvitation(_ invitationID: UUID) async throws {
        try await client.from("group_invitations")
            .delete()
            .eq("id", value: invitationID)
            .execute()
    }

    func setMemberKind(_ profileID: UUID, _ kind: GroupMemberKind, in groupID: UUID) async throws {
        try await client.from("group_members")
            .update(["kind": kind.dbValue])
            .eq("group_id", value: groupID)
            .eq("profile_id", value: profileID)
            .execute()
    }

    func kickMember(_ profileID: UUID, from groupID: UUID) async throws {
        try await client.from("group_members")
            .delete()
            .eq("group_id", value: groupID)
            .eq("profile_id", value: profileID)
            .execute()
    }

    func transferLeadership(of groupID: UUID, to profileID: UUID) async throws {
        try await client.from("music_groups")
            .update(["leader_id": profileID.uuidString])
            .eq("id", value: groupID)
            .execute()
        // Le nouveau leader reste membre permanent.
        try await setMemberKind(profileID, .permanent, in: groupID)
    }

    func deleteGroup(_ groupID: UUID) async throws {
        try await client.from("music_groups").delete().eq("id", value: groupID).execute()
    }

    // MARK: - Groupes : photo, visibilité, profils publics

    /// Bucket des photos de groupe : celui des avatars, dans le dossier du
    /// leader (`<leaderUID>/group_<groupID>.jpg`) — les policies Storage
    /// n'autorisent l'écriture que dans son propre dossier.
    func uploadGroupPhoto(_ data: Data, leaderID: UUID, groupID: UUID) async throws -> URL {
        let path = "\(leaderID.uuidString.lowercased())/group_\(groupID.uuidString.lowercased()).jpg"
        try await client.storage.from(Self.avatarsBucket).upload(
            path,
            data: data,
            options: FileOptions(cacheControl: "3600", contentType: "image/jpeg", upsert: true)
        )
        let base = try client.storage.from(Self.avatarsBucket).getPublicURL(path: path)
        var components = URLComponents(url: base, resolvingAgainstBaseURL: false)
        components?.queryItems = [URLQueryItem(name: "v", value: "\(Int(Date().timeIntervalSince1970))")]
        return components?.url ?? base
    }

    /// Écrit (ou efface) l'URL de la photo du groupe.
    func updateGroupPhotoURL(_ url: String?, groupID: UUID) async throws {
        struct Update: Encodable { let photo_url: String? }
        try await client.from("music_groups")
            .update(Update(photo_url: url))
            .eq("id", value: groupID)
            .execute()
    }

    /// Renomme le groupe (RLS : leader uniquement).
    func renameGroup(_ name: String, groupID: UUID) async throws {
        try await client.from("music_groups")
            .update(["name": name])
            .eq("id", value: groupID)
            .execute()
    }

    /// Rend le groupe public (affiché sur les profils des membres) ou privé.
    func setGroupVisibility(_ isPublic: Bool, groupID: UUID) async throws {
        try await client.from("music_groups")
            .update(["is_public": isPublic])
            .eq("id", value: groupID)
            .execute()
    }

    private struct PublicGroupRow: Decodable {
        var id: UUID
        var name: String
        var emoji: String
        var photoUrl: String?
        var memberCount: Int
        var isLeader: Bool
        enum CodingKeys: String, CodingKey {
            case id, name, emoji
            case photoUrl = "photo_url"
            case memberCount = "member_count"
            case isLeader = "is_leader"
        }
    }

    /// Groupes publics d'un musicien (fonction SECURITY DEFINER côté
    /// serveur — la RLS « membres uniquement » des groupes reste intacte).
    func fetchPublicGroups(of profileID: UUID) async throws -> [PublicGroup] {
        let rows: [PublicGroupRow] = try await client
            .rpc("profile_public_groups", params: ["target": profileID.uuidString])
            .execute().value
        return rows.map {
            PublicGroup(
                id: $0.id,
                name: $0.name,
                emoji: $0.emoji,
                photoURL: $0.photoUrl,
                memberCount: $0.memberCount,
                isLeader: $0.isLeader
            )
        }
    }

    func createEvent(_ event: GroupEvent, groupID: UUID) async throws {
        struct Insert: Encodable {
            let id: UUID
            let group_id: UUID
            let kind: String
            let title: String
            let venue: String
            let date: Date
            let setlist: [SongPayload]
        }
        try await client.from("group_events")
            .insert(Insert(
                id: event.id,
                group_id: groupID,
                kind: event.kind.rawValue,
                title: event.title,
                venue: event.venue,
                date: event.date,
                setlist: event.setlist.map(SongPayload.init(from:))
            ))
            .execute()
    }

    func deleteEvent(_ eventID: UUID) async throws {
        try await client.from("group_events").delete().eq("id", value: eventID).execute()
    }

    func setAttendance(
        _ status: AttendanceStatus,
        eventID: UUID,
        profileID: UUID
    ) async throws {
        struct Upsert: Encodable {
            let event_id: UUID
            let profile_id: UUID
            let status: String
        }
        try await client.from("event_attendance")
            .upsert(Upsert(
                event_id: eventID,
                profile_id: profileID,
                status: status.dbValue
            ))
            .execute()
    }

    func updateGroupRepertoire(_ songs: [Song], groupID: UUID) async throws {
        struct Update: Encodable { let repertoire: [SongPayload] }
        try await client.from("music_groups")
            .update(Update(repertoire: songs.map(SongPayload.init(from:))))
            .eq("id", value: groupID)
            .execute()
    }

    func updateEventSetlist(_ songs: [Song], eventID: UUID) async throws {
        struct Update: Encodable { let setlist: [SongPayload] }
        try await client.from("group_events")
            .update(Update(setlist: songs.map(SongPayload.init(from:))))
            .eq("id", value: eventID)
            .execute()
    }

    // MARK: - Groupes : partitions hébergées

    /// Bucket privé des partitions de groupe — lecture et écriture
    /// réservées aux membres du groupe (RLS Storage).
    static let groupDocsBucket = "group-docs"

    /// Ligne de la table `group_docs`.
    struct GroupDocRow: Codable {
        var id: UUID
        var groupId: UUID
        var title: String
        var path: String
        var ext: String
        var addedBy: UUID?
        var createdAt: Date

        enum CodingKeys: String, CodingKey {
            case id, title, path, ext
            case groupId = "group_id"
            case addedBy = "added_by"
            case createdAt = "created_at"
        }

        func asGroupDoc(myID: UUID, myName: String, nameByID: [UUID: String]) -> GroupDoc {
            let authorName = addedBy == myID ? myName : addedBy.flatMap { nameByID[$0] } ?? ""
            return GroupDoc(
                id: id,
                fileName: "",
                title: title,
                addedBy: authorName,
                date: createdAt,
                remotePath: path,
                ext: ext
            )
        }
    }

    /// Type MIME d'une partition selon son extension.
    nonisolated private static func docContentType(for ext: String) -> String {
        switch ext.lowercased() {
        case "jpg", "jpeg": return "image/jpeg"
        case "png": return "image/png"
        case "heic": return "image/heic"
        case "txt": return "text/plain"
        default: return "application/pdf"
        }
    }

    /// Téléverse une partition dans le dossier du groupe et retourne son
    /// chemin Storage (`<groupID>/<docID>.<ext>`).
    func uploadGroupDoc(_ data: Data, ext: String, docID: UUID, groupID: UUID) async throws -> String {
        let path = "\(groupID.uuidString.lowercased())/\(docID.uuidString.lowercased()).\(ext.lowercased())"
        try await client.storage.from(Self.groupDocsBucket).upload(
            path,
            data: data,
            options: FileOptions(contentType: Self.docContentType(for: ext))
        )
        return path
    }

    /// Déclare la partition dans `group_docs` (visible par tout le groupe).
    func insertGroupDoc(_ doc: GroupDoc, groupID: UUID, addedBy: UUID) async throws {
        struct Insert: Encodable {
            let id: UUID
            let group_id: UUID
            let title: String
            let path: String
            let ext: String
            let added_by: UUID
        }
        try await client.from("group_docs")
            .insert(Insert(
                id: doc.id,
                group_id: groupID,
                title: doc.title,
                path: doc.remotePath ?? "",
                ext: doc.ext ?? "pdf",
                added_by: addedBy
            ))
            .execute()
    }

    /// Retire la partition de la table (RLS : auteur ou leader).
    func deleteGroupDoc(_ docID: UUID) async throws {
        try await client.from("group_docs").delete().eq("id", value: docID).execute()
    }

    /// Supprime les fichiers de partitions du bucket (au mieux).
    func deleteGroupDocFiles(paths: [String]) async throws {
        guard !paths.isEmpty else { return }
        _ = try await client.storage.from(Self.groupDocsBucket).remove(paths: paths)
    }

    /// Télécharge une partition du bucket privé (RLS : membres du groupe).
    func downloadGroupDoc(path: String) async throws -> Data {
        try await client.storage.from(Self.groupDocsBucket).download(path: path)
    }

    // MARK: - Groupes : messages + temps réel

    /// Envoie un message de groupe. L'id est fourni par le client pour que
    /// l'écho realtime (notre propre INSERT revient aussi par le canal) se
    /// dédoublonne proprement.
    func sendGroupMessage(id: UUID, text: String, groupID: UUID, senderID: UUID) async throws {
        struct Insert: Encodable {
            let id: UUID
            let group_id: UUID
            let sender_id: UUID
            let text: String
        }
        try await client.from("group_messages")
            .insert(Insert(id: id, group_id: groupID, sender_id: senderID, text: text))
            .execute()
    }

    /// Événement temps réel côté groupes : un message arrive en incrémental,
    /// tout le reste (événements, présence, membres, répertoire) déclenche un
    /// rechargement des groupes.
    enum GroupRealtimeEvent {
        case message(GroupMessageRow)
        case groupsChanged
    }

    /// Flux temps réel des groupes (RLS : le serveur ne pousse que ce qui
    /// concerne mes groupes).
    func groupStream() async throws -> (channel: RealtimeChannelV2, stream: AsyncStream<GroupRealtimeEvent>) {
        let channel = client.channel("groups-live")
        let messageInserts = channel.postgresChange(InsertAction.self, schema: "public", table: "group_messages")
        let eventChanges = channel.postgresChange(AnyAction.self, schema: "public", table: "group_events")
        let attendanceChanges = channel.postgresChange(AnyAction.self, schema: "public", table: "event_attendance")
        let memberChanges = channel.postgresChange(AnyAction.self, schema: "public", table: "group_members")
        let groupChanges = channel.postgresChange(AnyAction.self, schema: "public", table: "music_groups")
        let docChanges = channel.postgresChange(AnyAction.self, schema: "public", table: "group_docs")
        let invitationChanges = channel.postgresChange(AnyAction.self, schema: "public", table: "group_invitations")
        try await channel.subscribeWithError()
        let stream = AsyncStream<GroupRealtimeEvent> { continuation in
            let messageTask = Task {
                for await insert in messageInserts {
                    if let row = try? insert.decodeRecord(as: GroupMessageRow.self, decoder: Self.realtimeDecoder) {
                        continuation.yield(.message(row))
                    }
                }
            }
            let changeTasks = [eventChanges, attendanceChanges, memberChanges, groupChanges, docChanges, invitationChanges].map { changes in
                Task {
                    for await _ in changes {
                        continuation.yield(.groupsChanged)
                    }
                }
            }
            continuation.onTermination = { _ in
                messageTask.cancel()
                changeTasks.forEach { $0.cancel() }
            }
        }
        return (channel, stream)
    }

    // MARK: - SOS : temps réel

    /// Flux temps réel des annonces SOS et des candidatures : tout
    /// changement déclenche un rechargement (coalescé côté AppStore) — un
    /// SOS publié apparaît chez tout le monde sans relancer l'app.
    func gigStream() async throws -> (channel: RealtimeChannelV2, stream: AsyncStream<Void>) {
        let channel = client.channel("gigs-live")
        let gigChanges = channel.postgresChange(AnyAction.self, schema: "public", table: "gig_requests")
        let applicationChanges = channel.postgresChange(AnyAction.self, schema: "public", table: "gig_applications")
        try await channel.subscribeWithError()
        let stream = AsyncStream<Void> { continuation in
            let tasks = [gigChanges, applicationChanges].map { changes in
                Task {
                    for await _ in changes {
                        continuation.yield(())
                    }
                }
            }
            continuation.onTermination = { _ in
                tasks.forEach { $0.cancel() }
            }
        }
        return (channel, stream)
    }
}
