#!/usr/bin/env bash
# Hide the DMG's support files (.background.tiff, .VolumeIcon.icns, .DS_Store).
#
# electron-builder 26 (via dmgbuild) writes them at the volume root and relies
# on the leading dot, but macOS 26 Finder shows dot-files in DMG windows, so
# installers looked cluttered. Setting the filesystem `hidden` flag fixes that
# on every macOS version. Run BEFORE notarization: the DMG is rewritten here.
#
# Usage: scripts/hide-dmg-files.sh release/*.dmg

set -euo pipefail

for dmg in "$@"; do
  [ -f "$dmg" ] || { echo "No such file: $dmg" >&2; exit 1; }
  work="$(mktemp -d)"
  rw="$work/rw.dmg"
  echo "Hiding support files in $dmg"
  hdiutil convert -quiet -format UDRW -o "$rw" "$dmg"
  # hdiutil prints tab-separated "device<tab>type<tab>mount point"; the mount point may contain spaces.
  attached="$(hdiutil attach -nobrowse -noautoopen -readwrite "$rw")"
  device="$(printf '%s\n' "$attached" | awk -F'\t' '$3 ~ /^\/Volumes\// {print $1; exit}' | sed 's/[[:space:]]*$//')"
  volume="$(printf '%s\n' "$attached" | awk -F'\t' '$3 ~ /^\/Volumes\// {print $3; exit}' | sed 's/[[:space:]]*$//')"
  if [ -z "$device" ] || [ -z "$volume" ]; then
    echo "Could not mount $rw" >&2
    exit 1
  fi
  shopt -s dotglob nullglob
  for f in "$volume"/.*; do
    name="$(basename "$f")"
    case "$name" in
      .|..|.Trashes|.fseventsd) continue ;;
    esac
    chflags hidden "$f"
    echo "  hidden: $name"
  done
  shopt -u dotglob nullglob
  hdiutil detach -quiet "$device"
  rm -f "$dmg"
  hdiutil convert -quiet -format UDZO -imagekey zlib-level=9 -o "$dmg" "$rw"
  rm -rf "$work"
done
