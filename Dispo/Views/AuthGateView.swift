import SwiftUI
import AuthenticationServices
import CryptoKit

/// Portail de connexion obligatoire : dès qu'un backend est configuré,
/// impossible d'utiliser l'app sans compte. Affiché après l'onboarding.
struct AuthGateView: View {
    @EnvironmentObject private var store: AppStore

    var body: some View {
        ZStack {
            JCBackground()

            ScrollView {
                VStack(spacing: 24) {
                    VStack(spacing: 12) {
                        LogoView(markSize: 44)
                        Text("Le réseau des musiciens\nqui se dépannent")
                            .font(.title3.weight(.bold))
                            .multilineTextAlignment(.center)
                        Text("Un musicien te lâche ? Trouve un remplaçant fiable en quelques minutes à Genève.")
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                            .multilineTextAlignment(.center)
                            .padding(.horizontal, 24)
                    }
                    .padding(.top, 48)

                    AuthForm()
                        .padding(.horizontal, 18)

                    Text("En continuant, tu acceptes que ton profil soit visible des autres musiciens.")
                        .font(.caption2)
                        .foregroundStyle(.tertiary)
                        .multilineTextAlignment(.center)
                        .padding(.horizontal, 32)
                        .padding(.bottom, 24)
                }
            }
        }
    }
}

/// Formulaire d'authentification e-mail + mot de passe (+ Sign in with
/// Apple quand l'entitlement est présent). Utilisé par le portail et,
/// à l'occasion, par la feuille « Mon compte ».
struct AuthForm: View {
    @EnvironmentObject private var store: AppStore
    @Environment(\.colorScheme) private var colorScheme

    enum Mode: String, CaseIterable, Identifiable {
        case signIn = "Se connecter"
        case signUp = "Créer un compte"
        var id: String { rawValue }
    }

    @State private var mode: Mode = .signIn
    @State private var email = ""
    @State private var password = ""
    @State private var isWorking = false
    @State private var errorText: String?
    @State private var infoText: String?
    /// Nonce brut de la requête Apple en cours (le hash part chez Apple).
    @State private var appleNonce: String?

    private var cleanEmail: String {
        email.trimmingCharacters(in: .whitespaces).lowercased()
    }

    private var canSubmit: Bool {
        cleanEmail.contains("@") && cleanEmail.contains(".") && password.count >= 8
    }

    var body: some View {
        VStack(spacing: 16) {
            if Self.isAppleSignInAvailable {
                appleButton
                separator
            }

            JCCard {
                VStack(alignment: .leading, spacing: 14) {
                    Picker("Mode", selection: $mode) {
                        ForEach(Mode.allCases) { Text(LocalizedStringKey($0.rawValue)).tag($0) }
                    }
                    .pickerStyle(.segmented)

                    Text("E-mail")
                        .font(.caption.weight(.bold))
                        .foregroundStyle(.secondary)
                    TextField("toi@exemple.ch", text: $email)
                        .keyboardType(.emailAddress)
                        .textContentType(.emailAddress)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                        .padding(12)
                        .background(JC.inset, in: RoundedRectangle(cornerRadius: 12, style: .continuous))

                    Text("Mot de passe")
                        .font(.caption.weight(.bold))
                        .foregroundStyle(.secondary)
                    SecureField(mode == .signUp ? "8 caractères minimum" : "Ton mot de passe", text: $password)
                        .textContentType(mode == .signUp ? .newPassword : .password)
                        .padding(12)
                        .background(JC.inset, in: RoundedRectangle(cornerRadius: 12, style: .continuous))

                    Button {
                        submit()
                    } label: {
                        HStack {
                            if isWorking { ProgressView().tint(JC.billetInk) }
                            Text(LocalizedStringKey(mode.rawValue))
                                .font(.headline)
                        }
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 14)
                        .background(JC.hero, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
                        .foregroundStyle(JC.billetInk)
                    }
                    .buttonStyle(PressableStyle())
                    .disabled(isWorking || !canSubmit)

                    if mode == .signIn {
                        Button("Mot de passe oublié ?") { forgotPassword() }
                            .font(.caption)
                            .frame(maxWidth: .infinity)
                            .disabled(isWorking || !cleanEmail.contains("@"))
                    }
                }
            }

            if let errorText {
                Label(errorText, systemImage: "exclamationmark.triangle.fill")
                    .font(.caption)
                    .foregroundStyle(JC.signal)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
            if let infoText {
                Label(infoText, systemImage: "envelope.badge")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
        }
    }

    private var appleButton: some View {
        SignInWithAppleButton(.signIn) { request in
            let nonce = Self.randomNonce()
            appleNonce = nonce
            request.requestedScopes = [.fullName, .email]
            request.nonce = Self.sha256(nonce)
        } onCompletion: { result in
            handleApple(result)
        }
        .signInWithAppleButtonStyle(colorScheme == .dark ? .white : .black)
        .frame(height: 50)
        .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
    }

    private var separator: some View {
        HStack(spacing: 12) {
            Rectangle().fill(JC.cardStroke).frame(height: 1)
            Text("ou par e-mail")
                .font(.caption)
                .foregroundStyle(.secondary)
                .fixedSize()
            Rectangle().fill(JC.cardStroke).frame(height: 1)
        }
    }

    // MARK: - Actions

    private func submit() {
        guard let backend = store.backend else { return }
        isWorking = true
        errorText = nil
        infoText = nil
        let signUp = mode == .signUp
        Task {
            do {
                let userID = signUp
                    ? try await backend.signUp(email: cleanEmail, password: password)
                    : try await backend.signIn(email: cleanEmail, password: password)
                await store.didSignIn(userID: userID)
            } catch {
                let message = error.localizedDescription.lowercased()
                if signUp, message.contains("already registered") {
                    errorText = store.tr("Un compte existe déjà avec cet e-mail — connecte-toi.")
                    mode = .signIn
                } else if !signUp, message.contains("invalid login credentials") {
                    errorText = store.tr("E-mail ou mot de passe incorrect.")
                } else if message.contains("password") {
                    errorText = store.tr("Mot de passe trop court : 8 caractères minimum.")
                } else {
                    errorText = signUp
                        ? store.tr("Création du compte impossible — vérifie le réseau.")
                        : store.tr("Connexion impossible — vérifie le réseau.")
                }
            }
            isWorking = false
        }
    }

    private func forgotPassword() {
        guard let backend = store.backend else { return }
        isWorking = true
        errorText = nil
        Task {
            do {
                try await backend.requestPasswordReset(email: cleanEmail)
                infoText = store.tr("E-mail de réinitialisation envoyé à :") + " " + cleanEmail
            } catch {
                errorText = store.tr("Envoi impossible — vérifie l'adresse et le réseau.")
            }
            isWorking = false
        }
    }

    private func handleApple(_ result: Result<ASAuthorization, Error>) {
        guard let backend = store.backend else { return }
        switch result {
        case .failure(let error):
            // Annulation utilisateur : pas d'erreur à afficher.
            if (error as? ASAuthorizationError)?.code != .canceled {
                errorText = store.tr("Connexion Apple impossible — réessaie.")
            }
        case .success(let authorization):
            guard let credential = authorization.credential as? ASAuthorizationAppleIDCredential,
                  let tokenData = credential.identityToken,
                  let idToken = String(data: tokenData, encoding: .utf8),
                  let nonce = appleNonce
            else {
                errorText = store.tr("Réponse Apple invalide — réessaie.")
                return
            }
            // Apple ne fournit le nom qu'à la toute première autorisation.
            let appleName = [credential.fullName?.givenName, credential.fullName?.familyName]
                .compactMap { $0 }
                .joined(separator: " ")
            isWorking = true
            errorText = nil
            Task {
                do {
                    let userID = try await backend.signInWithApple(idToken: idToken, nonce: nonce)
                    await store.didSignIn(
                        userID: userID,
                        suggestedProfileName: appleName.isEmpty ? nil : appleName
                    )
                } catch {
                    errorText = store.tr("Connexion Apple refusée par le serveur.")
                }
                isWorking = false
            }
        }
    }

    // MARK: - Aides

    /// true si le build peut proposer Sign in with Apple.
    /// Les builds TestFlight / App Store n'embarquent PAS de profil de
    /// provisioning : son absence signifie donc simulateur ou distribution
    /// — deux cas où l'entitlement est garanti (capability active sur
    /// l'App ID depuis la 0.9.6). Seuls les builds de développement sur
    /// appareil vérifient réellement leur profil (les équipes personnelles
    /// gratuites ne peuvent pas provisionner Sign in with Apple).
    static var isAppleSignInAvailable: Bool {
        guard let url = Bundle.main.url(forResource: "embedded", withExtension: "mobileprovision"),
              let data = try? Data(contentsOf: url),
              let content = String(data: data, encoding: .isoLatin1) else {
            return true
        }
        return content.contains("com.apple.developer.applesignin")
    }

    /// Nonce aléatoire (anti-rejeu) : brut → Supabase, hash SHA-256 → Apple.
    /// Interne : aussi utilisé par la liaison de compte dans les réglages.
    static func randomNonce(length: Int = 32) -> String {
        let charset = Array("0123456789ABCDEFGHIJKLMNOPQRSTUVXYZabcdefghijklmnopqrstuvwxyz-._")
        var bytes = [UInt8](repeating: 0, count: length)
        _ = SecRandomCopyBytes(kSecRandomDefault, length, &bytes)
        return String(bytes.map { charset[Int($0) % charset.count] })
    }

    static func sha256(_ input: String) -> String {
        SHA256.hash(data: Data(input.utf8))
            .map { String(format: "%02x", $0) }
            .joined()
    }
}
