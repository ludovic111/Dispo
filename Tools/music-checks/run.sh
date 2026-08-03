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
end = src.index("// MARK: - Transposition d'une grille")
pathlib.Path(sys.argv[1], "Music.swift").write_text(src[:start] + src[end:])
PY
cp main.swift "$work/"
swiftc -O "$work/Music.swift" "$work/main.swift" -o "$work/musicchecks"
"$work/musicchecks"
rm -rf "$work"
