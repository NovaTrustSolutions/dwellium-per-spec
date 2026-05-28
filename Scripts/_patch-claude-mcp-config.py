#!/usr/bin/env python3
"""Idempotently add the notebooklm-mcp server to ~/Library/Application Support/Claude/claude_desktop_config.json.

Preserves every existing key. Backs up the file first.
"""
import json, os, shutil, sys, time
from pathlib import Path

p = Path.home() / 'Library/Application Support/Claude/claude_desktop_config.json'
if not p.exists():
    # Create a minimal config
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text('{}')

backup = p.with_suffix(f'.json.bak-{int(time.time())}')
shutil.copy2(p, backup)
print(f'Backup: {backup}')

with p.open() as f:
    data = json.load(f)

binary = str(Path.home() / '.local/bin/notebooklm-mcp')
if not Path(binary).exists():
    print(f'ERROR: {binary} not found — install first', file=sys.stderr)
    sys.exit(1)

mcp = data.setdefault('mcpServers', {})
mcp['notebooklm-mcp'] = {
    'command': binary,
    'args': ['server'],
}

with p.open('w') as f:
    json.dump(data, f, indent=2)

print('mcpServers now contains:', list(mcp.keys()))
print('Path patched:', p)
