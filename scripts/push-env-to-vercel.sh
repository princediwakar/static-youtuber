#!/usr/bin/env bash
# Push all env vars from .env.vercel.production to Vercel (production environment only)
set -euo pipefail

ENV_FILE=".env.vercel.production"

# Skip these — they are Vercel auto-injected or OIDC tokens (not user secrets)
SKIP_PREFIXES=(
  "VERCEL"
  "NX_"
  "TURBO_"
)

# Also skip blank values and comment lines
while IFS= read -r line; do
  # Skip comments and blank lines
  [[ "$line" =~ ^# ]] && continue
  [[ -z "$line" ]] && continue

  # Parse KEY=VALUE (handle quoted values)
  if [[ "$line" =~ ^([A-Za-z_][A-Za-z0-9_]*)=\"(.*)\"$ ]]; then
    KEY="${BASH_REMATCH[1]}"
    VALUE="${BASH_REMATCH[2]}"
  elif [[ "$line" =~ ^([A-Za-z_][A-Za-z0-9_]*)=(.*)$ ]]; then
    KEY="${BASH_REMATCH[1]}"
    VALUE="${BASH_REMATCH[2]}"
  else
    continue
  fi

  # Skip auto-injected Vercel vars
  SKIP=false
  for prefix in "${SKIP_PREFIXES[@]}"; do
    if [[ "$KEY" == ${prefix}* ]]; then
      SKIP=true
      break
    fi
  done
  $SKIP && continue

  # Skip empty values
  if [[ -z "$VALUE" ]]; then
    echo "⏭  Skipping $KEY (empty value)"
    continue
  fi

  echo "→ Uploading $KEY"
  echo "$VALUE" | npx vercel env add "$KEY" production --force 2>&1 | tail -1

done < "$ENV_FILE"

echo ""
echo "✅ Done. Run 'npx vercel env ls production' to verify."
