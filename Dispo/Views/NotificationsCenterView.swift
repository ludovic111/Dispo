import SwiftUI

/// Historique des alertes du compte. La puce de l'icône et la cloche
/// utilisent exactement le même nombre de lignes non lues.
struct NotificationsCenterView: View {
    @EnvironmentObject private var store: AppStore
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            ZStack {
                JCBackground()
                if store.notifications.isEmpty {
                    JCEmptyState(
                        icon: "bell.slash",
                        title: "Aucune notification",
                        message: "Les SOS, messages et événements de groupe apparaîtront ici."
                    )
                    .padding(18)
                } else {
                    ScrollView {
                        LazyVStack(spacing: 10) {
                            ForEach(store.notifications) { notification in
                                notificationCard(notification)
                            }
                        }
                        .padding(18)
                    }
                }
            }
            .navigationTitle("Notifications")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Fermer") { dismiss() }
                }
                if store.unreadNotificationCount > 0 {
                    ToolbarItem(placement: .confirmationAction) {
                        Button("Tout lire") { store.markAllNotificationsRead() }
                            .font(.subheadline.weight(.bold))
                    }
                }
            }
            .task { await store.refreshLiveData() }
        }
    }

    private func notificationCard(_ notification: AppNotification) -> some View {
        Button {
            dismiss()
            store.openNotification(notification)
        } label: {
            JCCard(padding: 12) {
                HStack(alignment: .top, spacing: 11) {
                    Image(systemName: symbol(for: notification))
                        .font(.subheadline.weight(.bold))
                        .foregroundStyle(color(for: notification))
                        .frame(width: 34, height: 34)
                        .background(color(for: notification).opacity(0.12), in: Circle())
                    VStack(alignment: .leading, spacing: 3) {
                        HStack(spacing: 6) {
                            Text(notification.title)
                                .font(.subheadline.weight(notification.isUnread ? .bold : .semibold))
                                .foregroundStyle(.primary)
                                .lineLimit(1)
                            if notification.isUnread {
                                Circle()
                                    .fill(color(for: notification))
                                    .frame(width: 7, height: 7)
                            }
                        }
                        Text(notification.body)
                            .font(.caption)
                            .foregroundStyle(.secondary)
                            .multilineTextAlignment(.leading)
                            .lineLimit(3)
                        Text(notification.createdAt.formatted(.relative(presentation: .named)))
                            .font(.caption2)
                            .foregroundStyle(.tertiary)
                    }
                    Spacer(minLength: 0)
                    Image(systemName: "chevron.right")
                        .font(.caption.weight(.bold))
                        .foregroundStyle(.tertiary)
                        .padding(.top, 9)
                }
            }
        }
        .buttonStyle(PressableStyle())
    }

    private func symbol(for notification: AppNotification) -> String {
        switch notification.pushCategory {
        case .sos: return "bolt.fill"
        case .messages: return "bubble.left.and.bubble.right.fill"
        case .groups: return "person.3.fill"
        case nil: return "bell.fill"
        }
    }

    private func color(for notification: AppNotification) -> Color {
        switch notification.pushCategory {
        case .sos: return JC.signal
        case .messages: return JC.bronze
        case .groups: return JC.laiton
        case nil: return JC.laiton
        }
    }
}
