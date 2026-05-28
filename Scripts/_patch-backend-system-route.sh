#!/usr/bin/env bash
# Idempotently install systemUpdateRoutes into backend.
set -e
SRC="/Users/ilyaklipinitser/Downloads/Dwellium -Per Spec/Docs/backend-system-update-routes.ts"
DST="/Users/ilyaklipinitser/dwellium-backend/ai-dashboard369-file-manager/src/routes/systemUpdateRoutes.ts"
APP_TS="/Users/ilyaklipinitser/dwellium-backend/ai-dashboard369-file-manager/src/app.ts"

cp "$SRC" "$DST"
chmod +x "/Users/ilyaklipinitser/Downloads/Dwellium -Per Spec/Scripts/system-update.sh"
echo "Copied route + chmod script."

python3 <<'PY'
import re
from pathlib import Path
p = Path("/Users/ilyaklipinitser/dwellium-backend/ai-dashboard369-file-manager/src/app.ts")
s = p.read_text()

imp = "import systemUpdateRoutes from './routes/systemUpdateRoutes';"
if imp not in s:
    m = re.search(r"^import terminalRoutes from '\./routes/terminalRoutes';$", s, re.M)
    if not m: raise SystemExit("anchor (import terminalRoutes) not found")
    s = s[:m.end()] + "\n" + imp + s[m.end():]

mnt = "app.use('/api/system', systemUpdateRoutes);"
if mnt not in s:
    m = re.search(r"^app\.use\('/api/terminal', terminalRoutes\);$", s, re.M)
    if not m: raise SystemExit("anchor (app.use terminal) not found")
    s = s[:m.end()] + "\n" + mnt + s[m.end():]

p.write_text(s)
print("PATCH OK")
PY
echo "---"
grep -n 'systemUpdateRoutes\|/api/system' "$APP_TS" | head
