# Documenso — E-Sign backend (plan 047 phase 1, completed in plan 053)

Leases, renewals and vendor agreements go out for signature through Documenso.
The Dwellium **E-Sign** widget talks only to the backend proxy `/api/esign/*` —
the browser never sees a Documenso credential. Status flows back through the
webhook `POST /api/webhooks/documenso`.

**License note (AGPL-3.0-only):** if self-hosting, run the stock Documenso
image unmodified. All Dwellium customisation lives in Dwellium, never in
Documenso's source.

---

## 1. Account — and the honest cost caveat

Verified on https://documenso.com/pricing (2026-08-23):

| Tier | Price | What the pricing page lists |
|---|---|---|
| Free | $0 | "5 documents per month", "Up to 10 recipients per document", "No credit card required" |
| Individual | $25/mo | first tier where **"API Access for Personal Use"** appears |
| Teams | $40/mo | first tier where **"Embedded Signing"** appears |

**This integration needs the API (v2) + webhooks.** The free tier's bullets do
not include API access, so the $0 path may not yield an API key — re-verify when
creating the account. Two honest options if it does not:

1. **Individual $25/mo** on Documenso Cloud — smallest paid step that unlocks the
   API key this integration needs.
2. **Self-host** the AGPL image (Docker/Compose/Railway/Render/Koyeb/K8s per the
   Documenso README) — $0 in licence terms, but you pay for the host, and the
   self-signed p12 signing cert means signatures are *not* qualified e-signatures.

Embedded in-Dwellium signing (`@documenso/embed-react`) is a **Teams-plan**
feature and is deliberately **not** built — Dwellium instead deep-links each
signer to the Documenso signing page.

Steps once the account exists:

1. Sign up at https://documenso.com (or bring up your self-hosted instance).
2. Settings → **API Tokens** → create a token. Copy the `api_…` value once —
   it is shown a single time. This is `DOCUMENSO_API_KEY`.
3. Note the base URL of your instance (`https://app.documenso.com` for cloud) —
   this is `DOCUMENSO_API_URL`.

---

## 2. Lease template setup (the Andy recipe)

Dwellium's lease send uses the **template flow** by default: it maps Dwellium
recipients onto the template's recipient *placeholders* and distributes in one
call (`POST /template/use` with `distributeDocument: true`).

1. Documenso → **Templates** → *New template* → upload the AstraStrata Georgia
   residential lease PDF. Name it e.g. `GA Residential Lease — AstraStrata`.
2. Add **recipient placeholders in signing order**:
   - `1 — Resident` (role **Signer**) — Dwellium maps the lease's
     `applicantEmail` / `tenantEmail` here.
   - `2 — Co-resident` (role **Signer**) — optional; used when the lease has
     `coApplicantEmail`.
   - `3 — Management` (role **Signer**) — Andy / AstraStrata countersignature.
   Order matters: Dwellium sorts the template's placeholders by `signingOrder`
   and fills them with its recipient list in the same order.
3. Place fields per recipient: **Signature**, **Name**, **Date** for each signer;
   **Initials** on any page that needs them; **Text** fields for unit number,
   rent and term if you want them filled in Documenso rather than baked into
   the PDF.
4. Save, then copy the numeric template id from the template URL
   (`/templates/<id>`). That number is `DOCUMENSO_TEMPLATE_LEASE`.

Renewal / vendor templates: build them the same way and pick them per send from
the widget's **New send → Template** dropdown (the list comes live from
`GET /template`). Only the lease template needs an env var — it is the default
preselected in the send flow and the one Strata → Leasing uses.

**No template?** Leave `DOCUMENSO_TEMPLATE_LEASE` unset and send a PDF instead:
the widget's **New send → PDF from Dwellium files** picks any PDF from the
Dwellium files store and Dwellium uploads it (`POST /envelope/create` multipart
→ `POST /envelope/distribute`).

---

## 3. Webhook

Documenso → Settings → **Webhooks** → create:

- **URL:** `https://<your-cloud-run-backend>/api/webhooks/documenso`
- **Secret:** any strong random string; Documenso sends it in the
  `X-Documenso-Secret` header. Put the same value in `DOCUMENSO_WEBHOOK_SECRET`.
- **Events:** `DOCUMENT_SIGNED`, `DOCUMENT_COMPLETED`, `DOCUMENT_REJECTED`,
  `DOCUMENT_CANCELLED` (others are acknowledged and ignored).

Mapping in `webhookRoutes.ts`: `DOCUMENT_SIGNED → docStatus signed`,
`DOCUMENT_COMPLETED → countersigned`, `DOCUMENT_REJECTED`/`DOCUMENT_CANCELLED →
draft`. Matching is by `payload.externalId` (Dwellium sets it to the lease
workitem id on send), falling back to `envelopeId`, then numeric document id.
While `DOCUMENSO_WEBHOOK_SECRET` is unset the route answers **503** — never an
open sink. A wrong secret is a **401** (timing-safe compare).

---

## 4. Environment

**Backend (Cloud Run; `deploy/cloud-run.sh` plumbs all five):**

| Var | Required | Value |
|---|---|---|
| `DOCUMENSO_API_URL` | yes | `https://app.documenso.com` (or your self-hosted base URL) |
| `DOCUMENSO_API_KEY` | yes | the `api_…` token (rides `--update-secrets`, secret `dwellium-documenso-api-key`) |
| `DOCUMENSO_TEMPLATE_LEASE` | no | numeric lease template id; unset → sends need a `fileId` |
| `DOCUMENSO_WEBHOOK_SECRET` | for webhooks | same string as the Documenso webhook secret (secret `dwellium-documenso-webhook-secret`) |
| `DOCUMENSO_APP_URL` | no | where signing/deep links open; defaults to `DOCUMENSO_API_URL` |

Until `DOCUMENSO_API_URL` **and** `DOCUMENSO_API_KEY` are both set, every
`/api/esign/*` route answers `503 {needsSetup: true}` and the widget shows its
"Connect Documenso" card.

**Frontend (Netlify):**

| Var | Required | Value |
|---|---|---|
| `VITE_DOCUMENSO_URL` | yes | `https://app.documenso.com` (or self-host). Flips the Tools hub row to **Ready** and is the base for every "Open in Documenso ↗" / signing deep link. |

Note the two-sided status: the Tools hub keys on the *frontend* env, the widget
on the *backend* 503. Set both, or the hub reads Ready while the widget still
asks you to connect.

---

## 5. What the widget does

- **Documents** — Dwellium lease records merged with the live envelope list from
  Documenso (`GET /envelope`); pills `DRAFT / PENDING / COMPLETED / REJECTED /
  CANCELLED`. Per row: check status (live), resend, cancel (confirm-gated),
  download signed PDF, download audit log, copy each recipient's signing link,
  and **Open in Documenso ↗** straight to that document.
- **New send** — template (live `GET /template` list, lease template
  preselected) or a PDF from the Dwellium files store, with a recipients editor
  (name / email / role / order).
- **Strata → Leasing** — an approved lease's "Send for e-signature" uses the same
  backend flow with recipients prefilled from the lease.
- **Tenant Portal → My Lease** — when Documenso has a signing token for the
  signed-in resident, a "Review & sign" link appears.
