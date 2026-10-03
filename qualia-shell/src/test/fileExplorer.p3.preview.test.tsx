/** Plan 076 Phase 3 — FilePreview. */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { ApiError } from '../components/FileExplorer/fileExplorerApi';
import { FilePreview } from '../components/FileExplorer/FilePreview';

const readFile = vi.fn();
vi.mock('../components/FileExplorer/fileExplorerApi', async (orig) => ({
    ...(await orig<typeof import('../components/FileExplorer/fileExplorerApi')>()),
    readFile: (p: string) => readFile(p),
}));

const ok = (content: string) => Promise.resolve({ content, size: content.length, modified: '' });

describe('FilePreview', () => {
    beforeEach(() => readFile.mockReset());

    it('renders markdown headings', async () => {
        readFile.mockReturnValue(ok('# Hello\n\nbody'));
        render(<FilePreview path="docs/a.md" onClose={() => {}} />);
        expect(await screen.findByRole('heading', { name: 'Hello' })).toBeTruthy();
    });

    it('strips script and onerror from markdown', async () => {
        readFile.mockReturnValue(ok('# T\n<script>window.__x=1</script>\n<img src=x onerror="window.__x=1">'));
        const { container } = render(<FilePreview path="a.md" onClose={() => {}} />);
        await screen.findByRole('heading', { name: 'T' });
        expect(container.querySelector('script')).toBeNull();
        expect(container.querySelector('[onerror]')).toBeNull();
        expect(container.querySelector('img')).toBeNull();
    });

    it('shows plain text in a pre', async () => {
        readFile.mockReturnValue(ok('# not a heading'));
        const { container } = render(<FilePreview path="a.txt" onClose={() => {}} />);
        await waitFor(() => expect(container.querySelector('pre')?.textContent).toBe('# not a heading'));
        expect(screen.queryByRole('heading')).toBeNull();
    });

    it('maps 413, 415 and generic errors to messages', async () => {
        readFile.mockRejectedValueOnce(new ApiError('x', 413, 'TOO_LARGE'));
        const a = render(<FilePreview path="a.txt" onClose={() => {}} />);
        expect(await screen.findByText('Too large to preview (limit 2 MB)')).toBeTruthy();
        a.unmount();
        readFile.mockRejectedValueOnce(new ApiError('x', 415, 'BINARY'));
        const b = render(<FilePreview path="b.bin" onClose={() => {}} />);
        expect(await screen.findByText("Binary file — preview isn't available yet")).toBeTruthy();
        b.unmount();
        readFile.mockRejectedValueOnce(new Error('boom'));
        render(<FilePreview path="c.txt" onClose={() => {}} />);
        expect(await screen.findByText('boom')).toBeTruthy();
    });

    it('drops the stale response when path changes', async () => {
        let resolveFirst!: (v: unknown) => void;
        readFile.mockImplementationOnce(() => new Promise((r) => { resolveFirst = r; }));
        readFile.mockImplementationOnce(() => ok('second'));
        const { rerender } = render(<FilePreview path="one.txt" onClose={() => {}} />);
        rerender(<FilePreview path="two.txt" onClose={() => {}} />);
        await screen.findByText('second');
        await act(async () => { resolveFirst({ content: 'first', size: 5, modified: '' }); });
        expect(screen.queryByText('first')).toBeNull();
        expect(screen.getByText('second')).toBeTruthy();
    });

    it('closes on Esc inside the region and on the close button', async () => {
        readFile.mockReturnValue(ok('x'));
        const onClose = vi.fn();
        render(<FilePreview path="a.txt" onClose={onClose} />);
        await screen.findByText('x');
        fireEvent.keyDown(screen.getByRole('region'), { key: 'Escape' });
        expect(onClose).toHaveBeenCalledTimes(1);
        fireEvent.click(screen.getByLabelText('Close preview'));
        expect(onClose).toHaveBeenCalledTimes(2);
    });

    it('labels the region with the file name', async () => {
        readFile.mockReturnValue(ok('x'));
        render(<FilePreview path="dir/notes.txt" onClose={() => {}} />);
        expect(screen.getByRole('region', { name: 'Preview of notes.txt' })).toBeTruthy();
        await screen.findByText('x');
    });
});
