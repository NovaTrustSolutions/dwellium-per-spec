/**
 * Unit tests for the pure helpers behind the Home "AI Spend" card
 * (plan 068 Phase 1, section D). Render-level HalocronOS coverage mocks
 * subscriptionsStore, so proration math + plan-edit parsing are tested
 * directly here instead.
 */
import { describe, expect, it } from 'vitest';
import { prorateMonthly, withoutUnconfirmedDefaults } from '../lib/subscriptionsStore';

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
