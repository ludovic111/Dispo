import SwiftUI

/// Lecteur minimal d'un attribut `d` de SVG, pour dessiner les vrais logos
/// des plateformes dans SwiftUI sans embarquer d'images bitmap.
///
/// Gère les commandes utilisées par les tracés officiels : M/m, L/l, H/h,
/// V/v, C/c, S/s, Q/q, T/t, A/a, Z/z. Les arcs sont convertis en courbes de
/// Bézier (paramétrage centre, comme la spécification SVG).
enum SVGPath {

    /// Construit un `Path` SwiftUI à partir d'un `d`, mis à l'échelle pour
    /// remplir `rect` en conservant les proportions (viewBox carrée 0 0 24 24
    /// pour tous nos logos).
    static func path(_ d: String, in rect: CGRect, viewBox: CGFloat = 24) -> Path {
        var path = Path()
        var current = CGPoint.zero
        var start = CGPoint.zero
        /// Dernier point de contrôle, pour les commandes lisses S/T.
        var lastCubicControl: CGPoint?
        var lastQuadControl: CGPoint?

        let scale = min(rect.width, rect.height) / viewBox
        let offset = CGPoint(
            x: rect.minX + (rect.width - viewBox * scale) / 2,
            y: rect.minY + (rect.height - viewBox * scale) / 2
        )
        func mapped(_ point: CGPoint) -> CGPoint {
            CGPoint(x: offset.x + point.x * scale, y: offset.y + point.y * scale)
        }

        var scanner = Scanner(d)
        while let command = scanner.nextCommand() {
            let relative = command.isLowercase
            let letter = Character(command.uppercased())

            // Une commande peut être suivie de plusieurs jeux d'arguments.
            repeat {
                switch letter {
                case "M":
                    guard let point = scanner.point(relativeTo: relative ? current : .zero) else { break }
                    current = point
                    start = point
                    path.move(to: mapped(point))
                    // Les paires suivantes d'un M sont des L implicites.
                    while let next = scanner.point(relativeTo: relative ? current : .zero) {
                        current = next
                        path.addLine(to: mapped(next))
                    }
                case "L":
                    guard let point = scanner.point(relativeTo: relative ? current : .zero) else { break }
                    current = point
                    path.addLine(to: mapped(point))
                case "H":
                    guard let x = scanner.number() else { break }
                    current = CGPoint(x: relative ? current.x + x : x, y: current.y)
                    path.addLine(to: mapped(current))
                case "V":
                    guard let y = scanner.number() else { break }
                    current = CGPoint(x: current.x, y: relative ? current.y + y : y)
                    path.addLine(to: mapped(current))
                case "C":
                    let base = relative ? current : .zero
                    guard let c1 = scanner.point(relativeTo: base),
                          let c2 = scanner.point(relativeTo: base),
                          let end = scanner.point(relativeTo: base) else { break }
                    path.addCurve(to: mapped(end), control1: mapped(c1), control2: mapped(c2))
                    lastCubicControl = c2
                    current = end
                case "S":
                    let base = relative ? current : .zero
                    guard let c2 = scanner.point(relativeTo: base),
                          let end = scanner.point(relativeTo: base) else { break }
                    // Le premier contrôle est le reflet du précédent.
                    let c1 = lastCubicControl.map {
                        CGPoint(x: 2 * current.x - $0.x, y: 2 * current.y - $0.y)
                    } ?? current
                    path.addCurve(to: mapped(end), control1: mapped(c1), control2: mapped(c2))
                    lastCubicControl = c2
                    current = end
                case "Q":
                    let base = relative ? current : .zero
                    guard let control = scanner.point(relativeTo: base),
                          let end = scanner.point(relativeTo: base) else { break }
                    path.addQuadCurve(to: mapped(end), control: mapped(control))
                    lastQuadControl = control
                    current = end
                case "T":
                    let base = relative ? current : .zero
                    guard let end = scanner.point(relativeTo: base) else { break }
                    let control = lastQuadControl.map {
                        CGPoint(x: 2 * current.x - $0.x, y: 2 * current.y - $0.y)
                    } ?? current
                    path.addQuadCurve(to: mapped(end), control: mapped(control))
                    lastQuadControl = control
                    current = end
                case "A":
                    // Les deux drapeaux d'un arc sont des chiffres isolés,
                    // souvent collés au reste (« …0 00-.24-2.19 ») : les lire
                    // comme des nombres décalerait tous les arguments.
                    guard let rx = scanner.number(), let ry = scanner.number(),
                          let rotation = scanner.number(),
                          let largeArc = scanner.flag(), let sweep = scanner.flag(),
                          let raw = scanner.point(relativeTo: relative ? current : .zero)
                    else { break }
                    appendArc(
                        to: &path, from: current, to: raw,
                        rx: rx, ry: ry, rotationDegrees: rotation,
                        largeArc: largeArc, sweep: sweep,
                        mapped: mapped
                    )
                    current = raw
                case "Z":
                    path.closeSubpath()
                    current = start
                default:
                    break
                }
                if letter != "C" && letter != "S" { lastCubicControl = nil }
                if letter != "Q" && letter != "T" { lastQuadControl = nil }
            } while letter != "Z" && scanner.hasMoreArguments

            if letter == "Z" { continue }
        }
        return path
    }

    /// Convertit un arc elliptique SVG en une suite de courbes cubiques.
    private static func appendArc(
        to path: inout Path,
        from origin: CGPoint,
        to destination: CGPoint,
        rx rxIn: CGFloat, ry ryIn: CGFloat,
        rotationDegrees: CGFloat,
        largeArc: Bool, sweep: Bool,
        mapped: (CGPoint) -> CGPoint
    ) {
        // Rayon nul : l'arc dégénère en segment (règle SVG).
        var rx = abs(rxIn), ry = abs(ryIn)
        guard rx > 0, ry > 0, origin != destination else {
            path.addLine(to: mapped(destination))
            return
        }
        let phi = rotationDegrees * .pi / 180
        let cosPhi = cos(phi), sinPhi = sin(phi)

        let dx2 = (origin.x - destination.x) / 2
        let dy2 = (origin.y - destination.y) / 2
        let x1p = cosPhi * dx2 + sinPhi * dy2
        let y1p = -sinPhi * dx2 + cosPhi * dy2

        // Agrandit les rayons s'ils sont trop petits pour relier les points.
        let lambda = (x1p * x1p) / (rx * rx) + (y1p * y1p) / (ry * ry)
        if lambda > 1 {
            rx *= sqrt(lambda)
            ry *= sqrt(lambda)
        }

        let sign: CGFloat = (largeArc != sweep) ? 1 : -1
        let numerator = max(0, rx * rx * ry * ry - rx * rx * y1p * y1p - ry * ry * x1p * x1p)
        let denominator = rx * rx * y1p * y1p + ry * ry * x1p * x1p
        let coefficient = denominator == 0 ? 0 : sign * sqrt(numerator / denominator)
        let cxp = coefficient * rx * y1p / ry
        let cyp = -coefficient * ry * x1p / rx

        let cx = cosPhi * cxp - sinPhi * cyp + (origin.x + destination.x) / 2
        let cy = sinPhi * cxp + cosPhi * cyp + (origin.y + destination.y) / 2

        func angle(_ ux: CGFloat, _ uy: CGFloat, _ vx: CGFloat, _ vy: CGFloat) -> CGFloat {
            let dot = ux * vx + uy * vy
            let len = sqrt(ux * ux + uy * uy) * sqrt(vx * vx + vy * vy)
            guard len > 0 else { return 0 }
            let value = acos(min(1, max(-1, dot / len)))
            return (ux * vy - uy * vx < 0) ? -value : value
        }

        let startAngle = angle(1, 0, (x1p - cxp) / rx, (y1p - cyp) / ry)
        var delta = angle(
            (x1p - cxp) / rx, (y1p - cyp) / ry,
            (-x1p - cxp) / rx, (-y1p - cyp) / ry
        )
        if !sweep && delta > 0 { delta -= 2 * .pi }
        if sweep && delta < 0 { delta += 2 * .pi }

        // Un segment de Bézier par quart de tour au maximum : l'erreur reste
        // invisible à la taille d'un logo.
        let segments = max(1, Int(ceil(abs(delta) / (.pi / 2))))
        let step = delta / CGFloat(segments)
        let alpha = 4.0 / 3.0 * tan(step / 4)

        var theta = startAngle
        var point = origin
        for _ in 0..<segments {
            let next = theta + step
            let cosT = cos(theta), sinT = sin(theta)
            let cosN = cos(next), sinN = sin(next)

            func onEllipse(_ c: CGFloat, _ s: CGFloat) -> CGPoint {
                CGPoint(
                    x: cx + rx * cosPhi * c - ry * sinPhi * s,
                    y: cy + rx * sinPhi * c + ry * cosPhi * s
                )
            }
            func derivative(_ c: CGFloat, _ s: CGFloat) -> CGPoint {
                CGPoint(
                    x: -rx * cosPhi * s - ry * sinPhi * c,
                    y: -rx * sinPhi * s + ry * cosPhi * c
                )
            }

            let end = onEllipse(cosN, sinN)
            let d1 = derivative(cosT, sinT)
            let d2 = derivative(cosN, sinN)
            let c1 = CGPoint(x: point.x + alpha * d1.x, y: point.y + alpha * d1.y)
            let c2 = CGPoint(x: end.x - alpha * d2.x, y: end.y - alpha * d2.y)
            path.addCurve(to: mapped(end), control1: mapped(c1), control2: mapped(c2))

            point = end
            theta = next
        }
    }

    /// Lecteur de tokens d'un attribut `d`.
    private struct Scanner {
        private let characters: [Character]
        private var index: Int = 0

        init(_ text: String) { characters = Array(text) }

        private mutating func skipSeparators() {
            while index < characters.count,
                  characters[index] == " " || characters[index] == ","
                    || characters[index] == "\n" || characters[index] == "\t"
                    || characters[index] == "\r" {
                index += 1
            }
        }

        /// Vrai s'il reste un nombre à lire avant la prochaine commande.
        var hasMoreArguments: Bool {
            var probe = index
            while probe < characters.count,
                  " ,\n\t\r".contains(characters[probe]) { probe += 1 }
            guard probe < characters.count else { return false }
            let next = characters[probe]
            return next.isNumber || next == "-" || next == "+" || next == "."
        }

        mutating func nextCommand() -> Character? {
            skipSeparators()
            guard index < characters.count else { return nil }
            let character = characters[index]
            guard character.isLetter else { return nil }
            index += 1
            return character
        }

        mutating func number() -> CGFloat? {
            skipSeparators()
            guard index < characters.count else { return nil }
            var text = ""
            if characters[index] == "-" || characters[index] == "+" {
                text.append(characters[index]); index += 1
            }
            var seenDot = false
            while index < characters.count {
                let character = characters[index]
                if character.isNumber {
                    text.append(character); index += 1
                } else if character == "." && !seenDot {
                    seenDot = true; text.append(character); index += 1
                } else if character == "e" || character == "E" {
                    text.append(character); index += 1
                    if index < characters.count,
                       characters[index] == "-" || characters[index] == "+" {
                        text.append(characters[index]); index += 1
                    }
                } else {
                    break
                }
            }
            guard let value = Double(text) else { return nil }
            return CGFloat(value)
        }

        /// Un drapeau d'arc : exactement un caractère, « 0 » ou « 1 ».
        mutating func flag() -> Bool? {
            skipSeparators()
            guard index < characters.count else { return nil }
            let character = characters[index]
            guard character == "0" || character == "1" else { return nil }
            index += 1
            return character == "1"
        }

        /// Une paire x,y, éventuellement relative à `base`.
        mutating func point(relativeTo base: CGPoint) -> CGPoint? {
            guard hasMoreArguments, let x = number(), let y = number() else { return nil }
            return CGPoint(x: base.x + x, y: base.y + y)
        }
    }
}

/// Un logo de marque dessiné depuis son tracé officiel.
struct BrandLogo: View {
    let brand: Brand
    var size: CGFloat = 22
    /// Couleur imposée (sinon : la couleur officielle de la marque).
    var tint: Color?

    var body: some View {
        Canvas { context, canvasSize in
            let rect = CGRect(origin: .zero, size: canvasSize)
            // Les SVG officiels ne déclarent pas de `fill-rule` : c'est donc
            // « nonzero » qui s'applique — les trous (l'objectif d'Instagram)
            // viennent du sens d'enroulement des sous-tracés.
            context.fill(
                SVGPath.path(brand.pathData, in: rect),
                with: .color(tint ?? brand.color)
            )
        }
        .frame(width: size, height: size)
        .accessibilityLabel(Text(verbatim: brand.label))
    }
}
