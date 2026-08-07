import SwiftUI

/// Onboarding en 4 étapes : langue → concept → pays/ville → profil express.
/// Tout est réglable plus tard dans le profil ; « Passer » garde les défauts.
struct OnboardingView: View {
    @EnvironmentObject private var store: AppStore
    @State private var step = 0

    // Profil express — pré-rempli avec le profil existant.
    @State private var name = ""
    @State private var instruments: Set<Instrument> = []
    @State private var level: Level = .intermediaire
    @State private var country: Country = .switzerland
    @State private var city: City = Country.switzerland.cities[0]
    @State private var citySearch = ""

    private let stepCount = 4

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
            country = store.profile.resolvedCountry
            city = country.cities.first { $0.name == store.profile.resolvedCity }
                ?? country.cities[0]
        }
    }

    // MARK: - Chrome

    private var header: some View {
        HStack {
            LogoView(markSize: 32, wordmarkColor: JC.laiton)
                .padding(.leading)
            Spacer()
            if step > 0 {
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
                Text(step < stepCount - 1 ? "Continuer" : "C'est parti")
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
        .padding(.horizontal, 28)
        .padding(.bottom, 36)
    }

    /// Applique les choix au profil et termine l'onboarding.
    private func finish() {
        let trimmed = name.trimmingCharacters(in: .whitespaces)
        if !trimmed.isEmpty { store.profile.name = trimmed }
        if !instruments.isEmpty {
            store.profile.instruments = Array(instruments).sorted { $0.rawValue < $1.rawValue }
        }
        store.profile.level = level
        store.profile.country = country
        store.profile.city = city.name
        store.profile.postalCode = city.postalCode
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

    /// Villes du pays choisi, filtrées par la recherche (nom ou code postal).
    private var filteredCities: [City] {
        let trimmed = citySearch.trimmingCharacters(in: .whitespaces)
        guard !trimmed.isEmpty else { return country.cities }
        return country.cities.filter {
            $0.name.localizedCaseInsensitiveContains(trimmed)
                || $0.postalCode.localizedCaseInsensitiveContains(trimmed)
        }
    }

    private var regionStep: some View {
        stepLayout(
            icon: "mappin.and.ellipse",
            title: Text("Où joues-tu ?"),
            subtitle: Text("On te montre les musiciens et les concerts autour de toi.")
        ) {
            VStack(spacing: 12) {
                // Pays — rangée défilante de drapeaux
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 8) {
                        ForEach(Country.allCases) { option in
                            Button {
                                withAnimation(.snappy) {
                                    country = option
                                    citySearch = ""
                                    if !option.cities.contains(city) { city = option.cities[0] }
                                }
                            } label: {
                                HStack(spacing: 6) {
                                    Text(option.flag)
                                    Text(LocalizedStringKey(option.nameKey))
                                        .font(.caption.weight(.bold))
                                        .lineLimit(1)
                                }
                                .foregroundStyle(.primary)
                                .padding(.horizontal, 13)
                                .padding(.vertical, 10)
                                .background(
                                    (country == option ? JC.laiton.opacity(0.22) : JC.card),
                                    in: Capsule()
                                )
                                .overlay(
                                    Capsule().stroke((country == option ? JC.laiton.opacity(0.6) : JC.cardStroke), lineWidth: 1)
                                )
                            }
                            .buttonStyle(PressableStyle())
                        }
                    }
                }

                // Recherche de ville (nom ou code postal)
                HStack(spacing: 8) {
                    Image(systemName: "magnifyingglass")
                        .font(.caption.weight(.bold))
                        .foregroundStyle(.secondary)
                    TextField(
                        "",
                        text: $citySearch,
                        prompt: Text("Ville ou code postal…").foregroundStyle(.secondary)
                    )
                    .font(.subheadline)
                    .foregroundStyle(.primary)
                }
                .padding(.horizontal, 13)
                .padding(.vertical, 10)
                .background(JC.card, in: RoundedRectangle(cornerRadius: 12, style: .continuous))

                // Villes du pays choisi, avec code postal
                ScrollView {
                    VStack(spacing: 6) {
                        ForEach(filteredCities) { option in
                            Button {
                                city = option
                            } label: {
                                HStack(spacing: 10) {
                                    Text(option.postalCode)
                                        .font(.caption.weight(.bold))
                                        .foregroundStyle(.secondary)
                                        .frame(width: 52, alignment: .leading)
                                    Text(option.name)
                                        .font(.caption.weight(.bold))
                                        .foregroundStyle(.primary)
                                        .lineLimit(1)
                                    Spacer(minLength: 0)
                                    if city == option {
                                        Image(systemName: "checkmark.circle.fill")
                                            .font(.caption.weight(.bold))
                                            .foregroundStyle(.primary)
                                    }
                                }
                                .padding(.horizontal, 12)
                                .padding(.vertical, 9)
                                .background(
                                    (city == option ? JC.laiton.opacity(0.22) : JC.card),
                                    in: RoundedRectangle(cornerRadius: 12, style: .continuous)
                                )
                            }
                            .buttonStyle(PressableStyle())
                        }
                    }
                }
                .frame(maxHeight: 250)
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
