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

    /// URL de retour des liens d'auth (réinitialisation de mot de passe…).
    static let authCallbackURL = URL(string: "dispo://login-callback")!

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
        var availability: String
        var repertoire: [String]
        var photoUrl: String?
        var isPremium: Bool

        enum CodingKeys: String, CodingKey {
            case id, name, age, neighborhood, latitude, longitude
            case instruments, genres, level, bio, availability, repertoire
            case photoUrl = "photo_url"
            case isPremium = "is_premium"
        }

        /// Un profil apparaît dans le feed dès qu'il est réellement rempli.
        var isComplete: Bool {
            !name.isEmpty && !instruments.isEmpty && latitude != nil && longitude != nil
        }

        func asMusician(reviews: [Review]) -> Musician? {
            guard isComplete, let latitude, let longitude else { return nil }
            return Musician(
                id: id,
                name: name,
                age: age ?? 0,
                neighborhood: neighborhood,
                latitude: latitude,
                longitude: longitude,
                instruments: instruments.compactMap(Instrument.init(rawValue:)),
                genres: genres.compactMap(Genre.init(rawValue:)),
                level: Level(rawValue: level) ?? .intermediaire,
                bio: bio,
                availability: Availability(rawValue: availability) ?? .onRequest,
                repertoire: repertoire,
                reviews: reviews,
                photo: photoUrl
            )
        }
    }

    struct AppreciationRow: Codable {
        var giverId: UUID
        var receiverId: UUID
        var kind: String
        var comment: String

        enum CodingKeys: String, CodingKey {
            case giverId = "giver_id"
            case receiverId = "receiver_id"
            case kind, comment
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

        enum CodingKeys: String, CodingKey {
            case id, date, genre, fee, description, title, place, neighborhood
            case hostId = "host_id"
            case wantedInstruments = "wanted_instruments"
            case postedAt = "posted_at"
            case isLocked = "is_locked"
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

        enum CodingKeys: String, CodingKey {
            case id, text
            case conversationId = "conversation_id"
            case senderId = "sender_id"
            case createdAt = "created_at"
        }

        func asMessage(myID: UUID) -> Message {
            Message(id: id, text: text, isFromMe: senderId == myID, date: createdAt)
        }
    }

    // MARK: - Profils

    func fetchProfiles() async throws -> [ProfileRow] {
        try await client.from("profiles").select().execute().value
    }

    func fetchAppreciations() async throws -> [AppreciationRow] {
        try await client.from("appreciations").select().execute().value
    }

    /// Musiciens du feed (profils complets, sauf moi), avis inclus.
    func fetchMusicians(excluding myID: UUID) async throws -> [Musician] {
        async let profilesTask = fetchProfiles()
        async let appreciationsTask = fetchAppreciations()
        let (profiles, appreciations) = try await (profilesTask, appreciationsTask)

        let nameByID = Dictionary(uniqueKeysWithValues: profiles.map { ($0.id, $0.name) })
        var reviewsByReceiver: [UUID: [Review]] = [:]
        for a in appreciations {
            let review = Review(
                author: nameByID[a.giverId]?.split(separator: " ").first.map(String.init) ?? "Un musicien",
                appreciation: Appreciation(rawValue: a.kind) ?? .note,
                comment: a.comment
            )
            reviewsByReceiver[a.receiverId, default: []].append(review)
        }

        return profiles
            .filter { $0.id != myID }
            .compactMap { $0.asMusician(reviews: reviewsByReceiver[$0.id] ?? []) }
    }

    /// Pousse mon profil local vers le backend.
    func saveProfile(_ profile: MyProfile, userID: UUID) async throws {
        struct Update: Encodable {
            let name: String
            let instruments: [String]
            let genres: [String]
            let level: String
            let bio: String
            let availability: String
            // Position par défaut : centre de Genève (vraie géoloc en phase 2b).
            let latitude: Double
            let longitude: Double
        }
        let update = Update(
            name: profile.name,
            instruments: profile.instruments.map(\.rawValue),
            genres: profile.genres.map(\.rawValue),
            level: profile.level.rawValue,
            bio: profile.bio,
            availability: profile.availability.rawValue,
            latitude: AppStore.geneva.latitude,
            longitude: AppStore.geneva.longitude
        )
        try await client.from("profiles").update(update).eq("id", value: userID).execute()
    }

    func setPremium(_ isPremium: Bool, userID: UUID) async throws {
        try await client.from("profiles")
            .update(["is_premium": isPremium])
            .eq("id", value: userID)
            .execute()
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
        let created: ConversationRow = try await client.from("conversations")
            .insert(["participant_a": a, "participant_b": b])
            .select().single().execute().value
        return created
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
            let other = profileByID[row.other(than: myID)]
            return Conversation(
                id: row.id,
                contactName: other?.name ?? "Musicien",
                contactInstrument: other?.instruments.first.flatMap(Instrument.init(rawValue:)) ?? .voix,
                messages: (messagesByConversation[row.id] ?? []).map { $0.asMessage(myID: myID) }
            )
        }
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

    /// Flux temps réel des nouveaux messages (le serveur ne pousse que ceux
    /// de mes conversations, RLS oblige).
    func messageStream() async -> (channel: RealtimeChannelV2, stream: AsyncStream<MessageRow>) {
        let channel = client.channel("messages-live")
        let inserts = channel.postgresChange(InsertAction.self, schema: "public", table: "messages")
        await channel.subscribe()
        let stream = AsyncStream<MessageRow> { continuation in
            let task = Task {
                for await insert in inserts {
                    if let row = try? insert.decodeRecord(as: MessageRow.self, decoder: Self.realtimeDecoder) {
                        continuation.yield(row)
                    }
                }
                continuation.finish()
            }
            continuation.onTermination = { _ in task.cancel() }
        }
        return (channel, stream)
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
}
