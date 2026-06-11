# Inbox aggregation across Google accounts — 2026-06-10

Multi-account mail now shows up in InboxZero, each email tagged with the mailbox
it came from. Verified: `tsc -b` green + InboxZero 5/5 (incl. a new source-badge
test) + regression green (41/41 targeted).

## Frontend (built + tested, ships now)

- `InboxItem.sourceAccount?: string` — the connected Gmail account an email came from.
- **InboxZero card** renders a `✉ <account>` badge on each email when
  `sourceAccount` is set, so you can see at a glance which mailbox a message is in.
- The inbox query already passes items straight through (`data.data as InboxItem[]`),
  so the field flows from the API to the card with no mapping change.

## Backend (in the patch doc — you apply it)

`Docs/Google_MultiAccount_Backend.md §6` now has the concrete aggregation:

- `EmailMessage.sourceAccount` + a `fetchUnreadBatchForAccount(accountId, email, …)`
  that authes as a specific connected account and tags each message.
- `/api/gmail/fetch` (now `authenticate`d) loops every **enabled** Gmail account,
  fetches each in parallel, flattens the results, and falls back to the legacy
  single-account fetch when none are connected.
- `processIncomingEmails` carries `sourceAccount` onto the stored `InboxItem`, so
  `GET /api/inbox` returns it and the badge lights up.
- Calendar aggregation follows the same shape.

## End-to-end, once the backend patch + Google Cloud app are in place

Connect two Gmail accounts in **Settings → Google Accounts** → `/api/gmail/fetch`
pulls from both → InboxZero shows all the mail interleaved, each card tagged with
its source mailbox. Disable an account in Settings and it drops out of the fetch.

## Files

```
src/components/InboxZero/InboxZeroTypes.ts   + sourceAccount field
src/components/InboxZero/InboxZero.tsx        per-email source badge
src/test/InboxZero.test.tsx                   + badge test
Docs/Google_MultiAccount_Backend.md §6        concrete /fetch aggregation
```

## Mac gate

```
cd qualia-shell && npx tsc -b && npx vitest run && npx react-router build && VITE_APPFOLIO_SEEDS=false npx react-router build && cd .. && node Scripts/verify_no_pii_leak.mjs && SMOKE_TEST_PORT=3010 SMOKE_TEST_SKIP_BUILD=true node Scripts/smoke_test_ssr_phase8.mjs
```

## Follow-up (optional)

A per-account **filter chip row** in InboxZero ("All · andy@… · lisa@…") to scope
the view to one mailbox — small, additive, deferred unless you want it.
