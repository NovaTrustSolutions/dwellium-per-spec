import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DocumentToolbar } from '../components/Scribe/DocumentToolbar';
import { useScribeStore } from '../components/Scribe/scribeStore';

/**
 * The live-preview toggle used to be a floating button absolutely positioned
 * over the editor (top-right of `.scribe__editor-area`), where it covered the
 * first line of text and sat outside the toolbar every other view toggle lives
 * in. It is now a DocumentToolbar button backed by `scribeStore.previewVisible`.
 */
describe('Scribe preview toggle lives in the document toolbar', () => {
    beforeEach(() => {
        useScribeStore.setState({ previewVisible: false, activeFilepath: 'notes.md', openFiles: [{ filepath: 'notes.md', content: '# hi', dirty: false, scrollTop: 0 }] });
    });
    afterEach(() => { cleanup(); vi.restoreAllMocks(); });

    it('renders a Preview button next to Contents and Minimap and toggles the store flag', () => {
        render(<DocumentToolbar />);
        const toolbar = document.querySelector('.scribe__toolbar')!;
        const names = Array.from(toolbar.querySelectorAll('button')).map((b) => b.textContent?.trim());
        expect(names.slice(0, 3)).toEqual(['Contents', 'Minimap', 'Preview']);

        const btn = screen.getByRole('button', { name: 'Preview' });
        expect(btn.closest('.scribe__toolbar')).toBe(toolbar);
        expect(btn).toHaveAttribute('title', 'Show live preview (rendered Markdown beside the editor)');
        fireEvent.click(btn);
        expect(useScribeStore.getState().previewVisible).toBe(true);
        expect(screen.getByRole('button', { name: 'Preview' })).toHaveAttribute('title', 'Hide live preview');
        fireEvent.click(screen.getByRole('button', { name: 'Preview' }));
        expect(useScribeStore.getState().previewVisible).toBe(false);
    });

    it('no longer floats a toggle over the editor', () => {
        const root = resolve(process.cwd(), 'src/components/Scribe');
        const scribe = readFileSync(resolve(root, 'Scribe.tsx'), 'utf8');
        const css = readFileSync(resolve(root, 'MarkdownPreview.css'), 'utf8');
        expect(scribe).not.toMatch(/scribe__preview-toggle/);
        expect(css).not.toMatch(/scribe__preview-toggle/);
        // the preview column itself still follows the store flag
        expect(scribe).toMatch(/useScribeStore\(\(s\) => s\.previewVisible\)/);
    });
});
