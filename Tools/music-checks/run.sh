#!/bin/bash
# Compile Music.swift (sans l'extension qui dépend des modèles de l'app)
# avec les assertions, puis les exécute.
set -e
cd "$(dirname "$0")"
work=$(mktemp -d)
python3 - "$work" <<'PY'
import sys, pathlib
src = pathlib.Path("../../Dispo/Music.swift").read_text()
start = src.index("extension Instrument {")
# On ne retire QUE l'extension Instrument (elle dépend des modèles de
# l'app) : l'export iReal Pro qui suit doit rester testé.
end = src.index("// MARK: - Export iReal Pro")
pathlib.Path(sys.argv[1], "Music.swift").write_text(src[:start] + src[end:])
PY
cp main.swift "$work/"
swiftc -O "$work/Music.swift" "$work/main.swift" -o "$work/musicchecks"
"$work/musicchecks"

# L'extension Instrument est retirée de la compilation (elle dépend des
# modèles de l'app) : on vérifie son contenu au texte, sinon une erreur
# d'accord d'instrument passerait sans bruit.
mapping=$(sed -n '/extension Instrument {/,/^}/p' ../../Dispo/Music.swift)
fail=0
grep -q 'case .trompette, .clarinette, .saxTenor: return .bFlat' <<<"$mapping" || { echo "ECHEC  ténor et clarinette doivent lire en si♭"; fail=1; }
grep -q 'case .saxophone, .saxAlto: return .eFlat' <<<"$mapping" || { echo "ECHEC  alto doit lire en mi♭"; fail=1; }
grep -q 'case .cor: return .f' <<<"$mapping" || { echo "ECHEC  cor doit lire en fa"; fail=1; }
[ $fail -eq 0 ] && echo "OK    accords d'instruments (alto mi♭, ténor si♭, cor fa)"

rm -rf "$work"
exit $fail
