import CoreLocation

/// Position de l'utilisateur pour le rayon de recherche et la carte. La
/// coordonnée est arrondie à ~100 m avant de quitter cette classe (jamais
/// l'adresse au mètre) ; c'est AppStore qui décide ensuite de ce qui part
/// sur le serveur selon la préférence de partage : niveau ville (~5 km)
/// pour tout le monde, position exacte réservée aux amis ou à tous.
final class LocationService: NSObject, CLLocationManagerDelegate {

    private let manager = CLLocationManager()
    /// Appelé sur le main actor à chaque position obtenue (déjà arrondie).
    var onUpdate: (@MainActor (CLLocationCoordinate2D) -> Void)?

    override init() {
        super.init()
        manager.delegate = self
        // Le kilomètre suffit (on arrondit derrière) et économise la batterie.
        manager.desiredAccuracy = kCLLocationAccuracyKilometer
    }

    /// Demande l'autorisation si nécessaire, puis une position ponctuelle.
    func request() {
        switch manager.authorizationStatus {
        case .notDetermined:
            manager.requestWhenInUseAuthorization()
        case .authorizedWhenInUse, .authorizedAlways:
            manager.requestLocation()
        default:
            break // Refusée / restreinte : l'app fonctionne sans distance.
        }
    }

    func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
        switch manager.authorizationStatus {
        case .authorizedWhenInUse, .authorizedAlways:
            manager.requestLocation()
        default:
            break
        }
    }

    func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        guard let coordinate = locations.last?.coordinate else { return }
        let rounded = CLLocationCoordinate2D(
            latitude: (coordinate.latitude * 1000).rounded() / 1000,
            longitude: (coordinate.longitude * 1000).rounded() / 1000
        )
        Task { @MainActor [onUpdate] in onUpdate?(rounded) }
    }

    func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
        // Position indisponible (simulateur, avion…) : silencieux, l'app
        // reste pleinement utilisable sans distances.
    }
}
