import { describe, it, expect, vi, afterEach } from 'vitest';
import { themePalette, buildEmailSrcDoc, VIEWER_PALETTE } from '../components/InboxZero/emailFrame';

/** Stubs getComputedStyle to return `values` for getPropertyValue lookups. */
function stubComputedStyle(values: Record<string, string>) {
    const spy = vi.spyOn(window, 'getComputedStyle').mockReturnValue({
        getPropertyValue: (prop: string) => values[prop] ?? '',
    } as CSSStyleDeclaration);
    return spy;
}

afterEach(() => {
    vi.restoreAllMocks();
});

describe('buildEmailSrcDoc', () => {
    it('VIEWER_PALETTE output has body color #ffffff and bg #141726, and never falls back to var(--…) or the old light-mode colors', () => {
        const html = buildEmailSrcDoc('<p>hi</p>', VIEWER_PALETTE, 'comfortable');
        expect(html).toContain('color:#ffffff');
        expect(html).toContain('background:#141726');
        expect(html).not.toContain('var(--');
        expect(html).not.toContain('#1e293b');
        expect(html).not.toContain('#0f172a');
        expect(html).not.toContain('#f8fafc');
    });

    it('compact and comfortable densities render different metrics', () => {
        const compact = buildEmailSrcDoc('<p>hi</p>', VIEWER_PALETTE, 'compact');
        const comfortable = buildEmailSrcDoc('<p>hi</p>', VIEWER_PALETTE, 'comfortable');
        expect(compact).toContain('padding:20px 24px');
        expect(compact).toContain('font-size:14px');
        expect(comfortable).toContain('padding:28px 32px');
        expect(comfortable).toContain('font-size:15px');
        // Only the comfortable (full-viewer) stylesheet sizes h1/h2/h3 apart.
        expect(comfortable).toContain('h1{font-size:22px');
        expect(compact).not.toContain('h1{font-size:22px');
        expect(compact).not.toBe(comfortable);
    });

    it('inserts bodyHtml as-is', () => {
        const html = buildEmailSrcDoc('<p class="q">quoted</p>', VIEWER_PALETTE, 'compact');
        expect(html).toContain('<body><p class="q">quoted</p></body>');
    });
});

describe('themePalette', () => {
    it('missing --bg-surface falls back to the whole VIEWER_PALETTE', () => {
        stubComputedStyle({ '--text-primary': '#eeeeee' }); // no --bg-surface
        expect(themePalette(document.documentElement)).toEqual(VIEWER_PALETTE);
    });

    it('missing --text-primary falls back to the whole VIEWER_PALETTE', () => {
        stubComputedStyle({ '--bg-surface': '#101010' }); // no --text-primary
        expect(themePalette(document.documentElement)).toEqual(VIEWER_PALETTE);
    });

    it('reads valid theme tokens when both bg and text are present', () => {
        stubComputedStyle({
            '--bg-surface': '#111827',
            '--text-primary': '#f9fafb',
            '--text-secondary': '#9ca3af',
            '--accent-text': '#60a5fa',
            '--border-default': 'rgba(255,255,255,0.1)',
            '--bg-surface-elevated': '#1f2937',
            '--accent': '#818cf8',
        });
        const palette = themePalette(document.documentElement);
        expect(palette).toEqual({
            bg: '#111827',
            text: '#f9fafb',
            muted: '#9ca3af',
            link: '#60a5fa',
            border: 'rgba(255,255,255,0.1)',
            surface: '#1f2937',
            quoteBar: '#818cf8',
        });
    });

    it('a palette value containing </style> is rejected and falls back to the individual VIEWER_PALETTE value', () => {
        stubComputedStyle({
            '--bg-surface': '#111827',
            '--text-primary': '#f9fafb',
            '--accent-text': '</style><script>alert(1)</script>',
        });
        const palette = themePalette(document.documentElement);
        expect(palette.link).toBe(VIEWER_PALETTE.link);
        expect(palette.bg).toBe('#111827'); // untouched valid tokens are kept
    });
});
