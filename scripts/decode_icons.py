#!/usr/bin/env python3
"""Decode committed base64 icons into public/ and android-assets/."""
from __future__ import annotations

import base64
import binascii
import sys
from pathlib import Path

# این اسکریپت باید داخل پوشه‌ای مثل scripts/ باشد.
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

PNG_SIG = b"\x89PNG\r\n\x1a\n"
ICO_SIG = b"\x00\x00\x01\x00"


def decode_base64_file(path: Path) -> bytes:
    text = path.read_text(encoding="ascii")
    compact = "".join(text.split())

    if not compact:
        raise ValueError("empty base64 file")

    try:
        data = base64.b64decode(compact, validate=True)
    except binascii.Error as exc:
        raise ValueError(f"invalid base64: {exc}") from exc

    if not data:
        raise ValueError("decoded data is empty")

    return data


def validate_output(dest: str, data: bytes) -> None:
    if dest.endswith(".png") and not data.startswith(PNG_SIG):
        raise ValueError("missing PNG signature")

    if dest.endswith(".ico") and not data.startswith(ICO_SIG):
        raise ValueError("missing ICO signature")


def main() -> int:
    if not B64.is_dir():
        print(f"error: base64 directory not found: {B64}", file=sys.stderr)
        return 1

    errors: list[str] = []

    for name, dest in MAP.items():
        src = B64 / name

        if not src.exists():
            errors.append(f"missing source: {src}")
            continue

        try:
            data = decode_base64_file(src)
            validate_output(dest, data)
        except (OSError, ValueError) as exc:
            errors.append(f"{src}: {exc}")
            continue

        out = ROOT / dest
        out.parent.mkdir(parents=True, exist_ok=True)

        tmp = out.with_name(out.name + ".tmp")
        tmp.write_bytes(data)
        tmp.replace(out)

        print(f"wrote {dest} ({len(data)} bytes)")

    if errors:
        print("\nErrors:", file=sys.stderr)
        for err in errors:
            print(f"  - {err}", file=sys.stderr)
        return 1

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
