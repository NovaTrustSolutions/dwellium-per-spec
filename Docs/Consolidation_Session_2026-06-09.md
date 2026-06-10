# Dwellium Consolidation — Session 2026-06-09

Three pieces shipped this session, on top of the already-built consolidation spine
(One Save · Spaces · ⌘K · unified memory · ARA intercept · calm visual system).

All verified in-sandbox with `tsc -b` + targeted `vitest`. The **full gate (1018
vitest + `react-router build` ×2 + PII + SSR smoke) is the Mac gate** — the FUSE
mount here blocks a real framework build.

---

## 1. Full-screen Spaces (fill the canvas on switch)

**Before:** switching a Space crammed every widget as tabs into `regionRects[0]`
— a single half/third region, leaving the rest of the canvas empty.

**Now:** a Space fills the **whole desktop**. The widget count picks the layout:

| Widgets | Layout | Result |
|--------:|--------|--------|
| 1 | maximize | one widget, full canvas |
| 2 | halves | side-by-side, full height |
| 3 | thirds | three columns |
| 4+ | quadrants | 2×2, overflow tabs into regions |

Switching a Space also **minimizes everything not in it**, so the canvas *becomes*
the Space. Regions holding 2+ widgets keep full browser-tab behavior (switch /
reorder / close-reveals-behind / tear-off).

`src/components/Shell/Desktop.tsx` — `dwellium:apply-space` handler rewritten.

## 2. API-key encryption at rest

API keys (Anthropic / OpenAI / Gemini / custom), Supabase keys, the Postgres
password / connection string, and Google OAuth tokens are no longer plaintext in
`localStorage`.

- **WebCrypto AES-GCM-256**, key derived per-user via PBKDF2-SHA-256.
- **Ciphertext at rest, plaintext in memory** — every consumer (`llmClient`,
  Stella, ARA, Supabase, Postgres) reads the bundle unchanged. Zero consumer
  edits, so working LLM calls can't break.
- **Decrypt on login**, **encrypt on every save**, **proactive migration** of
  existing plaintext keys on first login after this update.
- Token format `enc:v1:<iv>:<ct>`; anything else is treated as legacy plaintext
  and passes through (transparent migration).
- **Threat model:** protects against casual devtools inspection, disk/profile
  backups, sync snapshots, and screen-shares. NOT against an attacker holding
  *both* the code bundle and your localStorage — the frictionless upgrade for
  that is a never-persisted passphrase (left as a future option).

`src/utils/integrationsCrypto.ts` (new) · `integrationsStore.ts` ·
`hooks/useIntegrations.ts` · `context/UserContext.tsx`.

## 3. One Conductor — talk-to-customize

ARA / ⌘K now drive the canvas by sentence. New tools + a smarter parser
(`src/lib/dwelliumCommands.ts`); ARAConsole and ⌘K inherit them for free.

- **Spatial placement:** `put strata on the left and scribe on the right`
- **Compound commands:** `make accent teal and switch to research`
  (no longer mis-parses the accent value greedily)
- **Group into tabs:** `group strata and scribe into tabs`
- **Window ops:** `close inbox` · `minimize scribe` · `maximize strata`
- Plus the existing: theme, accent, animations, save/switch Space, open, remember.

`src/components/Shell/Desktop.tsx` gained `dwellium:place-widget` /
`close-widget` / `minimize-widget` / `maximize-widget` handlers + a `tabbed`
mode on apply-space.

---

## Verification (sandbox)

```
tsc -b ......................................... PASS (whole project)
vitest integrationsCrypto ...................... 9/9
vitest dwelliumCommands ........................ 18/18
vitest spacesStore ............................. 4/4
vitest UserContext ............................. 18/18
vitest window.chrome ........................... 4/4
vitest providerSSRSafety ....................... 14/14
vitest desktopGrid.editMode .................... 2/2
                                          ----------------
                                          69/69 targeted
```

## Mac gate (run before any push)

```
cd qualia-shell && npx tsc -b && npx vitest run \
  && npx react-router build && VITE_APPFOLIO_SEEDS=false npx react-router build \
  && cd .. && node Scripts/verify_no_pii_leak.mjs \
  && SMOKE_TEST_SKIP_BUILD=true node Scripts/smoke_test_ssr_phase8.mjs
```

## Still open

- **One Save live end-to-end** — needs the backend running + a `VITE_ONE_SAVE=true`
  dev build. Backend `/api/objects` was unreachable this session (fetches hung).
  Steps + `Scripts/smoke_one_save.sh` in `Docs/OneSave_SmokeTest.md`.
- **One Conductor — deep agent-fold** — physically folding the ~10 agents (Hermes,
  Honcho, Hydra, Triage, Synthesis, Two Brains…) into ARA-as-orchestrator with
  LLM tool-routing is the large remaining refactor (proposal's "2–3 weeks" item).
  The tool-registry + talk-to-customize layer it depends on is now in place; the
  fold itself touches 10 widgets and should be reviewed increment-by-increment.
- **Encryption upgrade (optional)** — passphrase-derived key for at-rest secrets
  if a stronger threat model is wanted.
