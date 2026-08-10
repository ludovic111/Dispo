#!/usr/bin/env python3
"""Ajoute des traductions au catalogue, sans jamais toucher à l'existant.

Le catalogue est append-only en pratique : une clé déjà traduite ne doit pas
bouger (elle l'est peut-être depuis six versions et le français EST la clé).
Ce script n'écrit donc que des langues MANQUANTES, refuse d'écraser, et
signale toute clé de la table de traduction absente du catalogue attendu.

    python3 Tools/i18n/merge.py translations-1.7.json
"""

import json
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parents[2]
CATALOG = ROOT / "Dispo" / "Localizable.xcstrings"
LANGUAGES = ["de", "en", "es", "it", "ja", "zh-Hans"]


def main() -> int:
    if len(sys.argv) < 2:
        print("usage: merge.py <fichier.json>")
        return 2

    table = json.loads(pathlib.Path(sys.argv[1]).read_text(encoding="utf-8"))
    catalog = json.loads(CATALOG.read_text(encoding="utf-8"))
    strings = catalog["strings"]

    added, filled, skipped, bad = 0, 0, 0, []

    for french, translations in table.items():
        missing = [code for code in LANGUAGES if code not in translations]
        if missing:
            bad.append(f"{french!r} : langues manquantes {missing}")
            continue

        entry = strings.setdefault(french, {"localizations": {}})
        localizations = entry.setdefault("localizations", {})
        brand_new = not localizations

        for code in LANGUAGES:
            if code in localizations:
                skipped += 1
                continue
            localizations[code] = {
                "stringUnit": {"state": "translated", "value": translations[code]}
            }
            if not brand_new:
                filled += 1
        if brand_new:
            added += 1

    if bad:
        print("REFUSÉ — table incomplète :")
        for line in bad:
            print("  " + line)
        return 1

    # Clés triées : le catalogue Xcode l'est, on garde le diff lisible.
    catalog["strings"] = dict(sorted(strings.items()))
    CATALOG.write_text(
        json.dumps(catalog, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print(f"{added} clés créées, {filled} langues complétées, "
          f"{skipped} déjà présentes ignorées → {len(catalog['strings'])} clés au total")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
