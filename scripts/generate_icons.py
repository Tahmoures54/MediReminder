#!/usr/bin/env python3
"""Generate all PWA + Android launcher icons from the branded master asset."""
from __future__ import annotations

from pathlib import Path

try:
    from PIL import Image
except ImportError as e:
    raise SystemExit(
        "Pillow is required: pip install pillow\n" + str(e)
    ) from e

ROOT = Path(__file__).resolve().parent.parent
PUBLIC = ROOT / "public"
ASSETS = ROOT / "android-assets"

# Prefer the high-res branded design already in the repo
CANDIDATES = [
    PUBLIC / "icon-512.png",
    PUBLIC / "icon-192.png",
]


def find_master() -> Image.Image:
    best = None
    best_area = 0
    for p in CANDIDATES:
        if p.exists():
            im = Image.open(p).convert("RGBA")
            area = im.size[0] * im.size[1]
            if area > best_area and min(im.size) >= 180:
                best = im
                best_area = area
                print(f"master candidate: {p} {im.size}")
    if best is None:
        raise SystemExit("No master icon found in public/")
    return best


def resize(im: Image.Image, size: int) -> Image.Image:
    return im.resize((size, size), Image.Resampling.LANCZOS)


def maskable(im: Image.Image, size: int) -> Image.Image:
    bg = Image.new("RGBA", (size, size), (8, 145, 178, 255))
    content = resize(im, int(size * 0.72))
    off = (size - content.size[0]) // 2
    bg.paste(content, (off, off), content)
    return bg


def main() -> None:
    master = find_master()
    PUBLIC.mkdir(exist_ok=True)

    targets = {
        "icon-192.png": 192,
        "icon-512.png": 512,
        "android-chrome-192x192.png": 192,
        "android-chrome-512x512.png": 512,
        "apple-touch-icon.png": 180,
        "favicon-32x32.png": 32,
        "favicon-16x16.png": 16,
    }
    for name, size in targets.items():
        out = PUBLIC / name
        resize(master, size).save(out, "PNG", optimize=True)
        print("wrote", out.relative_to(ROOT), size)

    for size, name in [(192, "maskable-192.png"), (512, "maskable-512.png")]:
        out = PUBLIC / name
        maskable(master, size).save(out, "PNG", optimize=True)
        print("wrote", out.relative_to(ROOT), size)

    icons = [resize(master, s) for s in (16, 32, 48)]
    icons[0].save(PUBLIC / "favicon.ico", format="ICO", sizes=[(16, 16), (32, 32), (48, 48)])
    print("wrote public/favicon.ico")

    densities = {
        "mdpi": 48,
        "hdpi": 72,
        "xhdpi": 96,
        "xxhdpi": 144,
        "xxxhdpi": 192,
    }
    for dens, size in densities.items():
        d = ASSETS / f"mipmap-{dens}"
        d.mkdir(parents=True, exist_ok=True)
        im = resize(master, size)
        for n in ("ic_launcher.png", "ic_launcher_round.png", "ic_launcher_foreground.png"):
            im.save(d / n, "PNG", optimize=True)
        print(f"wrote android-assets/mipmap-{dens}/* ({size}px)")


if __name__ == "__main__":
    main()
