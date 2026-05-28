#!/usr/bin/env bash
# Test the NotebookLM MCP by issuing a list-notebooks JSON-RPC over stdio.
# Writes to /tmp/dwellium-nlm-test.log.
exec > /tmp/dwellium-nlm-test.log 2>&1
export PATH=/Users/ilyaklipinitser/.local/bin:$PATH

NLM_BIN=/Users/ilyaklipinitser/.local/bin/notebooklm-mcp
echo "[$(date)] Probing $NLM_BIN server via JSON-RPC over stdio"

# Build the three required MCP messages: initialize → initialized → list_tools → call_tool
python3 - <<'PY'
import json, subprocess, sys, time

proc = subprocess.Popen(
    ["/Users/ilyaklipinitser/.local/bin/notebooklm-mcp", "server"],
    stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
    text=True, bufsize=1,
)

def send(msg):
    j = json.dumps(msg) + "\n"
    proc.stdin.write(j); proc.stdin.flush()

def recv():
    # Read one line of JSON-RPC response
    line = proc.stdout.readline()
    if not line:
        return None
    try: return json.loads(line)
    except json.JSONDecodeError: return {"raw": line}

# 1. initialize
send({"jsonrpc": "2.0", "id": 1, "method": "initialize", "params": {
    "protocolVersion": "2024-11-05",
    "capabilities": {},
    "clientInfo": {"name": "dwellium-smoke", "version": "1.0"}
}})
print("INIT RESPONSE:", recv())

# 2. initialized notification
send({"jsonrpc": "2.0", "method": "notifications/initialized"})

# 3. list tools
send({"jsonrpc": "2.0", "id": 2, "method": "tools/list"})
tools_resp = recv()
print("TOOLS COUNT:", len(tools_resp.get("result", {}).get("tools", [])) if tools_resp else "n/a")
if tools_resp:
    names = [t["name"] for t in tools_resp.get("result", {}).get("tools", [])][:10]
    print("FIRST TOOL NAMES:", names)

# 4. call notebook_list
send({"jsonrpc": "2.0", "id": 3, "method": "tools/call", "params": {
    "name": "notebook_list",
    "arguments": {}
}})
list_resp = recv()
print("notebook_list RESPONSE:", json.dumps(list_resp, indent=2)[:2000])

# Cleanup
proc.stdin.close()
try:
    proc.wait(timeout=5)
except Exception:
    proc.kill()
PY
echo "[$(date)] Done"
