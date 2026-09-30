/** Plan 076 Phase 4 — FilePreview images. */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act, waitFor } from '@testing-library/react';
import { FilePreview } from '../components/FileExplorer/FilePreview';

const readFile = vi.fn();
const fetchBytes = vi.fn();
vi.mock('../components/FileExplorer/fileExplorerApi', async (orig) => ({
    ...(await orig<typeof import('../components/FileExplorer/fileExplorerApi')>()),
    readFile: (p: string) => readFile(p),
    fetchBytes: (p: string) => fetchBytes(p),
}));

const create = vi.fn();
const revoke = vi.fn();
let n = 0;
const md = (c: string) => Promise.resolve({ content: c, size: c.length, modified: '' });
const blob = () => Promise.resolve(new Blob(['x']));

beforeEach(() => {
    readFile.mockReset(); fetchBytes.mockReset(); create.mockReset(); revoke.mockReset(); n = 0;
    create.mockImplementation(() => `blob:mock/${++n}`);
    (URL as unknown as Record<string, unknown>).createObjectURL = create;
    (URL as unknown as Record<string, unknown>).revokeObjectURL = revoke;
    fetchBytes.mockImplementation(blob);
});
afterEach(() => { vi.restoreAllMocks(); });

describe('FilePreview images', () => {
    it('renders an image file from fetchBytes without readFile', async () => {
        const { container } = render(<FilePreview path="pics/Shot.PNG" onClose={() => {}} />);
        const img = await screen.findByAltText('Shot.PNG');
        expect(img.getAttribute('src')).toBe('blob:mock/1');
        expect(fetchBytes).toHaveBeenCalledWith('pics/Shot.PNG');
        expect(readFile).not.toHaveBeenCalled();
        expect(container.querySelectorAll('img')).toHaveLength(1);
    });

    it('maps image errors to the same messages', async () => {
        const { ApiError } = await import('../components/FileExplorer/fileExplorerApi');
        fetchBytes.mockRejectedValueOnce(new ApiError('x', 413, 'TOO_LARGE'));
        render(<FilePreview path="a.jpg" onClose={() => {}} />);
        expect(await screen.findByText('Too large to preview (limit 2 MB)')).toBeTruthy();
    });

    it('resolves a sibling markdown image to the blob URL', async () => {
        readFile.mockReturnValue(md('# T\n\n![shot](shot.png)'));
        render(<FilePreview path="docs/a.md" onClose={() => {}} />);
        const img = await screen.findByAltText('shot');
        await waitFor(() => expect(img.getAttribute('src')).toBe('blob:mock/1'));
        expect(fetchBytes).toHaveBeenCalledWith('docs/shot.png');
    });

    it('resolves ../ within the root and refuses to escape it', async () => {
        readFile.mockReturnValue(md('![up](../x.png)\n![out](../../x.png)\n![dot](./d/y.png)'));
        render(<FilePreview path="docs/a.md" onClose={() => {}} />);
        await waitFor(() => expect(fetchBytes).toHaveBeenCalledTimes(2));
        expect(fetchBytes.mock.calls.map((c) => c[0]).sort()).toEqual(['docs/d/y.png', 'x.png']);
        expect(fetchBytes).not.toHaveBeenCalledWith('../x.png');
        const out = screen.getByAltText('out');
        expect(out.getAttribute('src')).toBeNull();
    });

    it('shows remote images as a link (never auto-loaded) and does not fetch root-absolute or data refs', async () => {
        readFile.mockReturnValue(md('![w](https://e.com/a.png)\n![r](/abs.png)\n![d](data:image/png;base64,AAAA)\n![s](//cdn/x.png)'));
        render(<FilePreview path="a.md" onClose={() => {}} />);
        const w = await screen.findByText('Remote image: w');
        expect(w.getAttribute('href')).toBe('https://e.com/a.png');
        expect(w.getAttribute('rel')).toBe('noopener noreferrer');
        expect(document.querySelector('img[src^="http"]')).toBeNull();
        expect(fetchBytes).not.toHaveBeenCalled();
        expect(screen.getByAltText('r').getAttribute('src')).toBeNull();
        expect(screen.getByAltText('d').getAttribute('src')).toBeNull();
        expect(screen.getByAltText('s').getAttribute('src')).toBeNull();
    });

    it('revokes object URLs on unmount (image file and markdown image)', async () => {
        const a = render(<FilePreview path="p.png" onClose={() => {}} />);
        await screen.findByAltText('p.png');
        a.unmount();
        expect(revoke).toHaveBeenCalledWith('blob:mock/1');
        revoke.mockClear();
        readFile.mockReturnValue(md('![s](s.png)'));
        const b = render(<FilePreview path="a.md" onClose={() => {}} />);
        await waitFor(() => expect(screen.getByAltText('s').getAttribute('src')).toBe('blob:mock/2'));
        b.unmount();
        expect(revoke).toHaveBeenCalledWith('blob:mock/2');
    });

    it('revokes on path change', async () => {
        const { rerender } = render(<FilePreview path="one.png" onClose={() => {}} />);
        await screen.findByAltText('one.png');
        rerender(<FilePreview path="two.png" onClose={() => {}} />);
        await screen.findByAltText('two.png');
        expect(revoke).toHaveBeenCalledWith('blob:mock/1');
        expect(revoke).not.toHaveBeenCalledWith('blob:mock/2');
    });

    it('drops a stale image response after path change', async () => {
        let first!: (b: Blob) => void;
        fetchBytes.mockImplementationOnce(() => new Promise((r) => { first = r; }));
        const { rerender } = render(<FilePreview path="one.png" onClose={() => {}} />);
        rerender(<FilePreview path="two.png" onClose={() => {}} />);
        await screen.findByAltText('two.png');
        create.mockClear();
        await act(async () => { first(new Blob(['old'])); });
        expect(create).not.toHaveBeenCalled();
        expect(screen.queryByAltText('one.png')).toBeNull();
        expect(screen.getByAltText('two.png')).toBeTruthy();
    });

    it('does not mint a URL for a markdown image that resolves after unmount', async () => {
        let late!: (b: Blob) => void;
        fetchBytes.mockImplementationOnce(() => new Promise((r) => { late = r; }));
        readFile.mockReturnValue(md('![s](s.png)'));
        const { unmount } = render(<FilePreview path="a.md" onClose={() => {}} />);
        await screen.findByAltText('s');
        unmount();
        await act(async () => { late(new Blob(['x'])); });
        expect(create).not.toHaveBeenCalled();
    });
});
