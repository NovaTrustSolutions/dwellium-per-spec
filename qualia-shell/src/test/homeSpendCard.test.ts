/**
 * Unit tests for the pure helpers behind the Home "AI Spend" card
 * (plan 068 Phase 1, section D). Render-level HalocronOS coverage mocks
 * subscriptionsStore, so proration math + plan-edit parsing are tested
 * directly here instead.
 */
import { describe, expect, it } from 'vitest';
import { applyPlanEdits, parseNewSubscription, prorateMonthly, withoutUnconfirmedDefaults, type Subscription } from '../lib/subscriptionsStore';

describe('prorateMonthly', () => {
    it('prorates a flat monthly figure to the selected range (today/7/28)', () => {
        expect(prorateMonthly(30, 1)).toBeCloseTo(1);       // today
        expect(prorateMonthly(30, 7)).toBeCloseTo(7);        // 7 days
        expect(prorateMonthly(30, 28)).toBeCloseTo(28);      // 28 days
    });

    it('returns 0 for 0 subscriptions regardless of range', () => {
        expect(prorateMonthly(0, 7)).toBe(0);
    });
});

describe('applyPlanEdits', () => {
    const rows: Subscription[] = [
        { id: 'a', name: 'A', vendor: '', monthly: 10 },
        { id: 'b', name: 'B', vendor: '', monthly: 20 },
    ];

    it('leaves a row unchanged when the prompt answer is null (cancelled)', () => {
        expect(applyPlanEdits(rows, [null, null])).toEqual(rows);
    });

    it('removes a row when the answer is "remove"', () => {
        const out = applyPlanEdits(rows, ['remove', null]);
        expect(out).toEqual([rows[1]]);
    });

    it('sets monthly to 0 for a blank or "0" answer but keeps the row', () => {
        const out = applyPlanEdits(rows, ['', '0']);
        expect(out).toEqual([{ ...rows[0], monthly: 0 }, { ...rows[1], monthly: 0 }]);
    });

    it('parses a numeric answer into the new monthly price', () => {
        const out = applyPlanEdits(rows, ['15.50', null]);
        expect(out[0].monthly).toBe(15.5);
    });

    it('does not mutate the input array', () => {
        const before = JSON.stringify(rows);
        applyPlanEdits(rows, ['remove', '99']);
        expect(JSON.stringify(rows)).toBe(before);
    });
});

describe('parseNewSubscription', () => {
    it('returns null for a blank or null answer (skip)', () => {
        expect(parseNewSubscription(null)).toBeNull();
        expect(parseNewSubscription('')).toBeNull();
        expect(parseNewSubscription('   ')).toBeNull();
    });

    it('parses "Name, 20" into a subscription with a unique id', () => {
        const sub = parseNewSubscription('Midjourney, 20');
        expect(sub).not.toBeNull();
        expect(sub?.name).toBe('Midjourney');
        expect(sub?.monthly).toBe(20);
        expect(sub?.vendor).toBe('');
        expect(sub?.id).toContain('midjourney');
    });

    it('defaults monthly to 0 when no price is given', () => {
        const sub = parseNewSubscription('Notion AI');
        expect(sub?.monthly).toBe(0);
    });
});

describe('withoutUnconfirmedDefaults (plan 068)', () => {
    const OLD = [
        { id: 'claude-max', name: 'Claude Max 20x', vendor: 'Anthropic', monthly: 200 },
        { id: 'chatgpt-plus', name: 'ChatGPT Plus', vendor: 'OpenAI', monthly: 20 },
        { id: 'codex', name: 'Codex', vendor: 'OpenAI · CLI', monthly: 0 },
    ];
    it('hides the exact old shipped sample list (never confirmed by the user)', () => {
        expect(withoutUnconfirmedDefaults(OLD)).toEqual([]);
    });
    it('keeps the list once the user changed anything', () => {
        const edited = OLD.map((s) => (s.id === 'chatgpt-plus' ? { ...s, monthly: 0 } : s));
        expect(withoutUnconfirmedDefaults(edited)).toBe(edited);
        expect(withoutUnconfirmedDefaults(OLD.slice(0, 2))).toHaveLength(2);
    });
});
