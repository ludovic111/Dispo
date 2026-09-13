#!/usr/bin/env python3
"""Génère les textures de grain « Backstage » (assets/images/textures/).

Deux PNG répétables de 128 × 128 px, en mode LA (luminance + alpha) :
- grain-dark.png  : grains clairs, posés sur les fonds sombres ;
- grain-light.png : grains sombres, posés sur les fonds clairs.

Le grain vit dans l'alpha, quantifié sur quelques niveaux pour rester sous
20 Ko, et se répète sans raccord visible (bruit uniforme). Il est affiché à
faible opacité par `DispoBackground` et `BottomSheet`, sur la couleur de fond
du thème courant : la texture n'embarque donc aucune couleur de marque.

Usage : python3 scripts/gen-textures.py
"""

from __future__ import annotations

import os
import random

from PIL import Image

SIZE = 128
OUT_DIR = os.path.join(os.path.dirname(__file__), '..', 'assets', 'images', 'textures')
# Contraste maximal d'un grain (~4 %), sur 4 niveaux d'alpha pour la compression.
LEVELS = (0, 3, 6, 10)
SEED = 20260913


def make(name: str, luminance: int, seed: int) -> None:
    rng = random.Random(seed)
    image = Image.new('LA', (SIZE, SIZE), (luminance, 0))
    pixels = image.load()
    for y in range(SIZE):
        for x in range(SIZE):
            # ~55 % des pixels portent un grain, le reste reste transparent.
            roll = rng.random()
            if roll < 0.45:
                alpha = 0
            elif roll < 0.75:
                alpha = LEVELS[1]
            elif roll < 0.93:
                alpha = LEVELS[2]
            else:
                alpha = LEVELS[3]
            pixels[x, y] = (luminance, alpha)
    path = os.path.join(OUT_DIR, name)
    image.save(path, format='PNG', optimize=True)
    size = os.path.getsize(path)
    print(f'{name}: {size} bytes')
    if size >= 20 * 1024:
        raise SystemExit(f'{name} dépasse 20 Ko')


def main() -> None:
    os.makedirs(OUT_DIR, exist_ok=True)
    make('grain-dark.png', 255, SEED)
    make('grain-light.png', 0, SEED + 1)


if __name__ == '__main__':
    main()
