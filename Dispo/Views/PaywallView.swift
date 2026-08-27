import SwiftUI

/// Un seul niveau Premium, avec deux périodicités. Les prix et essais affichés
/// viennent exclusivement de l'offre Apple chargée par `AppStore`.
struct PaywallView: View {
    @EnvironmentObject private var store: AppStore
    @Environment(\.dismiss) private var dismiss
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    @State private var selectedPlan: PremiumPlan = .annual
    @State private var isLoadingPlans = false

    private struct Perk: Identifiable {
        let icon: String
        let title: LocalizedStringKey
        let text: LocalizedStringKey

        var id: String { icon }
    }

    /// Capacités réellement monétisées. L'accès aux SOS, le niveau des
    /// profils, les écoles et les fonctions de sécurité restent gratuits.
    private let perks: [Perk] = [
        Perk(
            icon: "person.3.fill",
            title: "Dirige plusieurs groupes",
            text: "Centralise les membres, répertoires, setlists et événements de chacun de tes projets."
        ),
        Perk(
            icon: "slider.horizontal.3",
            title: "Affûte tes recherches",
            text: "Combine les filtres avancés pour trouver plus vite les profils qui correspondent à ton projet."
        ),
        Perk(
            icon: "calendar.badge.clock",
            title: "Automatise l'organisation",
            text: "Événements récurrents, rappels configurables et recherche automatique d'un remplaçant en cas de désistement."
        ),
        Perk(
            icon: "play.rectangle.on.rectangle.fill",
            title: "Présente jusqu'à 6 vidéos",
            text: "Construis un portfolio qui montre plusieurs styles, formations et facettes de ton jeu."
        )
    ]

    private var allPlansUnavailable: Bool {
        PremiumPlan.allCases.allSatisfy { !store.planAvailable($0) }
    }

    private var privacyURL: URL {
        URL(string: store.language == .french
            ? "https://dispoapp.net/privacy"
            : "https://dispoapp.net/privacy-en")!
    }

    private let termsURL = URL(
        string: "https://www.apple.com/legal/internet-services/itunes/dev/stdeula/"
    )!
    private let manageSubscriptionsURL = URL(string: "https://apps.apple.com/account/subscriptions")!

    var body: some View {
        ZStack {
            JCBackground()

            ScrollViewReader { proxy in
                ScrollView {
                    VStack(spacing: 20) {
                        hero

                        if AppStore.isBeta {
                            betaNotice
                            perksList
                            freeFoundations
                        } else {
                            perksList
                            freeFoundations
                            plansSection
                                .id("premium-plans")
                            ctaSection
                        }
                    }
                    .padding(.horizontal, 20)
                    .padding(.top, 20)
                    .padding(.bottom, 32)
                }
                .scrollIndicators(.hidden)
                #if DEBUG
                .task {
                    guard UserDefaults.standard.string(forKey: "screenshotRoute") == "paywall-prices" else { return }
                    try? await Task.sleep(for: .milliseconds(300))
                    proxy.scrollTo("premium-plans", anchor: .top)
                }
                #endif
            }
        }
        .overlay(alignment: .topTrailing) {
            Button {
                dismiss()
            } label: {
                Image(systemName: "xmark")
                    .font(.subheadline.weight(.bold))
                    .foregroundStyle(.primary)
                    .frame(width: 44, height: 44)
                    .background(.ultraThinMaterial, in: Circle())
                    .contentShape(Circle())
            }
            .buttonStyle(PressableStyle())
            .accessibilityLabel(Text("Fermer Premium"))
            .padding(12)
        }
        .task {
            guard !AppStore.isBeta, allPlansUnavailable else { return }
            await loadPlans()
        }
    }

    private var hero: some View {
        ZStack(alignment: .bottomTrailing) {
            RoundedRectangle(cornerRadius: 28, style: .continuous)
                .fill(JC.premium)

            Image(systemName: "music.note")
                .font(.system(size: 118, weight: .black))
                .foregroundStyle(JC.billetPaper.opacity(0.08))
                .rotationEffect(.degrees(-9))
                .offset(x: 18, y: 20)
                .accessibilityHidden(true)

            VStack(alignment: .leading, spacing: 12) {
                HStack(spacing: 7) {
                    Image(systemName: "crown.fill")
                    Text(verbatim: "DISPO PREMIUM")
                        .font(JCFont.monoBold(11))
                        .tracking(1.6)
                }
                .foregroundStyle(JC.billetPaper.opacity(0.82))

                Text("Plus de musique.\nMoins d'organisation.")
                    .font(JCFont.display(30))
                    .foregroundStyle(JC.billetPaper)
                    .fixedSize(horizontal: false, vertical: true)

                Text("Des outils pour faire avancer tes projets sans alourdir les échanges.")
                    .font(.subheadline.weight(.medium))
                    .foregroundStyle(JC.billetPaper.opacity(0.78))
                    .fixedSize(horizontal: false, vertical: true)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.horizontal, 22)
            .padding(.top, 30)
            .padding(.bottom, 26)
        }
        .clipShape(RoundedRectangle(cornerRadius: 28, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 28, style: .continuous)
                .stroke(JC.billetPaper.opacity(0.14), lineWidth: 1)
        )
        .padding(.top, 8)
        .accessibilityElement(children: .combine)
    }

    private var betaNotice: some View {
        JCCard {
            HStack(alignment: .top, spacing: 13) {
                Image(systemName: "checkmark.seal.fill")
                    .font(.title2)
                    .foregroundStyle(JC.premiumTint)
                    .frame(width: 44, height: 44)
                    .background(JC.premiumTint.opacity(0.12), in: RoundedRectangle(cornerRadius: 13, style: .continuous))
                    .accessibilityHidden(true)

                VStack(alignment: .leading, spacing: 5) {
                    Text("Premium est inclus dans cette bêta")
                        .font(.headline)
                    Text("Aucun abonnement n'est proposé à la vente. Aucun achat ni débit ne peut être effectué depuis cette version.")
                        .font(.callout)
                        .foregroundStyle(.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
        }
        .accessibilityElement(children: .combine)
    }

    private var perksList: some View {
        VStack(alignment: .leading, spacing: 10) {
            SectionHeader(
                title: "Premium te rend du temps",
                subtitle: "Quatre outils concrets, sans limiter le cœur du réseau"
            )

            JCCard(padding: 0) {
                VStack(spacing: 0) {
                    ForEach(Array(perks.enumerated()), id: \.element.id) { index, perk in
                        perkRow(perk)
                        if index < perks.count - 1 {
                            Divider()
                                .padding(.leading, 70)
                        }
                    }
                }
            }
        }
    }

    private func perkRow(_ perk: Perk) -> some View {
        HStack(alignment: .top, spacing: 14) {
            Image(systemName: perk.icon)
                .font(.body.weight(.bold))
                .foregroundStyle(JC.premiumTint)
                .frame(width: 42, height: 42)
                .background(JC.premiumTint.opacity(0.12), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                .accessibilityHidden(true)

            VStack(alignment: .leading, spacing: 3) {
                Text(perk.title)
                    .font(.subheadline.weight(.bold))
                Text(perk.text)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            }

            Spacer(minLength: 0)
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 13)
        .accessibilityElement(children: .combine)
    }

    private var freeFoundations: some View {
        JCCard {
            VStack(alignment: .leading, spacing: 11) {
                Label("Toujours gratuit", systemImage: "lock.open.fill")
                    .font(.subheadline.weight(.heavy))
                    .foregroundStyle(JC.feutrine)

                Text("Premium n'achète ni l'accès au réseau ni ta sécurité.")
                    .font(.caption)
                    .foregroundStyle(.secondary)

                freeLine(
                    icon: "building.2.fill",
                    text: "Affiliation et communautés d'école"
                )
                freeLine(
                    icon: "shield.checkered",
                    text: "Accès aux SOS, adresse protégée, blocage et signalement"
                )
            }
        }
    }

    private func freeLine(icon: String, text: LocalizedStringKey) -> some View {
        HStack(alignment: .top, spacing: 9) {
            Image(systemName: icon)
                .font(.caption.weight(.bold))
                .foregroundStyle(JC.feutrine)
                .frame(width: 18)
                .accessibilityHidden(true)
            Text(text)
                .font(.caption.weight(.semibold))
                .fixedSize(horizontal: false, vertical: true)
        }
        .accessibilityElement(children: .combine)
    }

    @ViewBuilder
    private var plansSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            SectionHeader(
                title: "Choisis ton rythme",
                subtitle: "Un seul Premium, mensuel ou annuel"
            )

            if isLoadingPlans && allPlansUnavailable {
                HStack(spacing: 11) {
                    ProgressView()
                        .tint(JC.premiumTint)
                    Text("Chargement des offres Apple…")
                        .font(.subheadline.weight(.semibold))
                }
                .frame(maxWidth: .infinity, minHeight: 72)
                .background(JC.card, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
                .accessibilityElement(children: .combine)
            } else {
                ForEach(PremiumPlan.allCases) { plan in
                    planCard(plan)
                }

                if allPlansUnavailable {
                    plansUnavailableNotice
                }
            }
        }
    }

    private func planCard(_ plan: PremiumPlan) -> some View {
        let isSelected = selectedPlan == plan
        let isAvailable = store.planAvailable(plan)
        let price = store.displayPrice(for: plan)

        return Button {
            select(plan)
        } label: {
            VStack(alignment: .leading, spacing: 9) {
                HStack(spacing: 8) {
                    Text(LocalizedStringKey(plan.title))
                        .font(.headline)
                        .foregroundStyle(.primary)

                    if plan == .annual {
                        Text(verbatim: annualOfferLabel)
                            .font(JCFont.monoBold(9))
                            .tracking(0.8)
                            .foregroundStyle(JC.billetPaper)
                            .padding(.horizontal, 7)
                            .padding(.vertical, 4)
                            .background(JC.premium, in: Capsule())
                    }

                    Spacer(minLength: 8)

                    Image(systemName: isSelected ? "checkmark.circle.fill" : "circle")
                        .font(.title3)
                        .foregroundStyle(isSelected ? JC.premiumTint : Color.secondary.opacity(0.45))
                        .accessibilityHidden(true)
                }

                HStack(alignment: .firstTextBaseline, spacing: 8) {
                    Text(plan == .annual ? "Facturé chaque année" : "Facturé chaque mois")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                    Spacer(minLength: 8)
                    Text(verbatim: price)
                        .font(JCFont.monoBold(18))
                        .foregroundStyle(.primary)
                        .multilineTextAlignment(.trailing)
                }

                if let trial = store.trialLabel(for: plan) {
                    Label(trial, systemImage: "gift.fill")
                        .font(.caption2.weight(.bold))
                        .foregroundStyle(JC.feutrine)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.horizontal, 15)
            .padding(.vertical, 14)
            .background(
                isSelected ? JC.premiumTint.opacity(0.12) : JC.card,
                in: RoundedRectangle(cornerRadius: 18, style: .continuous)
            )
            .overlay(
                RoundedRectangle(cornerRadius: 18, style: .continuous)
                    .stroke(isSelected ? JC.premiumTint : JC.cardStroke, lineWidth: isSelected ? 2 : 1)
            )
            .contentShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
        }
        .buttonStyle(PressableStyle())
        .disabled(!isAvailable || store.purchaseInProgress)
        .opacity(isAvailable ? 1 : 0.58)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(Text(planAccessibilityLabel(plan, price: price)))
        .accessibilityValue(Text(planAccessibilityValue(plan, isSelected: isSelected, isAvailable: isAvailable)))
        .accessibilityHint(Text(isAvailable ? "Sélectionne cette périodicité" : "Cette offre Apple est indisponible"))
    }

    private var plansUnavailableNotice: some View {
        JCCard {
            HStack(alignment: .top, spacing: 12) {
                Image(systemName: "exclamationmark.arrow.triangle.2.circlepath")
                    .font(.title3)
                    .foregroundStyle(JC.bronze)
                    .frame(width: 32)
                    .accessibilityHidden(true)

                VStack(alignment: .leading, spacing: 7) {
                    Text("Offres Apple indisponibles")
                        .font(.subheadline.weight(.bold))
                    Text("Vérifie ta connexion, puis réessaie. Aucun achat ne peut partir tant qu'un prix Apple n'est pas chargé.")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                    Button("Réessayer") {
                        Task { await loadPlans() }
                    }
                    .font(.caption.weight(.bold))
                    .foregroundStyle(JC.premiumTint)
                    .frame(minHeight: 44)
                    .disabled(isLoadingPlans)
                }
            }
        }
        .accessibilityElement(children: .contain)
    }

    @ViewBuilder
    private var ctaSection: some View {
        VStack(spacing: 12) {
            if store.isPremium {
                activeSubscriptionCard
            } else {
                purchaseCard
            }

            legalLinks
        }
    }

    private var activeSubscriptionCard: some View {
        JCCard {
            VStack(spacing: 10) {
                Label(
                    store.premiumActivationPending ? "Activation en cours…" : "Premium est actif",
                    systemImage: store.premiumActivationPending
                        ? "hourglass.circle.fill"
                        : "checkmark.seal.fill"
                )
                    .font(.headline)
                    .foregroundStyle(store.premiumActivationPending ? JC.bronze : JC.feutrine)

                if store.premiumActivationPending {
                    Text("Le paiement est confirmé. Dispo synchronise maintenant tes droits sécurisés avec le serveur.")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .multilineTextAlignment(.center)
                    Button {
                        Task { _ = await store.refreshPremiumServerConfirmation(maxAttempts: 12) }
                    } label: {
                        Label("Vérifier l'activation", systemImage: "arrow.clockwise")
                            .font(.subheadline.weight(.semibold))
                            .frame(maxWidth: .infinity, minHeight: 44)
                    }
                    .disabled(store.purchaseInProgress)
                } else if let premiumPlan = store.premiumPlan {
                    Text(premiumPlan == .annual ? "Formule annuelle" : "Formule mensuelle")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }

                Link(destination: manageSubscriptionsURL) {
                    Label("Gérer mon abonnement", systemImage: "gearshape.fill")
                        .font(.subheadline.weight(.semibold))
                        .frame(maxWidth: .infinity, minHeight: 44)
                }
                .accessibilityHint(Text("Ouvre la gestion des abonnements Apple"))
            }
            .frame(maxWidth: .infinity)
        }
        .accessibilityElement(children: .contain)
    }

    private var purchaseCard: some View {
        VStack(spacing: 10) {
            Button {
                Task {
                    if await store.purchasePremium(plan: selectedPlan) {
                        dismiss()
                    }
                }
            } label: {
                HStack(spacing: 10) {
                    if store.purchaseInProgress {
                        ProgressView()
                            .tint(JC.billetPaper)
                        Text("Validation avec Apple…")
                    } else {
                        Text(store.trialLabel(for: selectedPlan) == nil
                             ? "Choisir Premium"
                             : "Commencer l'essai")
                        Spacer(minLength: 8)
                        Text(verbatim: store.displayPrice(for: selectedPlan))
                            .font(JCFont.monoBold(14))
                    }
                }
                .font(.headline)
                .frame(maxWidth: .infinity, minHeight: 54)
                .padding(.horizontal, 17)
                .background(JC.premium, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
                .foregroundStyle(JC.billetPaper)
                .contentShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
            }
            .buttonStyle(PressableStyle())
            .disabled(store.purchaseInProgress || !store.planAvailable(selectedPlan))
            .accessibilityLabel(Text(purchaseAccessibilityLabel))
            .accessibilityValue(Text(billingDisclosure))
            .accessibilityHint(Text("Ouvre la confirmation d'achat Apple"))

            Text(verbatim: billingDisclosure)
                .font(.caption)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
                .fixedSize(horizontal: false, vertical: true)

            Button {
                Task { await store.restorePurchases() }
            } label: {
                Label("Restaurer mes achats", systemImage: "arrow.clockwise")
                    .font(.caption.weight(.semibold))
                    .frame(minHeight: 44)
            }
            .disabled(store.purchaseInProgress)
            .accessibilityHint(Text("Recherche un abonnement acheté avec ton compte Apple"))

            Link(destination: manageSubscriptionsURL) {
                Text("Gérer mes abonnements Apple")
                    .font(.caption.weight(.semibold))
                    .frame(minHeight: 44)
            }
            .accessibilityHint(Text("Ouvre les réglages d'abonnements Apple"))
        }
    }

    private var legalLinks: some View {
        VStack(spacing: 2) {
            Text("En continuant, tu acceptes les conditions applicables et la politique de confidentialité de Dispo.")
                .font(.caption2)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
                .fixedSize(horizontal: false, vertical: true)

            ViewThatFits(in: .horizontal) {
                HStack(spacing: 18) {
                    termsLink
                    privacyLink
                }
                VStack(spacing: 0) {
                    termsLink
                    privacyLink
                }
            }
        }
    }

    private var termsLink: some View {
        Link("Conditions d'utilisation", destination: termsURL)
            .font(.caption.weight(.semibold))
            .frame(minHeight: 44)
    }

    private var privacyLink: some View {
        Link("Confidentialité", destination: privacyURL)
            .font(.caption.weight(.semibold))
            .frame(minHeight: 44)
    }

    private var purchaseAccessibilityLabel: String {
        if store.purchaseInProgress {
            return store.tr("Validation avec Apple")
        }
        if store.trialLabel(for: selectedPlan) != nil {
            return store.tr("Commencer l'essai Premium")
        }
        return store.tr("Choisir Premium")
    }

    private var billingDisclosure: String {
        let price = store.displayPrice(for: selectedPlan)
        let renewal = store.tr("Renouvellement automatique jusqu'à résiliation dans les réglages Apple.")
        let cadence = selectedPlan == .annual ? store.tr("par an") : store.tr("par mois")

        if let trial = store.trialLabel(for: selectedPlan) {
            return "\(trial), puis \(price) \(cadence). \(renewal)"
        }
        return "\(price) \(cadence). \(renewal)"
    }

    private func planAccessibilityLabel(_ plan: PremiumPlan, price: String) -> String {
        let cadence = plan == .annual ? store.tr("par an") : store.tr("par mois")
        return "\(store.tr(plan.title)), \(price) \(cadence)"
    }

    private var annualOfferLabel: String {
        if let savings = store.annualSavingsPercent() {
            return String(format: store.tr("ÉCONOMISE %d %%"), savings)
        }
        return store.tr("RECOMMANDÉ")
    }

    private func planAccessibilityValue(
        _ plan: PremiumPlan,
        isSelected: Bool,
        isAvailable: Bool
    ) -> String {
        var values = [isSelected ? store.tr("Sélectionné") : store.tr("Non sélectionné")]
        if let trial = store.trialLabel(for: plan) {
            values.append(trial)
        }
        if !isAvailable {
            values.append(store.tr("Indisponible"))
        }
        return values.joined(separator: ", ")
    }

    private func select(_ plan: PremiumPlan) {
        guard store.planAvailable(plan) else { return }
        if reduceMotion {
            selectedPlan = plan
        } else {
            withAnimation(.easeOut(duration: 0.14)) {
                selectedPlan = plan
            }
        }
    }

    @MainActor
    private func loadPlans() async {
        guard !isLoadingPlans else { return }
        isLoadingPlans = true
        await store.loadStoreProducts()
        isLoadingPlans = false

        if !store.planAvailable(selectedPlan),
           let firstAvailable = PremiumPlan.allCases.first(where: store.planAvailable) {
            selectedPlan = firstAvailable
        }
    }
}
