import SwiftUI

/// Onboarding en 4 étapes : langue → concept → pays/ville → profil express.
/// Tout est réglable plus tard dans le profil. Aucun contenu utilisateur n'est
/// prérempli ou publié tant que la personne ne l'a pas choisi elle-même.
struct OnboardingView: View {
    @EnvironmentObject private var store: AppStore
    @State private var step = 0

    // Profil express — pré-rempli avec le profil existant.
    @State private var name = ""
    @State private var instruments: Set<Instrument> = []
    @State private var level: Level = .intermediaire
    @State private var country: Country = .switzerland
    @State private var postalCode = ""
    @State private var city = ""

    private let stepCount = 4

    private var isRequiredProfileSetup: Bool {
        store.liveProfileNeedsSetup || LiveProfileSetupPolicy.requiresSetup(
            name: name,
            instrumentCount: instruments.count,
            city: city,
            postalCode: postalCode
        )
    }

    private var canFinishRequiredLiveSetup: Bool {
        LiveProfileSetupPolicy.canComplete(
            name: name,
            instrumentCount: instruments.count,
            city: city,
            postalCode: postalCode
        )
    }

    var body: some View {
        ZStack {
            JCBackground()

            // Halo décoratif — lueur laiton de scène.
            GeometryReader { geo in
                Circle()
                    .fill(JC.laiton.opacity(0.12))
                    .frame(width: geo.size.width * 0.7)
                    .blur(radius: 60)
                    .position(x: geo.size.width * 0.85, y: geo.size.height * 0.15)
            }
            .allowsHitTesting(false)

            VStack(spacing: 0) {
                header
                progressBar

                TabView(selection: $step) {
                    languageStep.tag(0)
                    conceptStep.tag(1)
                    regionStep.tag(2)
                    profileStep.tag(3)
                }
                .tabViewStyle(.page(indexDisplayMode: .never))
                .animation(.snappy, value: step)

                continueButton
            }
        }
        .onAppear {
            name = store.profile.name
            instruments = Set(store.profile.instruments)
            level = store.profile.level
            country = store.profile.country ?? store.preferredCountry
            postalCode = store.profile.postalCode ?? ""
            city = store.profile.city ?? ""
            store.requestLocation()
        }
    }

    // MARK: - Chrome

    private var header: some View {
        HStack {
            LogoView(markSize: 32, wordmarkColor: JC.laiton)
                .padding(.leading)
            Spacer()
            if step > 0 && !isRequiredProfileSetup {
                Button("Passer") { finish() }
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(.secondary)
                    .padding()
            }
        }
        .padding(.top, 6)
    }

    private var progressBar: some View {
        HStack(spacing: 6) {
            ForEach(0..<stepCount, id: \.self) { index in
                Capsule()
                    .fill(index <= step ? JC.laiton : JC.laiton.opacity(0.22))
                    .frame(height: 4)
            }
        }
        .padding(.horizontal, 28)
        .padding(.top, 4)
        .animation(.snappy, value: step)
    }

    private var continueButton: some View {
        Button {
            if step < stepCount - 1 {
                withAnimation(.snappy) { step += 1 }
            } else {
                finish()
            }
        } label: {
            HStack(spacing: 8) {
                Text(step < stepCount - 1
                     ? LocalizedStringKey("Continuer")
                     : LocalizedStringKey("C'est parti"))
                    .font(.headline)
                if step == stepCount - 1 {
                    Image(systemName: "bolt.fill")
                        .font(.subheadline.weight(.bold))
                }
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 17)
            .background(JC.hero, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
            .foregroundStyle(JC.billetInk)
        }
        .buttonStyle(PressableStyle())
        .disabled(
            (step == 2 && !PlaceDraft(country: country, postalCode: postalCode, city: city).isComplete)
                || (step == stepCount - 1 && isRequiredProfileSetup && !canFinishRequiredLiveSetup)
        )
        .opacity(
            (step == 2 && !PlaceDraft(country: country, postalCode: postalCode, city: city).isComplete)
                || (step == stepCount - 1 && isRequiredProfileSetup && !canFinishRequiredLiveSetup)
                ? 0.55 : 1
        )
        .padding(.horizontal, 28)
        .padding(.bottom, 36)
    }

    /// Applique les choix au profil et termine l'onboarding.
    private func finish() {
        if isRequiredProfileSetup && !canFinishRequiredLiveSetup { return }
        let trimmed = name.trimmingCharacters(in: .whitespaces)
        if !trimmed.isEmpty { store.profile.name = trimmed }
        if !instruments.isEmpty {
            store.profile.instruments = Array(instruments).sorted { $0.rawValue < $1.rawValue }
        }
        store.profile.level = level
        store.profile.country = country
        if !city.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            store.profile.city = city.trimmingCharacters(in: .whitespacesAndNewlines)
        }
        if !postalCode.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            store.profile.postalCode = postalCode.trimmingCharacters(in: .whitespacesAndNewlines).uppercased()
        }
        store.saveProfile()
        store.completeOnboarding()
    }

    // MARK: - Étape 1 : langue

    private var languageStep: some View {
        stepLayout(
            icon: "globe",
            title: Text("Choisis ta langue"),
            subtitle: Text("Tu pourras la changer à tout moment dans ton profil.")
        ) {
            VStack(spacing: 10) {
                ForEach(AppLanguage.allCases) { lang in
                    Button {
                        store.setLanguage(lang)
                    } label: {
                        HStack(spacing: 12) {
                            Text(lang.flag)
                                .font(.title3)
                            Text(lang.nativeName)
                                .font(.subheadline.weight(.bold))
                            Spacer()
                            if store.language == lang {
                                Image(systemName: "checkmark.circle.fill")
                                    .font(.body.weight(.bold))
                            }
                        }
                        .foregroundStyle(.primary)
                        .padding(.horizontal, 16)
                        .padding(.vertical, 12)
                        .background(
                            (store.language == lang ? JC.laiton.opacity(0.22) : JC.card),
                            in: RoundedRectangle(cornerRadius: 14, style: .continuous)
                        )
                        .overlay(
                            RoundedRectangle(cornerRadius: 14, style: .continuous)
                                .stroke((store.language == lang ? JC.laiton.opacity(0.6) : JC.cardStroke), lineWidth: 1)
                        )
                    }
                    .buttonStyle(PressableStyle())
                }
            }
        }
    }

    // MARK: - Étape 2 : le concept

    private var conceptStep: some View {
        stepLayout(
            icon: "bolt.fill",
            title: Text("Un musicien te lâche ?"),
            subtitle: Text("Dispo trouve un remplaçant fiable en quelques minutes.")
        ) {
            VStack(spacing: 14) {
                conceptRow(
                    icon: "bolt.fill",
                    title: Text("SOS en 30 secondes"),
                    text: Text("Publie « cherche bassiste samedi » — les musiciens dispo et compatibles répondent direct.")
                )
                conceptRow(
                    icon: "video.fill",
                    title: Text("Écoute avant d'engager"),
                    text: Text("Ajoute des vidéos de démo à ton profil. On entend le niveau et le style — zéro mauvaise surprise.")
                )
                conceptRow(
                    icon: "person.2.fill",
                    title: Text("Ton réseau d'abord"),
                    text: Text("Suis les musiciens fiables : tes amis et abonnés remontent en premier dans tes recherches.")
                )
            }
        }
    }

    private func conceptRow(icon: String, title: Text, text: Text) -> some View {
        HStack(alignment: .top, spacing: 14) {
            ZStack {
                RoundedRectangle(cornerRadius: 12, style: .continuous)
                    .fill(JC.laiton.opacity(0.15))
                    .frame(width: 42, height: 42)
                Image(systemName: icon)
                    .font(.body.weight(.semibold))
                    .foregroundStyle(.primary)
            }
            VStack(alignment: .leading, spacing: 3) {
                title
                    .font(.subheadline.weight(.heavy))
                    .foregroundStyle(.primary)
                text
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .lineSpacing(2)
            }
            Spacer(minLength: 0)
        }
        .padding(14)
        .background(JC.card, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
    }

    // MARK: - Étape 3 : pays & ville

    private var regionStep: some View {
        stepLayout(
            icon: "mappin.and.ellipse",
            title: Text("Où joues-tu ?"),
            subtitle: Text("On te montre les musiciens et les concerts autour de toi.")
        ) {
            VStack(alignment: .leading, spacing: 12) {
                CountryPostalField(
                    country: $country,
                    postalCode: $postalCode,
                    city: $city,
                    detectedCountry: store.detectedCountry
                )
                .padding(14)
                .background(JC.card, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
                .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous).stroke(JC.cardStroke))

                Label("Entre ton code postal, c'est tout.", systemImage: "sparkles")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(JC.secondaryText)
            }
        }
    }

    // MARK: - Étape 4 : profil express

    private var profileStep: some View {
        stepLayout(
            icon: "person.crop.circle.badge.checkmark",
            title: Text("Présente-toi"),
            subtitle: Text("Nom, instruments, niveau — le reste se complète plus tard.")
        ) {
            VStack(spacing: 14) {
                TextField("", text: $name, prompt: Text("Ton nom de scène").foregroundStyle(.secondary))
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(.primary)
                    .padding(14)
                    .background(JC.card, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                    .overlay(
                        RoundedRectangle(cornerRadius: 14, style: .continuous)
                            .stroke(JC.cardStroke, lineWidth: 1)
                    )

                ScrollView {
                    let columns = [GridItem(.flexible()), GridItem(.flexible()), GridItem(.flexible())]
                    VStack(alignment: .leading, spacing: 10) {
                        // Instruments groupés par famille
                        ForEach(InstrumentCategory.allCases) { category in
                            HStack(spacing: 6) {
                                Image(systemName: category.symbol)
                                    .font(.system(size: 9, weight: .bold))
                                Text(LocalizedStringKey(category.rawValue))
                                    .font(.caption2.weight(.heavy))
                            }
                            .foregroundStyle(.secondary)
                            LazyVGrid(columns: columns, spacing: 8) {
                                ForEach(Instrument.instruments(in: category)) { instrument in
                                    let isOn = instruments.contains(instrument)
                                    Button {
                                        if isOn { instruments.remove(instrument) } else { instruments.insert(instrument) }
                                    } label: {
                                        Text(LocalizedStringKey(instrument.rawValue))
                                            .font(.caption.weight(.bold))
                                            .lineLimit(1)
                                            .minimumScaleFactor(0.7)
                                            .foregroundStyle(.primary)
                                            .frame(maxWidth: .infinity)
                                            .padding(.vertical, 10)
                                            .background((isOn ? JC.laiton.opacity(0.22) : JC.card), in: Capsule())
                                            .overlay(Capsule().stroke((isOn ? JC.laiton.opacity(0.6) : JC.cardStroke), lineWidth: 1))
                                    }
                                    .buttonStyle(PressableStyle())
                                }
                            }
                        }
                    }
                }
                .frame(maxHeight: 220)

                HStack(spacing: 8) {
                    ForEach(Level.allCases) { option in
                        Button {
                            level = option
                        } label: {
                            Text(LocalizedStringKey(option.label))
                                .font(.caption2.weight(.bold))
                                .lineLimit(1)
                                .minimumScaleFactor(0.6)
                                .foregroundStyle(.primary)
                                .frame(maxWidth: .infinity)
                                .padding(.vertical, 10)
                                .background((level == option ? JC.laiton.opacity(0.22) : JC.card), in: Capsule())
                                .overlay(Capsule().stroke((level == option ? JC.laiton.opacity(0.6) : JC.cardStroke), lineWidth: 1))
                        }
                        .buttonStyle(PressableStyle())
                    }
                }
            }
        }
    }

    // MARK: - Gabarit d'étape

    private func stepLayout<Content: View>(
        icon: String,
        title: Text,
        subtitle: Text,
        @ViewBuilder content: () -> Content
    ) -> some View {
        VStack(spacing: 20) {
            VStack(spacing: 10) {
                ZStack {
                    Circle()
                        .fill(JC.laiton.opacity(0.14))
                        .frame(width: 64, height: 64)
                    Image(systemName: icon)
                        .font(.title2.weight(.semibold))
                        .foregroundStyle(.primary)
                }
                title
                    .font(.title2.weight(.heavy))
                    .multilineTextAlignment(.center)
                    .foregroundStyle(.primary)
                subtitle
                    .font(.caption)
                    .multilineTextAlignment(.center)
                    .foregroundStyle(.secondary)
                    .padding(.horizontal, 24)
            }
            content()
            Spacer(minLength: 0)
        }
        .padding(.horizontal, 24)
        .padding(.top, 18)
    }
}
