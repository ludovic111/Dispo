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

            VStack(spacing: 0) {
                HStack {
                    LogoView(markSize: 34)
                        .padding(.leading)
                    Spacer()
                    if page < pages.count - 1 {
                        Button("Passer") { store.completeOnboarding() }
                            .font(.subheadline.weight(.semibold))
                            .foregroundStyle(.white.opacity(0.8))
                            .padding()
                    }
                }
                .padding(.top, 6)

                TabView(selection: $page) {
                    ForEach(pages.indices, id: \.self) { index in
                        VStack(spacing: 28) {
                            ZStack {
                                Circle()
                                    .fill(.white.opacity(0.15))
                                    .frame(width: 170, height: 170)
                                Circle()
                                    .fill(.white.opacity(0.12))
                                    .frame(width: 135, height: 135)
                                Image(systemName: pages[index].icon)
                                    .font(.system(size: 56, weight: .bold))
                                    .foregroundStyle(.white)
                            }
                            Text(pages[index].title)
                                .font(.system(size: 30, weight: .heavy, design: .rounded))
                                .multilineTextAlignment(.center)
                                .foregroundStyle(.white)
                            Text(pages[index].text)
                                .font(.callout)
                                .multilineTextAlignment(.center)
                                .foregroundStyle(.white.opacity(0.85))
                                .padding(.horizontal, 36)
                        }
                        .tag(index)
                    }
                }
                .tabViewStyle(.page(indexDisplayMode: .always))

                Button {
                    if page < pages.count - 1 {
                        withAnimation { page += 1 }
                    } else {
                        store.completeOnboarding()
                    }
                } label: {
                    Text(page < pages.count - 1 ? "Continuer" : "C'est parti 🚨")
                        .font(.headline)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 16)
                        .background(.white, in: RoundedRectangle(cornerRadius: 18))
                        .foregroundStyle(.black)
                }
                .padding(.horizontal, 28)
                .padding(.bottom, 30)
            }
        }
    }
}
