import SwiftUI

struct EventsView: View {
    @EnvironmentObject private var store: AppStore
    @State private var showCreate = false

    var body: some View {
        NavigationStack {
            ZStack {
                JCBackground()

                ScrollView {
                    VStack(spacing: 16) {
                        HStack {
                            VStack(alignment: .leading, spacing: 3) {
                                Text("SOS dépannage 🚨")
                                    .font(.system(size: 26, weight: .heavy, design: .rounded))
                                Text("\(store.events.count) concerts cherchent un musicien à Genève")
                                    .font(.subheadline)
                                    .foregroundStyle(.secondary)
                            }
                            Spacer()
                        }
                        .padding(.top, 12)

                        createBanner

                        ForEach(store.events) { event in
                            NavigationLink(value: event) {
                                EventCard(event: event)
                            }
                            .buttonStyle(PressableStyle())
                        }
                    }
                    .padding(.horizontal, 18)
                    .padding(.bottom, 24)
                }
            }
            .toolbar(.hidden, for: .navigationBar)
            .navigationDestination(for: GigRequest.self) { EventDetailView(eventID: $0.id) }
            .sheet(isPresented: $showCreate) {
                CreateEventView()
            }
        }
    }

    private var createBanner: some View {
        Button {
            showCreate = true
        } label: {
            HStack(spacing: 12) {
                Image(systemName: "plus.circle.fill")
                    .font(.title2)
                VStack(alignment: .leading, spacing: 2) {
                    Text("Publie ton SOS")
                        .font(.subheadline.weight(.heavy))
                    Text("« Cherche bassiste samedi, Chat Noir, cachet CHF 150 »")
                        .font(.caption)
                        .opacity(0.85)
                }
                Spacer()
                Image(systemName: "chevron.right")
                    .font(.caption.weight(.bold))
            }
            .foregroundStyle(.white)
            .padding(16)
            .background(JC.hero, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
        }
        .buttonStyle(PressableStyle())
    }
}

struct EventCard: View {
    let event: GigRequest

    var body: some View {
        HStack(spacing: 0) {
            // Bloc date coloré par genre
            VStack(spacing: 2) {
                Text(event.date.formatted(.dateTime.day()))
                    .font(.title2.weight(.heavy))
                Text(event.date.formatted(.dateTime.month(.abbreviated)))
                    .font(.caption2.weight(.bold))
                    .textCase(.uppercase)
                Text(event.date.formatted(date: .omitted, time: .shortened))
                    .font(.system(size: 10, weight: .semibold))
                    .opacity(0.85)
            }
            .foregroundStyle(.white)
            .frame(width: 68)
            .frame(maxHeight: .infinity)
            .background(event.genre.gradient)

            VStack(alignment: .leading, spacing: 7) {
                HStack {
                    Text("\(event.genre.emoji) \(event.title)")
                        .font(.subheadline.weight(.bold))
                        .lineLimit(1)
                    Spacer()
                    if event.isMine {
                        TagView(text: "Mon SOS", color: JC.violet)
                    } else if event.applied {
                        TagView(text: "Postulé ✓", color: .green)
                    }
                }
                Label("\(event.place) · \(event.neighborhood)", systemImage: "mappin.and.ellipse")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
                HStack(spacing: 5) {
                    Text("Cherche")
                        .font(.caption2.weight(.bold))
                        .foregroundStyle(.secondary)
                    ForEach(event.wantedInstruments.prefix(2)) { instrument in
                        TagView(text: instrument.rawValue, color: .teal)
                    }
                    TagView(text: "💰 \(event.feeLabel)", color: JC.gold)
                }
            }
            .padding(13)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(JC.card)
        }
        .fixedSize(horizontal: false, vertical: true)
        .clipShape(RoundedRectangle(cornerRadius: 20, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 20, style: .continuous).stroke(JC.cardStroke, lineWidth: 1))
        .shadow(color: JC.cardShadow, radius: 14, x: 0, y: 8)
    }
}

struct EventDetailView: View {
    @EnvironmentObject private var store: AppStore
    let eventID: GigRequest.ID

    private var event: GigRequest? {
        store.events.first(where: { $0.id == eventID })
    }

    var body: some View {
        if let event {
            ZStack {
                JCBackground()

                ScrollView {
                    VStack(alignment: .leading, spacing: 16) {
                        // Bandeau photo du genre
                        ZStack {
                            GenreCover(genre: event.genre)
                                .frame(height: 130)
                                .clipShape(RoundedRectangle(cornerRadius: 26))
                            VStack(spacing: 5) {
                                Text(event.title)
                                    .font(.title3.weight(.heavy))
                                    .multilineTextAlignment(.center)
                                Text("Publié par \(event.hostName)")
                                    .font(.caption.weight(.medium))
                                    .opacity(0.9)
                            }
                            .foregroundStyle(.white)
                            .padding(.horizontal)
                        }
                        .padding(.top, 8)

                        JCCard {
                            VStack(alignment: .leading, spacing: 11) {
                                Label(event.date.formatted(date: .complete, time: .shortened), systemImage: "calendar")
                                Label("\(event.place) · \(event.neighborhood)", systemImage: "mappin.and.ellipse")
                                Label("\(event.genre.rawValue) — \(event.genre.codes.joined(separator: ", "))", systemImage: "music.quarternote.3")
                                Label("Cachet : \(event.feeLabel)", systemImage: "banknote")
                                    .foregroundStyle(JC.gold)
                            }
                            .font(.subheadline)
                        }

                        JCCard {
                            VStack(alignment: .leading, spacing: 10) {
                                Text("Musicien recherché")
                                    .font(.subheadline.weight(.heavy))
                                    .foregroundStyle(JC.coral)
                                HStack {
                                    ForEach(event.wantedInstruments) { instrument in
                                        TagView(text: instrument.rawValue, color: .teal)
                                    }
                                }
                            }
                        }

                        JCCard {
                            VStack(alignment: .leading, spacing: 8) {
                                Text("Description")
                                    .font(.subheadline.weight(.heavy))
                                    .foregroundStyle(JC.coral)
                                Text(event.descriptionText)
                                    .font(.subheadline)
                                    .foregroundStyle(.primary.opacity(0.9))
                            }
                        }
                    }
                    .padding(.horizontal, 18)
                    .padding(.bottom, 90)
                }
            }
            .navigationTitle("SOS dépannage")
            .navigationBarTitleDisplayMode(.inline)
            .toolbarBackground(JC.bg, for: .navigationBar)
            .safeAreaInset(edge: .bottom) {
                if !event.isMine {
                    Button {
                        store.toggleApply(event)
                    } label: {
                        Label(
                            event.applied ? "Retirer ma candidature" : "Je peux dépanner !",
                            systemImage: event.applied ? "xmark.circle" : "bolt.fill"
                        )
                        .font(.headline)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 15)
                        .background(
                            event.applied
                                ? AnyShapeStyle(JC.card)
                                : AnyShapeStyle(JC.hero),
                            in: RoundedRectangle(cornerRadius: 18, style: .continuous)
                        )
                        .foregroundStyle(event.applied ? Color.primary : Color.white)
                    }
                    .buttonStyle(PressableStyle())
                    .padding(.horizontal, 18)
                    .padding(.vertical, 10)
                    .background(.ultraThinMaterial)
                }
            }
        }
    }
}
