import SwiftUI

// Villes et codes postaux par pays. Listes volontairement fournies (chef-lieux,
// grandes villes, bassins musicaux) — le sélecteur a une recherche, et le
// choix reste modifiable à tout moment dans le profil.
extension Country {
    var cities: [City] {
        switch self {
        case .switzerland: return Self.swissCities
        case .france: return Self.frenchCities
        case .usa: return Self.usCities
        case .germany: return Self.germanCities
        case .italy: return Self.italianCities
        case .spain: return Self.spanishCities
        case .portugal: return Self.portugueseCities
        case .belgium: return Self.belgianCities
        case .netherlands: return Self.dutchCities
        case .luxembourg: return Self.luxembourgCities
        case .austria: return Self.austrianCities
        case .uk: return Self.ukCities
        case .ireland: return Self.irishCities
        case .canada: return Self.canadianCities
        }
    }

    // NPA suisses — tous les chefs-lieux cantonaux + villes principales,
    // avec un soin particulier pour l'arc lémanique (marché de lancement).
    private static let swissCities: [City] = [
        City(name: "Genève", postalCode: "1200"),
        City(name: "Carouge", postalCode: "1227"),
        City(name: "Lancy", postalCode: "1212"),
        City(name: "Meyrin", postalCode: "1217"),
        City(name: "Vernier", postalCode: "1214"),
        City(name: "Onex", postalCode: "1213"),
        City(name: "Thônex", postalCode: "1226"),
        City(name: "Versoix", postalCode: "1290"),
        City(name: "Plan-les-Ouates", postalCode: "1228"),
        City(name: "Grand-Saconnex", postalCode: "1218"),
        City(name: "Chêne-Bougeries", postalCode: "1224"),
        City(name: "Nyon", postalCode: "1260"),
        City(name: "Gland", postalCode: "1196"),
        City(name: "Rolle", postalCode: "1180"),
        City(name: "Morges", postalCode: "1110"),
        City(name: "Lausanne", postalCode: "1003"),
        City(name: "Renens", postalCode: "1020"),
        City(name: "Pully", postalCode: "1009"),
        City(name: "Vevey", postalCode: "1800"),
        City(name: "Montreux", postalCode: "1820"),
        City(name: "Aigle", postalCode: "1860"),
        City(name: "Yverdon-les-Bains", postalCode: "1400"),
        City(name: "Payerne", postalCode: "1530"),
        City(name: "Sion", postalCode: "1950"),
        City(name: "Sierre", postalCode: "3960"),
        City(name: "Martigny", postalCode: "1920"),
        City(name: "Monthey", postalCode: "1870"),
        City(name: "Brigue", postalCode: "3900"),
        City(name: "Fribourg", postalCode: "1700"),
        City(name: "Bulle", postalCode: "1630"),
        City(name: "Neuchâtel", postalCode: "2000"),
        City(name: "La Chaux-de-Fonds", postalCode: "2300"),
        City(name: "Le Locle", postalCode: "2400"),
        City(name: "Bienne", postalCode: "2500"),
        City(name: "Delémont", postalCode: "2800"),
        City(name: "Porrentruy", postalCode: "2900"),
        City(name: "Berne", postalCode: "3000"),
        City(name: "Köniz", postalCode: "3098"),
        City(name: "Thoune", postalCode: "3600"),
        City(name: "Interlaken", postalCode: "3800"),
        City(name: "Berthoud", postalCode: "3400"),
        City(name: "Bâle", postalCode: "4000"),
        City(name: "Liestal", postalCode: "4410"),
        City(name: "Soleure", postalCode: "4500"),
        City(name: "Olten", postalCode: "4600"),
        City(name: "Aarau", postalCode: "5000"),
        City(name: "Baden", postalCode: "5400"),
        City(name: "Lucerne", postalCode: "6000"),
        City(name: "Zoug", postalCode: "6300"),
        City(name: "Schwytz", postalCode: "6430"),
        City(name: "Altdorf", postalCode: "6460"),
        City(name: "Stans", postalCode: "6370"),
        City(name: "Sarnen", postalCode: "6060"),
        City(name: "Glaris", postalCode: "8750"),
        City(name: "Zurich", postalCode: "8001"),
        City(name: "Winterthour", postalCode: "8400"),
        City(name: "Uster", postalCode: "8610"),
        City(name: "Dübendorf", postalCode: "8600"),
        City(name: "Schaffhouse", postalCode: "8200"),
        City(name: "Frauenfeld", postalCode: "8500"),
        City(name: "Saint-Gall", postalCode: "9000"),
        City(name: "Rapperswil", postalCode: "8640"),
        City(name: "Herisau", postalCode: "9100"),
        City(name: "Appenzell", postalCode: "9050"),
        City(name: "Coire", postalCode: "7000"),
        City(name: "Davos", postalCode: "7260"),
        City(name: "Saint-Moritz", postalCode: "7500"),
        City(name: "Bellinzone", postalCode: "6500"),
        City(name: "Lugano", postalCode: "6900"),
        City(name: "Locarno", postalCode: "6600"),
        City(name: "Mendrisio", postalCode: "6850")
    ]

    // Grandes villes françaises + couronne genevoise (frontaliers).
    private static let frenchCities: [City] = [
        City(name: "Paris", postalCode: "75001"),
        City(name: "Marseille", postalCode: "13001"),
        City(name: "Lyon", postalCode: "69001"),
        City(name: "Toulouse", postalCode: "31000"),
        City(name: "Nice", postalCode: "06000"),
        City(name: "Nantes", postalCode: "44000"),
        City(name: "Montpellier", postalCode: "34000"),
        City(name: "Strasbourg", postalCode: "67000"),
        City(name: "Bordeaux", postalCode: "33000"),
        City(name: "Lille", postalCode: "59000"),
        City(name: "Rennes", postalCode: "35000"),
        City(name: "Reims", postalCode: "51100"),
        City(name: "Toulon", postalCode: "83000"),
        City(name: "Saint-Étienne", postalCode: "42000"),
        City(name: "Le Havre", postalCode: "76600"),
        City(name: "Grenoble", postalCode: "38000"),
        City(name: "Dijon", postalCode: "21000"),
        City(name: "Angers", postalCode: "49000"),
        City(name: "Nîmes", postalCode: "30000"),
        City(name: "Clermont-Ferrand", postalCode: "63000"),
        City(name: "Aix-en-Provence", postalCode: "13100"),
        City(name: "Brest", postalCode: "29200"),
        City(name: "Tours", postalCode: "37000"),
        City(name: "Amiens", postalCode: "80000"),
        City(name: "Limoges", postalCode: "87000"),
        City(name: "Perpignan", postalCode: "66000"),
        City(name: "Besançon", postalCode: "25000"),
        City(name: "Metz", postalCode: "57000"),
        City(name: "Orléans", postalCode: "45000"),
        City(name: "Rouen", postalCode: "76000"),
        City(name: "Mulhouse", postalCode: "68100"),
        City(name: "Caen", postalCode: "14000"),
        City(name: "Nancy", postalCode: "54000"),
        City(name: "Avignon", postalCode: "84000"),
        City(name: "Cannes", postalCode: "06400"),
        City(name: "Antibes", postalCode: "06600"),
        City(name: "La Rochelle", postalCode: "17000"),
        City(name: "Pau", postalCode: "64000"),
        City(name: "Bayonne", postalCode: "64100"),
        City(name: "Biarritz", postalCode: "64200"),
        City(name: "Poitiers", postalCode: "86000"),
        City(name: "Valence", postalCode: "26000"),
        City(name: "Bourg-en-Bresse", postalCode: "01000"),
        City(name: "Chambéry", postalCode: "73000"),
        City(name: "Annecy", postalCode: "74000"),
        City(name: "Annemasse", postalCode: "74100"),
        City(name: "Saint-Julien-en-Genevois", postalCode: "74160"),
        City(name: "Thonon-les-Bains", postalCode: "74200"),
        City(name: "Évian-les-Bains", postalCode: "74500"),
        City(name: "Ferney-Voltaire", postalCode: "01210"),
        City(name: "Divonne-les-Bains", postalCode: "01220"),
        City(name: "Gex", postalCode: "01170"),
        City(name: "Saint-Genis-Pouilly", postalCode: "01630"),
        City(name: "Bellegarde-sur-Valserine", postalCode: "01200"),
        City(name: "Cluses", postalCode: "74300"),
        City(name: "Chamonix", postalCode: "74400")
    ]

    private static let usCities: [City] = [
        City(name: "New York", postalCode: "10001"),
        City(name: "Los Angeles", postalCode: "90001"),
        City(name: "Chicago", postalCode: "60601"),
        City(name: "Houston", postalCode: "77001"),
        City(name: "Phoenix", postalCode: "85001"),
        City(name: "Philadelphia", postalCode: "19101"),
        City(name: "San Antonio", postalCode: "78201"),
        City(name: "San Diego", postalCode: "92101"),
        City(name: "Dallas", postalCode: "75201"),
        City(name: "Austin", postalCode: "78701"),
        City(name: "San Francisco", postalCode: "94102"),
        City(name: "San Jose", postalCode: "95101"),
        City(name: "Oakland", postalCode: "94601"),
        City(name: "Sacramento", postalCode: "94203"),
        City(name: "Seattle", postalCode: "98101"),
        City(name: "Portland", postalCode: "97201"),
        City(name: "Denver", postalCode: "80201"),
        City(name: "Boston", postalCode: "02108"),
        City(name: "Nashville", postalCode: "37201"),
        City(name: "Memphis", postalCode: "38103"),
        City(name: "New Orleans", postalCode: "70112"),
        City(name: "Miami", postalCode: "33101"),
        City(name: "Orlando", postalCode: "32801"),
        City(name: "Tampa", postalCode: "33601"),
        City(name: "Jacksonville", postalCode: "32201"),
        City(name: "Atlanta", postalCode: "30301"),
        City(name: "Charlotte", postalCode: "28201"),
        City(name: "Raleigh", postalCode: "27601"),
        City(name: "Richmond", postalCode: "23218"),
        City(name: "Washington", postalCode: "20001"),
        City(name: "Baltimore", postalCode: "21201"),
        City(name: "Pittsburgh", postalCode: "15201"),
        City(name: "Cleveland", postalCode: "44101"),
        City(name: "Cincinnati", postalCode: "45201"),
        City(name: "Columbus", postalCode: "43201"),
        City(name: "Detroit", postalCode: "48201"),
        City(name: "Indianapolis", postalCode: "46201"),
        City(name: "Milwaukee", postalCode: "53201"),
        City(name: "Minneapolis", postalCode: "55401"),
        City(name: "Kansas City", postalCode: "64101"),
        City(name: "St. Louis", postalCode: "63101"),
        City(name: "Las Vegas", postalCode: "89101"),
        City(name: "Salt Lake City", postalCode: "84101"),
        City(name: "Albuquerque", postalCode: "87101"),
        City(name: "Tucson", postalCode: "85701"),
        City(name: "Honolulu", postalCode: "96801"),
        City(name: "Anchorage", postalCode: "99501"),
        City(name: "Buffalo", postalCode: "14201"),
        City(name: "Rochester", postalCode: "14602"),
        City(name: "Providence", postalCode: "02901")
    ]

    private static let germanCities: [City] = [
        City(name: "Berlin", postalCode: "10115"),
        City(name: "Hambourg", postalCode: "20095"),
        City(name: "Munich", postalCode: "80331"),
        City(name: "Cologne", postalCode: "50667"),
        City(name: "Francfort-sur-le-Main", postalCode: "60311"),
        City(name: "Stuttgart", postalCode: "70173"),
        City(name: "Düsseldorf", postalCode: "40213"),
        City(name: "Leipzig", postalCode: "04109"),
        City(name: "Dortmund", postalCode: "44135"),
        City(name: "Essen", postalCode: "45127"),
        City(name: "Brême", postalCode: "28195"),
        City(name: "Dresde", postalCode: "01067"),
        City(name: "Hanovre", postalCode: "30159"),
        City(name: "Nuremberg", postalCode: "90402"),
        City(name: "Duisbourg", postalCode: "47051"),
        City(name: "Bochum", postalCode: "44787"),
        City(name: "Wuppertal", postalCode: "42103"),
        City(name: "Bielefeld", postalCode: "33602"),
        City(name: "Bonn", postalCode: "53111"),
        City(name: "Münster", postalCode: "48143"),
        City(name: "Karlsruhe", postalCode: "76133"),
        City(name: "Mannheim", postalCode: "68159"),
        City(name: "Fribourg-en-Brisgau", postalCode: "79098"),
        City(name: "Heidelberg", postalCode: "69117"),
        City(name: "Augsbourg", postalCode: "86150"),
        City(name: "Kiel", postalCode: "24103"),
        City(name: "Mayence", postalCode: "55116"),
        City(name: "Sarrebruck", postalCode: "66111"),
        City(name: "Constance", postalCode: "78462"),
        City(name: "Lörrach", postalCode: "79539")
    ]

    private static let italianCities: [City] = [
        City(name: "Rome", postalCode: "00100"),
        City(name: "Milan", postalCode: "20121"),
        City(name: "Naples", postalCode: "80121"),
        City(name: "Turin", postalCode: "10121"),
        City(name: "Palerme", postalCode: "90121"),
        City(name: "Gênes", postalCode: "16121"),
        City(name: "Bologne", postalCode: "40121"),
        City(name: "Florence", postalCode: "50121"),
        City(name: "Bari", postalCode: "70121"),
        City(name: "Catane", postalCode: "95121"),
        City(name: "Venise", postalCode: "30121"),
        City(name: "Vérone", postalCode: "37121"),
        City(name: "Messine", postalCode: "98121"),
        City(name: "Padoue", postalCode: "35121"),
        City(name: "Trieste", postalCode: "34121"),
        City(name: "Brescia", postalCode: "25121"),
        City(name: "Parme", postalCode: "43121"),
        City(name: "Modène", postalCode: "41121"),
        City(name: "Pérouse", postalCode: "06121"),
        City(name: "Cagliari", postalCode: "09121"),
        City(name: "Livourne", postalCode: "57121"),
        City(name: "Salerne", postalCode: "84121"),
        City(name: "Rimini", postalCode: "47921"),
        City(name: "Côme", postalCode: "22100"),
        City(name: "Varèse", postalCode: "21100"),
        City(name: "Aoste", postalCode: "11100")
    ]

    private static let spanishCities: [City] = [
        City(name: "Madrid", postalCode: "28001"),
        City(name: "Barcelone", postalCode: "08001"),
        City(name: "Valence", postalCode: "46001"),
        City(name: "Séville", postalCode: "41001"),
        City(name: "Saragosse", postalCode: "50001"),
        City(name: "Malaga", postalCode: "29001"),
        City(name: "Murcie", postalCode: "30001"),
        City(name: "Palma de Majorque", postalCode: "07001"),
        City(name: "Las Palmas", postalCode: "35001"),
        City(name: "Bilbao", postalCode: "48001"),
        City(name: "Alicante", postalCode: "03001"),
        City(name: "Cordoue", postalCode: "14001"),
        City(name: "Valladolid", postalCode: "47001"),
        City(name: "Vigo", postalCode: "36201"),
        City(name: "Gijón", postalCode: "33201"),
        City(name: "Grenade", postalCode: "18001"),
        City(name: "La Corogne", postalCode: "15001"),
        City(name: "Saint-Sébastien", postalCode: "20001"),
        City(name: "Santander", postalCode: "39001"),
        City(name: "Pampelune", postalCode: "31001"),
        City(name: "Tolède", postalCode: "45001"),
        City(name: "Salamanque", postalCode: "37001"),
        City(name: "Cadix", postalCode: "11001"),
        City(name: "Ibiza", postalCode: "07800")
    ]

    private static let portugueseCities: [City] = [
        City(name: "Lisbonne", postalCode: "1100"),
        City(name: "Porto", postalCode: "4000"),
        City(name: "Braga", postalCode: "4700"),
        City(name: "Coimbra", postalCode: "3000"),
        City(name: "Faro", postalCode: "8000"),
        City(name: "Aveiro", postalCode: "3800"),
        City(name: "Setúbal", postalCode: "2900"),
        City(name: "Funchal", postalCode: "9000"),
        City(name: "Évora", postalCode: "7000"),
        City(name: "Guimarães", postalCode: "4800")
    ]

    private static let belgianCities: [City] = [
        City(name: "Bruxelles", postalCode: "1000"),
        City(name: "Anvers", postalCode: "2000"),
        City(name: "Gand", postalCode: "9000"),
        City(name: "Charleroi", postalCode: "6000"),
        City(name: "Liège", postalCode: "4000"),
        City(name: "Bruges", postalCode: "8000"),
        City(name: "Namur", postalCode: "5000"),
        City(name: "Louvain", postalCode: "3000"),
        City(name: "Mons", postalCode: "7000"),
        City(name: "Ostende", postalCode: "8400"),
        City(name: "Tournai", postalCode: "7500"),
        City(name: "Hasselt", postalCode: "3500")
    ]

    private static let dutchCities: [City] = [
        City(name: "Amsterdam", postalCode: "1011"),
        City(name: "Rotterdam", postalCode: "3011"),
        City(name: "La Haye", postalCode: "2511"),
        City(name: "Utrecht", postalCode: "3511"),
        City(name: "Eindhoven", postalCode: "5611"),
        City(name: "Groningue", postalCode: "9711"),
        City(name: "Tilbourg", postalCode: "5011"),
        City(name: "Maastricht", postalCode: "6211"),
        City(name: "Haarlem", postalCode: "2011"),
        City(name: "Nimègue", postalCode: "6511")
    ]

    private static let luxembourgCities: [City] = [
        City(name: "Luxembourg", postalCode: "1111"),
        City(name: "Esch-sur-Alzette", postalCode: "4001"),
        City(name: "Differdange", postalCode: "4501"),
        City(name: "Dudelange", postalCode: "3401"),
        City(name: "Ettelbruck", postalCode: "9001")
    ]

    private static let austrianCities: [City] = [
        City(name: "Vienne", postalCode: "1010"),
        City(name: "Graz", postalCode: "8010"),
        City(name: "Linz", postalCode: "4020"),
        City(name: "Salzbourg", postalCode: "5020"),
        City(name: "Innsbruck", postalCode: "6020"),
        City(name: "Klagenfurt", postalCode: "9020"),
        City(name: "Bregenz", postalCode: "6900"),
        City(name: "Villach", postalCode: "9500")
    ]

    private static let ukCities: [City] = [
        City(name: "Londres", postalCode: "SW1A"),
        City(name: "Manchester", postalCode: "M1"),
        City(name: "Birmingham", postalCode: "B1"),
        City(name: "Liverpool", postalCode: "L1"),
        City(name: "Leeds", postalCode: "LS1"),
        City(name: "Glasgow", postalCode: "G1"),
        City(name: "Édimbourg", postalCode: "EH1"),
        City(name: "Bristol", postalCode: "BS1"),
        City(name: "Cardiff", postalCode: "CF10"),
        City(name: "Newcastle", postalCode: "NE1"),
        City(name: "Sheffield", postalCode: "S1"),
        City(name: "Nottingham", postalCode: "NG1"),
        City(name: "Brighton", postalCode: "BN1"),
        City(name: "Oxford", postalCode: "OX1"),
        City(name: "Cambridge", postalCode: "CB1"),
        City(name: "Belfast", postalCode: "BT1")
    ]

    private static let irishCities: [City] = [
        City(name: "Dublin", postalCode: "D01"),
        City(name: "Cork", postalCode: "T12"),
        City(name: "Galway", postalCode: "H91"),
        City(name: "Limerick", postalCode: "V94"),
        City(name: "Waterford", postalCode: "X91")
    ]

    private static let canadianCities: [City] = [
        City(name: "Montréal", postalCode: "H2X"),
        City(name: "Québec", postalCode: "G1R"),
        City(name: "Toronto", postalCode: "M5V"),
        City(name: "Vancouver", postalCode: "V6B"),
        City(name: "Ottawa", postalCode: "K1P"),
        City(name: "Gatineau", postalCode: "J8X"),
        City(name: "Calgary", postalCode: "T2P"),
        City(name: "Edmonton", postalCode: "T5J"),
        City(name: "Winnipeg", postalCode: "R3C"),
        City(name: "Halifax", postalCode: "B3J"),
        City(name: "Sherbrooke", postalCode: "J1H"),
        City(name: "Trois-Rivières", postalCode: "G8Z")
    ]
}

// MARK: - Sélecteur de ville

/// Feuille de choix de ville avec recherche (nom ou code postal).
/// Utilisée par l'onboarding et la carte « Langue & région » du profil.
struct CityPickerSheet: View {
    let country: Country
    let selected: City?
    let onPick: (City) -> Void
    @Environment(\.dismiss) private var dismiss
    @State private var query = ""

    private var results: [City] {
        let trimmed = query.trimmingCharacters(in: .whitespaces)
        guard !trimmed.isEmpty else { return country.cities }
        return country.cities.filter {
            $0.name.localizedCaseInsensitiveContains(trimmed)
                || $0.postalCode.localizedCaseInsensitiveContains(trimmed)
        }
    }

    var body: some View {
        NavigationStack {
            List(results) { city in
                Button {
                    onPick(city)
                    dismiss()
                } label: {
                    HStack {
                        Text(city.postalCode)
                            .font(.subheadline.weight(.bold))
                            .foregroundStyle(.secondary)
                            .frame(width: 64, alignment: .leading)
                        Text(city.name)
                            .font(.subheadline.weight(.semibold))
                            .foregroundStyle(.primary)
                        Spacer()
                        if selected == city {
                            Image(systemName: "checkmark.circle.fill")
                                .foregroundStyle(JC.laiton)
                        }
                    }
                }
            }
            .searchable(text: $query, prompt: Text("Ville ou code postal…"))
            .navigationTitle("Ville / région")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Annuler") { dismiss() }
                }
            }
        }
    }
}
