import UIKit
import UserNotifications

extension Notification.Name {
    static let dispoDidReceivePushToken = Notification.Name("dispo.didReceivePushToken")
    static let dispoDidFailPushRegistration = Notification.Name("dispo.didFailPushRegistration")
    static let dispoDidOpenPush = Notification.Name("dispo.didOpenPush")
}

/// Pont UIKit → SwiftUI pour APNs. Le token reste uniquement en mémoire puis
/// est transmis au backend ; Apple recommande de ne jamais le mettre en cache.
final class DispoAppDelegate: NSObject, UIApplicationDelegate, UNUserNotificationCenterDelegate {
    func application(
        _ application: UIApplication,
        didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
    ) -> Bool {
        UNUserNotificationCenter.current().delegate = self
        return true
    }

    func application(
        _ application: UIApplication,
        didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data
    ) {
        let token = deviceToken.map { String(format: "%02x", $0) }.joined()
        NotificationCenter.default.post(name: .dispoDidReceivePushToken, object: token)
    }

    func application(
        _ application: UIApplication,
        didFailToRegisterForRemoteNotificationsWithError error: Error
    ) {
        NotificationCenter.default.post(
            name: .dispoDidFailPushRegistration,
            object: error.localizedDescription
        )
    }

    func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        willPresent notification: UNNotification
    ) async -> UNNotificationPresentationOptions {
        [.banner, .list, .sound, .badge]
    }

    func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        didReceive response: UNNotificationResponse
    ) async {
        await MainActor.run {
            NotificationCenter.default.post(
                name: .dispoDidOpenPush,
                object: nil,
                userInfo: response.notification.request.content.userInfo
            )
        }
    }
}

enum AppTab: String, Hashable {
    case home
    case sos
    case messages
    case profile
}

enum PushCategory: String, CaseIterable, Identifiable, Codable {
    case sos
    case messages
    case groups

    var id: String { rawValue }
}

struct PushPreferences: Codable, Equatable {
    var sos = true
    var messages = true
    var groups = true

    func isEnabled(_ category: PushCategory) -> Bool {
        switch category {
        case .sos: return sos
        case .messages: return messages
        case .groups: return groups
        }
    }

    mutating func set(_ enabled: Bool, for category: PushCategory) {
        switch category {
        case .sos: sos = enabled
        case .messages: messages = enabled
        case .groups: groups = enabled
        }
    }
}
