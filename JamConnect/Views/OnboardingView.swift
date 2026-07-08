import SwiftUI

/// Onboarding en 3 écrans — explique le concept dès la première ouverture.
struct OnboardingView: View {
    @EnvironmentObject private var store: AppStore
    @State private var page = 0

    private struct Page {
        let icon: String
        let title: String
        let text: String
    }

    private let pages: [Page] = [
        Page(
            icon: "bolt.fill",
            title: "Un musicien\nte lâche ?",
            text: "Malade, en retard, désisté… Trouve en quelques minutes un remplaçant fiable près de toi à Genève, par instrument, style et niveau."
        ),
        Page(
            icon: "video.fill",
            title: "Écoute avant\nd'engager",
            text: "Chaque profil a une vidéo de 60–90 secondes. Tu entends le niveau et le style avant de confier ton concert — zéro mauvaise surprise."
        ),
        Page(
            icon: "megaphone.fill",
            title: "Publie ton SOS\nen 30 secondes",
            text: "« Cherche bassiste pour samedi, Chat Noir, cachet CHF 150. » Les musiciens dispo répondent direct."
        )
    ]

    var body: some View {
        ZStack {
            JC.hero.ignoresSafeArea()

            // Halos décoratifs
            GeometryReader { geo in
                Circle()
                    .fill(.white.opacity(0.08))
                    .frame(width: geo.size.width * 0.7)
                    .blur(radius: 60)
                    .position(x: geo.size.width * 0.85, y: geo.size.height * 0.15)
            }
            .allowsHitTesting(false)

            VStack(spacing: 0) {
                HStack {
                    LogoView(markSize: 32, wordmarkColor: .white)
                        .padding(.leading)
                    Spacer()
                    if page < pages.count - 1 {
                        Button("Passer") { store.completeOnboarding() }
                            .font(.subheadline.weight(.semibold))
                            .foregroundStyle(.white.opacity(0.75))
                            .padding()
                    }
                }
                .padding(.top, 6)

                TabView(selection: $page) {
                    ForEach(pages.indices, id: \.self) { index in
                        VStack(spacing: 32) {
                            ZStack {
                                Circle()
                                    .stroke(.white.opacity(0.15), lineWidth: 1)
                                    .frame(width: 160, height: 160)
                                Circle()
                                    .fill(.white.opacity(0.1))
                                    .frame(width: 120, height: 120)
                                Image(systemName: pages[index].icon)
                                    .font(.system(size: 48, weight: .semibold))
                                    .foregroundStyle(.white)
                                    .symbolEffect(.pulse, options: .repeating.speed(0.4), value: page == index)
                            }
                            VStack(spacing: 14) {
                                Text(pages[index].title)
                                    .font(.system(size: 32, weight: .bold))
                                    .multilineTextAlignment(.center)
                                    .foregroundStyle(.white)
                                    .tracking(-0.5)
                                Text(pages[index].text)
                                    .font(.body)
                                    .multilineTextAlignment(.center)
                                    .foregroundStyle(.white.opacity(0.82))
                                    .lineSpacing(4)
                                    .padding(.horizontal, 32)
                            }
                        }
                        .tag(index)
                    }
                }
                .tabViewStyle(.page(indexDisplayMode: .always))
                .animation(.snappy, value: page)

                Button {
                    if page < pages.count - 1 {
                        withAnimation(.snappy) { page += 1 }
                    } else {
                        store.completeOnboarding()
                    }
                } label: {
                    HStack(spacing: 8) {
                        Text(page < pages.count - 1 ? "Continuer" : "C'est parti")
                            .font(.headline)
                        if page == pages.count - 1 {
                            Image(systemName: "bolt.fill")
                                .font(.subheadline.weight(.bold))
                        }
                    }
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 17)
                    .background(.white, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
                    .foregroundStyle(.black)
                }
                .buttonStyle(PressableStyle())
                .padding(.horizontal, 28)
                .padding(.bottom, 36)
            }
        }
    }
}
