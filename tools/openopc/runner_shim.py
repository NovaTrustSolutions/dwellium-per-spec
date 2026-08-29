#!/usr/bin/env python3
"""
OpenOPC runner shim — REFERENCE implementation. Run it on YOUR sandbox/VM.

A thin FastAPI HTTP wrapper over `opc exec --stream-json`. Dwellium's backend
(/api/opc, opcRoutes.ts) relays to this; Dwellium NEVER runs OpenOPC itself.
OpenOPC agents execute code, edit files and drive a browser autonomously, so
this MUST run on a throwaway sandbox/VM you control, against an ISOLATED OpenOPC
project dir — no Dwellium data, no tenant/financial data.

    POST /runs              {goal,mode,companyProfile,agentBackend,project} -> {id}
    GET  /runs              list runs
    GET  /runs/{id}/stream  SSE: each `opc exec --stream-json` stdout line as `data: <line>`
    POST /runs/{id}/input   {escalationId?,answer} -> writes <answer>\\n to the run's stdin

Auth: set OPC_RUNNER_TOKEN and the shim requires `Authorization: Bearer <token>`
(the same value goes in Dwellium's OPC_RUNNER_TOKEN). Bind to localhost / your
private network only.

    pip install fastapi uvicorn
    OPC_RUNNER_TOKEN=... OPC_HOME=/path/to/scratch-opc-home \\
        uvicorn runner_shim:app --host 127.0.0.1 --port 8900

NOTE on escalations: the pure CLI surfaces a human-in-the-loop prompt on its
console and reads the reply from stdin — that is why /input writes to stdin.
Structured `{"type":"escalation",...}` JSON events (the panel's escalation
inbox) are best emitted by a shim that drives OpenOPC's OfficeServiceFactory
`on_escalation` hook directly instead of scraping the CLI; this reference shim
relays the stream-json org/kanban events and forwards stdin, which is enough to
demo the flow. Keep this file to what you can read in one sitting.
"""
from __future__ import annotations

import asyncio
import json
import os
import shlex
import uuid
from typing import Dict, Optional

from fastapi import FastAPI, Header, HTTPException, Request
from fastapi.responses import JSONResponse, StreamingResponse

app = FastAPI(title="OpenOPC runner shim (reference)")

TOKEN = os.environ.get("OPC_RUNNER_TOKEN", "")


class Run:
    def __init__(self, run_id: str, argv: list[str]):
        self.id = run_id
        self.argv = argv
        self.proc: Optional[asyncio.subprocess.Process] = None
        self.status = "starting"


RUNS: Dict[str, Run] = {}


def _auth(authorization: Optional[str]) -> None:
    """Require a Bearer token when OPC_RUNNER_TOKEN is set (deny-by-default if configured)."""
    if not TOKEN:
        return
    if authorization != f"Bearer {TOKEN}":
        raise HTTPException(status_code=401, detail="bad or missing bearer token")


def _build_argv(body: dict) -> list[str]:
    """The exact `opc exec --stream-json` invocation — mirrors the Dwellium launch form."""
    project = str(body.get("project") or "dwellium")
    mode = "company" if str(body.get("mode")) == "company" else "task"
    backend = str(body.get("agentBackend") or "native")
    goal = str(body.get("goal") or "")
    argv = ["opc", "exec", "-p", project, "--mode", mode]
    if mode == "company":
        argv += ["--company-profile", str(body.get("companyProfile") or "corporate")]
    argv += ["--agent", backend, "--stream-json", goal]
    return argv


@app.post("/runs")
async def start_run(request: Request, authorization: Optional[str] = Header(default=None)):
    _auth(authorization)
    body = await request.json()
    run_id = uuid.uuid4().hex[:12]
    run = Run(run_id, _build_argv(body))
    run.proc = await asyncio.create_subprocess_exec(
        *run.argv,
        stdin=asyncio.subprocess.PIPE,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.DEVNULL,  # keep the SSE channel to stdout JSON only
    )
    run.status = "running"
    RUNS[run_id] = run
    return {"data": {"id": run_id, "command": " ".join(shlex.quote(a) for a in run.argv)}}


@app.get("/runs")
async def list_runs(authorization: Optional[str] = Header(default=None)):
    _auth(authorization)
    return {"data": {"runs": [{"id": r.id, "status": r.status} for r in RUNS.values()]}}


@app.get("/runs/{run_id}/stream")
async def stream_run(run_id: str, authorization: Optional[str] = Header(default=None)):
    _auth(authorization)
    run = RUNS.get(run_id)
    if not run or not run.proc or not run.proc.stdout:
        raise HTTPException(status_code=404, detail="unknown run")

    async def gen():
        assert run.proc and run.proc.stdout
        async for raw in run.proc.stdout:
            line = raw.decode("utf-8", "replace").rstrip("\n")
            if not line:
                continue
            # Forward only well-formed stream-json lines (the CLI may interleave
            # non-JSON console output; the browser would ignore it, but drop it here).
            try:
                json.loads(line)
            except ValueError:
                continue
            yield f"data: {line}\n\n"
        run.status = "done"
        yield 'data: {"type":"final","payload":{"ok":true}}\n\n'

    return StreamingResponse(gen(), media_type="text/event-stream",
                             headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


@app.post("/runs/{run_id}/input")
async def send_input(run_id: str, request: Request, authorization: Optional[str] = Header(default=None)):
    _auth(authorization)
    run = RUNS.get(run_id)
    if not run or not run.proc or not run.proc.stdin:
        raise HTTPException(status_code=404, detail="unknown run")
    body = await request.json()
    answer = str(body.get("answer") or "")
    run.proc.stdin.write((answer + "\n").encode("utf-8"))
    await run.proc.stdin.drain()
    return JSONResponse({"data": {"ok": True}})
