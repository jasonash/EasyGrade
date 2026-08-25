#!/usr/bin/env bash
# Tidy the DMG's support files (.background.tiff, .VolumeIcon.icns, .DS_Store).
#
# electron-builder 26 (via dmgbuild) writes them at the volume root with only
# a leading dot. Two measures keep them out of the installer window:
#   1. the filesystem `hidden` flag, for Finders that honor flags but not dots;
#   2. icon positions far outside the window, recorded in .DS_Store through
#      Finder, so even a Finder set to show hidden files has nothing to draw.
# Run BEFORE notarization: the DMG is rewritten here.
#
# Usage: scripts/hide-dmg-files.sh release/*.dmg

set -euo pipefail

# Park the support files' icons well outside the window (which is 540x380 in
# package.json) and let Finder write the positions into .DS_Store.
position_offscreen() {
  local volume="$1"
  # The volume is mounted -nobrowse (a browsable mount makes macOS add an
  # .fseventsd folder to the image), so address items by path, not disk name.
  osascript <<APPLESCRIPT || echo "  warning: Finder could not reposition icons (positions left as built)" >&2
tell application "Finder"
  set root to POSIX file "$volume" as alias
  open root
  delay 1
  repeat with n in {".background.tiff", ".VolumeIcon.icns"}
    try
      set position of item (POSIX file ("$volume/" & n) as alias) to {1400, 900}
    end try
  end repeat
  update every item of root
  delay 1
  close window of root
end tell
APPLESCRIPT
  echo "  positioned support icons off-screen"
}

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
  position_offscreen "$volume"
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
  sync
  hdiutil detach -quiet "$device"
  rm -f "$dmg"
  hdiutil convert -quiet -format UDZO -imagekey zlib-level=9 -o "$dmg" "$rw"
  rm -rf "$work"
done
