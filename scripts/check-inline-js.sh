#!/usr/bin/env bash
# Check syntax of every inline <script> block in root-level HTML files.
# Usage: bash scripts/check-inline-js.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

fail=0
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

shopt -s nullglob
htmls=(*.html)
if [ ${#htmls[@]} -eq 0 ]; then
  echo "No root-level HTML files found."
  exit 0
fi

for html in "${htmls[@]}"; do
  # Extract inline script bodies (no src= attribute) into numbered files
  python3 - "$html" "$tmp" <<'PY'
import re, sys, os
path, outdir = sys.argv[1], sys.argv[2]
src = open(path, encoding="utf-8").read()
# Match <script ...> that do NOT have a src= attribute
blocks = re.findall(
    r"<script(?![^>]*\bsrc=)[^>]*>(.*?)</script>",
    src,
    flags=re.I | re.S,
)
for i, body in enumerate(blocks):
    out = os.path.join(outdir, f"{os.path.basename(path)}.{i}.js")
    open(out, "w", encoding="utf-8").write(body)
PY

  for js in "$tmp"/"$html".*.js; do
    [ -f "$js" ] || continue
    # Skip empty / whitespace-only blocks
    if ! grep -q '[^[:space:]]' "$js"; then
      continue
    fi
    if ! err=$(node --check "$js" 2>&1); then
      echo "FAIL: $html"
      echo "$err"
      fail=1
    fi
  done
  # Clean per-file extracts so next html starts fresh
  rm -f "$tmp"/"$html".*.js
done

if [ "$fail" -ne 0 ]; then
  exit 1
fi
echo "OK: all root inline scripts pass node --check"
