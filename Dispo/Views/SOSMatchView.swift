import SwiftUI

/// Écran affiché juste après la publication d'un SOS : le résultat du
/// matching. Montre les musiciens compatibles (bon instrument + dispo, ceux
/// qui ont coché la date du concert en premier) — ou explique honnêtement
/// que personne ne matche encore et que l'annonce attend les prochaines
/// dispos cochées.
struct SOSMatchView: View {
    @EnvironmentObject private var store: AppStore
    let gig: GigRequest
    var onClose: () -> Void

    private var matches: [SOSMatch] { store.matches(for: gig) }
    private var confirmed: [SOSMatch] { matches.filter(\.dateConfirmed) }
    private var onRequest: [SOSMatch] { matches.filter { !$0.dateConfirmed } }

    /// « samedi 12 juillet » — la date du concert en toutes lettres.
    private var gigDayLabel: String {
        gig.date.formatted(.dateTime.weekday(.wide).day().month(.wide))
    }

    private var wantedLabel: String {
        gig.wantedInstruments.map { store.tr($0.rawValue) }.joined(separator: " / ")
    }

    var body: some View {
        ZStack {
            JCBackground()

            ScrollView {
                VStack(spacing: 18) {
                    header

                    if matches.isEmpty {
                        waitingCard
                    } else {
                        if confirmed.isEmpty {
                            noConfirmedBanner
                        } else {
                            confirmedSection
                        }
                        if !onRequest.isEmpty {
                            onRequestSection
                        }
                    }
                }
                .padding(.horizontal, 18)
                .padding(.bottom, 90)
            }
        }
        .navigationTitle("SOS publié")
        .navigationBarTitleDisplayMode(.inline)
        .toolbarBackground(JC.bg, for: .navigationBar)
        .navigationDestination(for: Musician.self) { MusicianDetailView(musician: $0) }
        .safeAreaInset(edge: .bottom) {
            Button(action: onClose) {
                Text("Terminé")
                    .font(.headline)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 15)
                    .background(JC.hero, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
                    .foregroundStyle(.white)
            }
            .buttonStyle(PressableStyle())
            .padding(.horizontal, 18)
            .padding(.vertical, 10)
            .background(.ultraThinMaterial)
        }
    }

    // MARK: - En-tête

    private var header: some View {
        VStack(spacing: 10) {
            ZStack {
                Circle()
                    .fill(JC.hero)
                    .frame(width: 64, height: 64)
                Image(systemName: "bolt.badge.checkmark.fill")
                    .font(.title2.weight(.bold))
                    .foregroundStyle(.white)
            }
            Text("Ton SOS est en ligne !")
                .font(.title3.weight(.heavy))
            Text(verbatim: "\(wantedLabel) · \(gigDayLabel)")
                .font(.caption.weight(.semibold))
                .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity)
        .padding(.top, 12)
    }

    // MARK: - Musiciens qui ont coché la date

    private var confirmedSection: some View {
        JCCard {
            VStack(alignment: .leading, spacing: 12) {
                Text("🎯 Dispo ce jour-là : \(confirmed.count)")
                    .font(.subheadline.weight(.heavy))
                    .foregroundStyle(JC.coral)
                Text("Ces musiciens jouent l'instrument que tu cherches et sont dispo le \(gigDayLabel). Contacte-les sans attendre.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                ForEach(confirmed) { match in
                    NavigationLink(value: match.musician) {
                        SOSMatchRow(match: match, gig: gig)
                    }
                    .buttonStyle(PressableStyle())
                }
            }
        }
    }

    /// Il y a des profils compatibles, mais aucun n'a coché la date exacte.
    private var noConfirmedBanner: some View {
        JCCard {
            VStack(alignment: .leading, spacing: 8) {
                Label("Personne n'a coché le \(gigDayLabel) pour l'instant", systemImage: "calendar.badge.clock")
                    .font(.subheadline.weight(.bold))
                Text("Ton annonce reste en tête du feed : dès qu'un musicien compatible coche cette date dans son calendrier, il la verra. En attendant, tente ta chance auprès des profils « sur demande » ci-dessous.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        }
    }

    // MARK: - Compatibles « sur demande »

    private var onRequestSection: some View {
        JCCard {
            VStack(alignment: .leading, spacing: 12) {
                Text("🤙 À tenter au cas où")
                    .font(.subheadline.weight(.heavy))
                    .foregroundStyle(JC.violet)
                Text("Bon instrument, mais la date du concert n'est pas dans leurs dispos — un message direct peut débloquer la situation.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                ForEach(onRequest) { match in
                    NavigationLink(value: match.musician) {
                        SOSMatchRow(match: match, gig: gig)
                    }
                    .buttonStyle(PressableStyle())
                }
            }
        }
    }

    // MARK: - Aucun match : on l'assume

    private var waitingCard: some View {
        JCCard {
            VStack(alignment: .leading, spacing: 12) {
                Label("Personne de compatible… pour l'instant", systemImage: "hourglass")
                    .font(.subheadline.weight(.heavy))
                Text("Aucun musicien \(wantedLabel) n'est dispo autour du \(gigDayLabel) en ce moment. Ton annonce est en ligne et visible par tous : dès que quelqu'un de compatible coche cette date dans son calendrier, il la verra en tête du feed.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                Divider()
                VStack(alignment: .leading, spacing: 6) {
                    Text("Pour mettre toutes les chances de ton côté :")
                        .font(.caption.weight(.bold))
                    Label("Ajoute un instrument proche (ex. synthé en plus du piano)", systemImage: "plus.circle")
                    Label("Affiche un cachet — ces annonces reçoivent plus de candidatures", systemImage: "banknote")
                }
                .font(.caption)
                .foregroundStyle(.secondary)
            }
        }
    }
}

/// Ligne d'un musicien compatible (résultat de matching / annonce).
struct SOSMatchRow: View {
    @EnvironmentObject private var store: AppStore
    let match: SOSMatch
    let gig: GigRequest

    /// Les instruments du musicien qui répondent à l'annonce.
    private var matchedInstruments: String {
        match.musician.instruments
            .filter(gig.wantedInstruments.contains)
            .map { store.tr($0.rawValue) }
            .joined(separator: ", ")
    }

    var body: some View {
        HStack(spacing: 11) {
            AvatarView(name: match.musician.name, size: 44, photo: match.musician.photo)
            VStack(alignment: .leading, spacing: 3) {
                HStack(spacing: 6) {
                    Text(match.musician.name)
                        .font(.subheadline.weight(.bold))
                        .foregroundStyle(.primary)
                        .lineLimit(1)
                    SocialLinkBadge(link: store.socialLink(with: match.musician.name))
                }
                // Le niveau ne s'affiche qu'en Premium.
                Text(store.showsPremium
                     ? "\(matchedInstruments) · \(store.tr(match.musician.level.rawValue))"
                     : matchedInstruments)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
            }
            Spacer(minLength: 0)
            if match.dateConfirmed {
                TagView(text: "Dispo ✓", color: .green)
            } else {
                TagView(text: "Sur demande", color: JC.violet)
            }
            inviteButton
        }
        .padding(.vertical, 3)
        .contentShape(Rectangle())
    }

    /// Le geste clé : inviter ce musicien à l'événement, en un tap.
    /// Envoie un message pré-rempli (titre, date, lieu, cachet).
    private var inviteButton: some View {
        Button {
            guard !store.hasInvited(match.musician, to: gig) else { return }
            Task { await store.invite(match.musician, to: gig) }
        } label: {
            if store.hasInvited(match.musician, to: gig) {
                Label("Invité", systemImage: "checkmark")
                    .font(.caption2.weight(.heavy))
                    .padding(.horizontal, 10)
                    .padding(.vertical, 7)
                    .background(Color.green.opacity(0.15), in: Capsule())
                    .foregroundStyle(.green)
            } else {
                Label("Inviter", systemImage: "paperplane.fill")
                    .font(.caption2.weight(.heavy))
                    .padding(.horizontal, 10)
                    .padding(.vertical, 7)
                    .background(JC.hero, in: Capsule())
                    .foregroundStyle(.white)
            }
        }
        .buttonStyle(PressableStyle())
    }
}
