import re
from pathlib import Path

BUILD_GRADLE = Path("android/app/build.gradle")
BUILD_GRADLE_KTS = Path("android/app/build.gradle.kts")
KEYSTORE_PROPS = "keystore.properties"

def load(path: Path) -> str:
    if not path.exists():
        if BUILD_GRADLE_KTS.exists():
            raise SystemExit("Kotlin DSL (build.gradle.kts) detected; this script only supports Groovy DSL.")
        raise SystemExit(f"File not found: {path}")
    return path.read_text(encoding="utf-8")

def ensure_signing_configs(src: str) -> str:
    # اگر signingConfigs.release واقعاً تعریف شده، کاری نکن
    if re.search(r"signingConfigs\s*{[^}]*\brelease\s*{", src, re.DOTALL):
        return src

    signing_block = f"""    signingConfigs {{
        release {{
            def propsFile = rootProject.file("{KEYSTORE_PROPS}")
            if (propsFile.exists()) {{
                def props = new Properties()
                propsFile.withInputStream {{ props.load(it) }}
                storeFile rootProject.file(props["storeFile"])
                storePassword props["storePassword"]
                keyAlias props["keyAlias"]
                keyPassword props["keyPassword"]
            }}
        }}
    }}
"""

    # فقط اگر signingConfigs نداریم اضافه کن؛ اگر هست ولی release ندارد، خطا بده
    if re.search(r"\bsigningConfigs\s*{", src):
        raise SystemExit(
            "signingConfigs already exists without a `release` block; "
            "please add it manually or remove the existing block."
        )

    m = re.search(r"\bandroid\s*{", src)
    if not m:
        raise SystemExit("Could not find `android {` block in build.gradle.")

    insert_at = m.end()
    return src[:insert_at] + "\n" + signing_block + src[insert_at:]

def ensure_release_uses_release_signing(src: str) -> str:
    # جایگزینی debug با release در بلوک release
    new_src, n = re.subn(
        r"(buildTypes\s*{[^}]*?\brelease\s*{[^}]*?)(signingConfig\s+signingConfigs\.debug)",
        r"\1signingConfig signingConfigs.release",
        src,
        count=1,
        flags=re.DOTALL,
    )
    if n > 0:
        return new_src

    # اگر signingConfig signingConfigs.release از قبل هست
    if re.search(
        r"buildTypes\s*{[^}]*?\brelease\s*{[^}]*?signingConfig\s+signingConfigs\.release",
        src,
        re.DOTALL,
    ):
        return src

    # اگر نه debug بود و نه release، بعد از release { اضافه کن
    m = re.search(r"(buildTypes\s*{[^}]*?\brelease\s*{)", src, re.DOTALL)
    if not m:
        raise SystemExit("Could not locate buildTypes { release { ... } in build.gradle.")

    insert_at = m.end()
    addition = "\n            signingConfig signingConfigs.release"
    return src[:insert_at] + addition + src[insert_at:]

def main() -> None:
    src = load(BUILD_GRADLE)
    src = ensure_signing_configs(src)
    src = ensure_release_uses_release_signing(src)
    BUILD_GRADLE.write_text(src, encoding="utf-8")
    print(f"Patched {BUILD_GRADLE}")

if __name__ == "__main__":
    main()
