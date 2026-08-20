import SwiftUI

/// Pastille commune aux choix simples et multiples. La coche et le contraste
/// rendent l'état évident sans reposer uniquement sur la couleur.
struct ChoiceChip: View {
    let label: LocalizedStringKey
    var symbol: String? = nil
    let isSelected: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 6) {
                if let symbol { Image(systemName: symbol) }
                Text(label).lineLimit(1)
                if isSelected { Image(systemName: "checkmark") }
            }
            .font(.caption.weight(.bold))
            .foregroundStyle(isSelected ? JC.billetInk : Color.primary)
            .padding(.horizontal, 12)
            .frame(minHeight: 44)
            .background(isSelected ? AnyShapeStyle(JC.hero) : AnyShapeStyle(JC.inset), in: Capsule())
            .overlay(Capsule().stroke(isSelected ? JC.primaryAccent : JC.cardStroke, lineWidth: 1))
            .contentShape(Capsule())
        }
        .buttonStyle(PressableStyle())
        .accessibilityAddTraits(isSelected ? .isSelected : [])
    }
}

/// Badge reconnaissable d'un événement, partagé par les cartes et détails.
struct EventKindBadge: View {
    let kind: GroupEventKind
    var compact = false

    var body: some View {
        HStack(spacing: 5) {
            Image(systemName: kind.symbol)
            if !compact { Text(LocalizedStringKey(kind.rawValue)) }
        }
        .font(.caption2.weight(.heavy))
        .foregroundStyle(JC.primaryAccent)
        .padding(.horizontal, compact ? 7 : 9)
        .padding(.vertical, 5)
        .background(JC.primaryAccent.opacity(0.12), in: Capsule())
        .overlay(Capsule().stroke(JC.primaryAccent.opacity(0.35), lineWidth: 1))
        .accessibilityLabel(Text(LocalizedStringKey(kind.rawValue)))
    }
}
