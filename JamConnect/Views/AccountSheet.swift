import SwiftUI
import AuthenticationServices
import CryptoKit

/// Connexion au backend (mode live) : Sign in with Apple, ou un code à
/// 6 chiffres envoyé par e-mail. En dev local, les e-mails arrivent dans
/// Mailpit (http://localhost:54324).
struct AccountSheet: View {
    @EnvironmentObject private var store: AppStore
    @Environment(\.dismiss) private var dismiss
    @Environment(\.colorScheme) private var colorScheme

    @State private var email = ""
    @State private var code = ""
    @State private var codeSent = false
    @State private var isWorking = false
    @State private var errorText: String?
    /// Nonce brut de la requête Apple en cours (le hash part chez Apple).
    @State private var appleNonce: String?

    private var cleanEmail: String {
        email.trimmingCharacters(in: .whitespaces).lowercased()
    }

    var body: some View {
        NavigationStack {
            ZStack {
                JCBackground()

                ScrollView {
                    VStack(spacing: 18) {
                        header

                        if store.isLive {
                            signedInCard
                        } else {
                            if Self.isAppleSignInAvailable {
                                appleButton
                                separator
                            }
                            signInCard
                        }

                        if let errorText {
                            Label(errorText, systemImage: "exclamationmark.triangle.fill")
                                .font(.caption)
                                .foregroundStyle(JC.coral)
                                .frame(maxWidth: .infinity, alignment: .leading)
                        }
                    }
                    .padding(18)
                }
            }
            .navigationTitle("Mon compte")
            .navigationBarTitleDisplayMode(.inline)
            // Connexion par lien magique aboutie pendant que la feuille est
            // ouverte (onOpenURL) : on peut la refermer.
            .onChange(of: store.isLive) { _, live in
                if live { dismiss() }
            }
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("OK") { dismiss() }.font(.headline)
                }
            }
        }
    }

    private var header: some View {
        VStack(spacing: 10) {
            ZStack {
                Circle()
                    .fill(JC.violet.opacity(0.14))
                    .frame(width: 64, height: 64)
                Image(systemName: store.isLive ? "checkmark.icloud.fill" : "icloud")
                    .font(.title2.weight(.semibold))
                    .foregroundStyle(store.isLive ? .green : JC.violet)
            }
            Text(store.isLive ? "Connecté au réseau Dispo" : "Rejoins le réseau Dispo")
                .font(.headline)
            Text(store.isLive
                 ? "Ton profil, les annonces SOS et tes messages sont synchronisés en temps réel."
                 : "Un code envoyé par e-mail, et ton profil devient visible des autres musiciens — annonces et messages en temps réel.")
                .font(.caption)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
        }
        .padding(.top, 8)
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

    private var signInCard: some View {
        JCCard {
            VStack(alignment: .leading, spacing: 14) {
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
                    .disabled(codeSent)

                if codeSent {
                    Text("E-mail envoyé ! Ouvre le lien sur cet iPhone — ou entre le code s'il y en a un :")
                        .font(.caption.weight(.bold))
                        .foregroundStyle(.secondary)
                    TextField("123456", text: $code)
                        .keyboardType(.numberPad)
                        .textContentType(.oneTimeCode)
                        .font(.title3.weight(.bold).monospaced())
                        .padding(12)
                        .background(JC.inset, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                }

                Button {
                    codeSent ? verify() : sendCode()
                } label: {
                    HStack {
                        if isWorking { ProgressView().tint(.white) }
                        Text(codeSent ? "Valider le code" : "Recevoir mon lien de connexion")
                            .font(.headline)
                    }
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 14)
                    .background(JC.hero, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
                    .foregroundStyle(.white)
                }
                .buttonStyle(PressableStyle())
                .disabled(isWorking || cleanEmail.isEmpty || (codeSent && code.count < 6))

                if codeSent {
                    Button("Renvoyer un code") {
                        codeSent = false
                        code = ""
                    }
                    .font(.caption)
                    .frame(maxWidth: .infinity)
                }
            }
        }
    }

    private var signedInCard: some View {
        JCCard {
            VStack(alignment: .leading, spacing: 14) {
                HStack(spacing: 12) {
                    Circle().fill(.green).frame(width: 10, height: 10)
                    VStack(alignment: .leading, spacing: 2) {
                        Text(store.liveEmail ?? "Connecté")
                            .font(.subheadline.weight(.bold))
                        Text("Mode live — données du serveur")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                }
                Button(role: .destructive) {
                    Task {
                        await store.signOutLive()
                        dismiss()
                    }
                } label: {
                    Text("Se déconnecter")
                        .font(.subheadline.weight(.semibold))
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 12)
                        .background(JC.inset, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                }
                .buttonStyle(PressableStyle())
            }
        }
    }

    private func sendCode() {
        guard let backend = store.backend else { return }
        isWorking = true
        errorText = nil
        Task {
            do {
                try await backend.sendCode(email: cleanEmail)
                codeSent = true
            } catch {
                errorText = "Envoi du code impossible — vérifie l'adresse et le réseau."
            }
            isWorking = false
        }
    }

    private func verify() {
        guard let backend = store.backend else { return }
        isWorking = true
        errorText = nil
        Task {
            do {
                let userID = try await backend.verifyCode(
                    email: cleanEmail,
                    code: code.trimmingCharacters(in: .whitespaces)
                )
                await store.didSignIn(userID: userID)
                dismiss()
            } catch {
                errorText = "Code invalide ou expiré — réessaie."
            }
            isWorking = false
        }
    }

    // MARK: - Sign in with Apple

    private func handleApple(_ result: Result<ASAuthorization, Error>) {
        guard let backend = store.backend else { return }
        switch result {
        case .failure(let error):
            // Annulation utilisateur : pas d'erreur à afficher.
            if (error as? ASAuthorizationError)?.code != .canceled {
                errorText = "Connexion Apple impossible — réessaie."
            }
        case .success(let authorization):
            guard let credential = authorization.credential as? ASAuthorizationAppleIDCredential,
                  let tokenData = credential.identityToken,
                  let idToken = String(data: tokenData, encoding: .utf8),
                  let nonce = appleNonce
            else {
                errorText = "Réponse Apple invalide — réessaie."
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
                    if !appleName.isEmpty, store.profile.name.isEmpty {
                        store.profile.name = appleName
                    }
                    await store.didSignIn(userID: userID)
                    dismiss()
                } catch {
                    errorText = "Connexion Apple refusée par le serveur."
                }
                isWorking = false
            }
        }
    }

    /// true si le build embarque l'entitlement Sign in with Apple.
    /// Les équipes personnelles gratuites ne peuvent pas le provisionner :
    /// le bouton apparaît automatiquement dès la signature avec une équipe
    /// du Developer Program (voir le bloc commenté dans project.yml).
    static var isAppleSignInAvailable: Bool {
        guard let url = Bundle.main.url(forResource: "embedded", withExtension: "mobileprovision"),
              let data = try? Data(contentsOf: url),
              let content = String(data: data, encoding: .isoLatin1) else {
            #if targetEnvironment(simulator)
            return true // pas de profil embarqué en simulateur
            #else
            return false
            #endif
        }
        return content.contains("com.apple.developer.applesignin")
    }

    /// Nonce aléatoire (anti-rejeu) : brut → Supabase, hash SHA-256 → Apple.
    private static func randomNonce(length: Int = 32) -> String {
        let charset = Array("0123456789ABCDEFGHIJKLMNOPQRSTUVXYZabcdefghijklmnopqrstuvwxyz-._")
        var bytes = [UInt8](repeating: 0, count: length)
        _ = SecRandomCopyBytes(kSecRandomDefault, length, &bytes)
        return String(bytes.map { charset[Int($0) % charset.count] })
    }

    private static func sha256(_ input: String) -> String {
        SHA256.hash(data: Data(input.utf8))
            .map { String(format: "%02x", $0) }
            .joined()
    }
}
