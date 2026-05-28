#!/usr/bin/env bash
exec > /tmp/dwellium-nlm-variants.log 2>&1
for p in \
  /Users/ilyaklipinitser/.local/pipx/venvs/notebooklm-mcp-server/bin/notebooklm-mcp \
  /Users/ilyaklipinitser/.local/share/uv/tools/notebooklm-mcp-server/bin/notebooklm-mcp \
  /Users/ilyaklipinitser/.local/share/uv/tools/notebooklm-mcp/bin/notebooklm-mcp \
  /Users/ilyaklipinitser/.local/share/uv/tools/notebooklm-mcp-cli/bin/notebooklm-mcp ; do
    echo "=== $p ==="
    if [ -x "$p" ]; then
        "$p" --version 2>&1 | head -3 || echo "(--version not supported)"
        "$p" --help 2>&1 | head -5
    else
        echo "(not executable / missing)"
    fi
    echo
done
