#!/usr/bin/env python3
"""Generate all PWA + Android launcher icons from the branded master asset."""
from __future__ import annotations

from pathlib import Path

try:
    from PIL import Image, ImageDraw
except ImportError as e:
    raise SystemExit("Pillow is required: pip install pillow\n" + str(e)) from e

ROOT = Path(__file__).resolve().parent.parent
PUBLIC = ROOT / "public"
ASSETS = ROOT / "android-assets"

THEME_RGB = (8, 145, 178)        # #0891b2
THEME_RGBA = (*THEME_RGB, 255)

CANDIDATES = [
    PUBLIC / "icon-512.png",
    PUBLIC / "icon-192.png",
]

# adaptive icon: launcher size → foreground size (108dp canvas, 72dp safe)
ANDROID_DENSITIES = {
    "mdpi":    (48,  108),
    "hdpi":    (72,  162),
    "xhdpi":   (96,  216),
    "xxhdpi":  (144, 324),
    "xxxhdpi": (192, 432),
}


def find_master() -> Image.Image:
    best: Image.Image | None = None
    best_area = 0
    for p in CANDIDATES:
        if not p.exists():
            continue
        im = Image.open(p).convert("RGBA")
        area = im.size[0] * im.size[1]
        if area > best_area and min(im.size) >= 512:
            best, best_area = im, area
            print(f"master candidate: {p} {im.size}")
    if best is None:
        raise SystemExit("No master icon ≥512px found in public/")
    return best


def resize(im: Image.Image, size: int) -> Image.Image:
    return im.resize((size, size), Image.Resampling.LANCZOS)


def flatten(im: Image.Image, size: int, bg_rgb=THEME_RGB) -> Image.Image:
    """Resize and composite on opaque background (for iOS, etc.)."""
    scaled = resize(im, size)
    canvas = Image.new("RGB", (size, size), bg_rgb)
    canvas.paste(scaled, (0, 0), scaled)
    return canvas


def maskable(im: Image.Image, size: int, content_ratio: float = 0.66) -> Image.Image:
    """
    Maskable icon: full-bleed background + centered content.

    content_ratio 0.66 keeps the important content inside the 66/108
    Android safe zone; 0.56 guarantees a fully square-safe mask.
    """
    bg = Image.new("RGBA", (size, size), THEME_RGBA)
    inner = max(1, int(size * content_ratio))
    content = resize(im, inner)
    off = (size - inner) // 2
    bg.paste(content, (off, off), content)
    return bg


def round_icon(im: Image.Image, size: int) -> Image.Image:
    """Square icon circularly masked (Android legacy round launcher)."""
    square = resize(im, size).convert("RGBA")
    mask = Image.new("L", (size, size), 0)
    ImageDraw.Draw(mask).ellipse((0, 0, size - 1, size - 1), fill=255)
    square.putalpha(mask)
    return square


def adaptive_foreground(im: Image.Image, size: int) -> Image.Image:
    """108dp foreground: full canvas transparent, content inside 72dp (66%)."""
    canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    inner = max(1, int(size * 66 / 108))
    content = resize(im, inner)
    off = (size - inner) // 2
    canvas.paste(content, (off, off), content)
    return canvas


def main() -> None:
    master = find_master()
    PUBLIC.mkdir(exist_ok=True)

    # PWA icons
    targets = {
        "icon-192.png": 192,
        "icon-512.png": 512,
        "android-chrome-192x192.png": 192,
        "android-chrome-512x512.png": 512,
        "favicon-32x32.png": 32,
        "favicon-16x16.png": 16,
    }
    for name, size in targets.items():
        out = PUBLIC / name
        resize(master, size).save(out, "PNG", optimize=True)
        print("wrote", out.relative_to(ROOT), size)

    # iOS needs opaque
    flatten(master, 180).save(PUBLIC / "apple-touch-icon.png", "PNG", optimize=True)
    print("wrote public/apple-touch-icon.png 180 (opaque)")

    # Maskable
    for size, name in ((192, "maskable-192.png"), (512, "maskable-512.png")):
        out = PUBLIC / name
        maskable(master, size).save(out, "PNG", optimize=True)
        print("wrote", out.relative_to(ROOT), size)

    # favicon.ico from the largest render, NOT the 16px one
    resize(master, 48).save(
        PUBLIC / "favicon.ico",
        format="ICO",
        sizes=[(16, 16), (32, 32), (48, 48)],
    )
    print("wrote public/favicon.ico")

    # Android mipmaps
    for dens, (launcher, fg) in ANDROID_DENSITIES.items():
        d = ASSETS / f"mipmap-{dens}"
        d.mkdir(parents=True, exist_ok=True)
        resize(master, launcher).save(d / "ic_launcher.png", "PNG", optimize=True)
        round_icon(master, launcher).save(d / "ic_launcher_round.png", "PNG", optimize=True)
        adaptive_foreground(master, fg).save(d / "ic_launcher_foreground.png", "PNG", optimize=True)
        print(f"wrote android-assets/mipmap-{dens}/* (launcher {launcher}, fg {fg})")


if __name__ == "__main__":
    main()
