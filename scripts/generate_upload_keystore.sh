#!/usr/bin/env bash
# Generate a local upload keystore for Play / Bazaar / Myket.
# Keep the output directory forever — app updates cannot be published without it.
set -euo pipefail

OUT_DIR="${1:-./signing-key}"
mkdir -p "$OUT_DIR"

STORE_PASS="${STORE_PASS:-$(openssl rand -base64 24 | tr -d '/+=' | head -c 24)}"
KEY_PASS="${KEY_PASS:-$(openssl rand -base64 24 | tr -d '/+=' | head -c 24)}"
ALIAS="${ALIAS:-medireminder}"
STORE_FILE="$OUT_DIR/medireminder-release.jks"

if [[ -f "$STORE_FILE" ]]; then
  echo "Keystore already exists: $STORE_FILE" >&2
  exit 1
fi

keytool -genkeypair -noprompt \
  -keystore "$STORE_FILE" \
  -storetype JKS \
  -alias "$ALIAS" \
  -keyalg RSA -keysize 2048 -validity 10000 \
  -storepass "$STORE_PASS" \
  -keypass "$KEY_PASS" \
  -dname "CN=MediReminder, OU=Release, O=MediReminder, L=Tehran, C=IR"

{
  echo "این فایل را برای همیشه نگه دارید. بدون همین کلید نمی‌توانید آپدیت در گوگل‌پلی / بازار / مایکت منتشر کنید."
  echo
  echo "alias=$ALIAS"
  echo "storePassword=$STORE_PASS"
  echo "keyPassword=$KEY_PASS"
  echo "storeFile=medireminder-release.jks"
  echo "validityDays=10000"
} > "$OUT_DIR/credentials.txt"

echo "Wrote $STORE_FILE"
echo "Wrote $OUT_DIR/credentials.txt"
