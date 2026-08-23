import SwiftUI

/// Repère de jour lisible au milieu d'un échange, comme dans les apps de
/// messagerie natives. L'heure reste affichée sous chaque bulle.
struct MessageDayDivider: View {
    @EnvironmentObject private var store: AppStore
    let date: Date

    var body: some View {
        HStack(spacing: 10) {
            Capsule().fill(JC.cardStroke).frame(height: 1)
            Text(label)
                .font(.caption2.weight(.semibold))
                .foregroundStyle(.secondary)
                .padding(.horizontal, 10)
                .padding(.vertical, 5)
                .background(.thinMaterial, in: Capsule())
            Capsule().fill(JC.cardStroke).frame(height: 1)
        }
        .padding(.vertical, 4)
        .accessibilityAddTraits(.isHeader)
    }

    private var label: String {
        let calendar = Calendar.autoupdatingCurrent
        if calendar.isDateInToday(date) { return store.tr("Aujourd'hui") }
        if calendar.isDateInYesterday(date) { return store.tr("Hier") }
        let formatter = DateFormatter()
        formatter.locale = store.language.locale
        formatter.setLocalizedDateFormatFromTemplate("EEEE d MMMM")
        return formatter.string(from: date).capitalized(with: store.language.locale)
    }
}

struct MessageReactionBar: View {
    @EnvironmentObject private var store: AppStore
    let reactions: [MessageReaction]
    let onTap: (String) -> Void

    var body: some View {
        if !reactions.isEmpty {
            HStack(spacing: 5) {
                ForEach(reactions) { reaction in
                    Button {
                        onTap(reaction.emoji)
                    } label: {
                        HStack(spacing: 3) {
                            Text(reaction.emoji)
                            if reaction.count > 1 {
                                Text("\(reaction.count)")
                                    .font(.caption2.weight(.bold))
                                    .monospacedDigit()
                            }
                        }
                        .padding(.horizontal, 8)
                        .padding(.vertical, 4)
                        .background(
                            reaction.isMine ? JC.electric.opacity(0.18) : JC.card,
                            in: Capsule()
                        )
                        .overlay(
                            Capsule().stroke(
                                reaction.isMine ? JC.electric.opacity(0.65) : JC.cardStroke,
                                lineWidth: 1
                            )
                        )
                    }
                    .buttonStyle(PressableStyle())
                    .accessibilityLabel(
                        Text(
                            "\(reaction.emoji), "
                                + String(
                                    format: store.tr("%lld réaction(s)"),
                                    Int64(reaction.count)
                                )
                        )
                    )
                }
            }
        }
    }
}

struct MessageActionsMenu: View {
    let isMine: Bool
    let canEdit: Bool
    let onReact: (String) -> Void
    let onEdit: () -> Void
    let onDelete: () -> Void

    var body: some View {
        Menu {
            ForEach(MessageReaction.choices, id: \.self) { emoji in
                Button(emoji) { onReact(emoji) }
            }
        } label: {
            Label("Réagir", systemImage: "face.smiling")
        }
        if isMine {
            if canEdit {
                Button(action: onEdit) {
                    Label("Modifier", systemImage: "pencil")
                }
            }
            Button(role: .destructive, action: onDelete) {
                Label("Supprimer pour tout le monde", systemImage: "trash")
            }
        }
    }
}

struct MessageEditSheet: View {
    @Environment(\.dismiss) private var dismiss
    @State private var text: String
    let onSave: (String) -> Void

    init(text: String, onSave: @escaping (String) -> Void) {
        _text = State(initialValue: text)
        self.onSave = onSave
    }

    var body: some View {
        NavigationStack {
            ZStack {
                JCBackground()
                VStack(alignment: .leading, spacing: 12) {
                    Text("Corrige ton message")
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(.secondary)
                    TextField("Ton message…", text: $text, axis: .vertical)
                        .lineLimit(2...8)
                        .padding(14)
                        .background(JC.card, in: RoundedRectangle(cornerRadius: 16))
                        .overlay(
                            RoundedRectangle(cornerRadius: 16)
                                .stroke(JC.cardStroke, lineWidth: 1)
                        )
                    Text("\(text.count)/4000")
                        .font(.caption2.monospacedDigit())
                        .foregroundStyle(text.count > 4000 ? Color.red : Color.secondary)
                        .frame(maxWidth: .infinity, alignment: .trailing)
                    Spacer()
                }
                .padding()
            }
            .navigationTitle("Modifier le message")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Annuler") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Enregistrer") {
                        onSave(text.trimmingCharacters(in: .whitespacesAndNewlines))
                        dismiss()
                    }
                    .fontWeight(.semibold)
                    .disabled(
                        text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
                        || text.count > 4000
                    )
                }
            }
        }
        .presentationDetents([.medium])
    }
}
