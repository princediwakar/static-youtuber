#!/usr/bin/env bash
# scripts/download-assets.sh
# Run once after cloning: bash scripts/download-assets.sh
# Downloads Montserrat Bold font + 3 CC BY music tracks into assets/
# All URLs verified 2026-06-25.

set -e

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MUSIC_DIR="$PROJECT_ROOT/assets/music"
FONT_DIR="$PROJECT_ROOT/assets/fonts"

mkdir -p "$MUSIC_DIR" "$FONT_DIR"

echo "📦 Downloading assets for ai-slideshow..."

# ─── Montserrat Bold TTF ──────────────────────────────────────────────────────
# Source: JulietaUla/Montserrat on GitHub (the official Montserrat repository)
# License: SIL Open Font License 1.1 — free for commercial use, no attribution required
FONT_FILE="$FONT_DIR/Montserrat-Bold.ttf"
if [ ! -f "$FONT_FILE" ]; then
  echo "⬇️  Downloading Montserrat-Bold.ttf..."
  curl -fL \
    "https://github.com/JulietaUla/Montserrat/raw/master/fonts/ttf/Montserrat-Bold.ttf" \
    -o "$FONT_FILE"
  echo "✅ Font saved: assets/fonts/Montserrat-Bold.ttf"
else
  echo "✅ Montserrat-Bold.ttf already exists"
fi

# ─── Background Music (Kevin MacLeod / incompetech.com) ──────────────────────
# License: Creative Commons Attribution 4.0 (CC BY 4.0)
# Required attribution in video description (added automatically by the pipeline
# in the YouTube description field — see constants.ts MUSIC_ATTRIBUTION).
#
# All URLs verified live as of 2026-06-25.
# Format: https://incompetech.com/music/royalty-free/mp3-royaltyfree/<Track+Name>.mp3

download_track() {
  local name="$1"
  local url="$2"
  local out="$MUSIC_DIR/$name"
  if [ ! -f "$out" ]; then
    echo "⬇️  Downloading $name..."
    if curl -fL "$url" -o "$out"; then
      echo "✅ $name saved"
    else
      echo "⚠️  Failed to download $name — skipping (pipeline will run without this track)"
      rm -f "$out"
    fi
  else
    echo "✅ $name already exists"
  fi
}

# Track 1: Investigations — sneaky, curious, light tension
# Great for ancient/historical mysteries
download_track "focus-01.mp3" \
  "https://incompetech.com/music/royalty-free/mp3-royaltyfree/Investigations.mp3"


# Track 2: Americana — warm, understated, slightly epic underscore
# Works well as neutral background under narration
download_track "tension-01.mp3" \
  "https://incompetech.com/music/royalty-free/mp3-royaltyfree/Americana.mp3"

# Track 3: Invariance — minimal, ambient, subtle tension
# Perfect for mysterious/dark history topics
download_track "ambient-01.mp3" \
  "https://incompetech.com/music/royalty-free/mp3-royaltyfree/Invariance.mp3"

echo ""
echo "🎉 Asset download complete!"
echo ""
echo "Files installed:"
ls -lh "$FONT_DIR" 2>/dev/null | grep -v total || echo "  (font dir empty)"
ls -lh "$MUSIC_DIR" 2>/dev/null | grep -v total || echo "  (music dir empty — pipeline will run silently)"
echo ""
echo "Attribution required in video descriptions:"
echo "  Music by Kevin MacLeod (incompetech.com)"
echo "  Licensed under Creative Commons: By Attribution 4.0 License"
echo "  http://creativecommons.org/licenses/by/4.0/"
echo ""
echo "Next step: node setup-database.js (if not already done)"
