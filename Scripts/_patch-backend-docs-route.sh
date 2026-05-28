#!/usr/bin/env bash
# Idempotently add docsConvertRoutes import + mount to backend app.ts.
set -e
APP_TS="/Users/ilyaklipinitser/dwellium-backend/ai-dashboard369-file-manager/src/app.ts"

python3 <<'PY'
import re
from pathlib import Path

p = Path("/Users/ilyaklipinitser/dwellium-backend/ai-dashboard369-file-manager/src/app.ts")
s = p.read_text()

# 1. Add import (after terminalRoutes import if present, else after scribeDndRoutes, else fail-safe)
import_line = "import docsConvertRoutes from './routes/docsConvertRoutes';"
if import_line not in s:
    # Anchor after terminalRoutes import
    m = re.search(r"^import terminalRoutes from '\./routes/terminalRoutes';$", s, re.M)
    if m:
        insert_at = m.end()
        s = s[:insert_at] + "\n" + import_line + s[insert_at:]
    else:
        raise SystemExit("Could not find anchor 'import terminalRoutes' — patch manually.")

# 2. Add app.use mount (after terminal route mount)
mount_line = "app.use('/api/docs', docsConvertRoutes);"
if mount_line not in s:
    m = re.search(r"^app\.use\('/api/terminal', terminalRoutes\);$", s, re.M)
    if m:
        insert_at = m.end()
        s = s[:insert_at] + "\n" + mount_line + s[insert_at:]
    else:
        raise SystemExit("Could not find anchor app.use('/api/terminal'…) — patch manually.")

p.write_text(s)
print("PATCH OK")
PY

echo "--- diff snippet ---"
grep -n 'docsConvertRoutes\|/api/docs' "$APP_TS" || true
