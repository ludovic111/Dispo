import Foundation

/// Configuration du backend Supabase, lue depuis `Secrets.plist` (gitignoré).
/// Absente → l'app tourne en mode démo local, comme avant.
///
/// `Secrets.example.plist` documente le format. En dev local :
///   SUPABASE_URL     = http://<ip-du-mac>:54321   (supabase start)
///   SUPABASE_ANON_KEY = <anon key de `supabase status`>
struct BackendConfig {
    let url: URL
    let anonKey: String

    /// nil si Secrets.plist est absent ou incomplet (mode démo).
    static func load() -> BackendConfig? {
        guard let dict = secrets(),
              let urlString = dict["SUPABASE_URL"] as? String,
              let url = URL(string: urlString),
              let key = dict["SUPABASE_ANON_KEY"] as? String,
              !key.isEmpty
        else { return nil }
        return BackendConfig(url: url, anonKey: key)
    }

    /// Clé API publique RevenueCat (achats intégrés). nil : repli StoreKit pur.
    static func revenueCatAPIKey() -> String? {
        guard let key = secrets()?["REVENUECAT_API_KEY"] as? String, !key.isEmpty else { return nil }
        return key
    }

    private static func secrets() -> [String: Any]? {
        guard let plistURL = Bundle.main.url(forResource: "Secrets", withExtension: "plist"),
              let data = try? Data(contentsOf: plistURL)
        else { return nil }
        return try? PropertyListSerialization.propertyList(from: data, format: nil) as? [String: Any]
    }
}
