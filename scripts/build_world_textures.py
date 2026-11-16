"""Small whole-world images for the start screen (public/worlds/*.jpg).

The start screen draws the Moon, Mars and Earth as lit spheres before any map engine loads. Each texture is
stitched from the same public tile services the app already uses for its base maps, then downsampled to an
equirectangular image (longitude -180..180 left to right, latitude 90..-90 top to bottom):

  moon.jpg   LRO WAC global mosaic (NASA/GSFC/Arizona State University), via NASA Solar System Treks
  mars.jpg   Viking MDIM 2.1 colour mosaic (NASA/JPL/USGS), via NASA Solar System Treks
  earth.jpg  Blue Marble shaded relief and bathymetry (NASA Earth Observatory), via NASA GIBS

    .venv/bin/python scripts/build_world_textures.py
"""
from __future__ import annotations

import io
import sys
import urllib.request
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "public" / "worlds"
SIZE = (1536, 768)

TREK = "https://trek.nasa.gov/tiles/{world}/EQ/{layer}/1.0.0//default/default028mm/{z}/{y}/{x}.jpg"
GIBS = "https://gibs.earthdata.nasa.gov/wmts/epsg4326/best/BlueMarble_ShadedRelief_Bathymetry/default/500m/{z}/{y}/{x}.jpeg"


def fetch(url: str) -> Image.Image:
    req = urllib.request.Request(url, headers={"User-Agent": "radium-texture-build"})
    with urllib.request.urlopen(req, timeout=60) as r:
        return Image.open(io.BytesIO(r.read())).convert("RGB")


def trek(world: str, layer: str, z: int = 2) -> Image.Image:
    """Trek equirectangular pyramids have 2^(z+1) by 2^z tiles of 256 px."""
    cols, rows = 2 ** (z + 1), 2 ** z
    img = Image.new("RGB", (cols * 256, rows * 256))
    for y in range(rows):
        for x in range(cols):
            img.paste(fetch(TREK.format(world=world, layer=layer, z=z, y=y, x=x)), (x * 256, y * 256))
    return img


def gibs(z: int = 2) -> Image.Image:
    """GIBS geographic tiles are 512 px and span 288/2^z degrees from (-180, 90); the last row and column overhang."""
    span = 288.0 / 2 ** z
    cols, rows = -(-360 // int(span)), -(-180 // int(span))
    img = Image.new("RGB", (cols * 512, rows * 512))
    for y in range(rows):
        for x in range(cols):
            img.paste(fetch(GIBS.format(z=z, y=y, x=x)), (x * 512, y * 512))
    px = 512 / span
    return img.crop((0, 0, round(360 * px), round(180 * px)))


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    jobs = {
        "moon": lambda: trek("Moon", "LRO_WAC_Mosaic_Global_303ppd_v02"),
        "mars": lambda: trek("Mars", "Mars_Viking_MDIM21_ClrMosaic_global_232m"),
        "earth": gibs,
    }
    for name, job in jobs.items():
        img = job().resize(SIZE, Image.LANCZOS)
        path = OUT / f"{name}.jpg"
        img.save(path, "JPEG", quality=80, optimize=True, progressive=True)
        print(f"wrote {path.relative_to(ROOT)} {img.size} {path.stat().st_size / 1024:.0f} KB")


if __name__ == "__main__":
    sys.exit(main())
