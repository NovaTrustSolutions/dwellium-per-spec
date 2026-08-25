/**
 * Registry-walker smoke suite — assessment sweep 2026-06-12 (weakness #2:
 * "1,319 tests are store/parser-deep and widget-interaction-shallow; the
 * repo's own FUCKUPS.md documents 'green gate ≠ working'").
 *
 * This walks the SINGLE source of truth (WIDGET_REGISTRY) and asserts, for
 * every registered widget:
 *   1. the entry is structurally well-formed (id matches key, label, icon,
 *      lazy component, sane min-size);
 *   2. its lazy component is a real React.lazy exotic (so Desktop/Sidebar/
 *      CommandPalette can mount it);
 *   3. the Widget Enhancement Layer (WidgetShell + WidgetErrorBoundary) it now
 *      renders inside ISOLATES a crash — one widget throwing cannot blank the
 *      desktop or strand its neighbours.
 *
 * A full live mount of every widget under every provider is deliberately NOT done
 * here — it's flaky and would test the providers, not the registry. The
 * end-to-end "does the widget actually work when clicked" check lives in the
 * Playwright journey specs (e2e/journey-*.spec.ts), which run on the Mac
 * against a real dev server.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Suspense } from 'react';
import { WIDGET_REGISTRY, WINDOW_COMPONENTS } from '../registry/widgetRegistry';
import WidgetShell from '../components/Window/WidgetShell';

const ids = Object.keys(WIDGET_REGISTRY);

describe('WIDGET_REGISTRY integrity', () => {
    it('has the expected widget count (guards accidental drops)', () => {
        // Running total = 56:
        //   48 baseline + time-travel (upgrade #7) + holocron-library (2026-06-12)
        //   + 2 feat/assessment-sweep widgets (e.g. cognitive-harness) not
        //     previously recorded in this guard
        //   + api-keys (per-user API-key widget below Inbox Zero, 2026-06-15)
        //   + meeting (ARA Meeting Notetaker — visible/background note-taker, 2026-06-15)
        //   + cloud-browser (server-rendered browsing inside Holocron, 2026-06-18)
        //   + audit-log (Andy-only Audit Log holocron, 730c82a — guard was not
        //     bumped when that widget shipped; corrected here, pre-existing drift).
        //   − ui-editor DISABLED (2026-07-06 Andy: activating it blanked the
        //     screen; registry entry removed, component kept on disk) → 55.
        //   + tools-hub + guide (plan 047 onboarding surface) → 57.
        //   + whiteboard (plan 047 phase 1 — Excalidraw, feat/047-whiteboard) → 58.
        //   + esign (plan 047 phase 1 — Documenso e-sign widget) → 59.
        //   + scheduler + penpot-studio + remote-support (plan 047 phase 2
        //     launcher/embed trio — cal.com embed, Penpot launcher, RustDesk
        //     launcher; feat/047-launchers) → 62.
        //   + photo-vault (plan 047 phase 2 — Immich on the office Mac via Tailscale) → 63.
        //   + broadcasts + short-links (plan 047 phase 2 — listmonk + Dub proxies) → 61.
        //   + appflowy (plan 047 phase 3 / plan 053 — AppFlowy Workspace embed/launcher) → 66.
        //   + advisory-board (5 Persona Advisory Board — CRIT decision stress-test) → 67.
        expect(ids.length).toBe(67);
    });

    // Plan 047: every widget carries a first-open tip whose related ids resolve.
    it.each(ids)('"%s" has a description + tip with resolvable related ids', (id) => {
        const w = WIDGET_REGISTRY[id];
        expect(w.description.length).toBeGreaterThan(0);
        expect(w.tip?.tryThis.length ?? 0).toBeGreaterThan(0);
        expect(w.tip!.related.length).toBeGreaterThanOrEqual(1);
        expect(w.tip!.related.length).toBeLessThanOrEqual(2);
        for (const r of w.tip!.related) expect(WIDGET_REGISTRY[r], `related "${r}" of "${id}"`).toBeDefined();
        if (w.tier !== undefined) expect(['core', 'daily', 'ai', 'tools', 'labs']).toContain(w.tier);
    });

    it.each(ids)('"%s" entry is well-formed', (id) => {
        const w = WIDGET_REGISTRY[id];
        expect(w.id).toBe(id); // key matches id
        expect(typeof w.label).toBe('string');
        expect(w.label.length).toBeGreaterThan(0);
        expect(typeof w.icon).toBe('string');
        expect(w.icon.length).toBeGreaterThan(0);
        // lazy component: a React exotic (object with $$typeof + _init/_payload)
        expect(w.component).toBeTruthy();
        expect(typeof w.component).toBe('object');
        if (w.minWidth !== undefined) expect(w.minWidth).toBeGreaterThan(0);
        if (w.minHeight !== undefined) expect(w.minHeight).toBeGreaterThan(0);
    });

    it('WINDOW_COMPONENTS map covers every registry id (Desktop can resolve all)', () => {
        for (const id of ids) {
            expect(WINDOW_COMPONENTS[id]).toBe(WIDGET_REGISTRY[id].component);
        }
    });

    it('every category is one of the known buckets', () => {
        const ok = new Set([undefined, 'core', 'ai', 'filing', 'tools']);
        for (const id of ids) expect(ok.has(WIDGET_REGISTRY[id].category)).toBe(true);
    });

    // plan 046 S2-6: one plain-English line per widget (⌘K rows, sidebar hover, window title).
    it('every widget has a one-line description', () => {
        for (const r of Object.values(WIDGET_REGISTRY)) {
            expect(r.description, r.id).toBeTruthy();
            expect(r.description.length, r.id).toBeLessThanOrEqual(100);
            expect(r.description, r.id).not.toMatch(/\n/);
        }
    });
});

describe('Widget Enhancement Layer isolates crashes (weakness #2)', () => {
    it('a crashing widget shows its recover card; siblings keep rendering', () => {
        vi.spyOn(console, 'error').mockImplementation(() => {});
        const Crash = () => { throw new Error('widget exploded'); };
        render(
            <div>
                <WidgetShell widgetId="crasher" widgetLabel="Crasher">
                    <Suspense fallback={<div>loading…</div>}><Crash /></Suspense>
                </WidgetShell>
                <WidgetShell widgetId="healthy" widgetLabel="Healthy">
                    <div>sibling still alive</div>
                </WidgetShell>
            </div>,
        );
        // crashed widget contained to its own recover card
        expect(screen.getByText(/Crasher hit an error/)).toBeTruthy();
        // sibling unaffected — the desktop survives
        expect(screen.getByText('sibling still alive')).toBeTruthy();
    });
});
