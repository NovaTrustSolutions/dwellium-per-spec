#!/usr/bin/env python3
"""Re-patch the Claude Desktop config to use the correct pipx binary +
--transport stdio. The previously-installed ~/.local/bin/notebooklm-mcp
points to an older project (v3.2.3, 8 chat tools); the working v0.1.15
server lives in the pipx venv."""
import json, shutil, time
from pathlib import Path

p = Path.home() / 'Library/Application Support/Claude/claude_desktop_config.json'
backup = p.with_suffix(f'.json.bak-{int(time.time())}')
shutil.copy2(p, backup)
print(f'Backup: {backup}')

with p.open() as f:
    data = json.load(f)

mcp = data.setdefault('mcpServers', {})
mcp['notebooklm-mcp'] = {
    'command': '/Users/ilyaklipinitser/.local/pipx/venvs/notebooklm-mcp-server/bin/notebooklm-mcp',
    'args': ['--transport', 'stdio'],
}

with p.open('w') as f:
    json.dump(data, f, indent=2)
print('mcpServers:', list(mcp.keys()))
print('Updated:', p)
