import CoreLocation

/// Position de l'utilisateur pour le rayon de recherche. La coordonnée est
/// arrondie à ~1 km AVANT de quitter cette classe : assez précise pour des
/// rayons de 5 à 100 km, assez floue pour ne jamais exposer un domicile —
/// c'est cette valeur arrondie qui part sur le serveur.
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
            latitude: (coordinate.latitude * 100).rounded() / 100,
            longitude: (coordinate.longitude * 100).rounded() / 100
        )
        Task { @MainActor [onUpdate] in onUpdate?(rounded) }
    }

    func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
        // Position indisponible (simulateur, avion…) : silencieux, l'app
        // reste pleinement utilisable sans distances.
    }
}
