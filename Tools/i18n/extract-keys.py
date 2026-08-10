#!/usr/bin/env python3
"""Repère les chaînes d'interface absentes du catalogue de traductions.

Le français est la langue SOURCE : la clé du catalogue EST la chaîne
française. Une chaîne affichée mais absente du catalogue s'affiche donc en
français dans les six autres langues, sans la moindre erreur de compilation.
Ce script rend cette dette visible.

    python3 Tools/i18n/extract-keys.py           # ce qui manque
    python3 Tools/i18n/extract-keys.py --all     # + les clés orphelines
"""

import json
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parents[2]
SRC = ROOT / "Dispo"
CATALOG = SRC / "Localizable.xcstrings"

# Un littéral Swift sans interpolation ni échappement exotique.
LITERAL = r'"((?:[^"\\\n]|\\.)*)"'

# Les façons dont une chaîne arrive à l'écran dans ce projet.
PATTERNS = [
    rf'\bText\(\s*{LITERAL}',
    rf'\bLabel\(\s*{LITERAL}\s*,',
    rf'\bButton\(\s*{LITERAL}\s*[,)]',
    rf'\bSection\(\s*{LITERAL}\s*[,)]',
    rf'\bPicker\(\s*{LITERAL}\s*,',
    rf'\bTextField\(\s*{LITERAL}\s*,',
    rf'\.navigationTitle\(\s*{LITERAL}',
    rf'\.tr\(\s*{LITERAL}',
    rf'\btitle:\s*{LITERAL}',
    rf'\bsubtitle:\s*{LITERAL}',
    rf'\bmessage:\s*{LITERAL}',
    rf'\btext:\s*{LITERAL}',
    rf'\.confirmationDialog\(\s*{LITERAL}',
    rf'\.alert\(\s*{LITERAL}',
    rf'\bLocalizedStringKey\(\s*{LITERAL}\s*\)',
]

# Ce qui n'est pas de l'interface : identifiants techniques, symboles SF,
# clés UserDefaults, noms de tables…
def is_ui_string(text: str) -> bool:
    if not text or len(text) < 2:
        return False
    if text.startswith(("jamconnect.", "dispo.", "http", "irealb", "sf.")):
        return False
    # Un symbole SF Symbols : que du minuscule, des points et des tirets.
    if re.fullmatch(r"[a-z0-9.\-]+", text):
        return False
    # Doit contenir au moins une lettre.
    return bool(re.search(r"[A-Za-zÀ-ÿ]", text))


def unescape(text: str) -> str:
    return text.replace('\\"', '"').replace("\\n", "\n").replace("\\\\", "\\")


def collect() -> dict[str, set[str]]:
    found: dict[str, set[str]] = {}
    for path in sorted(SRC.rglob("*.swift")):
        source = path.read_text(encoding="utf-8")
        for pattern in PATTERNS:
            for match in re.finditer(pattern, source):
                raw = unescape(match.group(1))
                if is_ui_string(raw):
                    found.setdefault(raw, set()).add(path.name)
    return found


def main() -> int:
    catalog = json.loads(CATALOG.read_text(encoding="utf-8"))
    strings = catalog["strings"]
    languages = sorted({
        code
        for entry in strings.values()
        for code in entry.get("localizations", {})
    })

    found = collect()
    missing = {key: files for key, files in found.items() if key not in strings}
    incomplete = {
        key: sorted(set(languages) - set(strings[key].get("localizations", {})))
        for key in found
        if key in strings
        and set(strings[key].get("localizations", {})) != set(languages)
    }

    print(f"catalogue : {len(strings)} clés, langues {', '.join(languages)}")
    print(f"repérées dans le code : {len(found)} chaînes\n")

    print(f"--- ABSENTES du catalogue ({len(missing)}) ---")
    for key in sorted(missing):
        print(f"  {key!r}   [{', '.join(sorted(missing[key]))}]")

    print(f"\n--- INCOMPLÈTES ({len(incomplete)}) ---")
    for key in sorted(incomplete):
        print(f"  {key!r}   manque : {', '.join(incomplete[key])}")

    if "--all" in sys.argv:
        orphans = sorted(set(strings) - set(found))
        print(f"\n--- ORPHELINES, non trouvées dans le code ({len(orphans)}) ---")
        for key in orphans:
            print(f"  {key!r}")

    return 1 if missing or incomplete else 0


if __name__ == "__main__":
    raise SystemExit(main())
