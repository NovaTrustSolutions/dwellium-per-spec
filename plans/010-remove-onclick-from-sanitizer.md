# Plan 010: Stop the markdown sanitizer from allowlisting `onclick` (close the XSS bypass)

> **Executor instructions**: Follow step by step; run each verification. Obey STOP
> conditions. Update this plan's row in `plans/README.md` when done.
>
> **Drift check (run first)**: `git diff --stat a619279..HEAD -- qualia-shell/src/utils/safeMarkdown.ts`
> If `safeMarkdown.ts` changed, re-read it and compare the "Current state" excerpt; on mismatch STOP.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none (pairs with plan 011 — CSP — for defense-in-depth)
- **Category**: security
- **Planned at**: commit `a619279`, 2026-06-20

## Why this matters

`safeMarkdown.ts` is the central XSS gate — all `dangerouslySetInnerHTML` content is
supposed to pass through it. But its DOMPurify allowlist includes **`onclick`** (and
`style`). DOMPurify normally strips every `on*` event-handler attribute; explicitly
allowlisting `onclick` re-opens an HTML-injection-to-script-execution path. These
renderers are fed **LLM output** (which can echo web-search results and uploaded files
verbatim) across ARA, Stella, Hydra, Astra, and the Knowledge Graph. So attacker-
controlled text reaching a chat surface can plant a click-triggered script in the
authenticated app — where it can read the in-memory LLM/Supabase keys and the auth
token. The only in-tree reason `onclick` is allowed is the code-block "Copy" button,
which injects an inline handler; that can be reworked with a delegated listener.

## Current state

- `qualia-shell/src/utils/safeMarkdown.ts:27-36` — `ALLOWED_ATTR` includes `'onclick'` (line 33) and `'style'` (line 29).
- `safeMarkdown.ts:63-66` — `renderSafeMarkdown` injects an inline handler:
  ```ts
  return `<div class="code-block">${langLabel}<button class="code-copy-btn" onclick="navigator.clipboard.writeText(decodeURIComponent('${encodeURIComponent(code.trim())}'))">Copy</button><pre><code>${code.trim()}</code></pre></div>`;
  ```
- Exposed sinks fed model/web/file content (from grep): `StellaAgent.tsx:1626`, `ARAConsole.tsx:1990-1996`, `HydraAI.tsx:109-115`, `HydraSplit.tsx:105`, `Antigravity.tsx:506`, `AstraWorkspace.tsx:265`, `HalocronKnowledgeGraph.tsx:697`.
- The SVG path uses a *separate* config (`sanitizeSvg`, `safeMarkdown.ts:112-118`) — not affected by this change.
- Client entry that runs once on load: the module that calls `initSentry()` (find with `grep -rn "initSentry()" qualia-shell/src qualia-shell/app`) — a good place to register one delegated click listener.

## Commands you will need

| Purpose | Command | Expected |
|---|---|---|
| Find the client entry | `grep -rn "initSentry()" qualia-shell/src qualia-shell/app` | the entry file |
| Typecheck (Mac) | `cd qualia-shell && npx tsc -b` | exit 0 |
| Tests (Mac) | `cd qualia-shell && npx vitest run safeMarkdown` | pass (incl. new test) |
| Grep guard | `grep -n "onclick" qualia-shell/src/utils/safeMarkdown.ts` | no match after the fix |

## Scope

**In scope**:
- `qualia-shell/src/utils/safeMarkdown.ts` (remove `onclick`; rework the copy button; narrow `style` — see Step 3)
- the client-entry file that calls `initSentry()` (register one delegated copy-click listener)
- `qualia-shell/src/utils/safeMarkdown.test.ts` (create)

**Out of scope**:
- The sink components listed above — they call `sanitizeHtml`/`renderSafeMarkdown`; they don't need changes once the helper is fixed.
- `sanitizeSvg` config.

## Git workflow

- Branch: `advisor/010-sanitizer-onclick`
- Commit: `security(xss): drop onclick from DOMPurify allowlist; delegated copy-button handler`
- Do NOT push/PR without Ilya's go.

## Steps

### Step 1: Remove `onclick` from the allowlist

In `safeMarkdown.ts`, delete `'onclick',` from `ALLOWED_ATTR` (line 33).

**Verify**: `grep -n "onclick" qualia-shell/src/utils/safeMarkdown.ts` → no match.

### Step 2: Rework the copy button to a data attribute + delegated listener

In `renderSafeMarkdown` (line 65), change the button to carry the payload in a data attribute instead of an inline handler:
```html
<button class="code-copy-btn" type="button" data-copy="${encodeURIComponent(code.trim())}">Copy</button>
```
Then register ONE delegated listener at app startup (in the client entry that calls `initSentry()`), guarded for SSR:
```ts
if (typeof document !== 'undefined') {
  document.addEventListener('click', (e) => {
    const btn = (e.target as HTMLElement)?.closest?.('.code-copy-btn') as HTMLElement | null;
    if (btn?.dataset.copy) navigator.clipboard?.writeText(decodeURIComponent(btn.dataset.copy));
  });
}
```
Add `data-copy` to `ALLOWED_ATTR` is NOT needed if `ALLOW_DATA_ATTR` were true — but it's `false`. Since the button HTML is produced by our own code (not user input) and then sanitized, DOMPurify will strip `data-copy` under `ALLOW_DATA_ATTR:false`. To keep the data attribute, either (a) add `'data-copy'` explicitly to `ALLOWED_ATTR`, or (b) attach the listener by reading the adjacent `<code>` text instead of a data attribute. Prefer (a): add `'data-copy'` to `ALLOWED_ATTR` (a data attribute is inert — no script vector).

**Verify**: `grep -n "data-copy" qualia-shell/src/utils/safeMarkdown.ts` → present in both the button HTML and `ALLOWED_ATTR`; the delegated listener exists in the client entry.

### Step 3: Narrow `style` (recommended)

Remove `'style'` from `ALLOWED_ATTR` (line 29) — inline `style` enables CSS-based exfiltration/clickjacking on injected content. After removing, do a quick visual check (Step 5) that rendered markdown still looks right. If something genuinely needs inline style, STOP and report rather than re-adding blanket `style`.

**Verify**: `grep -n "'style'" qualia-shell/src/utils/safeMarkdown.ts` → no match (or report the specific need).

### Step 4: Typecheck + tests

**Verify (Mac)**: `npx tsc -b` exit 0; `npx vitest run safeMarkdown` passes.

### Step 5: Visual smoke (Mac)

`npm run preview`; in ARA/Stella, render a message with a code block — confirm the Copy button copies, and normal markdown still renders.

## Test plan

Create `qualia-shell/src/utils/safeMarkdown.test.ts`:
- `sanitizeHtml('<button onclick="alert(1)">x</button>')` → result contains no `onclick`.
- `sanitizeHtml('<img src=x onerror="alert(1)">')` → no `onerror`.
- `renderSafeMarkdown('\`\`\`js\\ncode\\n\`\`\`')` → output contains `class="code-copy-btn"` and `data-copy=`, and contains no `onclick`.
- (If `style` removed) `sanitizeHtml('<div style="x">y</div>')` → no `style` attribute.
- Model after any existing `src/test/*.test.ts` using vitest `describe/it/expect`.
Verification: `npx vitest run safeMarkdown` → all pass.

## Done criteria

- [ ] `grep -n "onclick" qualia-shell/src/utils/safeMarkdown.ts` → no match
- [ ] Copy button works via a delegated listener (verified in preview)
- [ ] New `safeMarkdown.test.ts` asserts `onclick`/`onerror` are stripped and the copy button still has `data-copy`; `npx vitest run safeMarkdown` green
- [ ] `npx tsc -b` exit 0
- [ ] Only the in-scope files changed
- [ ] `plans/README.md` row updated

## STOP conditions

- A sink component relies on inline `style` in rendered markdown such that removing `'style'` visibly breaks it — keep `style` removed from the markdown config, report the component, and leave its fix for a follow-up (do NOT re-add blanket `onclick`).
- The delegated-listener entry point can't be located — report; do not scatter per-component listeners.

## Maintenance notes

- Never re-add `on*` attributes to `ALLOWED_ATTR`. If a new interactive element is needed in rendered content, use a `data-*` attribute + a delegated listener, as done here.
- Plan 011 (CSP) is the second layer — even if a future regression re-opens a sink, a tight `script-src`/`connect-src` limits the blast radius.
- Reviewer: grep the diff for any `on*` attribute reintroduction.
