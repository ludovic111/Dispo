import SwiftUI

/// Paywall Premium centre sur la promesse n°1 : ne jamais rater un cachet.
/// Abonnements auto-renouvelables achetes et restaures avec StoreKit 2.
struct PaywallView: View {
    @EnvironmentObject private var store: AppStore
    @Environment(\.dismiss) private var dismiss
    @State private var selectedPlan: PremiumPlan = .annual

    private struct Perk {
        let icon: String
        let title: LocalizedStringKey
        let text: LocalizedStringKey
        var highlight: Bool = false
    }

    private let perks: [Perk] = [
        Perk(icon: "bolt.fill", title: "Alertes dépannage en priorité",
             text: "Un groupe cherche un remplaçant près de toi ? Tu reçois l'alerte 30 min avant tout le monde — le cachet est pour toi.",
             highlight: true),
        Perk(icon: "person.3.fill", title: "Crée et dirige des groupes",
             text: "Leader du groupe : membres, répertoire validé, événements et setlists — rejoindre reste gratuit."),
        Perk(icon: "video.fill", title: "6 vidéos de démo",
             text: "Montre plusieurs styles — un seul extrait en gratuit."),
        Perk(icon: "medal.fill", title: "Tri et niveau des musiciens",
             text: "Les meilleurs profils en haut, leur niveau affiché.")
    ]

    var body: some View {
        ZStack {
            JCBackground()

            ScrollView {
                VStack(spacing: 22) {
                    hero
                    if AppStore.isBeta {
                        // Bêta fermée : pas de plans, pas de faux prix —
                        // on dit simplement ce qui est ouvert.
                        betaNotice
                        perksList
                    } else {
                        roiHook
                        perksList
                        planPicker
                        ctaSection
                    }
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

    /// Le pass backstage — badge plastifié sous la lumière de scène,
    /// fente de tour de cou comprise.
    private var hero: some View {
        ZStack(alignment: .top) {
            RoundedRectangle(cornerRadius: 28, style: .continuous)
                .fill(JC.premium)
                .frame(height: 172)
            Capsule()
                .fill(JC.bg)
                .frame(width: 44, height: 8)
                .padding(.top, 14)
            VStack(spacing: 7) {
                Text("Pass backstage")
                    .font(JCFont.monoBold(11))
                    .tracking(2.5)
                    .textCase(.uppercase)
                    .opacity(0.75)
                Text(verbatim: "Dispo Premium")
                    .font(JCFont.display(27))
                Text("Ne rate plus jamais un cachet")
                    .font(.subheadline.weight(.semibold))
                    .opacity(0.8)
            }
            .foregroundStyle(JC.billetPaper)
            .frame(maxWidth: .infinity)
            .padding(.top, 38)
        }
        .padding(.top, 8)
    }

    /// L'argument massue : un cachet de dépannage vaut CHF 100–300 à Genève.
    /// Pendant la bêta, tout ce qui suit est déjà à toi — rien à acheter.
    private var betaNotice: some View {
        JCCard {
            VStack(alignment: .leading, spacing: 8) {
                Label("Version bêta", systemImage: "wrench.and.screwdriver.fill")
                    .font(.subheadline.weight(.heavy))
                    .foregroundStyle(JC.premiumTint)
                Text("Tout est ouvert pendant les tests : aucun abonnement n'est vendu et rien ne sera débité. Ces fonctions sont déjà actives sur ton compte.")
                    .font(.callout)
                    .foregroundStyle(.secondary)
            }
        }
    }

    private var roiHook: some View {
        HStack(spacing: 12) {
            ZStack {
                Circle()
                    .fill(JC.laiton.opacity(0.18))
                    .frame(width: 36, height: 36)
                Image(systemName: "lightbulb.fill")
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(JC.laiton)
            }
            Text("Un seul concert dépanné (souvent CHF 100–300 à Genève) **peut couvrir ton abonnement à l'année**.")
                .font(.footnote)
                .foregroundStyle(.primary.opacity(0.9))
            Spacer(minLength: 0)
        }
        .padding(14)
        .background(JC.laiton.opacity(0.12), in: RoundedRectangle(cornerRadius: 16))
        .overlay(RoundedRectangle(cornerRadius: 16).stroke(JC.laiton.opacity(0.35), lineWidth: 1))
    }

    private var perksList: some View {
        VStack(spacing: 12) {
            ForEach(perks, id: \.icon) { perk in
                HStack(spacing: 14) {
                    Image(systemName: perk.icon)
                        .font(.title3)
                        .foregroundStyle(perk.highlight ? JC.laiton : JC.premiumTint)
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
                        .stroke(perk.highlight ? JC.laiton.opacity(0.5) : .clear, lineWidth: 1)
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
                    Text(LocalizedStringKey(tag))
                        .font(.system(size: 9, weight: .heavy))
                        .padding(.horizontal, 8)
                        .padding(.vertical, 3)
                        .background(JC.premium, in: Capsule())
                        .foregroundStyle(JC.billetPaper)
                } else {
                    Spacer().frame(height: 18)
                }
                Text(LocalizedStringKey(plan.title))
                    .font(.caption.weight(.bold))
                    .foregroundStyle(.secondary)
                Text(verbatim: store.displayPrice(for: plan))
                    .font(JCFont.monoBold(16))
                Text(plan == .annual ? "par an" : "par mois")
                    .font(.system(size: 10))
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
                if let trial = store.trialLabel(for: plan) {
                    Text(verbatim: trial)
                        .font(.system(size: 9, weight: .heavy))
                        .foregroundStyle(JC.feutrine)
                        .multilineTextAlignment(.center)
                }
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 14)
            .padding(.horizontal, 8)
            .background(isSelected ? JC.laiton.opacity(0.14) : JC.card,
                        in: RoundedRectangle(cornerRadius: 18, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: 18, style: .continuous)
                    .stroke(isSelected ? JC.laiton : JC.cardStroke, lineWidth: isSelected ? 2 : 1)
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
                .foregroundStyle(JC.feutrine)
                if let subscriptionsURL = URL(string: "https://apps.apple.com/account/subscriptions") {
                    Link("Gérer l'abonnement", destination: subscriptionsURL)
                        .font(.subheadline)
                }
            }
        } else {
            VStack(spacing: 10) {
                Button {
                    Task {
                        if await store.purchasePremium(plan: selectedPlan) { dismiss() }
                    }
                } label: {
                    HStack {
                        if store.purchaseInProgress { ProgressView().tint(JC.billetPaper) }
                        if store.trialLabel(for: selectedPlan) != nil {
                            Text("Commencer l'essai gratuit")
                                .font(.headline)
                        } else {
                            Text("S'abonner · \(store.displayPrice(for: selectedPlan))")
                                .font(.headline)
                        }
                    }
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 16)
                    .background(JC.premium, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
                    .foregroundStyle(JC.billetPaper)
                }
                .buttonStyle(PressableStyle())
                .disabled(store.purchaseInProgress || !store.planAvailable(selectedPlan))

                if let trial = store.trialLabel(for: selectedPlan) {
                    Text(verbatim: String(format: store.tr("%@, puis %@ — résiliable à tout moment."), trial, store.displayPrice(for: selectedPlan)))
                        .font(.caption)
                        .foregroundStyle(JC.feutrine)
                        .multilineTextAlignment(.center)
                }

                Text("Paiement débité sur ton compte Apple. L'abonnement se renouvelle automatiquement jusqu'à sa résiliation dans les réglages App Store.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)

                Button("Restaurer mes achats") {
                    Task { await store.restorePurchases() }
                }
                .font(.caption.weight(.semibold))
                .disabled(store.purchaseInProgress)

                Text("Pensé avec la scène jazz & latin de Genève")
                    .font(.caption2.weight(.semibold))
                    .foregroundStyle(JC.laiton)

            }
        }
    }
}
