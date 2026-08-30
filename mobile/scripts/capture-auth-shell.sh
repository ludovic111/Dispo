#!/usr/bin/env bash

set -euo pipefail

ios_device_id="${DISPO_IOS_DEVICE_ID:-}"
android_serial="${DISPO_ANDROID_SERIAL:-emulator-5554}"
script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
mobile_dir="$(cd "${script_dir}/.." && pwd)"
output_dir="${1:-${mobile_dir}/captures/auth}"
ios_bundle_id="ch.dispo.app.dev"
android_package="ch.dispo.app.dev"
android_activity="${android_package}/.MainActivity"
adb_bin="${ANDROID_HOME:-/Users/ludovicmarie/Library/Android/sdk}/platform-tools/adb"

if [[ -z "${ios_device_id}" ]]; then
  echo "DISPO_IOS_DEVICE_ID doit contenir l'UDID d'un simulateur iOS démarré." >&2
  exit 64
fi

if [[ ! -x "${adb_bin}" ]]; then
  echo "adb est introuvable sous ${adb_bin}. Définis ANDROID_HOME si nécessaire." >&2
  exit 69
fi

mkdir -p "${output_dir}"

capture_ios() {
  local theme="$1"
  xcrun simctl ui "${ios_device_id}" appearance "${theme}"
  xcrun simctl terminate "${ios_device_id}" "${ios_bundle_id}" 2>/dev/null || true
  xcrun simctl launch "${ios_device_id}" "${ios_bundle_id}" \
    -AppleLanguages '(fr)' -AppleLocale 'fr_CH' >/dev/null
  sleep 3
  xcrun simctl io "${ios_device_id}" screenshot \
    "${output_dir}/expo-ios-fr-${theme}.png" >/dev/null
}

capture_android() {
  local theme="$1"
  local night_mode="no"
  if [[ "${theme}" == "dark" ]]; then night_mode="yes"; fi

  "${adb_bin}" -s "${android_serial}" shell cmd locale set-app-locales \
    "${android_package}" --locales fr-CH
  "${adb_bin}" -s "${android_serial}" shell cmd uimode night "${night_mode}" >/dev/null
  "${adb_bin}" -s "${android_serial}" reverse tcp:8081 tcp:8081 >/dev/null || true
  local ready="false"
  local runtime_log=""
  if [[ "${theme}" == "dark" ]]; then
    "${adb_bin}" -s "${android_serial}" logcat -c
    "${adb_bin}" -s "${android_serial}" shell am force-stop "${android_package}"
    "${adb_bin}" -s "${android_serial}" shell am start -n "${android_activity}" >/dev/null
    for _attempt in {1..15}; do
      sleep 2
      runtime_log="$("${adb_bin}" -s "${android_serial}" logcat -d -t 300 2>/dev/null || true)"
      if [[ "${runtime_log}" == *'ReactNativeJS: Running "main"'* ]]; then
        ready="true"
        break
      fi
    done
  else
    ready="true"
  fi
  if [[ "${ready}" != "true" ]]; then
    echo "Le runtime React Native Android n'a pas démarré en 30 secondes." >&2
    exit 70
  fi

  local output_file="${output_dir}/expo-android-fr-${theme}.png"
  local rendered="false"
  local screenshot_size=0
  for _attempt in {1..10}; do
    sleep 2
    "${adb_bin}" -s "${android_serial}" exec-out screencap -p >"${output_file}"
    screenshot_size="$(wc -c <"${output_file}")"
    if ((screenshot_size > 100000)); then
      rendered="true"
      break
    fi
  done
  if [[ "${rendered}" != "true" ]]; then
    echo "AuthGate Android n'a pas remplacé le splash en 20 secondes." >&2
    exit 70
  fi
}

capture_ios dark
capture_ios light
capture_android dark
capture_android light

echo "Captures écrites dans ${output_dir}"
