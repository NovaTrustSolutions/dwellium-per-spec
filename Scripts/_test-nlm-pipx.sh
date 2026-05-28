#!/usr/bin/env bash
exec > /tmp/dwellium-nlm-pipx-test.log 2>&1
python3 - <<'PY'
import json, subprocess
BIN = "/Users/ilyaklipinitser/.local/pipx/venvs/notebooklm-mcp-server/bin/notebooklm-mcp"
proc = subprocess.Popen(
    [BIN, "--transport", "stdio"],
    stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
    text=True, bufsize=1,
)
def send(m): proc.stdin.write(json.dumps(m)+"\n"); proc.stdin.flush()
def recv(): return json.loads(proc.stdout.readline())

send({"jsonrpc":"2.0","id":1,"method":"initialize","params":{
    "protocolVersion":"2024-11-05","capabilities":{},
    "clientInfo":{"name":"dwellium-smoke","version":"1.0"}}})
print("INIT:", json.dumps(recv(), indent=2)[:600])
send({"jsonrpc":"2.0","method":"notifications/initialized"})

# List tools to confirm we got the 31-tool variant
send({"jsonrpc":"2.0","id":2,"method":"tools/list"})
tl = recv()
tools = tl.get("result", {}).get("tools", [])
print(f"\nTOOLS ({len(tools)}):")
for t in tools[:35]:
    print(" -", t["name"])

# Call notebook_list
send({"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"notebook_list","arguments":{}}})
print("\nnotebook_list:")
print(json.dumps(recv(), indent=2)[:3000])

proc.stdin.close()
try: proc.wait(timeout=8)
except Exception: proc.kill()
PY
echo "[$(date)] done"
