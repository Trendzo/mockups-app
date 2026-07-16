#!/usr/bin/env bash
# This checkout lives on an exFAT external drive. exFAT can't hold macOS's
# per-file metadata, so the OS shadows every file Gradle/CMake writes with a
# "._name" AppleDouble companion — which breaks AAPT resource parsing and even
# plain directory deletion for native modules under node_modules.
#
# Fix: replace every android/build directory (root app + every node_modules
# native module) and the app's CMake .cxx directory with a symlink into
# ~/Library/Caches on the internal APFS disk. Paths keep resolving exactly as
# before (symlinks are transparent), which matters because RN's CMake
# autolinking script hardcodes real "node_modules/<pkg>/android/build/..."
# paths — a Gradle-only buildDir override doesn't update those.
#
# Safe to re-run any time (idempotent): skips anything already a symlink, and
# only touches gitignored build output, never source.
set -euo pipefail

APP_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CACHE_ROOT="$HOME/Library/Caches/trendzo-mockups-android"

relocate() {
  local real_dir="$1"      # path (may not exist yet) to replace with a symlink
  local cache_key="$2"     # unique subfolder name under CACHE_ROOT
  local cache_dir="$CACHE_ROOT/$cache_key"

  if [ -L "$real_dir" ]; then
    return 0 # already relocated
  fi
  mkdir -p "$cache_dir"
  rm -rf "$real_dir"
  ln -s "$cache_dir" "$real_dir"
}

# 1) Root project + the app module itself.
relocate "$APP_ROOT/android/build" "root-build"
relocate "$APP_ROOT/android/app/build" "app-build"
relocate "$APP_ROOT/android/app/.cxx" "app-cxx"
relocate "$APP_ROOT/android/.gradle" "dot-gradle"

# 2) Every native module under node_modules that has its own android/build.gradle
#    (Groovy) or android/build.gradle.kts (Kotlin DSL — e.g. worklets, reanimated).
count=0
while IFS= read -r -d '' gradle_file; do
  mod_android_dir="$(dirname "$gradle_file")"
  mod_build_dir="$mod_android_dir/build"
  # Cache key = the module's path under node_modules, flattened.
  key="nm-$(python3 -c "import sys,os; print(os.path.relpath(sys.argv[1], sys.argv[2]).replace('/', '__'))" "$mod_android_dir" "$APP_ROOT/node_modules")"
  relocate "$mod_build_dir" "$key"
  count=$((count + 1))
done < <(find "$APP_ROOT/node_modules" -maxdepth 4 \( -path '*/android/build.gradle' -o -path '*/android/build.gradle.kts' \) -print0)

echo "Relocated root/app build dirs + $count node_modules native module build dirs onto $CACHE_ROOT"
