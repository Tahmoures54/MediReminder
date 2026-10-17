#!/usr/bin/env bash
# Generate a local upload keystore for Play / Bazaar / Myket.
# KEEP THE OUTPUT DIRECTORY FOREVER — app updates cannot be published without it.
set -euo pipefail

# Default output inside the Android module so Gradle's rootProject.file() finds it.
OUT_DIR="${1:-android/signing-key}"
ALIAS="${ALIAS:-medireminder}"
VALIDITY_DAYS="${VALIDITY_DAYS:-10000}"
DNAME="${DNAME:-CN=MediReminder, OU=Release, O=MediReminder, L=Tehran, C=IR}"

STORE_FILE="$OUT_DIR/medireminder-release.jks"
CREDS_FILE="$OUT_DIR/keystore.properties"

# --- password helpers -------------------------------------------------------
gen_pass() { openssl rand -hex 16; }   # 32 hex chars, no pipe, no SIGPIPE

STORE_PASS="${STORE_PASS:-$(gen_pass)}"
KEY_PASS="${KEY_PASS:-$(gen_pass)}"

# Reject characters that break Java Properties or keytool dname parsing.
for v in "$STORE_PASS" "$KEY_PASS"; do
  if [[ ! "$v" =~ ^[A-Za-z0-9]+$ ]]; then
    echo "error: passwords must be alphanumeric only" >&2
    exit 2
  fi
done

# --- directory & permissions -----------------------------------------------
umask 077
mkdir -p "$OUT_DIR"

if [[ -f "$STORE_FILE" ]]; then
  echo "Keystore already exists: $STORE_FILE" >&2
  echo "Refusing to overwrite — replacing the upload key breaks all future updates." >&2
  exit 1
fi

# --- generate ---------------------------------------------------------------
keytool -genkeypair -noprompt \
  -keystore "$STORE_FILE" \
  -storetype JKS \
  -alias "$ALIAS" \
  -keyalg RSA -keysize 2048 -sigalg SHA256withRSA \
  -validity "$VALIDITY_DAYS" \
  -storepass "$STORE_PASS" \
  -keypass "$KEY_PASS" \
  -dname "$DNAME"

# Verify the keystore actually opens before writing credentials
keytool -list -keystore "$STORE_FILE" -storepass "$STORE_PASS" -alias "$ALIAS" >/dev/null

# --- path for keystore.properties ------------------------------------------
# Gradle does rootProject.file(props["storeFile"]) where rootProject = android/.
# So storeFile must be relative to android/, not to the Flutter project root.
STORE_REL="${STORE_FILE#android/}"
STORE_REL="${STORE_REL#./}"

# --- write properties (with # comments so Java Properties ignores them) ----
{
  echo "# این فایل را برای همیشه و در جای امن نگه دارید."
  echo "# بدون این کلید و رمزها نمی‌توانید در گوگل‌پلی / بازار / مایکت آپدیت منتشر کنید."
  echo "# این فایل را هرگز در git commit نکنید."
  echo "alias=$ALIAS"
  echo "storePassword=$STORE_PASS"
  echo "keyPassword=$KEY_PASS"
  echo "storeFile=$STORE_REL"
  echo "validityDays=$VALIDITY_DAYS"
} > "$CREDS_FILE"

chmod 600 "$STORE_FILE" "$CREDS_FILE"
chmod 700 "$OUT_DIR"

echo "Wrote $STORE_FILE"
echo "Wrote $CREDS_FILE"
echo
echo "IMPORTANT:"
echo "  - Back up $OUT_DIR/ to at least two offline locations."
echo "  - Add 'signing-key/' to .gitignore."
echo "  - Copy $CREDS_FILE to android/keystore.properties if it is not already there."
echo "  - storeFile '$STORE_REL' is resolved relative to android/."
