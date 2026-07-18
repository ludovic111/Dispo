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
        var isAdmin: Bool
        var isDemo: Bool?
        /// Pseudos réseaux sociaux (jsonb côté serveur).
        var socials: [String: String]?

        enum CodingKeys: String, CodingKey {
            case id, name, age, neighborhood, latitude, longitude
            case instruments, genres, level, bio, repertoire, socials
            case availableDates = "available_dates"
            case photoUrl = "photo_url"
            case isPremium = "is_premium"
            case isAdmin = "is_admin"
            case isDemo = "is_demo"
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

        func asMusician(reviews: [Review]) -> Musician? {
            guard isComplete else { return nil }
            let dates = parsedDates
            return Musician(
                id: id,
                name: name,
                age: age ?? 0,
                neighborhood: neighborhood,
                // Sans géoloc (phase 2b), le profil est posé au centre de
                // Genève pour rester visible dans le feed et sur la carte.
                latitude: latitude ?? AppStore.geneva.latitude,
                longitude: longitude ?? AppStore.geneva.longitude,
                instruments: instruments.compactMap(Instrument.init(rawValue:)),
                genres: genres.compactMap(Genre.init(rawValue:)),
                level: Level(rawValue: level) ?? .intermediaire,
                bio: bio,
                availability: .derived(from: dates),
                availableDates: dates,
                repertoire: repertoire,
                reviews: reviews,
                photo: photoUrl,
                socials: socials,
                isDemo: isDemo ?? false
            )
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

    struct FavoriteRow: Codable, Hashable {
        var userId: UUID
        var favoriteId: UUID
        enum CodingKeys: String, CodingKey {
            case userId = "user_id"
            case favoriteId = "favorite_id"
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

    /// Formateur des colonnes Postgres `date` (« 2026-07-08 »).
    static let dayFormatter: DateFormatter = {
        let formatter = DateFormatter()
        formatter.dateFormat = "yyyy-MM-dd"
        formatter.locale = Locale(identifier: "en_US_POSIX")
        return formatter
    }()

    /// Pousse mon profil local vers le backend.
    func saveProfile(_ profile: MyProfile, userID: UUID) async throws {
        struct Update: Encodable {
            let name: String
            let instruments: [String]
            let genres: [String]
            let level: String
            let bio: String
            let available_dates: [String]
            let socials: [String: String]
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
            available_dates: profile.availableDates.map { Self.dayFormatter.string(from: $0) },
            socials: profile.socials ?? [:],
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

    func fetchFavorites(me: UUID) async throws -> Set<UUID> {
        let rows: [FavoriteRow] = try await client.from("favorites")
            .select().eq("user_id", value: me).execute().value
        return Set(rows.map(\.favoriteId))
    }

    func addFavorite(_ targetID: UUID, me: UUID) async throws {
        try await client.from("favorites")
            .insert(["user_id": me.uuidString, "favorite_id": targetID.uuidString])
            .execute()
    }

    func removeFavorite(_ targetID: UUID, me: UUID) async throws {
        try await client.from("favorites").delete()
            .eq("user_id", value: me).eq("favorite_id", value: targetID).execute()
    }

    func fetchCollaborations() async throws -> [CollaborationRow] {
        try await client.from("collaborations").select().execute().value
    }

    func addCollaboration(with targetID: UUID, me: UUID) async throws {
        let a = min(me.uuidString, targetID.uuidString)
        let b = max(me.uuidString, targetID.uuidString)
        try await client.from("collaborations").insert(["a_id": a, "b_id": b]).execute()
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
    func messageStream() async throws -> (channel: RealtimeChannelV2, stream: AsyncStream<MessageRow>) {
        let channel = client.channel("messages-live")
        let inserts = channel.postgresChange(InsertAction.self, schema: "public", table: "messages")
        try await channel.subscribeWithError()
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

    // MARK: - Groupes (noyau fixe + présence)

    struct MusicGroupRow: Codable {
        var id: UUID
        var name: String
        var emoji: String
        var leaderId: UUID
        var repertoire: [SongPayload]

        enum CodingKeys: String, CodingKey {
            case id, name, emoji, repertoire
            case leaderId = "leader_id"
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

    /// Forme JSON des morceaux (répertoire / setlist) côté Postgres.
    struct SongPayload: Codable, Hashable {
        var id: UUID
        var title: String
        var artist: String
        var artworkURL: String?
        var suggestedBy: String
        var isApproved: Bool

        enum CodingKeys: String, CodingKey {
            case id, title, artist
            case artworkURL = "artwork_url"
            case suggestedBy = "suggested_by"
            case isApproved = "is_approved"
        }

        init(from song: Song) {
            id = song.id
            title = song.title
            artist = song.artist
            artworkURL = song.artworkURL
            suggestedBy = song.suggestedBy
            isApproved = song.isApproved
        }

        var asSong: Song {
            Song(
                id: id,
                title: title,
                artist: artist,
                artworkURL: artworkURL,
                suggestedBy: suggestedBy,
                isApproved: isApproved
            )
        }
    }

    /// Charge les groupes dont je suis membre (RLS), avec membres, événements
    /// et présence. Les messages / partitions restent locaux à l'appareil.
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
                leaderName: leaderName,
                memberNames: memberNames,
                memberKinds: kinds,
                messages: [],
                docs: [],
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
}
