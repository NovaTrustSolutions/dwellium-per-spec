# OpenOPC runner — the AI Company automation's sandbox host

Dwellium's **Automation Hub → AI Company (OpenOPC)** turns one brief into a
self-built AI org (OpenOPC: *Self-Built → Self-Run → Self-Grown*). It does this
by relaying to an **OpenOPC runner you host** — not by running anything itself.

## The safety model (non-negotiable)

OpenOPC agents **execute code, edit files, and drive a browser autonomously**
(its `layer4_tools/{shell,python_exec,file_ops,git_ops,browser}.py` are real
tools). So:

- The runner runs on a **sandbox/VM you control** — a scratch box, never a
  machine holding Dwellium data or tenant/financial data.
- It works inside an **isolated OpenOPC project dir** (`opc project create …`),
  against a scratch workspace — nothing of Dwellium's.
- Dwellium's backend only **relays**: `/api/opc` (`opcRoutes.ts`) proxies to
  `OPC_RUNNER_URL` and answers `503 needsSetup` until you set it. Dwellium never
  executes agent code and never hands the runner tenant data.

If you would not run `curl … | bash` on the box, do not run the OpenOPC runner
on it.

## 1 · Install OpenOPC on the sandbox

```bash
# on the scratch VM — a checkout of github.com/HKUDS/OpenOPC
uv venv && source .venv/bin/activate && uv pip install -e .
uv run python -m playwright install chromium     # only if agents will browse
opc init
opc project create dwellium                       # isolated project dir
```

Add an LLM key (any OpenAI-compatible provider) to
`.opc/config/llm_config.yaml` — a **live run needs an LLM key**. Verify with
`opc status`. Optionally raise/lower autonomy in
`.opc/config/system_config.yaml` (`autonomy.max_auto_approve_risk`); on a shared
box use `low`.

## 2 · Stand up the HTTP runner shim

[`runner_shim.py`](./runner_shim.py) is a ~120-line **reference** FastAPI wrapper
over `opc exec --stream-json`. Run it **on the sandbox**, in the venv where `opc`
is installed:

```bash
pip install fastapi uvicorn
export OPC_RUNNER_TOKEN="$(openssl rand -hex 16)"   # shared secret (recommended)
uvicorn runner_shim:app --host 127.0.0.1 --port 8900
```

Bind to localhost or your private network only, and put it behind your own TLS /
tunnel (e.g. Tailscale) if Dwellium's backend is remote. It exposes exactly what
Dwellium's proxy calls:

| Method + path            | Does |
|--------------------------|------|
| `POST /runs`             | Spawns `opc exec -p <project> --mode <mode> [--company-profile <p>] --agent <backend> --stream-json "<goal>"`, returns `{ id }` |
| `GET  /runs`             | Lists runs |
| `GET  /runs/{id}/stream` | SSE — each `--stream-json` stdout line as a `data:` event |
| `POST /runs/{id}/input`  | Writes `<answer>\n` to the run's stdin (answers an escalation prompt) |

## 3 · Point Dwellium at it

On the Dwellium backend (Cloud Run: `deploy/cloud-run.sh` ships `OPC_RUNNER_URL`
as a non-secret env var):

```bash
OPC_RUNNER_URL=https://your-sandbox:8900   # where the shim listens
OPC_RUNNER_TOKEN=<same value as above>     # optional; sent as Bearer to the shim
```

Then, in Dwellium, open **Automation Hub → AI Company (OpenOPC) → Open console**,
write a goal, pick task/company mode, and **Launch**. The org chart, work-item
kanban, and escalation inbox update live from the relayed stream.

## What the panel reads (event handoff)

The runner emits OpenOPC's `--stream-json` lines. The verified envelope
(`opc/cli/app.py::_print_exec_event`) is:

```json
{ "type": "...", "seq": 1, "timestamp": "...", "project_id": "...",
  "task_id": "...", "session_id": "...", "payload": { } }
```

Top-level `type`s the CLI emits: `session_created`, `session_resumed`,
`runtime_update`, `message`, `final`, `error`. The org/kanban/delegate/review/
blocker detail rides inside `runtime_update.payload`; Dwellium's
`opcEvents.ts` normalizes it defensively (upstream doesn't pin that inner
schema) into roles + work-items + messages.

**Escalations.** The plain CLI shows a human-in-the-loop prompt on its console
and reads the reply from stdin — that is why `/input` writes to stdin, and why
this reference shim is enough to demo the loop. For a first-class escalation
inbox (structured `{"type":"escalation",…}` events), have your shim drive
OpenOPC's `OfficeServiceFactory(..., on_escalation=…)` hook directly (as the CLI
does) instead of scraping the CLI, and emit an `escalation` line when the hook
fires; Dwellium's panel already renders that event type.

## Ownership

The runner, its LLM key, and everything it produces are **yours** and live on
**your** sandbox. Dwellium stores none of it — it only relays the stream while
the console is open.
