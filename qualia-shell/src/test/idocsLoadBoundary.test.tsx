import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { vi, describe, it, expect, afterEach } from 'vitest';
import { IdocsLoadBoundary } from '../components/Scribe/Scribe';
import { isChunkLoadError } from '../utils/lazyWithReload';

/**
 * A tab left open across a deploy fails to import the Interactive Docs chunk
 * (old hash gone). The boundary names that case and offers Reload; other
 * errors stay visible with Try again. Nothing here is a generic "Something
 * went wrong".
 */
function Boom({ message }: { message: string }): never { throw new Error(message); }

describe('IdocsLoadBoundary', () => {
    afterEach(() => { cleanup(); vi.restoreAllMocks(); });

    it('names a stale deploy on a chunk-load failure and offers Reload + Back to Doc', () => {
        vi.spyOn(console, 'error').mockImplementation(() => {});
        const back = vi.fn();
        render(<IdocsLoadBoundary onBackToDoc={back}><Boom message="Failed to fetch dynamically imported module: https://argyleholocron.netlify.app/assets/InteractiveDocs-OLDHASH.js" /></IdocsLoadBoundary>);
        const alert = screen.getByRole('alert');
        expect(alert.getAttribute('data-state')).toBe('stale-deploy');
        expect(alert.textContent).toMatch(/newer Dwellium was deployed since this tab opened/);
        expect(screen.getByRole('button', { name: 'Reload' })).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Back to Doc' }));
        expect(back).toHaveBeenCalledTimes(1);
    });

    it('shows the real message for any other error and recovers on Try again', () => {
        vi.spyOn(console, 'error').mockImplementation(() => {});
        let fail = true;
        function Flaky() { if (fail) throw new Error('idocs store: cards is not iterable'); return <p>library</p>; }
        render(<IdocsLoadBoundary><Flaky /></IdocsLoadBoundary>);
        const alert = screen.getByRole('alert');
        expect(alert.getAttribute('data-state')).toBe('idocs-error');
        expect(alert.textContent).toMatch(/cards is not iterable/);
        fail = false;
        fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
        expect(screen.getByText('library')).toBeInTheDocument();
    });

    it('isChunkLoadError recognises the browsers\' wording and nothing else', () => {
        expect(isChunkLoadError(new Error('Failed to fetch dynamically imported module: x.js'))).toBe(true);
        expect(isChunkLoadError(new Error('Importing a module script failed.'))).toBe(true);
        expect(isChunkLoadError(new Error('Loading chunk 123 failed.'))).toBe(true);
        expect(isChunkLoadError(new TypeError('Failed to fetch'))).toBe(false);
        expect(isChunkLoadError(null)).toBe(false);
    });
});
