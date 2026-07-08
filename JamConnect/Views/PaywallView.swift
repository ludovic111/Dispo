import SwiftUI

/// Paywall Premium, centré sur la promesse n°1 : ne jamais rater un cachet
/// de dépannage. Annuel CHF 59 (−29 %) mis en avant, mensuel CHF 6.90.
/// Paiement simulé dans la démo ; StoreKit / App Store en phase 2.
struct PaywallView: View {
    @EnvironmentObject private var store: AppStore
    @Environment(\.dismiss) private var dismiss
    @State private var selectedPlan: PremiumPlan = .annual

    private struct Perk {
        let icon: String
        let title: String
        let text: String
        var highlight: Bool = false
    }

    private let perks: [Perk] = [
        Perk(icon: "bolt.fill", title: "Alertes dépannage en priorité",
             text: "Un groupe cherche un remplaçant près de toi ? Tu reçois l'alerte 30 min avant tout le monde — le cachet est pour toi.",
             highlight: true),
        Perk(icon: "arrow.up.circle.fill", title: "Profil en tête des recherches",
             text: "Quand un orga cherche en urgence, ton profil sort en premier."),
        Perk(icon: "slider.horizontal.3", title: "Filtres avancés",
             text: "Filtre par niveau, répertoire et type de dispo."),
        Perk(icon: "eye.fill", title: "Qui a vu ton profil",
             text: "Vois quels groupes et musiciens ont regardé ta vidéo."),
        Perk(icon: "crown.fill", title: "Badge Premium",
             text: "Le badge doré qui dit « fiable, dispo, pro ».")
    ]

    var body: some View {
        ZStack {
            JCBackground()

            ScrollView {
                VStack(spacing: 22) {
                    hero
                    roiHook
                    perksList
                    planPicker
                    ctaSection
                }
                .padding(20)
            }
        }
        .overlay(alignment: .topTrailing) {
            Button {
                dismiss()
            } label: {
                Image(systemName: "xmark.circle.fill")
                    .font(.title2)
                    .foregroundStyle(.secondary)
            }
            .padding()
        }
    }

    private var hero: some View {
        ZStack {
            RoundedRectangle(cornerRadius: 28)
                .fill(JC.premium)
                .frame(height: 160)
            VStack(spacing: 8) {
                Image(systemName: "crown.fill")
                    .font(.system(size: 36, weight: .bold))
                Text("JamConnect Premium")
                    .font(.title2.weight(.heavy))
                Text("Ne rate plus jamais un cachet")
                    .font(.subheadline.weight(.semibold))
                    .opacity(0.8)
            }
            .foregroundStyle(.black)
        }
        .padding(.top, 8)
    }

    /// L'argument massue : un cachet de dépannage vaut CHF 100–300 à Genève.
    private var roiHook: some View {
        HStack(spacing: 12) {
            ZStack {
                Circle()
                    .fill(JC.gold.opacity(0.18))
                    .frame(width: 36, height: 36)
                Image(systemName: "lightbulb.fill")
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(JC.gold)
            }
            Text("Un seul concert dépanné (CHF 100–300) rembourse **largement ton année** d'abonnement.")
                .font(.footnote)
                .foregroundStyle(.primary.opacity(0.9))
            Spacer(minLength: 0)
        }
        .padding(14)
        .background(JC.gold.opacity(0.12), in: RoundedRectangle(cornerRadius: 16))
        .overlay(RoundedRectangle(cornerRadius: 16).stroke(JC.gold.opacity(0.35), lineWidth: 1))
    }

    private var perksList: some View {
        VStack(spacing: 12) {
            ForEach(perks, id: \.title) { perk in
                HStack(spacing: 14) {
                    Image(systemName: perk.icon)
                        .font(.title3)
                        .foregroundStyle(perk.highlight ? JC.coral : JC.gold)
                        .frame(width: 34)
                    VStack(alignment: .leading, spacing: 2) {
                        Text(perk.title).font(.subheadline.weight(.bold))
                        Text(perk.text)
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                    Spacer()
                }
                .padding(14)
                .background(JC.card, in: RoundedRectangle(cornerRadius: 16))
                .overlay(
                    RoundedRectangle(cornerRadius: 16)
                        .stroke(perk.highlight ? JC.coral.opacity(0.5) : .clear, lineWidth: 1)
                )
            }
        }
    }

    private var planPicker: some View {
        HStack(spacing: 12) {
            ForEach(PremiumPlan.allCases) { plan in
                planCard(plan)
            }
        }
    }

    private func planCard(_ plan: PremiumPlan) -> some View {
        let isSelected = selectedPlan == plan
        return Button {
            withAnimation(.snappy) { selectedPlan = plan }
        } label: {
            VStack(spacing: 6) {
                if let tag = plan.promoTag {
                    Text(tag)
                        .font(.system(size: 9, weight: .heavy))
                        .padding(.horizontal, 8)
                        .padding(.vertical, 3)
                        .background(JC.premium, in: Capsule())
                        .foregroundStyle(.black)
                } else {
                    Spacer().frame(height: 18)
                }
                Text(plan.title)
                    .font(.caption.weight(.bold))
                    .foregroundStyle(.secondary)
                Text(plan.priceLine)
                    .font(.headline.weight(.heavy))
                Text(plan.detailLine)
                    .font(.system(size: 10))
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 14)
            .padding(.horizontal, 8)
            .background(isSelected ? JC.gold.opacity(0.14) : JC.card,
                        in: RoundedRectangle(cornerRadius: 18, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: 18, style: .continuous)
                    .stroke(isSelected ? JC.gold : JC.cardStroke, lineWidth: isSelected ? 2 : 1)
            )
        }
        .buttonStyle(PressableStyle())
    }

    @ViewBuilder
    private var ctaSection: some View {
        if store.isPremium {
            VStack(spacing: 10) {
                Label(
                    store.premiumPlan == .annual
                        ? "Abonnement annuel actif"
                        : "Abonnement mensuel actif",
                    systemImage: "checkmark.seal.fill"
                )
                .font(.headline)
                .foregroundStyle(.green)
                Button("Résilier l'abonnement", role: .destructive) {
                    store.cancelPremium()
                }
                .font(.subheadline)
            }
        } else {
            VStack(spacing: 10) {
                Button {
                    store.subscribePremium(plan: selectedPlan)
                    dismiss()
                } label: {
                    Text("Essayer 7 jours gratuits")
                        .font(.headline)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 16)
                        .background(JC.premium, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
                        .foregroundStyle(.black)
                }
                .buttonStyle(PressableStyle())

                Text(selectedPlan == .annual
                     ? "7 jours offerts, puis CHF 59/an · annulable à tout moment"
                     : "7 jours offerts, puis CHF 6.90/mois · annulable à tout moment")
                    .font(.caption)
                    .foregroundStyle(.secondary)

                Text("Pensé avec la scène jazz & latin de Genève")
                    .font(.caption2.weight(.semibold))
                    .foregroundStyle(JC.gold)

                Text("Démo : paiement simulé — l'achat réel passera par l'App Store (StoreKit) en phase 2.")
                    .font(.caption2)
                    .foregroundStyle(.tertiary)
                    .multilineTextAlignment(.center)
            }
        }
    }
}
