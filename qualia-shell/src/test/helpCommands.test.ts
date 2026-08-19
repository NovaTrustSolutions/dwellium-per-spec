/**
 * helpCommands — plan 047 §6 ⌘K "help:" / "?" / "labs:" rows (pure builder).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../lib/oneSaveClient', () => ({
    ONE_SAVE_ENABLED: false,
    oneSaveClient: { get: vi.fn().mockResolvedValue(null), put: vi.fn().mockResolvedValue(undefined), remove: vi.fn().mockResolvedValue(undefined), history: vi.fn() },
}));

import { buildHelpRows } from '../lib/helpCommands';
import { WIDGET_REGISTRY } from '../registry/widgetRegistry';
import { tierOf, onboardingStore, resetOnboarding, markTipSeen } from '../lib/onboardingStore';
import { setPerUserIdentity } from '../lib/perUserIdentity';
import { AUDIT_LOG_CATALOG_EMAILS } from '../components/AuditLog/auditLogAccess';


// `openWidget()` dispatches a plain `dwellium:open-widget` CustomEvent (not a typed-bus emit) — capture it.
const opened: string[] = [];
const onOpen = (e: Event) => opened.push(String((e as CustomEvent<{ widgetId: string }>).detail?.widgetId));
beforeEach(() => { localStorage.clear(); setPerUserIdentity('u-help'); onboardingStore.reset(); resetOnboarding(); opened.length = 0; window.addEventListener('dwellium:open-widget', onOpen); });
afterEach(() => window.removeEventListener('dwellium:open-widget', onOpen));

describe('buildHelpRows', () => {
    it('non-help queries yield nothing', () => {
        expect(buildHelpRows('')).toEqual([]);
        expect(buildHelpRows('open strata')).toEqual([]);
        expect(buildHelpRows('helpful stuff')).toEqual([]);
    });
    it('"help:" and "?" list Guide · Keyboard shortcuts · Tools hub with registry descriptions', () => {
        for (const q of ['help:', '? ', 'HELP: ']) {
            const rows = buildHelpRows(q);
            expect(rows.map(r => r.id)).toEqual(['help:guide', 'help:shortcuts', 'help:tools']);
            expect(rows[0].subtitle).toBe(WIDGET_REGISTRY['guide'].description);
            expect(rows[2].subtitle).toBe(WIDGET_REGISTRY['tools-hub'].description);
        }
    });
    it('static rows run: Guide/Tools hub open the widget, shortcuts dispatches the sheet event', () => {
        const rows = buildHelpRows('help:');
        rows[0].run(); rows[2].run();
        expect(opened).toEqual(['guide', 'tools-hub']);
        const sheet = vi.fn(); window.addEventListener('dwellium:open-shortcuts', sheet);
        rows[1].run(); expect(sheet).toHaveBeenCalledTimes(1);
        window.removeEventListener('dwellium:open-shortcuts', sheet);
    });
    it('"help: scribe" → one widget row that opens Scribe and re-arms its tip', () => {
        markTipSeen('scribe');
        const rows = buildHelpRows('help: scribe');
        expect(rows.map(r => r.id)).toEqual(['help:scribe']);
        expect(rows[0].subtitle).toBe(WIDGET_REGISTRY['scribe'].description);
        rows[0].run();
        expect(opened).toEqual(['scribe']);
        expect(onboardingStore.getSnapshot().seenTips).toEqual([]); // re-armed
    });
    it('"help: tools" matches the static Tools hub row (no widget-row duplicate)', () => {
        expect(buildHelpRows('help: tools').map(r => r.id)).toEqual(['help:tools']);
    });
    it('"labs:" lists every labs-tier widget; restricted ones only for their emails', () => {
        const all = Object.values(WIDGET_REGISTRY).filter(w => tierOf(w.id) === 'labs');
        const anon = buildHelpRows('labs:');
        expect(anon.map(r => r.id)).toEqual(all.filter(w => !w.restrictedToEmails).map(w => `labs:${w.id}`));
        const andy = buildHelpRows('labs:', AUDIT_LOG_CATALOG_EMAILS[0]);
        expect(andy.map(r => r.id)).toContain('labs:audit-log');
        expect(buildHelpRows('labs: term').map(r => r.id)).toEqual(['labs:terminal']);
        anon[0].run();
        expect(opened).toEqual([anon[0].id.replace('labs:', '')]);
    });
});
