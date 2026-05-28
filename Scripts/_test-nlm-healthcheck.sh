#!/usr/bin/env bash
exec > /tmp/dwellium-nlm-health.log 2>&1
python3 - <<'PY'
import json, subprocess
proc = subprocess.Popen(
    ["/Users/ilyaklipinitser/.local/bin/notebooklm-mcp", "server"],
    stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
    text=True, bufsize=1,
)
def send(m): proc.stdin.write(json.dumps(m) + "\n"); proc.stdin.flush()
def recv(): return json.loads(proc.stdout.readline())

send({"jsonrpc":"2.0","id":1,"method":"initialize","params":{
    "protocolVersion":"2024-11-05","capabilities":{},
    "clientInfo":{"name":"dwellium-smoke","version":"1.0"}}})
recv()
send({"jsonrpc":"2.0","method":"notifications/initialized"})

# healthcheck
send({"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"healthcheck","arguments":{}}})
resp = recv()
print("healthcheck:")
print(json.dumps(resp, indent=2))

# get_default_notebook
send({"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"get_default_notebook","arguments":{}}})
print("\nget_default_notebook:")
print(json.dumps(recv(), indent=2))

proc.stdin.close()
try: proc.wait(timeout=5)
except Exception: proc.kill()
PY
