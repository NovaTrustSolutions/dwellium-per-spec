# qualia-shell/CLAUDE.md — Agent Notes (subtree)

This is the `qualia-shell/` subtree. Full repo conventions: `../CLAUDE.md` + `../AGENTS.md`.

## 🔴 NON-NEGOTIABLE RULES (read before acting)

### 🤡 BEFORE-YOU-SAY-YOU-CAN'T
Before telling Ilya you **can't** do something — impossible, blocked, unavailable,
"not permitted", or "already done" — you MUST first read
[`../FUCKUPS.md`](../FUCKUPS.md) at the repo root. The blocker may already be solved
there. Only then may you claim inability, and you must (1) quote the clown canary
token `🤡 DWELLIUM-9F3A-"honk-honk"` to prove you read it, and (2) cite the command +
output that proves it. No token + no proof = log a new `../FUCKUPS.md` entry.

### Verify before you claim
No "done / fixed / works / verified" without running a check and pasting its output
ABOVE the claim. Can't verify → say "NOT verified."

### Backend failure NEVER logs the user out
Keep the session and surface the global banner (`src/components/Shell/BackendConnectionBanner.tsx`
+ `src/lib/backendStatusStore.ts`); only a real `401/403` clears auth
(`src/context/UserContext.tsx`).

### Never push without verified-green + Ilya's go
Full gate green on the Mac first; build with `npx react-router build`, never
`npx vite build` (silent no-op).
