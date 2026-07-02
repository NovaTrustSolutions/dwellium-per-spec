# Implementation Spec — Google Account Connect Fix + Per‑Provider Model Dropdowns

**Repo:** `NovaTrustSolutions/dwellium-per-spec` (default branch `main`)
**Local path:** `/Users/ilyaklipinitser/Downloads/Dwellium -Per Spec`
**App package:** `qualia-shell/`
**Gate:** `cd "/Users/ilyaklipinitser/Downloads/Dwellium -Per Spec" && bash Scripts/gate.sh`
**Live app:** https://argyleholocron.netlify.app (Netlify; current prod deploy verified = `main@99f3d44`)
**Produced by:** live browser diagnosis of the deployed app on 2026‑06‑30.

> Legend: **[VERIFIED]** = observed directly in the running app/repo. **[HYPOTHESIS]** = inferred; the implementing agent must confirm against the code before coding.

---

## 0. Ground rules for the implementing agent

1. Confirm every **[HYPOTHESIS]** in the code before changing it. Do not blindly apply a fix.
2. The build must pass the gate: `bash Scripts/gate.sh` (tsc + vitest + build seeds on/off + PII scan + SSR smoke).
3. **Keep ESLint clean.** The GitHub Actions check **"AppFolio Parity Gate" currently FAILS on recent commits (incl. `99f3d44`)** even though the *local* `gate.sh` is green — because the local gate prints lint as *non‑blocking* but CI enforces it. Every new control you add must satisfy `jsx-a11y/label-has-associated-control`, avoid `@typescript-eslint/no-explicit-any`, and respect `react-hooks/exhaustive-deps`. (Bonus: reconcile the gap — either make `Scripts/gate.sh` fail on lint too, or document why CI differs.)
4. **Do NOT regress** the integrations clobber fix: `shouldAdoptRemoteBundle` in `qualia-shell/src/utils/integrationsStore.ts` and its test `qualia-shell/src/test/integrationsPersistence.test.ts`. Keys must still persist across login.
5. No secrets in logs, URLs, or query strings. Provider config persists through the existing encrypted integrations vault — use the store's existing API.

---

## TASK A — Fix "Connect Google account" (HTTP 401 "Authentication required")

### A1. Verified symptom & reproduction  [VERIFIED]
- In Control Panel → **Google (Gmail + Calendar)** → clicking **"Connect Google account"** opens a **new tab** navigating to:
  `https://argyleholocron.netlify.app/api/google/oauth/start`
- That endpoint returns **HTTP 401**, `content-type: application/json`, body:
  ```json
  {"error":"Authentication required"}
  ```
- I re‑issued the **same GET from the app's own origin/context with the app's bearer token attached** and same‑origin cookies:
  ```js
  fetch('/api/google/oauth/start', { headers: { Authorization: 'Bearer ' + localStorage['dwellium-auth-token'] } })
  // → still HTTP 401  {"error":"Authentication required"}   (token was present, length 39)
  ```
- **Conclusion [VERIFIED]:** the OAuth‑start route rejects the request even *with* the app's bearer token. So this is **not only** the "top‑level navigation can't send the Authorization header" problem — the deployed backend does not accept the app's current credential for this route at all.

### A2. Likely root causes  [HYPOTHESIS — confirm in code]
1. **Auth‑mechanism mismatch.** The OAuth‑start middleware expects a credential the deployed client never supplies (e.g., a server session cookie that is never set on the `argyleholocron.netlify.app` origin), while normal app calls authenticate differently. Grep for the literal string `Authentication required` to find the exact middleware/handler.
2. **Navigation vs. fetch.** The Connect button triggers a **top‑level browser navigation** (new tab / `window.location`) to a *protected* endpoint. Top‑level navigations cannot carry an `Authorization` header — so even if the route accepted bearer tokens, the navigation path would fail. (My header‑replay shows there is *also* a second factor per #1.)
3. **Deployed backend reachability.** The real backend runs on `localhost:3000`, which Netlify's servers cannot reach. Determine what actually serves `/api/*` for the deployed site (the `apiProxy` route, `netlify.toml` redirects, or Netlify functions) and whether that path is connected to a backend that can complete OAuth at all. If the deployed app has no real OAuth‑capable backend, that must be addressed (or the feature scoped to local/proper‑backend environments).
4. **Google Cloud OAuth config.** The OAuth client's authorized redirect URIs must include the deployed callback (e.g. `https://argyleholocron.netlify.app/api/google/oauth/callback`). The agent can't change Google Cloud settings — **flag this for Ilya to verify** in the Google Cloud Console.

### A3. Files to inspect  [VERIFIED paths]
- `qualia-shell/src/components/ControlPanel/GoogleAccountsSection.tsx` — the Connect button + click handler.
- `qualia-shell/src/services/googleIdentity.ts` — Google auth/identity client logic.
- `qualia-shell/src/services/googleDriveStorage.ts`, `qualia-shell/src/components/ControlPanel/GoogleDriveSection.tsx` — related Google wiring.
- `qualia-shell/app/routes/apiProxy.tsx` (+ test `qualia-shell/src/test/apiProxy.test.ts`) — how `/api/*` is proxied and whether auth headers/cookies are forwarded for `/api/google/oauth/*`.
- The backend handler that emits `{"error":"Authentication required"}` (grep the whole repo for that string; check `electron/`, any `server`/backend dir, and Netlify functions).
- `netlify.toml` — redirects/proxy/functions config for `/api/*`.

### A4. Investigation steps (do these first)
1. `grep -rn "Authentication required" .` → find the exact guard returning the 401.
2. Read that guard: what credential does it require (cookie session? bearer? custom header?) and from where?
3. Compare with a **working** authenticated `/api/...` call the app already makes successfully — what auth does *it* carry? Identify the difference.
4. Trace how `/api/google/oauth/start` is served on the deployed site vs. locally (`apiProxy.tsx` / `netlify.toml`). Confirm whether the request even reaches the same authenticated backend.
5. Decide the fix from the actual mechanism (see A5).

### A5. Recommended fix direction (choose based on findings)
- **If auth is bearer/header‑based (preferred fix):** stop navigating the browser directly to the protected endpoint. Instead, in the Connect handler, make an **authenticated `fetch`** (same auth the working API calls use) to `/api/google/oauth/start`, have that endpoint **return the Google consent URL** (e.g. `{ url }`) instead of redirecting, then `window.location.assign(url)` / open that returned URL. The protected call stays authenticated; only the *public* Google consent page is opened by navigation.
- **If auth is cookie/session‑based:** ensure login establishes a session cookie valid for the deployed origin (`SameSite`/domain correct) so it's present on the OAuth‑start request; fix whatever prevents that cookie from being set/sent on `argyleholocron.netlify.app`.
- **Resolve the second factor (A1):** ensure the deployed backend actually accepts the logged‑in user's credential for this route (the 39‑char `dwellium-auth-token` must be honored by the OAuth‑start guard, or the route must read whatever session the app already holds).
- Add the deployed callback URI to the Google OAuth client (Ilya — manual, in Google Cloud Console).

### A6. Acceptance criteria
- Clicking **Connect Google account** (on the deployed app and locally) starts a working Google consent flow and, on return, the account shows **connected** (Gmail + Calendar) and persists across reload/login.
- The OAuth‑start call no longer returns 401; it is made with valid auth.
- A test asserts the client uses the **fetch‑then‑redirect** pattern (not a raw navigation to the protected endpoint) and that auth is attached — extend `qualia-shell/src/test/apiProxy.test.ts` or add a new test near `GoogleAccountsSection`.
- Re‑run the A1 reproduction and show it now succeeds.

---

## TASK B — Per‑provider model dropdowns (Anthropic, OpenAI, Gemini)

### B1. Goal
Replace each provider's free‑text **"Model"** input with a **dropdown** of available models, while still allowing a manual/custom model string. Cover **Anthropic, OpenAI, Google Gemini** at minimum; apply the same pattern to **Custom (OpenRouter/Together/Anyscale)** and **Local LLM (Ollama/LM Studio)** if low‑cost.

### B2. Current state  [VERIFIED in the running app]
- Each provider block in the Control Panel has: an `Enabled` checkbox, an API‑key field, a free‑text **Model** field, and a **Test Connection** button. Observed defaults: Anthropic `claude-haiku-4-5-20251001`, OpenAI `gpt-4o-mini`, Gemini `gemini-1.5-flash`.
- Keys/config persist via `integrationsStore` (encrypted vault).

### B3. Files
- `qualia-shell/src/components/ControlPanel/LlmIntegrationsSection.tsx` — **primary** UI (provider blocks; lines ~360–412 hold the provider config controls).
- `qualia-shell/src/utils/integrationsStore.ts` — provider config state + persistence (the `model` field lives here).
- `qualia-shell/src/lib/llmClient.ts` — provider call client; **reuse this for model‑list fetches** (inherits working auth + avoids CORS — see B5).
- `qualia-shell/src/components/ControlPanel/ApiKeyField.tsx`, `ApiKeysPanel.tsx` — existing field patterns to match.

### B4. Recommended approach — dynamic with curated fallback + custom override
1. **Dynamic:** when a provider has a saved/valid key, fetch its model list and populate the dropdown. **Reuse the exact call path "Test Connection" uses** (same auth, same proxy) — see CORS note B5.
2. **Cache** the result in `integrationsStore` (`availableModels?: string[]`, `modelsFetchedAt?: number`) so it isn't refetched every render; add a small **"Refresh models"** affordance + loading/error states.
3. **Fallback:** if no key / fetch fails / offline → show a **curated static list** per provider (constants file). 
4. **Custom override:** always include a **"Custom…"** option that reveals the current free‑text input, so any model ID can still be entered.
5. **Preserve selection:** if the currently‑saved model isn't in the fetched list, keep it selected (don't silently drop a user's value).

### B5. Provider model‑list endpoints + CORS caveat  [verify in code]
- **OpenAI:** `GET https://api.openai.com/v1/models`, `Authorization: Bearer <key>`. Filter to chat‑capable ids (`gpt-`, `o1`/`o3`/`o4`, `chatgpt-`); exclude embeddings/whisper/tts/image models.
- **Google Gemini:** `GET https://generativelanguage.googleapis.com/v1beta/models?key=<key>`. Keep models whose `supportedGenerationMethods` includes `generateContent`; strip the `models/` prefix.
- **Anthropic:** `GET https://api.anthropic.com/v1/models`, headers `x-api-key: <key>`, `anthropic-version: 2023-06-01` (+ `anthropic-dangerous-direct-browser-access: true` **iff** called from the browser). Use `data[].id`.
- **CORS:** direct browser calls to OpenAI/Anthropic may be blocked; Anthropic requires the dangerous‑direct‑browser‑access header. **Safest: fetch model lists through the app's existing server/proxy path (the same one `llmClient`/"Test Connection" uses).** Match whatever already works in the app today; only add a tiny proxied endpoint if there is no existing path.

### B6. Curated fallback lists  [VERIFY before shipping]
Use the repo's existing known‑good model IDs as the source of truth, plus the dynamic fetch. Only the following are **observed in the app** and safe to rely on as defaults: Anthropic `claude-haiku-4-5-20251001`, OpenAI `gpt-4o-mini`, Gemini `gemini-1.5-flash`. Any *additional* curated entries (e.g. Sonnet/Opus, `gpt-4o`/`o`‑series, Gemini Pro/2.x) must be **verified against current provider docs** at implementation time — do not hard‑code unverified model IDs.

### B7. UX / a11y
- Every `<select>` MUST have an associated `<label>` (CI enforces `jsx-a11y/label-has-associated-control`).
- Keep **Test Connection** working against the selected model.
- Loading spinner while fetching; inline error + automatic fallback to curated list on failure.

### B8. Data model
- Extend the provider config in `integrationsStore` with optional, **non‑secret** `availableModels?: string[]` and `modelsFetchedAt?: number`. Keep `model: string` as the saved selection. Use the store's existing setters/persistence (don't bypass the vault).

### B9. Acceptance criteria
- For Anthropic / OpenAI / Gemini, with a valid key, **Model** is a dropdown populated with that provider's models; selecting one persists and is used by Test Connection + real calls.
- With no key or on fetch failure → curated list shown; **Custom…** allows manual entry; previously‑saved custom models are preserved.
- No secrets logged; model‑list calls reuse the existing auth/proxy path; no new CORS breakage.
- Unit tests near `LlmIntegrationsSection` cover: dynamic list render, fallback‑on‑error, custom override, persistence round‑trip.

---

## Suggested commits
- `feat(integrations): per-provider model dropdowns (live fetch + curated fallback + custom override)`
- `fix(google-oauth): authenticate OAuth start (fetch-then-redirect) so Connect Google stops 401ing`

## Definition of done (must verify, with proof)
1. Re‑run the **A1** Google reproduction → no 401, full consent round‑trip, connected state persists.
2. Dropdowns populate for Anthropic/OpenAI/Gemini with a real key; fallback + custom paths work.
3. `bash Scripts/gate.sh` is **green** (paste the tail of the output).
4. `qualia-shell/src/test/integrationsPersistence.test.ts` still passes (no clobber‑fix regression).
5. Keep new code ESLint‑clean so the CI "AppFolio Parity Gate" can go green.

---

## Appendix — exact browser evidence used to write this spec
- Prod deploy confirmed live: Netlify Deploys shows `Production: main@99f3d44` **Published** ("fix(integrations): never let a tombstoned/secret-less One Save remote clobber local API keys on login").
- Google connect: `GET https://argyleholocron.netlify.app/api/google/oauth/start` → `401 {"error":"Authentication required"}`; same result when replayed with `Authorization: Bearer <dwellium-auth-token>` (len 39) + same‑origin cookies.
- Active account in the tested window: `architect-9a921527` (role `god`, iklipinitser@gmail.com).

---

## TASK C — API keys don't persist / "not configured" per account  [VERIFIED 2026-07-01]

### C1. Symptom
On the deployed app, after entering an LLM key and Saving, **Test Connection** returns `Provider <x> not configured or not enabled`, and the key field shows the empty placeholder (`sk-ant-…`) rather than a masked `••••1234`. Real bug in shipped `99f3d44` — NOT the in-flight dropdown work.

### C2. Verified evidence
- `qualia-shell/src/components/ControlPanel/ApiKeyField.tsx`: renders `maskKey(value)` + Replace/Remove whenever `value.length > 0`. The empty placeholder in the UI therefore proves the active bundle's `apiKey` is **empty** for that provider.
- `qualia-shell/src/lib/llmClient.ts` `dispatchLlm`: returns `null` when `!llm.<p>.enabled || !llm.<p>.apiKey`; `testProvider` maps `null` → "not configured or not enabled". Enabled is checked, so the empty `apiKey` is the failing condition.
- `qualia-shell/src/utils/integrationsStore.ts` `resolveKey()` = `integrations:${integrationsUserIdHolder.current}` (or `integrations:_anonymous` when null). The tested account (`architect-9a921527`, god) had **no `integrations:*` localStorage entry at all**.
- Original `99f3d44` session left **user.id drift** UNRESOLVED: `login()` uses backend id when up but `data/users.json` id when the backend is down; `loginLocal`/`loginAsArchitect` use their own ids; Google uses the backend id → same person gets different `user.id`s → keys land in a different vault than the UI later reads.

### C3. Root-cause hypotheses (confirm before fixing — auth-adjacent, do NOT patch blind)
1. `integrationsUserIdHolder.current` differs between save-time and read-time (or is null → `integrations:_anonymous`): save writes one namespace, `unlockIntegrations`/consumers read another.
2. Architect/god login assigns a `user.id` that isn't stable across reloads → vault namespace changes.
3. `unlockIntegrations` decrypt silently fails for this account (wrong key → empty snapshot) → apiKey empty in memory.

### C4. Required investigation
- Reproduce in the account actually used: enter a throwaway key, Save; read all `integrations:*` localStorage keys, note which namespace got the write + content; log `integrationsUserIdHolder.current` at save-time and again after reload/`unlockIntegrations` — confirm they match.
- Trace `user.id` assignment across EVERY login path in `qualia-shell/src/context/UserContext.tsx` (login / loginLocal / loginAsArchitect / Google) and confirm the SAME id for the SAME person every time.

### C5. Fix direction
- Key the integrations vault by a **stable per-person identifier** that does not change across login paths or backend up/down (e.g. verified email or a durable account id). Migrate keys stranded under legacy/anonymous/mismatched namespaces.
- Set `integrationsUserIdHolder.current` to that stable id BEFORE any save or `unlockIntegrations`, for ALL login paths including Architect/god.

### C6. Acceptance
- Enter a key via any login path (incl. Architect/god) → Save → field shows `••••` immediately; reload → still masked; Test Connection succeeds with a valid key.
- Key lands in ONE stable `integrations:*` namespace regardless of login path.
- Regression test (extend `qualia-shell/src/test/integrationsPersistence.test.ts`): save under a resolved id, simulate reload as the same person, assert the key survives.
- Do NOT weaken the `shouldAdoptRemoteBundle` / `wouldClobberStoredSecret` guards.
