/**
 * Cycle 9 — DomaineBadge presentational component (decision C9-D2).
 *
 * Renders a resolved DomaineMeta as a color-tinted pill (chip) or dot. Covers:
 *   - null domaine → renders nothing (no empty-pill flicker)
 *   - chip variant shows the name + an accessible label
 *   - dot variant shows the label but not the name text
 *   - the domaine color tints the badge; missing color falls back to the accent
 */
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { DomaineBadge } from '../components/Workspace/DomaineBadge';
import type { DomaineMeta } from '../components/Workspace/workspaceApi';

const dom = (over: Partial<DomaineMeta> = {}): DomaineMeta => ({
    name: 'Acme Estates', path: 'Acme Estates', description: '', color: '#ff8800', position: 0, ...over,
});

afterEach(() => cleanup());

describe('DomaineBadge', () => {
    it('renders nothing when no domaine is supplied', () => {
        const { container } = render(<DomaineBadge domaine={null} />);
        expect(container.firstChild).toBeNull();
    });

    it('chip variant shows the name and an accessible label', () => {
        render(<DomaineBadge domaine={dom()} />);
        const el = screen.getByLabelText('Domaine Acme Estates');
        expect(el).toBeTruthy();
        expect(el.textContent).toContain('Acme Estates');
    });

    it('dot variant exposes the label without rendering the name text', () => {
        render(<DomaineBadge domaine={dom()} variant="dot" />);
        const el = screen.getByLabelText('Domaine Acme Estates');
        expect(el.textContent).toBe('');
    });

    it('tints with the domaine color, falling back to the accent when unset', () => {
        // jsdom serializes CSS colors to rgb(); #ff8800 → rgb(255,136,0), accent #D6FE51 → rgb(214,254,81).
        const { container, rerender } = render(<DomaineBadge domaine={dom({ color: '#ff8800' })} variant="dot" />);
        expect((container.firstChild as HTMLElement).style.background).toBe('rgb(255, 136, 0)');
        rerender(<DomaineBadge domaine={dom({ color: '' })} variant="dot" />);
        expect((container.firstChild as HTMLElement).style.background).toBe('rgb(214, 254, 81)');
    });
});
