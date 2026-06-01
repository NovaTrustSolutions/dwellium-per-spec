import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import VoiceVisualizer from '../components/ARAConsole/VoiceVisualizer';

/**
 * Renders the REAL visualizer component. jsdom has no AudioContext and no 2D
 * canvas context, so this proves the component is SSR/test-safe (mounts and
 * switches templates without throwing) and that the template switcher actually
 * changes + persists the selection. Drawing/Web-Audio is feature-detected off.
 */
describe('VoiceVisualizer', () => {
    beforeEach(() => {
        // Keep jsdom from running an animation loop; we only assert DOM/state.
        vi.stubGlobal('requestAnimationFrame', () => 0);
        vi.stubGlobal('cancelAnimationFrame', () => {});
        try { localStorage.clear(); } catch { /* */ }
    });
    afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

    it('is hidden and shows no switcher when inactive', () => {
        const { container } = render(<VoiceVisualizer active={false} />);
        const root = container.querySelector('.ara-visualizer') as HTMLElement;
        expect(root).toBeTruthy();
        expect(root.getAttribute('data-active')).toBe('false');
        expect(screen.queryByRole('button', { name: /Visualizer:/ })).toBeNull();
    });

    it('shows all four templates while ARA is speaking, Galaxy selected by default', () => {
        render(<VoiceVisualizer active={true} />);
        for (const name of ['Galaxy', 'Orb', 'Bars', 'Waveform']) {
            expect(screen.getByRole('button', { name: `Visualizer: ${name}` })).toBeInTheDocument();
        }
        expect(screen.getByRole('button', { name: 'Visualizer: Galaxy' }).getAttribute('aria-pressed')).toBe('true');
    });

    it('switching template updates selection and persists it', () => {
        render(<VoiceVisualizer active={true} />);
        fireEvent.click(screen.getByRole('button', { name: 'Visualizer: Bars' }));
        expect(screen.getByRole('button', { name: 'Visualizer: Bars' }).getAttribute('aria-pressed')).toBe('true');
        expect(screen.getByRole('button', { name: 'Visualizer: Galaxy' }).getAttribute('aria-pressed')).toBe('false');
        expect(localStorage.getItem('ara-visualizer-theme')).toBe('bars');
    });

    it('mounts without throwing when active and no AudioContext exists (jsdom)', () => {
        expect(() => render(<VoiceVisualizer active={true} />)).not.toThrow();
    });
});
