#!/usr/bin/env bash
# Build Capacitor Android APK / Play Store AAB against the hosted API server.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

MODE="${1:-aab}" # debug | release | aab

# --- JDK: Android Gradle needs a FULL JDK 17/21 with javac ---
pick_java_home() {
  if [[ -n "${JAVA_HOME:-}" && -x "${JAVA_HOME}/bin/javac" ]]; then
    echo "$JAVA_HOME"
    return 0
  fi
  local candidate
  for candidate in \
    /usr/lib/jvm/java-21-openjdk-amd64 \
    /usr/lib/jvm/java-17-openjdk-amd64 \
    /usr/lib/jvm/java-21-openjdk \
    /usr/lib/jvm/java-17-openjdk \
    /usr/lib/jvm/temurin-21-jdk-amd64 \
    /usr/lib/jvm/temurin-17-jdk-amd64
  do
    if [[ -x "$candidate/bin/javac" ]]; then
      echo "$candidate"
      return 0
    fi
  done
  if command -v javac >/dev/null 2>&1; then
    local javac_path jhome
    javac_path="$(readlink -f "$(command -v javac)")"
    jhome="$(dirname "$(dirname "$javac_path")")"
    if [[ -x "$jhome/bin/javac" ]] && [[ "$jhome" != *java-25* ]]; then
      echo "$jhome"
      return 0
    fi
  fi
  return 1
}

if ! JAVA_HOME_RESOLVED="$(pick_java_home)"; then
  cat <<'EOF'
ERROR: To'liq JDK topilmadi (javac yo'q).

Yechim (JDK 21 tavsiya):
  sudo apt update && sudo apt install -y openjdk-21-jdk
  export JAVA_HOME=/usr/lib/jvm/java-21-openjdk-amd64
  export PATH="$JAVA_HOME/bin:$PATH"
EOF
  exit 1
fi

export JAVA_HOME="$JAVA_HOME_RESOLVED"
export PATH="$JAVA_HOME/bin:$PATH"
echo "==> JAVA_HOME=$JAVA_HOME"

export ANDROID_HOME="${ANDROID_HOME:-${HOME}/Android/Sdk}"
if [[ ! -d "$ANDROID_HOME" && -d /opt/android-sdk ]]; then
  export ANDROID_HOME=/opt/android-sdk
fi
export PATH="$ANDROID_HOME/cmdline-tools/latest/bin:$ANDROID_HOME/platform-tools:$PATH"

if [[ ! -d "$ANDROID_HOME" ]]; then
  cat <<EOF
ERROR: Android SDK topilmadi (ANDROID_HOME=$ANDROID_HOME).
Avval ishga tushiring: ./scripts/setup-android-sdk.sh
EOF
  exit 1
fi

OUT_DIR="${APK_OUT:-$ROOT/artifacts}"
mkdir -p "$OUT_DIR"

if [[ ! -d "$ROOT/node_modules" ]]; then
  echo "==> npm install (frontend deps)"
  npm install --no-fund --no-audit
fi

# Note: vite.config.ts uses envPrefix: 'PUBLIC_'!
DEFAULT_API_URL="https://ais-pre-qklrabiwvmysvkgylkte2l-105846898450.asia-southeast1.run.app/api"
if [[ -f "$ROOT/.env.capacitor" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "$ROOT/.env.capacitor"
  set +a
fi

export PUBLIC_API_URL="${PUBLIC_API_URL:-$DEFAULT_API_URL}"
if [[ "$PUBLIC_API_URL" != https://* ]]; then
  echo "ERROR: Play Market APK/AAB uchun PUBLIC_API_URL https:// bilan boshlanishi shart (hozir: $PUBLIC_API_URL)"
  exit 1
fi

echo "==> Vite build (mode=capacitor, PUBLIC_API_URL=$PUBLIC_API_URL)"
npm run build -- --mode capacitor

# Guard: verify PUBLIC_API_URL was actually compiled into dist/
if ! grep -Rql --include='*.js' "$PUBLIC_API_URL" dist; then
  echo "ERROR: dist ichida $PUBLIC_API_URL topilmadi. Build konfiguratsiyasini tekshiring."
  exit 1
fi
echo "==> API URL baked OK ($PUBLIC_API_URL)"

echo "==> Capacitor sync android"
npx cap sync android

HEALTH_URL="${PUBLIC_API_URL%/}/health"
if curl -sf --connect-timeout 5 "$HEALTH_URL" >/dev/null 2>&1; then
  echo "==> Backend health check OK ($HEALTH_URL)"
else
  echo "==> WARNING: $HEALTH_URL ga hozir ulanib bo'lmadi (tarmoq yoki server uyquda bo'lishi mumkin)."
fi

# Release APK and Play Store AAB both require signing via android/key.properties
if [[ "$MODE" == "release" || "$MODE" == "aab" ]]; then
  KEYSTORE="${RELEASE_KEYSTORE:-$ROOT/android/release.keystore}"
  if [[ ! -f "$ROOT/android/key.properties" ]]; then
    if [[ ! -f "$KEYSTORE" ]]; then
      echo "==> Generating upload keystore at: $KEYSTORE"
      echo "    MUHIM: Play Marketga yuklaganingizdan keyin bu faylni va parolni xavfsiz saqlang!"
      keytool -genkeypair -v \
        -keystore "$KEYSTORE" \
        -alias "${RELEASE_KEY_ALIAS:-mexrliqollar}" \
        -keyalg RSA -keysize 2048 -validity 10000 \
        -storepass "${RELEASE_STORE_PASSWORD:-mexrliqollar_release}" \
        -keypass "${RELEASE_KEY_PASSWORD:-mexrliqollar_release}" \
        -dname "CN=mexrliqollar.uz, OU=Mobile, O=Mehrli Qollar, L=Samarkand, ST=Samarkand, C=UZ"
    fi
    cat > "$ROOT/android/key.properties" <<EOF
storeFile=$KEYSTORE
storePassword=${RELEASE_STORE_PASSWORD:-mexrliqollar_release}
keyAlias=${RELEASE_KEY_ALIAS:-mexrliqollar}
keyPassword=${RELEASE_KEY_PASSWORD:-mexrliqollar_release}
EOF
  fi
fi

GRADLE_VERSION_ARGS=()
if [[ -n "${VERSION_CODE:-}" ]]; then
  GRADLE_VERSION_ARGS+=("-PVERSION_CODE=${VERSION_CODE}")
fi
if [[ -n "${VERSION_NAME:-}" ]]; then
  GRADLE_VERSION_ARGS+=("-PVERSION_NAME=${VERSION_NAME}")
fi

case "$MODE" in
  debug)
    echo "==> assembleDebug (APK)"
    (cd android && ./gradlew assembleDebug -Dorg.gradle.java.home="$JAVA_HOME" "${GRADLE_VERSION_ARGS[@]}")
    ARTIFACT="$ROOT/android/app/build/outputs/apk/debug/app-debug.apk"
    EXT="apk"
    ;;
  release)
    echo "==> assembleRelease (APK)"
    (cd android && ./gradlew assembleRelease -Dorg.gradle.java.home="$JAVA_HOME" "${GRADLE_VERSION_ARGS[@]}")
    ARTIFACT="$ROOT/android/app/build/outputs/apk/release/app-release.apk"
    EXT="apk"
    ;;
  aab)
    echo "==> bundleRelease (AAB — Google Play Market uchun)"
    (cd android && ./gradlew bundleRelease -Dorg.gradle.java.home="$JAVA_HOME" "${GRADLE_VERSION_ARGS[@]}")
    ARTIFACT="$ROOT/android/app/build/outputs/bundle/release/app-release.aab"
    EXT="aab"
    ;;
  *)
    echo "Usage: $0 [debug|release|aab]"
    exit 1
    ;;
esac

STAMP=$(date +%Y%m%d-%H%M%S)
DEST="$OUT_DIR/mexrliqollar-${MODE}-${STAMP}.${EXT}"
cp -f "$ARTIFACT" "$DEST"
cp -f "$ARTIFACT" "$OUT_DIR/mexrliqollar-${MODE}-latest.${EXT}"
echo "Artifact ready: $DEST"
ls -lh "$DEST"
echo "Also: $OUT_DIR/mexrliqollar-${MODE}-latest.${EXT}"
