# Dwellium Usability and Accessibility QA Report

**Date:** 2026-06-08  
**Target:** `http://localhost:5173/`  
**Account:** Andy (God Mode)  
**Viewport coverage:** default desktop and 390 x 844 narrow viewport

**Evidence screenshot:** [System Health desktop state](./QA_System_Health_2026-06-08.png)

## Executive Summary

The Andy quick-access login works with the supplied passphrase, and all 32 sidebar widgets can be opened and closed without a React error-boundary crash. The app is not yet completely usable because session persistence, narrow-screen layout, Workspace loading, window restore behavior, service readiness, and several accessibility gaps block important workflows.

## Priority Findings

### P0 - Session is lost on page reload

After a successful Andy login, reloading `/` returned to the staff login screen instead of restoring the authenticated shell.

**Impact:** A refresh, accidental reload, or browser restart interrupts work and forces re-authentication.

**Recommended fix:** Verify token/user persistence and the reload path in `src/context/UserContext.tsx`, including the static-login fallback and `dwellium-user` restoration.

### P0 - Narrow viewport hides the main workspace

At 390 x 844 after login:

- Sidebar/navigation was visible at 240 px wide.
- Main workspace was not visible.
- There was no horizontal overflow that would allow reaching the workspace.

**Impact:** The authenticated app is unusable on a phone-sized viewport and likely difficult in narrow split-screen layouts.

**Recommended fix:** Add a mobile shell mode that collapses the sidebar to a drawer/icon rail and guarantees the main workspace remains reachable.

### P1 - Workspace fails to load

The Workspace widget displayed:

> Backend unavailable - showing a local sample workspace. Drill-down works; creating/renaming folders needs the backend. Failed to load domaines HTTP 4...

**Impact:** Core Workspace write workflows are unavailable.

**Recommended fix:** Correct the failing domaines endpoint/request and retain the local fallback as a degraded mode.

### P1 - Minimized widget did not restore from the sidebar

Task Board minimized successfully. Clicking its sidebar launcher did not restore the visible Task Board content in the tested flow.

**Impact:** Users can lose access to a minimized widget unless they find another restore path.

**Recommended fix:** Ensure `handleWidgetClick` restores minimized windows consistently and add an integration test covering open -> minimize -> sidebar restore.

### P1 - Accessibility: many form controls have no accessible name

Observed unnamed visible controls:

- Inbox Zero: 14 unlabeled message-selection checkboxes.
- Inbox alias: the same 14 unlabeled message-selection checkboxes.
- Settings / Control Panel: at least 30 unnamed controls among 55 visible fields, including color inputs, selects, ranges, checkboxes, and numeric margin inputs.
- Docs: 1 unnamed input/select-like control.
- Terminal: 1 unnamed input.
- Login screen: the password visibility icon button has no accessible name.

**Impact:** Screen-reader and voice-control users cannot reliably identify or operate these controls.

**Recommended fix:** Add explicit `<label for>`, `aria-label`, or `aria-labelledby` attributes. For repeated Inbox checkboxes, include the message subject/sender in the accessible name.

### P1 - Required services are not fully operational

System Health reported **9 of 14 ready** and **5 need attention**. Visible degraded/offline states included:

- Trello not configured.
- Transcription backend offline.
- Hydra multi-model not configured.
- Stella agent offline.
- Honcho / Hermes offline.
- No LLM key configured.

**Impact:** Several prominent widgets open but cannot complete their primary job.

**Recommended fix:** Make service setup status actionable from each widget and provide a single verified setup checklist in System Health.

### P2 - Two Brains is inaccessible to Andy God Mode

Two Brains opened to an authorization-required screen telling Andy to contact an administrator.

**Impact:** Either God Mode permissions are not honored or the authorization message does not explain the intended restriction.

**Recommended fix:** Confirm intended permissions. If intentional, explain who can grant access; otherwise fix the permission mapping.

### P2 - React hydration mismatch on initial load

The console logged a hydration mismatch involving the root `<html>` class (`theme-dark`).

**Impact:** This can cause visual flash, inconsistent theme state, and future hydration bugs.

**Recommended fix:** Make the server/client root theme class deterministic.

## Verified Working

- Andy quick-access passphrase gate accepts the supplied passphrase.
- Widget search filters the sidebar.
- Settings opens.
- All 32 sidebar widgets open without a React error-boundary crash.
- Sidebar widget click toggles successfully opened widgets closed during the inventory pass.
- Task Board minimize and maximize controls are present; minimize and maximize actions worked.
- No duplicate DOM IDs were found in the empty shell.
- No missing image `alt` attributes were found in the visible portions of the 32-widget opening pass.
- The empty desktop shell had no unnamed visible buttons or inputs.

## Widget Inventory

### Property Management - 7/7 opened

`Astra`, `Strata`, `Universal Shell`, `Trello`, `Task Board`, `Inbox Zero`, `Tenant Portal`

Notes:

- Trello opened but is not configured.
- Inbox Zero contains 14 unlabeled checkboxes.

### AI Tools - 13/13 opened

`Thought Weaver`, `NotebookLM`, `Transcribe`, `Fact Check`, `Upkeep AI`, `Automations`, `Two Brains`, `Hydra AI`, `ARA`, `Stella`, `Honcho`, `Cognitive M Network`, `System Health`

Notes:

- Transcribe, Hydra AI, Stella, Honcho/Hermes, and LLM-dependent features are degraded or offline.
- Two Brains is authorization-blocked for Andy.

### Filing Cabinet - 12/12 opened

`Explorer`, `Tasks`, `Inbox`, `Files`, `Notepad`, `Scribe`, `Tag File`, `File Explorer`, `Workspace`, `Docs`, `PDF Gear`, `Terminal`

Notes:

- Workspace reports a backend HTTP load failure.
- Inbox contains 14 unlabeled checkboxes.
- Docs and Terminal each expose one unnamed visible input.

## Test Scope and Limitations

This was a broad usability smoke test of every sidebar widget and shell-level interactions. It did not submit destructive actions, send communications, upload files, connect third-party accounts, or exercise every data mutation. Those actions require dedicated workflow tests and configured external services.

## Recommended Remediation Order

1. Fix session persistence across reload.
2. Make the authenticated shell usable at narrow widths.
3. Fix Workspace loading and minimized-widget restore.
4. Label Inbox, Settings, Docs, Terminal, and login controls.
5. Resolve or clearly guide setup for the five unhealthy services.
6. Confirm Two Brains God Mode authorization.
7. Remove the root theme hydration mismatch.
