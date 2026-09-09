#!/usr/bin/env python3
"""Decode committed base64 icons into public/ and android-assets/."""
from pathlib import Path
import base64
import shutil

ROOT = Path(__file__).resolve().parent.parent
B64 = ROOT / "icon-b64"

MAP = {
    "public__icon-192.png.b64": "public/icon-192.png",
    "public__icon-512.png.b64": "public/icon-512.png",
    "public__android-chrome-192x192.png.b64": "public/android-chrome-192x192.png",
    "public__android-chrome-512x512.png.b64": "public/android-chrome-512x512.png",
    "public__apple-touch-icon.png.b64": "public/apple-touch-icon.png",
    "public__favicon-16x16.png.b64": "public/favicon-16x16.png",
    "public__favicon-32x32.png.b64": "public/favicon-32x32.png",
    "public__favicon.ico.b64": "public/favicon.ico",
    "public__maskable-192.png.b64": "public/maskable-192.png",
    "public__maskable-512.png.b64": "public/maskable-512.png",
    "android-assets__mipmap-mdpi__ic_launcher.png.b64": "android-assets/mipmap-mdpi/ic_launcher.png",
    "android-assets__mipmap-hdpi__ic_launcher.png.b64": "android-assets/mipmap-hdpi/ic_launcher.png",
    "android-assets__mipmap-xhdpi__ic_launcher.png.b64": "android-assets/mipmap-xhdpi/ic_launcher.png",
    "android-assets__mipmap-xxhdpi__ic_launcher.png.b64": "android-assets/mipmap-xxhdpi/ic_launcher.png",
    "android-assets__mipmap-xxxhdpi__ic_launcher.png.b64": "android-assets/mipmap-xxxhdpi/ic_launcher.png",
}

def main():
    for name, dest in MAP.items():
        src = B64 / name
        if not src.exists():
            print("missing", src)
            continue
        out = ROOT / dest
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_bytes(base64.b64decode(src.read_text().strip()))
        print("wrote", dest, out.stat().st_size)
        if dest.endswith("/ic_launcher.png"):
            shutil.copy(out, out.parent / "ic_launcher_round.png")
            shutil.copy(out, out.parent / "ic_launcher_foreground.png")

if __name__ == "__main__":
    main()
