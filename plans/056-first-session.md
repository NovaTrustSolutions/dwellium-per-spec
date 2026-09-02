# Plan 056 — The first session: win in 10 seconds, connect tools in-app, one calm indicator

> 2026-08-31, from the phase-5 measurements (plan 055) and Ilya's ask: implement
> all three, then prove them functional live. Order: #2 ∥ #1 → #3 → live proof.

## 1 · Keyless first win + truthful first-run card
- FirstRunCard "Bring your data" scopes to the USER's own records (not the shared
  backend's global properties — today it self-ticks at 158 units).
- "Ask ARA" completes with ZERO setup: a keyless **hello mode** on the Pollinations
  `openai` model (Research Lab's verified keyless endpoint). HARD RULE: hello mode
  sends NO property/tenant/financial context — prompt = user text + a fixed
  orientation system prompt; a test proves no data leaves. Labeled in the UI
  ("Hello mode — free, anonymous, no property data · add a key for the full ARA").
  Auto-switches to full ARA the moment a key exists. Intro video never blocks the
  first reply (plays after / dismissible).
**Done:** fresh user, no key: step 2 & 3 honest (unchecked until real), Ask ARA
returns a reply in-app. **Verify:** vitest (scoping, hello-mode no-context guard,
key-present switch) + live rig screenshot of a reply with no key.

## 2 · Connect tools inside Dwellium — no env vars, no redeploy
- Control Panel → **Connect a tool**: URL + key per tool, per-user, encrypted
  One Save (`toolConnectionsStore`, sister of API Keys). Statuses flip live.
- `resolveToolStatus` reads the store first, env second (env stays as an
  override/bootstrap). Each tool widget resolves its URL from the store.
- Backend proxies read per-user connection config (sent from the client per
  request via a signed header/body, or stored server-side per user — pick the
  smallest safe design; server-side jobs (brief/sync) keep env). Never log keys.
**Done:** paste a cal.com URL + key in Control Panel → Scheduling row = Ready and
the widget loads, no redeploy. **Verify:** vitest (store, status precedence,
widget URL source) + backend jest (per-user config path) + live rig: connect a
tool from the UI → Ready.

## 3 · One calm progress indicator instead of three amber banners
- Sidebar **"Your desk: N of M connected"** (from #2's store + AI key + Google)
  → click = Connect flow. Replaces the System Health "connections need setup"
  banner for the onboarding case; the banner stays only for genuine failures.
- Thin-context banner: once per session per mode, and only when the reply
  actually touched a data source that came back empty — not on every message.
- FirstRunCard defers to the indicator once ≥1 step is done.
**Done:** fresh user sees ONE quiet indicator, zero amber stack. **Verify:**
vitest (indicator counts, banner gating, thin-context frequency) + live rig
screenshot of the fresh-user desk.
