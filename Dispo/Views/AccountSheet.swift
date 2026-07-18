import SwiftUI

/// Gestion du compte connecté (mode live) : état de la session, déconnexion.
/// La connexion elle-même passe par le portail obligatoire (AuthGateView).
struct AccountSheet: View {
    @EnvironmentObject private var store: AppStore
    @Environment(\.dismiss) private var dismiss

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
                            AuthForm()
                        }
                    }
                    .padding(18)
                }
            }
            .navigationTitle("Mon compte")
            .navigationBarTitleDisplayMode(.inline)
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
                 : "Ton profil devient visible des autres musiciens — annonces SOS et messages en temps réel.")
                .font(.caption)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
        }
        .padding(.top, 8)
    }

    private var signedInCard: some View {
        JCCard {
            VStack(alignment: .leading, spacing: 14) {
                HStack(spacing: 12) {
                    Circle().fill(.green).frame(width: 10, height: 10)
                    VStack(alignment: .leading, spacing: 2) {
                        Text(store.liveEmail ?? store.tr("Connecté"))
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
}
