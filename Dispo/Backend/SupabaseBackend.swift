import Foundation
import Supabase

/// Couche d'accès au backend Supabase : auth (code par e-mail), profils,
/// annonces SOS, candidatures et messagerie temps réel.
/// Toute la sécurité (RLS, confidentialité des lieux, droits) est appliquée
/// côté serveur.
final class SupabaseBackend: Sendable {

    private enum AccountDeletionFailure: Error {
        case unauthenticated
        case pendingFiles
    }

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

    /// Centre de notifications, de la plus récente à la plus ancienne.
    func fetchNotifications() async throws -> [AppNotification] {
        try await client.from("push_notifications")
            .select("id,user_id,actor_id,category,title,body,data,created_at,read_at")
            .order("created_at", ascending: false)
            .execute().value
    }

    func markNotificationRead(_ id: UUID) async throws {
        try await client.from("push_notifications")
            .update(["read_at": ISO8601DateFormatter().string(from: Date())])
            .eq("id", value: id)
            .execute()
    }

    func markAllNotificationsRead() async throws {
        try await client.from("push_notifications")
            .update(["read_at": ISO8601DateFormatter().string(from: Date())])
            .is("read_at", value: nil)
            .execute()
    }

    /// INSERT en temps réel : l'alerte apparaît dans l'app sans attendre un
    /// retour au premier plan. La RLS ne livre que celles du compte courant.
    func notificationStream() async throws -> (
        channel: RealtimeChannelV2,
        stream: AsyncStream<AppNotification>
    ) {
        let channel = client.channel("notifications-live")
        let inserts = channel.postgresChange(
            InsertAction.self,
            schema: "public",
            table: "push_notifications"
        )
        try await channel.subscribeWithError()
        let stream = AsyncStream<AppNotification> { continuation in
            let task = Task {
                for await insert in inserts {
                    if let notification = try? insert.decodeRecord(
                        as: AppNotification.self,
                        decoder: Self.realtimeDecoder
                    ) {
                        continuation.yield(notification)
                    }
                }
            }
            continuation.onTermination = { _ in task.cancel() }
        }
        return (channel, stream)
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
        /// Lieu structuré du profil. Nullable pour les profils créés avant
        /// Dispo 2.1 ; `neighborhood` reste le libellé public compatible.
        var country: String?
        var postalCode: String?
        var city: String?
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
        /// Profil d'exemple laissé visible dans le feed des vrais comptes
        /// (toujours badgé « Démo »). Sans lui, un `is_demo` reste caché.
        var isShowcase: Bool?
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
        /// Séjours ailleurs (jsonb côté serveur).
        var availabilityPlaces: [AvailabilityPlacePayload]?

        enum CodingKeys: String, CodingKey {
            case id, name, age, neighborhood, latitude, longitude, country, city
            case postalCode = "postal_code"
            case instruments, genres, level, bio, repertoire, socials
            case availableDates = "available_dates"
            case photoUrl = "photo_url"
            case isPremium = "is_premium"
            case isDemo = "is_demo"
            case isShowcase = "is_showcase"
            case ratingAvg = "rating_avg"
            case ratingCount = "rating_count"
            case demoVideos = "demo_videos"
            case locationPrecision = "location_precision"
            case availabilityPlaces = "availability_places"
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
            let publicPlace: String = {
                guard let parsedCountry = Country(isoCode: self.country),
                      let savedCity = self.city, !savedCity.isEmpty
                else { return neighborhood }
                return PlaceDraft(
                    country: parsedCountry,
                    postalCode: postalCode ?? "",
                    city: savedCity
                ).label
            }()
            return Musician(
                id: id,
                name: name,
                age: age ?? 0,
                neighborhood: publicPlace,
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
                demoVideos: (demoVideos ?? []).map(\.asDemoVideo),
                availabilityPlaces: (availabilityPlaces ?? []).compactMap(\.asAvailabilityPlace)
            )
        }
    }

    /// Forme JSON d'un séjour dans `profiles.availability_places`.
    struct AvailabilityPlacePayload: Codable, Hashable {
        var id: UUID
        /// « yyyy-MM-dd »
        var from: String
        var to: String
        var country: String?
        var postalCode: String?
        var city: String

        enum CodingKeys: String, CodingKey {
            case id, from, to, country, city
            case postalCode = "postal_code"
        }

        init(from place: AvailabilityPlace) {
            id = place.id
            from = SupabaseBackend.dayFormatter.string(from: place.from)
            to = SupabaseBackend.dayFormatter.string(from: place.to)
            country = place.country?.rawValue
            postalCode = place.postalCode
            city = place.city
        }

        var asAvailabilityPlace: AvailabilityPlace? {
            guard let start = SupabaseBackend.dayFormatter.date(from: from),
                  let end = SupabaseBackend.dayFormatter.date(from: to)
            else { return nil }
            return AvailabilityPlace(
                id: id,
                from: start,
                to: end,
                country: country.flatMap(Country.init(rawValue:)),
                postalCode: postalCode,
                city: city
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
        /// Niveaux acceptés (nil / vide = tous).
        var wantedLevels: [String]?
        var filledInstruments: [String]?
        var fee: Int?
        var description: String?
        var postedAt: Date
        var isLocked: Bool
        var paymentMethod: String?
        var groupId: UUID?
        var eventId: UUID?
        var targetId: UUID?
        var targetStatus: String?
        /// Ajouté à la fin de la vue pour ne pas casser les anciens clients.
        /// `place` reste présent et porte le même libellé public sûr.
        var publicLocationLabel: String?

        enum CodingKeys: String, CodingKey {
            case id, date, genre, fee, description, title, place, neighborhood
            case hostId = "host_id"
            case wantedInstruments = "wanted_instruments"
            case wantedLevels = "wanted_levels"
            case filledInstruments = "filled_instruments"
            case postedAt = "posted_at"
            case isLocked = "is_locked"
            case paymentMethod = "payment_method"
            case groupId = "group_id"
            case eventId = "event_id"
            case targetId = "target_id"
            case targetStatus = "target_status"
            case publicLocationLabel = "public_location_label"
        }

        func asGigRequest(
            hostName: String,
            isMine: Bool,
            application: (instrument: Instrument?, status: GigApplicationStatus)?,
            exactAddress: String? = nil,
            privateLocationState: PrivateLocationState = .unknown
        ) -> GigRequest {
            GigRequest(
                id: id,
                title: title ?? "Nouveau SOS",
                hostName: hostName,
                hostId: hostId,
                date: date,
                place: publicLocationLabel ?? place ?? "",
                neighborhood: neighborhood ?? "",
                exactAddress: exactAddress,
                privateLocationState: privateLocationState,
                genre: Genre(rawValue: genre) ?? .jazz,
                wantedInstruments: wantedInstruments.compactMap(Instrument.init(rawValue:)),
                wantedLevels: wantedLevels.map { $0.compactMap(Level.init(rawValue:)) },
                filledInstruments: (filledInstruments ?? []).compactMap(Instrument.init(rawValue:)),
                fee: fee,
                paymentMethod: paymentMethod,
                descriptionText: description ?? "",
                applied: application != nil,
                myApplicationInstrument: application?.instrument,
                myApplicationStatus: application?.status,
                isMine: isMine,
                postedAt: postedAt,
                groupId: groupId,
                eventId: eventId,
                targetId: targetId,
                targetStatus: targetStatus.flatMap(DirectRequestStatus.init(rawValue:))
            )
        }
    }

    struct GigRequestLocationRow: Codable, Hashable {
        var gigId: UUID
        var publicLocationLabel: String
        var exactAddress: String?
        var postalCode: String?
        var city: String?
        var countryCode: String?
        var latitude: Double?
        var longitude: Double?

        enum CodingKeys: String, CodingKey {
            case city, latitude, longitude
            case gigId = "gig_id"
            case publicLocationLabel = "public_location_label"
            case exactAddress = "exact_address"
            case postalCode = "postal_code"
            case countryCode = "country_code"
        }
    }

    struct GroupEventLocationRow: Codable, Hashable {
        var eventId: UUID
        var publicLocationLabel: String
        var exactAddress: String?
        var postalCode: String?
        var city: String?
        var countryCode: String?
        var latitude: Double?
        var longitude: Double?

        enum CodingKeys: String, CodingKey {
            case city, latitude, longitude
            case eventId = "event_id"
            case publicLocationLabel = "public_location_label"
            case exactAddress = "exact_address"
            case postalCode = "postal_code"
            case countryCode = "country_code"
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
        var editedAt: Date?
        var deletedAt: Date?
        var attachmentPath: String?
        var attachmentName: String?
        var attachmentType: String?
        var attachmentSize: Int64?

        enum CodingKeys: String, CodingKey {
            case id, text
            case conversationId = "conversation_id"
            case senderId = "sender_id"
            case createdAt = "created_at"
            case deliveredAt = "delivered_at"
            case readAt = "read_at"
            case editedAt = "edited_at"
            case deletedAt = "deleted_at"
            case attachmentPath = "attachment_path"
            case attachmentName = "attachment_name"
            case attachmentType = "attachment_type"
            case attachmentSize = "attachment_size"
        }

        var attachment: MessageAttachment? {
            guard let attachmentPath, let attachmentName,
                  let attachmentType, let attachmentSize else { return nil }
            return MessageAttachment(
                remotePath: attachmentPath,
                fileName: attachmentName,
                contentType: attachmentType,
                byteCount: attachmentSize
            )
        }

        func asMessage(myID: UUID, reactions: [MessageReaction] = []) -> Message {
            Message(
                id: id, text: text, isFromMe: senderId == myID, date: createdAt,
                deliveredAt: deliveredAt, readAt: readAt, attachment: attachment,
                editedAt: editedAt, deletedAt: deletedAt, reactions: reactions
            )
        }
    }

    struct MessageReactionRow: Codable {
        var messageId: UUID
        var profileId: UUID
        var emoji: String
        var removedAt: Date?

        enum CodingKeys: String, CodingKey {
            case emoji
            case messageId = "message_id"
            case profileId = "profile_id"
            case removedAt = "removed_at"
        }
    }

    nonisolated private static func reactionSummaries(
        _ rows: [MessageReactionRow],
        myID: UUID
    ) -> [MessageReaction] {
        let activeRows = rows.filter { $0.removedAt == nil }
        return MessageReaction.choices.compactMap { emoji in
            let matching = activeRows.filter { $0.emoji == emoji }
            guard !matching.isEmpty else { return nil }
            return MessageReaction(
                emoji: emoji,
                count: matching.count,
                isMine: matching.contains { $0.profileId == myID }
            )
        }
    }

    // MARK: - Profils

    func fetchProfiles() async throws -> [ProfileRow] {
        try await client.from("profiles").select().execute().value
    }

    func fetchServerPremium(userID: UUID) async throws -> Bool {
        struct PremiumStatus: Decodable {
            let isPremium: Bool
            enum CodingKeys: String, CodingKey { case isPremium = "is_premium" }
        }
        let row: PremiumStatus = try await client.from("profiles")
            .select("is_premium")
            .eq("id", value: userID)
            .single()
            .execute().value
        return row.isPremium
    }

    /// Musiciens du feed (profils complets, sauf moi). La note étoilée
    /// arrive agrégée sur le profil (moyenne + nombre, jamais le détail).
    /// Les musiciens du réseau. La base refuse désormais tout `is_demo=true`;
    /// le filtre reste une défense compatible avec un ancien environnement.
    func fetchMusicians(excluding myID: UUID) async throws -> [Musician] {
        let profiles = try await fetchProfiles()
        return profiles
            .filter { $0.id != myID }
            .filter { $0.isDemo != true }
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
            let country: String
            let postal_code: String?
            let city: String
            let instrument_levels: [String: String]
            let availability_places: [AvailabilityPlacePayload]
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
            country: profile.resolvedCountry.rawValue,
            postal_code: profile.postalCode,
            city: profile.resolvedCity,
            instrument_levels: profile.instrumentLevels ?? [:],
            availability_places: profile.trips.map(AvailabilityPlacePayload.init(from:))
        )
        try await client.from("profiles").update(update).eq("id", value: userID).execute()
    }

    // MARK: - Écoles de musique

    struct MusicSchoolRow: Codable {
        var id: UUID
        var slug: String
        var name: String
        var shortName: String?
        var city: String
        var countryCode: String
        var websiteUrl: String?
        var logoUrl: String?
        var isVerified: Bool
        var isActive: Bool

        enum CodingKeys: String, CodingKey {
            case id, slug, name, city
            case shortName = "short_name"
            case countryCode = "country_code"
            case websiteUrl = "website_url"
            case logoUrl = "logo_url"
            case isVerified = "is_verified"
            case isActive = "is_active"
        }

        var asMusicSchool: MusicSchool {
            MusicSchool(
                id: id,
                slug: slug,
                name: name,
                shortName: shortName,
                city: city,
                countryCode: countryCode,
                websiteURL: websiteUrl,
                logoURL: logoUrl,
                isVerified: isVerified
            )
        }
    }

    /// Forme commune aux RPC `my_music_schools`,
    /// `profile_music_schools` et `visible_profile_music_schools`. Les champs
    /// propres à l'une d'elles restent optionnels afin que le client survive à
    /// un déploiement progressif de la migration.
    struct MusicSchoolAffiliationRow: Codable {
        var profileId: UUID?
        var schoolId: UUID
        var slug: String
        var name: String
        var shortName: String?
        var city: String
        /// Présent dans `my_music_schools`; les RPC d'affiliations de profil
        /// n'exposent volontairement pas ce champ pour garder leur contrat
        /// minimal. La Suisse reste le repli historique de l'app.
        var countryCode: String?
        var logoUrl: String?
        var isVerified: Bool
        var membershipId: UUID
        var role: String
        var roleLabel: String?
        var visibility: String
        var status: String?
        var verificationLevel: String
        var isPrimary: Bool
        var joinedAt: Date
        var channelId: UUID?
        var memberCount: Int?

        enum CodingKeys: String, CodingKey {
            case slug, name, city, role, visibility, status
            case profileId = "profile_id"
            case schoolId = "school_id"
            case shortName = "short_name"
            case countryCode = "country_code"
            case logoUrl = "logo_url"
            case isVerified = "is_verified"
            case membershipId = "membership_id"
            case roleLabel = "role_label"
            case verificationLevel = "verification_level"
            case isPrimary = "is_primary"
            case joinedAt = "joined_at"
            case channelId = "channel_id"
            case memberCount = "member_count"
        }

        var asAffiliation: MusicSchoolAffiliation? {
            guard let role = MusicSchoolRole(rawValue: role),
                  let visibility = MusicSchoolVisibility(rawValue: visibility),
                  let verification = MusicSchoolVerificationLevel(rawValue: verificationLevel)
            else { return nil }
            return MusicSchoolAffiliation(
                membershipID: membershipId,
                profileID: profileId,
                school: MusicSchool(
                    id: schoolId,
                    slug: slug,
                    name: name,
                    shortName: shortName,
                    city: city,
                    countryCode: countryCode ?? "CH",
                    websiteURL: nil,
                    logoURL: logoUrl,
                    isVerified: isVerified
                ),
                role: role,
                roleLabel: roleLabel,
                visibility: visibility,
                status: status.flatMap(MusicSchoolMembershipStatus.init(rawValue:)) ?? .active,
                verificationLevel: verification,
                isPrimary: isPrimary,
                joinedAt: joinedAt
            )
        }
    }

    struct MusicSchoolMemberRow: Codable {
        var profileId: UUID
        var name: String
        var photoUrl: String?
        var instruments: [String]
        var level: String
        var role: String
        var roleLabel: String?
        var verificationLevel: String
        var isPrimary: Bool
        var joinedAt: Date

        enum CodingKeys: String, CodingKey {
            case name, instruments, level, role
            case profileId = "profile_id"
            case photoUrl = "photo_url"
            case roleLabel = "role_label"
            case verificationLevel = "verification_level"
            case isPrimary = "is_primary"
            case joinedAt = "joined_at"
        }

        var asMember: MusicSchoolMember? {
            guard let role = MusicSchoolRole(rawValue: role),
                  let verification = MusicSchoolVerificationLevel(rawValue: verificationLevel)
            else { return nil }
            return MusicSchoolMember(
                profileID: profileId,
                name: name,
                photoURL: photoUrl,
                instruments: instruments.compactMap(Instrument.init(rawValue:)),
                level: Level(rawValue: level) ?? .intermediaire,
                role: role,
                roleLabel: roleLabel,
                verificationLevel: verification,
                isPrimary: isPrimary,
                joinedAt: joinedAt
            )
        }
    }

    struct SchoolMessageRow: Codable {
        var id: UUID
        var channelId: UUID
        var senderId: UUID
        var text: String
        var createdAt: Date
        var editedAt: Date?
        var deletedAt: Date?

        enum CodingKeys: String, CodingKey {
            case id, text
            case channelId = "channel_id"
            case senderId = "sender_id"
            case createdAt = "created_at"
            case editedAt = "edited_at"
            case deletedAt = "deleted_at"
        }

        func asMessage(members: [MusicSchoolMember]) -> SchoolMessage {
            let sender = members.first { $0.profileID == senderId }
            return SchoolMessage(
                id: id,
                channelID: channelId,
                senderID: senderId,
                senderName: sender?.name,
                senderPhotoURL: sender?.photoURL,
                text: text,
                createdAt: createdAt,
                editedAt: editedAt,
                deletedAt: deletedAt
            )
        }
    }

    func fetchMusicSchools() async throws -> [MusicSchool] {
        let rows: [MusicSchoolRow] = try await client.from("music_schools")
            .select()
            .eq("is_active", value: true)
            .order("name")
            .execute().value
        return rows.map(\.asMusicSchool)
    }

    func fetchVisibleProfileMusicSchools() async throws -> [UUID: [MusicSchoolAffiliation]] {
        let rows: [MusicSchoolAffiliationRow] = try await client
            .rpc("visible_profile_music_schools")
            .execute().value
        let affiliations = rows.compactMap { row -> MusicSchoolAffiliation? in
            guard row.profileId != nil else { return nil }
            return row.asAffiliation
        }
        return Dictionary(grouping: affiliations, by: { $0.profileID! })
    }

    func fetchProfileMusicSchools(profileID: UUID) async throws -> [MusicSchoolAffiliation] {
        struct Params: Encodable { let p_profile_id: UUID }
        let rows: [MusicSchoolAffiliationRow] = try await client.rpc(
            "profile_music_schools",
            params: Params(p_profile_id: profileID)
        ).execute().value
        return rows.compactMap { row in
            guard var affiliation = row.asAffiliation else { return nil }
            affiliation.profileID = profileID
            return affiliation
        }
    }

    func fetchMusicSchoolMembers(schoolID: UUID) async throws -> [MusicSchoolMember] {
        struct Params: Encodable { let p_school_id: UUID }
        let rows: [MusicSchoolMemberRow] = try await client.rpc(
            "music_school_members",
            params: Params(p_school_id: schoolID)
        ).execute().value
        return rows.compactMap(\.asMember)
    }

    func fetchRecentSchoolMessages(limit: Int = 60) async throws -> [SchoolMessageRow] {
        struct Params: Encodable { let p_limit: Int }
        return try await client.rpc(
            "recent_school_messages",
            params: Params(p_limit: limit)
        ).execute().value
    }

    func fetchMyMusicSchoolCommunities() async throws -> [MusicSchoolCommunity] {
        let rows: [MusicSchoolAffiliationRow] = try await client
            .rpc("my_music_schools")
            .execute().value
        let recentRows = (try? await fetchRecentSchoolMessages()) ?? []
        var result: [MusicSchoolCommunity] = []
        for row in rows {
            guard let affiliation = row.asAffiliation else { continue }
            let members = (try? await fetchMusicSchoolMembers(schoolID: row.schoolId)) ?? []
            let messages = recentRows
                .filter { $0.channelId == row.channelId }
                .map { $0.asMessage(members: members) }
                .sorted { $0.createdAt < $1.createdAt }
            result.append(MusicSchoolCommunity(
                affiliation: affiliation,
                channelID: row.channelId,
                memberCount: row.memberCount ?? members.count,
                members: members,
                messages: messages
            ))
        }
        return result.sorted { $0.school.name.localizedCaseInsensitiveCompare($1.school.name) == .orderedAscending }
    }

    func joinMusicSchool(
        schoolID: UUID,
        role: MusicSchoolRole,
        visibility: MusicSchoolVisibility,
        roleLabel: String?
    ) async throws {
        struct Params: Encodable {
            let p_school_id: UUID
            let p_role: String
            let p_visibility: String
            let p_role_label: String?
        }
        try await client.rpc(
            "join_music_school",
            params: Params(
                p_school_id: schoolID,
                p_role: role.rawValue,
                p_visibility: visibility.rawValue,
                p_role_label: roleLabel
            )
        ).execute()
    }

    func leaveMusicSchool(schoolID: UUID) async throws {
        struct Params: Encodable { let p_school_id: UUID }
        try await client.rpc(
            "leave_music_school",
            params: Params(p_school_id: schoolID)
        ).execute()
    }

    func sendSchoolMessage(channelID: UUID, text: String) async throws -> SchoolMessageRow {
        struct Params: Encodable {
            let p_channel_id: UUID
            let p_text: String
        }
        return try await client.rpc(
            "send_school_message",
            params: Params(p_channel_id: channelID, p_text: text)
        ).execute().value
    }

    func editSchoolMessage(messageID: UUID, text: String) async throws {
        struct Params: Encodable {
            let p_message_id: UUID
            let p_text: String
        }
        try await client.rpc(
            "edit_school_message",
            params: Params(p_message_id: messageID, p_text: text)
        ).execute()
    }

    func deleteSchoolMessage(messageID: UUID) async throws {
        struct Params: Encodable { let p_message_id: UUID }
        try await client.rpc(
            "delete_school_message",
            params: Params(p_message_id: messageID)
        ).execute()
    }

    /// Écrit ma position publique niveau ville (déjà floutée par AppStore).
    func updateCityLocation(latitude: Double, longitude: Double, userID: UUID) async throws {
        try await client.from("profiles")
            .update(["latitude": latitude, "longitude": longitude])
            .eq("id", value: userID)
            .execute()
    }

    /// Efface ma position publique : sans coordonnées, aucune épingle sur la
    /// carte et aucune distance calculable côté client.
    func clearCityLocation(userID: UUID) async throws {
        struct Update: Encodable {
            let latitude: Double?
            let longitude: Double?
        }
        try await client.from("profiles")
            .update(Update(latitude: nil, longitude: nil))
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

    func reportSchoolMessage(
        _ messageID: UUID,
        senderID: UUID,
        me: UUID,
        reason: String
    ) async throws {
        struct Insert: Encodable {
            let reporter_id: UUID
            let reported_id: UUID
            let school_message_id: UUID
            let reason: String
        }
        try await client.from("reports").insert(Insert(
            reporter_id: me,
            reported_id: senderID,
            school_message_id: messageID,
            reason: reason
        )).execute()
    }

    func deleteMyAccount() async throws {
        guard let userID = await currentUserID() else {
            throw AccountDeletionFailure.unauthenticated
        }

        // Détache et supprime d'abord tous les fichiers tant que la session
        // possède encore les droits Storage. L'identité n'est jamais effacée
        // si un objet n'a pas pu être nettoyé : le prochain essai peut alors
        // reprendre sans laisser de contenu inaccessible au service role seul.
        try await client.rpc("prepare_my_message_file_cleanup").execute()
        try await cleanupPendingMessageFilesOrThrow()
        try await cleanupOwnedAccountStorage(userID: userID)

        let pending: [MessageFileCleanupRow] = try await client
            .from("message_file_cleanup")
            .select("path")
            .execute().value
        guard pending.isEmpty else {
            throw AccountDeletionFailure.pendingFiles
        }
        try await client.rpc("delete_my_account").execute()
    }

    /// Supprime les autres objets Storage propres au compte avant l'identité :
    /// avatar + photos de groupes menés, vidéos de profil, partitions
    /// ajoutées par l'utilisateur et documents de ses groupes dirigés.
    private func cleanupOwnedAccountStorage(userID: UUID) async throws {
        let prefix = userID.uuidString.lowercased()
        try await removeAllFiles(in: Self.avatarsBucket, under: prefix)
        try await removeAllFiles(in: Self.demoVideosBucket, under: prefix)

        struct LedGroup: Decodable { let id: UUID }
        struct OwnedGroupDoc: Decodable {
            let id: UUID
            let path: String
        }
        async let uploadedDocumentsTask: [OwnedGroupDoc] = client
            .from("group_docs")
            .select("id,path")
            .eq("added_by", value: userID)
            .execute().value
        async let ledGroupsTask: [LedGroup] = client
            .from("music_groups")
            .select("id")
            .eq("leader_id", value: userID)
            .execute().value
        let (uploadedDocuments, ledGroups) = try await (
            uploadedDocumentsTask,
            ledGroupsTask
        )
        let ledGroupDocuments: [OwnedGroupDoc]
        if ledGroups.isEmpty {
            ledGroupDocuments = []
        } else {
            ledGroupDocuments = try await client
                .from("group_docs")
                .select("id,path")
                .in("group_id", values: ledGroups.map(\.id.uuidString))
                .execute().value
        }
        // Un leader peut supprimer les fichiers de ses groupes, même quand
        // ils ont été ajoutés par un autre membre. Sans cette union, la
        // cascade du groupe effacerait la ligne SQL mais laisserait le blob.
        let documents = Array(
            Dictionary(
                (uploadedDocuments + ledGroupDocuments).map { ($0.id, $0) },
                uniquingKeysWith: { first, _ in first }
            ).values
        )
        if !documents.isEmpty {
            _ = try await client.storage
                .from(Self.groupDocsBucket)
                .remove(paths: documents.map(\.path))
            try await client.from("group_docs")
                .delete()
                .in("id", values: documents.map(\.id.uuidString))
                .execute()
        }
    }

    /// Pagination explicite : un compte actif peut dépasser les 100 objets,
    /// limite par défaut de l'API Storage.
    private func removeAllFiles(in bucket: String, under prefix: String) async throws {
        var paths: [String] = []
        var offset = 0
        while true {
            let files = try await client.storage.from(bucket).list(
                path: prefix,
                options: SearchOptions(limit: 100, offset: offset)
            )
            paths.append(contentsOf: files.compactMap { file in
                file.id == nil ? nil : "\(prefix)/\(file.name)"
            })
            guard files.count == 100 else { break }
            offset += files.count
        }
        guard !paths.isEmpty else { return }
        _ = try await client.storage.from(bucket).remove(paths: paths)
    }

    // MARK: - Annonces SOS

    /// Feed des annonces à venir. Tous les musiciens y accèdent au même
    /// moment ; l'adresse exacte est chargée séparément par une RPC privée.
    func fetchGigs(myID: UUID) async throws -> [GigRequest] {
        async let feedTask: [GigFeedRow] = client.from("gig_requests_feed")
            .select().order("date").execute().value
        async let profilesTask = fetchProfiles()
        async let applicationsTask: [ApplicationRow] = client.from("gig_applications")
            .select().eq("musician_id", value: myID).execute().value
        async let locationsTask = fetchVisibleGigRequestLocations()

        let (feed, profiles, applications) = try await (feedTask, profilesTask, applicationsTask)
        // Le feed public reste utilisable pendant une panne de la RPC privée,
        // mais l'échec devient `.unknown` au lieu d'être déguisé en liste vide.
        let locationsResult: Result<[GigRequestLocationRow], Error>
        do {
            locationsResult = .success(try await locationsTask)
        } catch {
            locationsResult = .failure(error)
        }
        let locations: [GigRequestLocationRow]
        switch locationsResult {
        case let .success(rows): locations = rows
        case .failure: locations = []
        }
        let locationByGig = Dictionary(uniqueKeysWithValues: locations.map { ($0.gigId, $0) })
        let nameByID = Dictionary(uniqueKeysWithValues: profiles.map { ($0.id, $0.name) })
        let myApplications = Dictionary(applications.map { ($0.gigId, $0) }, uniquingKeysWith: { a, _ in a })

        return feed.map { row in
            let mine = myApplications[row.id]
            let application: (instrument: Instrument?, status: GigApplicationStatus)? = mine.map {
                (Instrument(rawValue: $0.instrument ?? ""),
                 GigApplicationStatus(rawValue: $0.status ?? "pending") ?? .pending)
            }
            let location = locationByGig[row.id]
            let locationState: PrivateLocationState
            switch locationsResult {
            case .success:
                locationState = .serverValue(
                    rowReturned: location != nil,
                    exactAddress: location?.exactAddress
                )
            case .failure:
                locationState = .unknown
            }
            return row.asGigRequest(
                hostName: row.isLocked ? "Membre Premium requis" : (nameByID[row.hostId] ?? "Organisateur"),
                isMine: row.hostId == myID,
                application: application,
                exactAddress: location?.exactAddress,
                privateLocationState: locationState
            )
        }
    }

    func fetchVisibleGigRequestLocations() async throws -> [GigRequestLocationRow] {
        try await client.rpc("visible_gig_request_locations").execute().value
    }

    func fetchGigRequestLocation(gigID: UUID) async throws -> GigRequestLocationRow? {
        struct Params: Encodable { let p_gig_id: UUID }
        let rows: [GigRequestLocationRow] = try await client.rpc(
            "get_gig_request_location",
            params: Params(p_gig_id: gigID)
        ).execute().value
        return rows.first
    }

    func setGigRequestLocation(
        gigID: UUID,
        publicLocationLabel: String,
        exactAddress: String?,
        clearExactAddress: Bool = false,
        postalCode: String? = nil,
        city: String? = nil,
        countryCode: String = "CH",
        latitude: Double? = nil,
        longitude: Double? = nil
    ) async throws {
        struct Params: Encodable {
            let p_gig_id: UUID
            let p_public_location_label: String
            let p_exact_address: String?
            let p_postal_code: String?
            let p_city: String?
            let p_country_code: String
            let p_latitude: Double?
            let p_longitude: Double?
            let p_clear_exact_address: Bool
        }
        try await client.rpc(
            "set_gig_request_location",
            params: Params(
                p_gig_id: gigID,
                p_public_location_label: publicLocationLabel,
                p_exact_address: exactAddress,
                p_postal_code: postalCode,
                p_city: city,
                p_country_code: countryCode,
                p_latitude: latitude,
                p_longitude: longitude,
                p_clear_exact_address: clearExactAddress
            )
        ).execute()
    }

    struct ApplicationRow: Codable {
        var id: UUID
        var gigId: UUID
        var musicianId: UUID
        var instrument: String?
        var status: String?
        enum CodingKeys: String, CodingKey {
            case id, instrument, status
            case gigId = "gig_id"
            case musicianId = "musician_id"
        }
    }

    /// Une candidature avec le profil de son auteur — l'organisateur doit voir
    /// TOUS ses candidats, y compris ceux absents de son fil (hors rayon,
    /// compte de démo, profil filtré…).
    struct ApplicantRow: Codable {
        var id: UUID
        var musicianId: UUID
        var instrument: String?
        var status: String?
        var createdAt: Date?
        var profiles: ProfileRow?

        enum CodingKeys: String, CodingKey {
            case id, instrument, status, profiles
            case musicianId = "musician_id"
            case createdAt = "created_at"
        }
    }

    /// Toutes les candidatures d'une annonce (RLS : réservé à l'organisateur).
    func fetchApplicants(gigID: UUID) async throws -> [ApplicantRow] {
        try await client.from("gig_applications")
            .select("id,musician_id,instrument,status,created_at,profiles(*)")
            .eq("gig_id", value: gigID)
            .order("created_at")
            .execute().value
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
            let wanted_levels: [String]?
            let fee: Int?
            let payment_method: String?
            let description: String
            let group_id: UUID?
            let event_id: UUID?
            let target_id: UUID?
            let target_status: String?
            let public_location_label: String
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
            wanted_levels: gig.levels.isEmpty ? nil : gig.levels.map(\.rawValue),
            fee: gig.fee,
            payment_method: gig.paymentMethod,
            description: gig.descriptionText,
            group_id: gig.groupId,
            event_id: gig.eventId,
            target_id: gig.targetId,
            target_status: gig.targetId == nil ? nil : DirectRequestStatus.pending.rawValue,
            public_location_label: gig.place
        )
        try await client.from("gig_requests").insert(insert).execute()
        do {
            try await setGigRequestLocation(
                gigID: gig.id,
                publicLocationLabel: gig.place,
                exactAddress: gig.exactAddress
            )
        } catch {
            // Une annonce ne doit jamais survivre avec son adresse privée dans
            // un état ambigu. La suppression est best-effort, puis l'erreur
            // originale remonte pour que le client annule aussi son optimisme.
            try? await deleteGig(gig.id)
            throw error
        }
    }

    struct AutoSOSCreationResult: Decodable {
        let gigID: UUID
        let created: Bool

        enum CodingKeys: String, CodingKey {
            case gigID = "gig_id"
            case created
        }
    }

    /// Crée un SOS automatique de manière atomique et idempotente côté base.
    /// Deux appareils ou un retry réseau reçoivent le même `gig_id` ; seul le
    /// premier résultat porte `created = true`.
    func createAutoSOS(
        eventID: UUID,
        absentProfileID: UUID,
        title: String,
        description: String,
        instrument: Instrument
    ) async throws -> AutoSOSCreationResult {
        struct Params: Encodable {
            let p_event_id: UUID
            let p_absent_profile_id: UUID
            let p_title: String
            let p_description: String
            let p_instrument: String
        }
        let rows: [AutoSOSCreationResult] = try await client.rpc(
            "create_auto_sos",
            params: Params(
                p_event_id: eventID,
                p_absent_profile_id: absentProfileID,
                p_title: title,
                p_description: description,
                p_instrument: instrument.rawValue
            )
        ).execute().value
        guard let result = rows.first else {
            throw URLError(.cannotParseResponse)
        }
        return result
    }

    /// Retire une de mes annonces (RLS : organisateur uniquement). Les
    /// candidatures partent avec, en cascade.
    func deleteGig(_ gigID: UUID) async throws {
        try await client.from("gig_requests").delete().eq("id", value: gigID).execute()
    }

    func apply(to gigID: UUID, musicianID: UUID, instrument: Instrument?) async throws {
        struct Insert: Encodable {
            let gig_id: UUID
            let musician_id: UUID
            let instrument: String?
        }
        try await client.from("gig_applications")
            .insert(Insert(gig_id: gigID, musician_id: musicianID, instrument: instrument?.rawValue))
            .execute()
    }

    func unapply(from gigID: UUID, musicianID: UUID) async throws {
        try await client.from("gig_applications")
            .delete()
            .eq("gig_id", value: gigID)
            .eq("musician_id", value: musicianID)
            .execute()
    }

    /// L'organisateur accepte une candidature (RPC host-only) : l'instrument
    /// passe « pourvu » et les concurrents sur ce poste sont refusés.
    func acceptApplication(_ applicationID: UUID) async throws {
        try await client
            .rpc("accept_gig_application", params: ["application_id": applicationID.uuidString])
            .execute()
    }

    /// L'organisateur refuse une candidature (RPC host-only). Refuser
    /// quelqu'un de déjà pris libère son poste.
    func declineApplication(_ applicationID: UUID) async throws {
        try await client
            .rpc("decline_gig_application", params: ["application_id": applicationID.uuidString])
            .execute()
    }

    /// L'organisateur remet une candidature en attente : le poste se rouvre.
    func reopenApplication(_ applicationID: UUID) async throws {
        try await client
            .rpc("reopen_gig_application", params: ["application_id": applicationID.uuidString])
            .execute()
    }

    /// Les invités d'un soir des événements de mes groupes : les musiciens
    /// retenus sur un SOS lié à un événement (RPC réservée aux membres).
    struct EventGuestRow: Codable {
        var eventId: UUID
        var groupId: UUID
        var gigId: UUID
        var musicianId: UUID
        var name: String
        var instrument: String?
        var photoUrl: String?

        enum CodingKeys: String, CodingKey {
            case name, instrument
            case eventId = "event_id"
            case groupId = "group_id"
            case gigId = "gig_id"
            case musicianId = "musician_id"
            case photoUrl = "photo_url"
        }
    }

    func fetchEventGuests() async throws -> [EventGuestRow] {
        try await client.rpc("my_event_guests").execute().value
    }

    /// Le musicien visé par une demande de dépannage répond (RPC target-only).
    func respondToDirectGig(_ gigID: UUID, accept: Bool) async throws {
        struct Params: Encodable {
            let p_gig: UUID
            let p_accept: Bool
        }
        try await client
            .rpc("respond_to_direct_gig", params: Params(p_gig: gigID, p_accept: accept))
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
    func fetchConversations(
        myID: UUID,
        profiles suppliedProfiles: [ProfileRow]? = nil
    ) async throws -> [Conversation] {
        let rows: [ConversationRow] = try await client.from("conversations").select().execute().value
        guard !rows.isEmpty else { return [] }

        let profiles: [ProfileRow]
        if let suppliedProfiles {
            profiles = suppliedProfiles
        } else {
            profiles = try await fetchProfiles()
        }
        struct RecentParams: Encodable { let p_limit: Int }
        let messages: [MessageRow]
        do {
            messages = try await client.rpc(
                "recent_messages",
                params: RecentParams(p_limit: 60)
            ).execute().value
        } catch {
            // Compatibilité pendant les quelques secondes entre l'upload de
            // l'app et la migration.
            messages = try await client.from("messages")
                .select()
                .in("conversation_id", values: rows.map(\.id.uuidString))
                .order("created_at")
                .execute().value
        }
        let messageIDs = messages.map(\.id.uuidString)
        let reactions: [MessageReactionRow]
        if messageIDs.isEmpty {
            reactions = []
        } else {
            reactions = (try? await client.from("message_reactions")
                .select()
                .in("message_id", values: messageIDs)
                .is("removed_at", value: nil)
                .execute().value) ?? []
        }

        let profileByID = Dictionary(uniqueKeysWithValues: profiles.map { ($0.id, $0) })
        let messagesByConversation = Dictionary(grouping: messages, by: \.conversationId)
        let reactionsByMessage = Dictionary(grouping: reactions, by: \.messageId)

        return rows.map { row in
            let otherID = row.other(than: myID)
            let other = profileByID[otherID]
            return Conversation(
                id: row.id,
                contactName: other?.name ?? "Musicien",
                contactInstrument: other?.instruments.first.flatMap(Instrument.init(rawValue:)) ?? .voix,
                messages: (messagesByConversation[row.id] ?? []).map {
                    $0.asMessage(
                        myID: myID,
                        reactions: Self.reactionSummaries(reactionsByMessage[$0.id] ?? [], myID: myID)
                    )
                },
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
    func sendMessage(
        _ text: String,
        attachment: MessageAttachment?,
        conversationID: UUID,
        senderID: UUID
    ) async throws -> Message {
        struct Insert: Encodable {
            let conversation_id: UUID
            let sender_id: UUID
            let text: String
            let attachment_path: String?
            let attachment_name: String?
            let attachment_type: String?
            let attachment_size: Int64?
        }
        let row: MessageRow = try await client.from("messages")
            .insert(Insert(
                conversation_id: conversationID,
                sender_id: senderID,
                text: text,
                attachment_path: attachment?.remotePath,
                attachment_name: attachment?.fileName,
                attachment_type: attachment?.contentType,
                attachment_size: attachment?.byteCount
            ))
            .select().single().execute().value
        return row.asMessage(myID: senderID)
    }

    func updateMessage(_ id: UUID, text: String) async throws {
        struct Params: Encodable {
            let p_message: UUID
            let p_text: String
        }
        try await client.rpc(
            "edit_message",
            params: Params(p_message: id, p_text: text)
        ).execute()
    }

    func deleteMessage(_ id: UUID) async throws {
        struct Params: Encodable { let p_message: UUID }
        let path: String? = try await client.rpc(
            "delete_message",
            params: Params(p_message: id)
        ).execute().value
        if let path { try? await completeMessageFileRemoval(path: path) }
    }

    func setMessageReaction(messageID: UUID, emoji: String?) async throws {
        struct Params: Encodable {
            let p_message: UUID
            let p_emoji: String?
        }
        try await client.rpc(
            "set_message_reaction",
            params: Params(p_message: messageID, p_emoji: emoji)
        ).execute()
    }

    func fetchMessageReactionSummaries(
        messageID: UUID,
        myID: UUID
    ) async throws -> [MessageReaction] {
        let rows: [MessageReactionRow] = try await client.from("message_reactions")
            .select()
            .eq("message_id", value: messageID.uuidString)
            .is("removed_at", value: nil)
            .execute().value
        return Self.reactionSummaries(rows, myID: myID)
    }

    /// Évènement du flux messages : nouveau message, ou accusés mis à jour.
    enum MessageEvent {
        case inserted(MessageRow)
        case updated(MessageRow)
        case reactionsChanged(UUID)
    }

    /// Flux temps réel des messages (le serveur ne pousse que ceux de mes
    /// conversations, RLS oblige) : INSERT pour les nouveaux, UPDATE pour les
    /// accusés « reçu / lu ».
    func messageStream() async throws -> (channel: RealtimeChannelV2, stream: AsyncStream<MessageEvent>) {
        let channel = client.channel("messages-live")
        let inserts = channel.postgresChange(InsertAction.self, schema: "public", table: "messages")
        let updates = channel.postgresChange(UpdateAction.self, schema: "public", table: "messages")
        let reactionInserts = channel.postgresChange(
            InsertAction.self, schema: "public", table: "message_reactions"
        )
        let reactionUpdates = channel.postgresChange(
            UpdateAction.self, schema: "public", table: "message_reactions"
        )
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
            let reactionsTask = Task {
                await withTaskGroup(of: Void.self) { group in
                    group.addTask {
                        for await insert in reactionInserts {
                            if let row = try? insert.decodeRecord(
                                as: MessageReactionRow.self,
                                decoder: Self.realtimeDecoder
                            ) {
                                continuation.yield(.reactionsChanged(row.messageId))
                            }
                        }
                    }
                    group.addTask {
                        for await update in reactionUpdates {
                            if let row = try? update.decodeRecord(
                                as: MessageReactionRow.self,
                                decoder: Self.realtimeDecoder
                            ) {
                                continuation.yield(.reactionsChanged(row.messageId))
                            }
                        }
                    }
                }
            }
            continuation.onTermination = { _ in
                insertTask.cancel()
                updateTask.cancel()
                reactionsTask.cancel()
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
        /// Remplacement automatique en cas de désistement.
        var autoSosEnabled: Bool?
        var autoSosMinLevel: String?

        enum CodingKeys: String, CodingKey {
            case id, name, emoji, repertoire
            case leaderId = "leader_id"
            case photoUrl = "photo_url"
            case isPublic = "is_public"
            case autoSosEnabled = "auto_sos_enabled"
            case autoSosMinLevel = "auto_sos_min_level"
        }
    }

    struct GroupMemberRow: Codable {
        var groupId: UUID
        var profileId: UUID
        var kind: String
        var role: String?

        enum CodingKeys: String, CodingKey {
            case kind, role
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
        var publicLocationLabel: String?
        var date: Date
        var setlist: [SongPayload]
        /// Série (répétition hebdomadaire…) — nil pour un événement ponctuel.
        /// Optionnels : la 1.2 et antérieures ne connaissent pas ces colonnes.
        var seriesId: UUID?
        var recurrence: String?
        var reminderLeadDays: Int?

        enum CodingKeys: String, CodingKey {
            case id, kind, title, venue, date, setlist, recurrence
            case publicLocationLabel = "public_location_label"
            case groupId = "group_id"
            case seriesId = "series_id"
            case reminderLeadDays = "reminder_lead_days"
        }
    }

    /// État serveur minimal des collections de morceaux d'un groupe. Il est
    /// relu dans la file de mutations juste avant chaque fusion afin de ne pas
    /// reconstruire un JSON à partir d'un cache local potentiellement ancien.
    struct GroupSongCollections {
        var repertoire: [Song]
        var eventSetlists: [UUID: [Song]]
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
        var editedAt: Date?
        var deletedAt: Date?
        var attachmentPath: String?
        var attachmentName: String?
        var attachmentType: String?
        var attachmentSize: Int64?

        enum CodingKeys: String, CodingKey {
            case id, text
            case groupId = "group_id"
            case senderId = "sender_id"
            case createdAt = "created_at"
            case editedAt = "edited_at"
            case deletedAt = "deleted_at"
            case attachmentPath = "attachment_path"
            case attachmentName = "attachment_name"
            case attachmentType = "attachment_type"
            case attachmentSize = "attachment_size"
        }

        var attachment: MessageAttachment? {
            guard let attachmentPath, let attachmentName,
                  let attachmentType, let attachmentSize else { return nil }
            return MessageAttachment(
                remotePath: attachmentPath,
                fileName: attachmentName,
                contentType: attachmentType,
                byteCount: attachmentSize
            )
        }

        func asGroupMessage(
            myID: UUID,
            myName: String,
            nameByID: [UUID: String],
            reactions: [MessageReaction] = []
        ) -> GroupMessage {
            GroupMessage(
                id: id,
                sender: senderId == myID ? myName : (nameByID[senderId] ?? "Musicien"),
                isFromMe: senderId == myID,
                text: text,
                date: createdAt,
                attachment: attachment,
                editedAt: editedAt,
                deletedAt: deletedAt,
                reactions: reactions
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
        var platformLinks: [String: String]?
        var suggestedBy: String
        var isApproved: Bool
        /// Tonalité réelle, grille d'accords et lien iReal Pro du morceau.
        var key: String?
        var chords: String?
        var irealURL: String?
        var irealDisabled: Bool?
        /// UUID de profils dans l'ordre des solos, encodés en minuscules :
        /// Foundation produit sinon des UUID majuscules, tandis qu'Android
        /// utilise la forme minuscule. Optionnel pour les anciens JSONB.
        var solos: [String]?

        enum CodingKeys: String, CodingKey {
            case id, title, artist, key, chords, solos
            case artworkURL = "artwork_url"
            case trackURL = "track_url"
            case platformLinks = "platform_links"
            case suggestedBy = "suggested_by"
            case isApproved = "is_approved"
            case irealURL = "ireal_url"
            case irealDisabled = "ireal_disabled"
        }

        init(from song: Song) {
            id = song.id
            title = song.title
            artist = song.artist
            artworkURL = song.artworkURL
            trackURL = song.trackURL
            platformLinks = song.platformLinks
            suggestedBy = song.suggestedBy
            isApproved = song.isApproved
            key = song.key
            chords = song.chords
            irealURL = song.irealURL
            irealDisabled = song.irealDisabled
            solos = song.solos?.map { $0.uuidString.lowercased() }
        }

        var asSong: Song {
            Song(
                id: id,
                title: title,
                artist: artist,
                artworkURL: artworkURL,
                trackURL: trackURL,
                platformLinks: platformLinks,
                suggestedBy: suggestedBy,
                isApproved: isApproved,
                key: key,
                chords: chords,
                irealURL: irealURL,
                irealDisabled: irealDisabled,
                solos: solos?.compactMap(UUID.init(uuidString:))
            )
        }
    }

    /// Charge les groupes dont je suis membre (RLS), avec membres, événements,
    /// présence, messages, partitions et commentaires.
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
        async let eventLocationsTask = fetchVisibleGroupEventLocations()
        let (members, events) = try await (membersTask, eventsTask)
        // Une erreur de lecture privée n'est pas une preuve d'absence. On
        // conserve le résultat public et marque chaque adresse `.unknown`.
        let eventLocationsResult: Result<[GroupEventLocationRow], Error>
        do {
            eventLocationsResult = .success(try await eventLocationsTask)
        } catch {
            eventLocationsResult = .failure(error)
        }
        let eventLocations: [GroupEventLocationRow]
        switch eventLocationsResult {
        case let .success(rows): eventLocations = rows
        case .failure: eventLocations = []
        }
        let locationByEvent = Dictionary(uniqueKeysWithValues: eventLocations.map { ($0.eventId, $0) })
        // Tolérant si la migration group_messages n'est pas encore appliquée :
        // les groupes restent utilisables, juste sans historique de messages.
        struct RecentGroupParams: Encodable { let p_limit: Int }
        let groupMessages: [GroupMessageRow]
        if let recent: [GroupMessageRow] = try? await client.rpc(
            "recent_group_messages",
            params: RecentGroupParams(p_limit: 60)
        ).execute().value {
            groupMessages = recent
        } else {
            groupMessages = (try? await client.from("group_messages")
                .select()
                .in("group_id", values: groupIDs)
                .order("created_at")
                .execute().value) ?? []
        }
        let groupMessageIDs = groupMessages.map(\.id.uuidString)
        let groupReactions: [MessageReactionRow]
        if groupMessageIDs.isEmpty {
            groupReactions = []
        } else {
            groupReactions = (try? await client.from("group_message_reactions")
                .select()
                .in("message_id", values: groupMessageIDs)
                .is("removed_at", value: nil)
                .execute().value) ?? []
        }
        // Partitions hébergées — même tolérance le temps de la migration.
        let groupDocs: [GroupDocRow] = (try? await client.from("group_docs")
            .select()
            .in("group_id", values: groupIDs)
            .order("created_at", ascending: false)
            .execute().value) ?? []
        // Commentaires de morceaux — idem, tolérant si la table manque.
        let comments: [SongCommentRow] = (try? await client.from("song_comments")
            .select()
            .in("group_id", values: groupIDs)
            .order("created_at")
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
        let reactionsByGroupMessage = Dictionary(grouping: groupReactions, by: \.messageId)
        let docsByGroup = Dictionary(grouping: groupDocs, by: \.groupId)
        let commentsByGroup = Dictionary(grouping: comments, by: \.groupId)

        return groupRows.map { row in
            let leaderName = row.leaderId == myID ? nil : nameByID[row.leaderId]
            let memberRows = (membersByGroup[row.id] ?? [])
                .filter { $0.profileId != row.leaderId }
            let memberProfiles = memberRows.compactMap { member -> SoloistOption? in
                let name = member.profileId == myID ? myName : nameByID[member.profileId]
                guard let name, !name.isEmpty else { return nil }
                return SoloistOption(id: member.profileId, name: name)
            }
            .sorted {
                let comparison = $0.name.localizedCaseInsensitiveCompare($1.name)
                return comparison == .orderedSame
                    ? $0.id.uuidString < $1.id.uuidString
                    : comparison == .orderedAscending
            }
            let memberNames = memberProfiles.map(\.name)
            let leaderProfileName = row.leaderId == myID ? myName : nameByID[row.leaderId]
            let rosterProfiles = leaderProfileName.flatMap { name -> [SoloistOption]? in
                guard !name.isEmpty else { return nil }
                return [SoloistOption(id: row.leaderId, name: name)] + memberProfiles
            } ?? memberProfiles
            var kinds: [String: GroupMemberKind] = [:]
            var kindsByProfileID: [String: GroupMemberKind] = [:]
            var roles: [String: String] = [:]
            var rolesByProfileID: [String: String] = [:]
            for member in memberRows {
                if let name = nameByID[member.profileId] {
                    if let kind = GroupMemberKind(dbValue: member.kind) {
                        kinds[name] = kind
                        kindsByProfileID[member.profileId.uuidString.lowercased()] = kind
                    }
                    if let role = member.role, !role.isEmpty {
                        roles[name] = role
                        rolesByProfileID[member.profileId.uuidString.lowercased()] = role
                    }
                }
            }

            let mappedEvents: [GroupEvent] = (eventsByGroup[row.id] ?? []).map { event in
                var attendanceMap: [String: AttendanceStatus] = [:]
                var attendanceByProfileID: [String: AttendanceStatus] = [:]
                for entry in attendanceByEvent[event.id] ?? [] {
                    let name = entry.profileId == myID ? myName : (nameByID[entry.profileId] ?? "")
                    guard let status = AttendanceStatus(dbValue: entry.status) else { continue }
                    attendanceByProfileID[entry.profileId.uuidString.lowercased()] = status
                    guard !name.isEmpty else { continue }
                    attendanceMap[name] = status
                }
                let location = locationByEvent[event.id]
                let locationState: PrivateLocationState
                switch eventLocationsResult {
                case .success:
                    locationState = .serverValue(
                        rowReturned: location != nil,
                        exactAddress: location?.exactAddress
                    )
                case .failure:
                    locationState = .unknown
                }
                return GroupEvent(
                    id: event.id,
                    kind: GroupEventKind(rawValue: event.kind) ?? .jam,
                    title: event.title,
                    venue: event.publicLocationLabel ?? event.venue,
                    exactAddress: location?.exactAddress,
                    privateLocationState: locationState,
                    date: event.date,
                    setlist: event.setlist.map(\.asSong),
                    attendance: attendanceMap,
                    attendanceByProfileID: attendanceByProfileID,
                    seriesID: event.seriesId,
                    recurrence: event.recurrence.flatMap(EventRecurrence.init(rawValue:)),
                    reminderLeadDays: event.reminderLeadDays
                )
            }

            return GroupChat(
                id: row.id,
                name: row.name,
                emoji: row.emoji,
                photoURL: row.photoUrl,
                isPublic: row.isPublic ?? false,
                leaderName: leaderName,
                leaderProfileID: row.leaderId,
                memberNames: memberNames,
                rosterProfiles: rosterProfiles,
                memberKinds: kinds,
                memberKindsByProfileID: kindsByProfileID,
                memberRoles: roles,
                memberRolesByProfileID: rolesByProfileID,
                autoSOSEnabled: row.autoSosEnabled,
                autoSOSMinLevel: row.autoSosMinLevel,
                messages: (messagesByGroup[row.id] ?? []).map {
                    $0.asGroupMessage(
                        myID: myID,
                        myName: myName,
                        nameByID: nameByID,
                        reactions: Self.reactionSummaries(
                            reactionsByGroupMessage[$0.id] ?? [],
                            myID: myID
                        )
                    )
                },
                docs: (docsByGroup[row.id] ?? []).map {
                    $0.asGroupDoc(myID: myID, myName: myName, nameByID: nameByID)
                },
                songComments: (commentsByGroup[row.id] ?? []).map {
                    $0.asSongComment(myID: myID, myName: myName, nameByID: nameByID)
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

    /// Assigne (ou retire, role = nil) le rôle/instrument d'un membre dans le
    /// groupe. RLS : réservé au leader (policy group_members_update_leader).
    func setMemberRole(_ role: String?, for profileID: UUID, in groupID: UUID) async throws {
        struct Update: Encodable { let role: String? }
        try await client.from("group_members")
            .update(Update(role: role))
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
        struct Params: Encodable {
            let p_group_id: UUID
            let p_new_leader_id: UUID
        }
        // Transaction serveur unique : vérifie le leader courant, l'adhésion
        // du destinataire et sa capacité à diriger un groupe supplémentaire,
        // puis le rend permanent avant de transférer. L'UPDATE direct est
        // volontairement refusé par la RLS.
        try await client.rpc(
            "transfer_group_leadership",
            params: Params(p_group_id: groupID, p_new_leader_id: profileID)
        ).execute()
    }

    func deleteGroup(_ groupID: UUID) async throws {
        try await client.from("music_groups").delete().eq("id", value: groupID).execute()
    }

    /// Supprime la photo du groupe du bucket avatars (best-effort — la ligne
    /// `music_groups` part en cascade, mais pas le fichier Storage). RLS :
    /// on ne peut effacer que dans son propre dossier (le leader).
    func deleteGroupPhoto(leaderID: UUID, groupID: UUID) async throws {
        let path = "\(leaderID.uuidString.lowercased())/group_\(groupID.uuidString.lowercased()).jpg"
        _ = try await client.storage.from(Self.avatarsBucket).remove(paths: [path])
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
        try await createEvents([event], groupID: groupID)
    }

    func fetchVisibleGroupEventLocations() async throws -> [GroupEventLocationRow] {
        try await client.rpc("visible_group_event_locations").execute().value
    }

    func fetchGroupEventLocation(eventID: UUID) async throws -> GroupEventLocationRow? {
        struct Params: Encodable { let p_event_id: UUID }
        let rows: [GroupEventLocationRow] = try await client.rpc(
            "get_group_event_location",
            params: Params(p_event_id: eventID)
        ).execute().value
        return rows.first
    }

    func setGroupEventLocation(
        eventID: UUID,
        publicLocationLabel: String,
        exactAddress: String?,
        clearExactAddress: Bool = false,
        postalCode: String? = nil,
        city: String? = nil,
        countryCode: String = "CH",
        latitude: Double? = nil,
        longitude: Double? = nil
    ) async throws {
        struct Params: Encodable {
            let p_event_id: UUID
            let p_public_location_label: String
            let p_exact_address: String?
            let p_postal_code: String?
            let p_city: String?
            let p_country_code: String
            let p_latitude: Double?
            let p_longitude: Double?
            let p_clear_exact_address: Bool
        }
        try await client.rpc(
            "set_group_event_location",
            params: Params(
                p_event_id: eventID,
                p_public_location_label: publicLocationLabel,
                p_exact_address: exactAddress,
                p_postal_code: postalCode,
                p_city: city,
                p_country_code: countryCode,
                p_latitude: latitude,
                p_longitude: longitude,
                p_clear_exact_address: clearExactAddress
            )
        ).execute()
    }

    private enum GroupEventSaveMode: String, Encodable {
        case create, update
    }

    private struct GroupEventSavePayload: Encodable {
        let id: UUID
        let kind: String
        let title: String
        let public_location_label: String
        let date: Date
        let setlist: [SongPayload]
        let series_id: UUID?
        let recurrence: String?
        let reminder_lead_days: Int?
        let exact_address: String?
        let clear_exact_address: Bool
        let postal_code: String?
        let city: String?
        let country_code: String
        let latitude: Double?
        let longitude: Double?
    }

    /// Métadonnées publiques et adresse privée sont enregistrées par une
    /// seule transaction PostgreSQL. Une interruption ne peut donc plus
    /// laisser un upsert public réussi suivi d'une mutation privée perdue.
    private func saveGroupEvents(
        _ events: [GroupEvent],
        groupID: UUID,
        mode: GroupEventSaveMode,
        locationMutations: [UUID: ExactAddressMutation]
    ) async throws {
        guard !events.isEmpty else { return }
        struct Params: Encodable {
            let p_group_id: UUID
            let p_events: [GroupEventSavePayload]
            let p_mode: GroupEventSaveMode
        }
        let payloads = events.map { event -> GroupEventSavePayload in
            let mutation = locationMutations[event.id] ?? .preserve
            return GroupEventSavePayload(
                id: event.id,
                kind: event.kind.rawValue,
                title: event.title,
                public_location_label: event.venue,
                date: event.date,
                setlist: event.setlist.map(SongPayload.init(from:)),
                series_id: event.seriesID,
                recurrence: event.recurrence?.rawValue,
                reminder_lead_days: event.reminderLeadDays,
                exact_address: mutation.rpcExactAddress,
                clear_exact_address: mutation.clearsExactAddress,
                postal_code: nil,
                city: nil,
                country_code: "CH",
                latitude: nil,
                longitude: nil
            )
        }
        try await client.rpc(
            "save_group_events_with_locations",
            params: Params(p_group_id: groupID, p_events: payloads, p_mode: mode)
        ).execute()
    }

    /// Insère une ou plusieurs dates et leur rendez-vous privé atomiquement.
    func createEvents(_ events: [GroupEvent], groupID: UUID) async throws {
        let mutations: [UUID: ExactAddressMutation] = Dictionary(
            uniqueKeysWithValues: events.map { event in
            let address = event.exactAddress?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
            return (event.id, address.isEmpty ? .preserve : .replace(address))
            }
        )
        try await saveGroupEvents(
            events,
            groupID: groupID,
            mode: .create,
            locationMutations: mutations
        )
    }

    /// Active ou coupe le remplacement automatique du groupe (leader).
    func updateAutoSOS(enabled: Bool, minLevel: String?, groupID: UUID) async throws {
        struct Patch: Encodable {
            let auto_sos_enabled: Bool
            let auto_sos_min_level: String?
        }
        try await client.from("music_groups")
            .update(Patch(auto_sos_enabled: enabled, auto_sos_min_level: minLevel))
            .eq("id", value: groupID)
            .execute()
    }

    /// Nouveau délai de rappel décidé par le leader — la RLS `update` du
    /// groupe s'applique (membres du groupe uniquement).
    func updateEventReminderLead(_ days: Int, eventID: UUID) async throws {
        struct Patch: Encodable { let reminder_lead_days: Int }
        try await client.from("group_events")
            .update(Patch(reminder_lead_days: days))
            .eq("id", value: eventID)
            .execute()
    }

    /// Réécrit les horaires/libellés et applique UNE intention privée commune
    /// à la portée choisie. `.preserve` conserve chaque adresse existante.
    func updateEventSchedules(
        _ events: [GroupEvent],
        groupID: UUID,
        exactAddressMutation: ExactAddressMutation = .preserve
    ) async throws {
        let mutations = Dictionary(uniqueKeysWithValues: events.map {
            ($0.id, exactAddressMutation)
        })
        try await saveGroupEvents(
            events,
            groupID: groupID,
            mode: .update,
            locationMutations: mutations
        )
    }

    /// Efface les réponses de présence de ces dates, sauf celle du leader :
    /// quand le JOUR change, « je suis dispo jeudi » ne veut plus rien dire.
    func resetAttendance(eventIDs: [UUID], keeping leaderID: UUID) async throws {
        guard !eventIDs.isEmpty else { return }
        try await client.from("event_attendance")
            .delete()
            .in("event_id", values: eventIDs.map(\.uuidString))
            .neq("profile_id", value: leaderID)
            .execute()
    }

    /// Prévient le groupe qu'une date a bougé — UNE notification, même si la
    /// série entière a été déplacée (la RPC compte les dates elle-même).
    func notifyEventMoved(eventID: UUID, dates: Int) async throws {
        struct Params: Encodable {
            let p_event_id: UUID
            let p_dates: Int
        }
        try await client
            .rpc("notify_group_event_moved", params: Params(p_event_id: eventID, p_dates: dates))
            .execute()
    }

    /// Annule une date — ou plusieurs occurrences — dans une seule transaction
    /// serveur. La RPC vérifie que l'appelant est le leader, prévient les
    /// membres une fois, puis supprime les dates.
    func cancelGroupEvents(_ eventIDs: [UUID]) async throws {
        guard !eventIDs.isEmpty else { return }
        struct Params: Encodable { let p_event_ids: [UUID] }
        try await client
            .rpc("cancel_group_events", params: Params(p_event_ids: eventIDs))
            .execute()
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

    /// Relit uniquement les deux colonnes JSON nécessaires aux mutations de
    /// morceaux. Les autres données lourdes d'un groupe (messages, documents,
    /// présence...) ne sont volontairement pas chargées.
    func fetchGroupSongCollections(groupID: UUID) async throws -> GroupSongCollections {
        struct RepertoireRow: Decodable {
            let repertoire: [SongPayload]
        }
        struct EventSetlistRow: Decodable {
            let id: UUID
            let setlist: [SongPayload]
        }

        async let repertoireRow: RepertoireRow = client.from("music_groups")
            .select("repertoire")
            .eq("id", value: groupID)
            .single()
            .execute().value
        async let eventRows: [EventSetlistRow] = client.from("group_events")
            .select("id,setlist")
            .eq("group_id", value: groupID)
            .execute().value

        let (group, events) = try await (repertoireRow, eventRows)
        return GroupSongCollections(
            repertoire: group.repertoire.map(\.asSong),
            eventSetlists: Dictionary(
                uniqueKeysWithValues: events.map { ($0.id, $0.setlist.map(\.asSong)) }
            )
        )
    }

    /// Fusionne une mutation locale avec le répertoire courant sous verrou.
    /// Le RPC compare `original` et `desired` clé par clé : ordre et champs
    /// modifiés à distance après la lecture restent donc intacts.
    func mergeGroupRepertoireSnapshot(
        originalSongs: [Song],
        desiredSongs: [Song],
        groupID: UUID
    ) async throws {
        struct Params: Encodable {
            let p_group_id: UUID
            let p_original_songs: [SongPayload]
            let p_desired_songs: [SongPayload]
        }
        try await client.rpc(
            "merge_group_repertoire_snapshot",
            params: Params(
                p_group_id: groupID,
                p_original_songs: originalSongs.map(SongPayload.init(from:)),
                p_desired_songs: desiredSongs.map(SongPayload.init(from:))
            )
        ).execute()
    }

    /// Même fusion atomique pour la setlist d'une session précise.
    func mergeEventSetlistSnapshot(
        originalSongs: [Song],
        desiredSongs: [Song],
        eventID: UUID
    ) async throws {
        struct Params: Encodable {
            let p_event_id: UUID
            let p_original_songs: [SongPayload]
            let p_desired_songs: [SongPayload]
        }
        try await client.rpc(
            "merge_event_setlist_snapshot",
            params: Params(
                p_event_id: eventID,
                p_original_songs: originalSongs.map(SongPayload.init(from:)),
                p_desired_songs: desiredSongs.map(SongPayload.init(from:))
            )
        ).execute()
    }

    /// Réordonne atomiquement les morceaux d'un répertoire. Le RPC ne
    /// remplace jamais le JSON complet : une suggestion ajoutée pendant le
    /// geste ne peut donc pas être perdue.
    func reorderGroupRepertoire(_ songIDs: [UUID], groupID: UUID) async throws {
        struct Params: Encodable {
            let p_group_id: UUID
            let p_song_ids: [String]
        }
        try await client.rpc(
            "reorder_group_repertoire",
            params: Params(
                p_group_id: groupID,
                p_song_ids: songIDs.map(\.uuidString)
            )
        ).execute()
    }

    /// Variante atomique pour la setlist d'une date précise.
    func reorderEventSetlist(_ songIDs: [UUID], eventID: UUID) async throws {
        struct Params: Encodable {
            let p_event_id: UUID
            let p_song_ids: [String]
        }
        try await client.rpc(
            "reorder_event_setlist",
            params: Params(
                p_event_id: eventID,
                p_song_ids: songIDs.map(\.uuidString)
            )
        ).execute()
    }

    /// Modifie uniquement `solos` pour ce morceau, dans le répertoire et ses
    /// copies de setlist, sans écraser les autres changements JSON.
    func setGroupSongSolos(
        _ profileIDs: [UUID],
        songID: UUID,
        groupID: UUID
    ) async throws {
        struct Params: Encodable {
            let p_group_id: UUID
            let p_song_id: UUID
            let p_profile_ids: [UUID]
        }
        try await client.rpc(
            "set_group_song_solos",
            params: Params(
                p_group_id: groupID,
                p_song_id: songID,
                p_profile_ids: profileIDs
            )
        ).execute()
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
        /// Morceau auquel la partition est rattachée (nil = partition libre).
        var songId: UUID?
        var instrument: String?

        enum CodingKeys: String, CodingKey {
            case id, title, path, ext, instrument
            case groupId = "group_id"
            case addedBy = "added_by"
            case createdAt = "created_at"
            case songId = "song_id"
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
                ext: ext,
                songID: songId,
                instrument: instrument
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
            let song_id: UUID?
            let instrument: String?
        }
        try await client.from("group_docs")
            .insert(Insert(
                id: doc.id,
                group_id: groupID,
                title: doc.title,
                path: doc.remotePath ?? "",
                ext: doc.ext ?? "pdf",
                added_by: addedBy,
                song_id: doc.songID,
                instrument: doc.instrument
            ))
            .execute()
    }

    // MARK: - Commentaires de morceau

    struct SongCommentRow: Codable {
        var id: UUID
        var groupId: UUID
        var songId: UUID
        var authorId: UUID?
        var text: String
        var createdAt: Date

        enum CodingKeys: String, CodingKey {
            case id, text
            case groupId = "group_id"
            case songId = "song_id"
            case authorId = "author_id"
            case createdAt = "created_at"
        }

        func asSongComment(myID: UUID, myName: String, nameByID: [UUID: String]) -> SongComment {
            SongComment(
                id: id,
                songID: songId,
                author: authorId == myID ? myName : authorId.flatMap { nameByID[$0] } ?? "",
                isMine: authorId == myID,
                text: text,
                date: createdAt
            )
        }
    }

    /// Commentaires de tous les morceaux des groupes dont je fais partie.
    func fetchSongComments(groupIDs: [UUID]) async throws -> [SongCommentRow] {
        guard !groupIDs.isEmpty else { return [] }
        return try await client.from("song_comments")
            .select()
            .in("group_id", values: groupIDs.map(\.uuidString))
            .order("created_at")
            .execute().value
    }

    func insertSongComment(
        id: UUID,
        groupID: UUID,
        songID: UUID,
        authorID: UUID,
        text: String
    ) async throws {
        struct Insert: Encodable {
            let id: UUID
            let group_id: UUID
            let song_id: UUID
            let author_id: UUID
            let text: String
        }
        try await client.from("song_comments")
            .insert(Insert(
                id: id, group_id: groupID, song_id: songID,
                author_id: authorID, text: text
            ))
            .execute()
    }

    func deleteSongComment(_ commentID: UUID) async throws {
        try await client.from("song_comments").delete().eq("id", value: commentID).execute()
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

    // MARK: - Pièces jointes de messages

    /// Bucket privé commun aux conversations et groupes. Les policies lisent
    /// le premier dossier du chemin pour appliquer la bonne appartenance.
    static let messageFilesBucket = "message-files"

    func uploadConversationAttachment(
        _ data: Data,
        fileName: String,
        contentType: String,
        ext: String,
        conversationID: UUID,
        senderID: UUID
    ) async throws -> MessageAttachment {
        try await uploadMessageAttachment(
            data,
            fileName: fileName,
            contentType: contentType,
            ext: ext,
            prefix: "conversation/\(conversationID.uuidString.lowercased())",
            senderID: senderID
        )
    }

    func uploadGroupMessageAttachment(
        _ data: Data,
        fileName: String,
        contentType: String,
        ext: String,
        groupID: UUID,
        senderID: UUID
    ) async throws -> MessageAttachment {
        try await uploadMessageAttachment(
            data,
            fileName: fileName,
            contentType: contentType,
            ext: ext,
            prefix: "group/\(groupID.uuidString.lowercased())",
            senderID: senderID
        )
    }

    private func uploadMessageAttachment(
        _ data: Data,
        fileName: String,
        contentType: String,
        ext: String,
        prefix: String,
        senderID: UUID
    ) async throws -> MessageAttachment {
        let safeExtension = ext
            .lowercased()
            .filter { $0.isLetter || $0.isNumber }
        let suffix = safeExtension.isEmpty ? "dat" : String(safeExtension.prefix(12))
        let path = "\(prefix)/\(senderID.uuidString.lowercased())/\(UUID().uuidString.lowercased()).\(suffix)"
        try await client.storage.from(Self.messageFilesBucket).upload(
            path,
            data: data,
            options: FileOptions(contentType: contentType)
        )
        return MessageAttachment(
            remotePath: path,
            fileName: String(fileName.prefix(255)),
            contentType: contentType,
            byteCount: Int64(data.count)
        )
    }

    func downloadMessageAttachment(path: String) async throws -> Data {
        try await client.storage.from(Self.messageFilesBucket).download(path: path)
    }

    func deleteMessageAttachment(path: String) async throws {
        struct Params: Encodable { let p_path: String }
        try await client.rpc(
            "queue_message_file_cleanup",
            params: Params(p_path: path)
        ).execute()
        try await completeMessageFileRemoval(path: path)
    }

    private func removeMessageAttachmentObject(path: String) async throws {
        _ = try await client.storage.from(Self.messageFilesBucket).remove(paths: [path])
    }

    private func completeMessageFileRemoval(path: String) async throws {
        try await removeMessageAttachmentObject(path: path)
        struct Params: Encodable { let p_path: String }
        try await client.rpc(
            "complete_message_file_cleanup",
            params: Params(p_path: path)
        ).execute()
    }

    private struct MessageFileCleanupRow: Decodable { let path: String }

    /// Reprend les suppressions Storage interrompues (réseau coupé, app tuée).
    /// Le chemin courant est best-effort ; la suppression de compte utilise
    /// la variante stricte afin de ne jamais perdre l'identité avant le blob.
    func cleanupPendingMessageFiles() async {
        try? await cleanupPendingMessageFilesOrThrow()
    }

    private func cleanupPendingMessageFilesOrThrow() async throws {
        let rows: [MessageFileCleanupRow] = try await client
            .from("message_file_cleanup")
            .select("path")
            .execute().value
        for row in rows {
            try await completeMessageFileRemoval(path: row.path)
        }
    }

    // MARK: - Groupes : messages + temps réel

    /// Envoie un message de groupe. L'id est fourni par le client pour que
    /// l'écho realtime (notre propre INSERT revient aussi par le canal) se
    /// dédoublonne proprement.
    @discardableResult
    func sendGroupMessage(
        id: UUID,
        text: String,
        attachment: MessageAttachment?,
        groupID: UUID,
        senderID: UUID
    ) async throws -> GroupMessageRow {
        struct Insert: Encodable {
            let id: UUID
            let group_id: UUID
            let sender_id: UUID
            let text: String
            let attachment_path: String?
            let attachment_name: String?
            let attachment_type: String?
            let attachment_size: Int64?
        }
        return try await client.from("group_messages")
            .insert(Insert(
                id: id,
                group_id: groupID,
                sender_id: senderID,
                text: text,
                attachment_path: attachment?.remotePath,
                attachment_name: attachment?.fileName,
                attachment_type: attachment?.contentType,
                attachment_size: attachment?.byteCount
            ))
            .select()
            .single()
            .execute().value
    }

    func updateGroupMessage(_ id: UUID, text: String) async throws {
        struct Params: Encodable {
            let p_message: UUID
            let p_text: String
        }
        try await client.rpc(
            "edit_group_message",
            params: Params(p_message: id, p_text: text)
        ).execute()
    }

    func deleteGroupMessage(_ id: UUID) async throws {
        struct Params: Encodable { let p_message: UUID }
        let path: String? = try await client.rpc(
            "delete_group_message",
            params: Params(p_message: id)
        ).execute().value
        if let path { try? await completeMessageFileRemoval(path: path) }
    }

    func setGroupMessageReaction(messageID: UUID, emoji: String?) async throws {
        struct Params: Encodable {
            let p_message: UUID
            let p_emoji: String?
        }
        try await client.rpc(
            "set_group_message_reaction",
            params: Params(p_message: messageID, p_emoji: emoji)
        ).execute()
    }

    func fetchGroupMessageReactionSummaries(
        messageID: UUID,
        myID: UUID
    ) async throws -> [MessageReaction] {
        let rows: [MessageReactionRow] = try await client.from("group_message_reactions")
            .select()
            .eq("message_id", value: messageID.uuidString)
            .is("removed_at", value: nil)
            .execute().value
        return Self.reactionSummaries(rows, myID: myID)
    }

    // MARK: - Écoles : temps réel

    enum SchoolRealtimeEvent {
        case messageInserted(SchoolMessageRow)
        case messageUpdated(SchoolMessageRow)
        case membershipsChanged
    }

    /// RLS filtre les messages et adhésions aux seules écoles visibles par le
    /// compte. La liste des membres est rechargée/coalescée côté AppStore ; les
    /// messages, beaucoup plus fréquents, sont intégrés incrémentalement.
    func schoolStream() async throws -> (
        channel: RealtimeChannelV2,
        stream: AsyncStream<SchoolRealtimeEvent>
    ) {
        let channel = client.channel("schools-live")
        let messageInserts = channel.postgresChange(
            InsertAction.self, schema: "public", table: "school_messages"
        )
        let messageUpdates = channel.postgresChange(
            UpdateAction.self, schema: "public", table: "school_messages"
        )
        let membershipChanges = channel.postgresChange(
            AnyAction.self, schema: "public", table: "music_school_memberships"
        )
        do {
            try await channel.subscribeWithError()
        } catch {
            await client.removeChannel(channel)
            throw error
        }
        let stream = AsyncStream<SchoolRealtimeEvent> { continuation in
            let insertTask = Task {
                for await insert in messageInserts {
                    if let row = try? insert.decodeRecord(
                        as: SchoolMessageRow.self,
                        decoder: Self.realtimeDecoder
                    ) {
                        continuation.yield(.messageInserted(row))
                    }
                }
            }
            let updateTask = Task {
                for await update in messageUpdates {
                    if let row = try? update.decodeRecord(
                        as: SchoolMessageRow.self,
                        decoder: Self.realtimeDecoder
                    ) {
                        continuation.yield(.messageUpdated(row))
                    }
                }
            }
            let membershipsTask = Task {
                for await _ in membershipChanges {
                    continuation.yield(.membershipsChanged)
                }
            }
            continuation.onTermination = { _ in
                insertTask.cancel()
                updateTask.cancel()
                membershipsTask.cancel()
            }
        }
        return (channel, stream)
    }

    /// Événement temps réel côté groupes : un message arrive en incrémental,
    /// tout le reste (événements, présence, membres, répertoire) déclenche un
    /// rechargement des groupes.
    enum GroupRealtimeEvent {
        case message(GroupMessageRow)
        case messageUpdated(GroupMessageRow)
        case reactionsChanged(UUID)
        case groupsChanged
    }

    /// Flux temps réel des groupes (RLS : le serveur ne pousse que ce qui
    /// concerne mes groupes).
    func groupStream() async throws -> (channel: RealtimeChannelV2, stream: AsyncStream<GroupRealtimeEvent>) {
        let channel = client.channel("groups-live")
        let messageInserts = channel.postgresChange(InsertAction.self, schema: "public", table: "group_messages")
        let messageUpdates = channel.postgresChange(UpdateAction.self, schema: "public", table: "group_messages")
        let reactionInserts = channel.postgresChange(
            InsertAction.self, schema: "public", table: "group_message_reactions"
        )
        let reactionUpdates = channel.postgresChange(
            UpdateAction.self, schema: "public", table: "group_message_reactions"
        )
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
            let messageUpdateTask = Task {
                for await update in messageUpdates {
                    if let row = try? update.decodeRecord(
                        as: GroupMessageRow.self,
                        decoder: Self.realtimeDecoder
                    ) {
                        continuation.yield(.messageUpdated(row))
                    }
                }
            }
            let reactionTask = Task {
                await withTaskGroup(of: Void.self) { group in
                    group.addTask {
                        for await insert in reactionInserts {
                            if let row = try? insert.decodeRecord(
                                as: MessageReactionRow.self,
                                decoder: Self.realtimeDecoder
                            ) {
                                continuation.yield(.reactionsChanged(row.messageId))
                            }
                        }
                    }
                    group.addTask {
                        for await update in reactionUpdates {
                            if let row = try? update.decodeRecord(
                                as: MessageReactionRow.self,
                                decoder: Self.realtimeDecoder
                            ) {
                                continuation.yield(.reactionsChanged(row.messageId))
                            }
                        }
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
                messageUpdateTask.cancel()
                reactionTask.cancel()
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
