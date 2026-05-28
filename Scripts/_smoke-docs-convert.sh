#!/usr/bin/env bash
# Smoke test the /api/docs/convert endpoint: create a tiny PDF, convert to DOCX, verify.
set -e
TMPDIR_BASE=$(mktemp -d)
cd "$TMPDIR_BASE"

# Find a real PDF on disk to use as input — try the Resume file first
INPUT="/Users/ilyaklipinitser/Downloads/Dwellium -Per Spec/qualia-shell/public/assets/sample.pdf"
if [ ! -f "$INPUT" ]; then
  # Find any PDF under the project
  INPUT=$(find "/Users/ilyaklipinitser/Downloads/Dwellium -Per Spec" -maxdepth 6 -name '*.pdf' 2>/dev/null | head -1)
fi
if [ ! -f "$INPUT" ]; then
  echo "Generating throwaway PDF via soffice"
  echo "Test conversion document" > input.txt
  /opt/homebrew/bin/soffice --headless --convert-to pdf input.txt --outdir "$TMPDIR_BASE" >/dev/null 2>&1
  INPUT="$TMPDIR_BASE/input.pdf"
fi
echo "INPUT: $INPUT ($(stat -f%z "$INPUT") bytes)"

OUT=/tmp/converted.docx
HTTP=$(curl -s -o "$OUT" -w '%{http_code}' \
  -X POST http://localhost:3000/api/docs/convert \
  -F "file=@${INPUT}" \
  -F 'targetFormat=docx')

echo "HTTP: $HTTP"
echo "OUTPUT SIZE: $(stat -f%z "$OUT" 2>/dev/null || echo 'missing') bytes"
file "$OUT"
echo "--- first 100 bytes (hex) ---"
xxd "$OUT" | head -4

# 504b0304 = ZIP magic = valid DOCX (DOCX is a zip container)
if xxd -l 4 "$OUT" | grep -q '504b 0304'; then
  echo "✓ Valid DOCX (ZIP magic confirmed)"
else
  echo "✗ NOT a valid DOCX"
  head -c 500 "$OUT"
  exit 1
fi
