#!/usr/bin/env bash
#
# Copy the device's scripts into Ableton's User Library.
#
# The .amxd loads `chordlens.server.js` / `chordlens.v8.js` by bare filename,
# resolved next to wherever the device itself lives. Once you drag the device
# into Live it gets copied into the User Library — and from then on Live reads
# THOSE copies, not the ones in this repo. Editing here changes nothing until
# you run this, which is a confusing way to lose an afternoon.
#
# Usage:  ./install-device.sh            copy scripts to every install found
#         ./install-device.sh --check    report drift, change nothing (exit 1 if stale)

set -euo pipefail

cd "$(dirname "$0")"
SCRIPTS=(chordlens.server.js chordlens.v8.js)
LIBRARY="${ABLETON_USER_LIBRARY:-$HOME/Music/Ableton/User Library}"
check_only=false
[[ "${1:-}" == "--check" ]] && check_only=true

if [[ ! -d "$LIBRARY" ]]; then
  echo "No Ableton User Library at: $LIBRARY" >&2
  echo "Set ABLETON_USER_LIBRARY if yours lives elsewhere." >&2
  exit 1
fi

# Every directory holding a copy of the device. (Built with a read loop rather
# than mapfile: macOS still ships bash 3.2.)
targets=()
while IFS= read -r dir; do
  targets+=("$dir")
done < <(find "$LIBRARY" -name ChordLens.amxd -exec dirname {} \; | sort -u)

if [[ ${#targets[@]} -eq 0 ]]; then
  echo "No ChordLens.amxd found under $LIBRARY — drag the device into Live once first." >&2
  exit 1
fi

stale=0
for dir in "${targets[@]}"; do
  for script in "${SCRIPTS[@]}"; do
    if cmp -s "$script" "$dir/$script"; then
      $check_only && echo "ok     $dir/$script"
      continue
    fi
    stale=1
    if $check_only; then
      echo "STALE  $dir/$script"
    else
      cp "$script" "$dir/$script"
      echo "copied $script → $dir"
    fi
  done
done

if $check_only; then
  [[ $stale -eq 0 ]] && echo "Every installed copy matches this repo."
  exit $stale
fi

if [[ $stale -eq 0 ]]; then
  echo "Already up to date."
else
  echo
  echo "Done. The device watches its scripts (@watch / autowatch), so it should"
  echo "reload on its own — check the Max console for 'ChordLens hub listening'."
fi
