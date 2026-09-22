/**
 * Pins P0 item 2: text mode must load the FULL file body via
 * `GET ${API_FILES}/:id` (never the truncated `/preview` route) and must
 * never PUT a truncated body back to the server.
 *
 * A 6000-char .txt (over the old 5,000-char /preview truncation, under the
 * 2 MB full-load cap) is opened via the `qualia-docviewer-open-file` event,
 * edited, and Save Back is confirmed — the PUT's multipart `file` part must
 * contain the full original text plus the edit.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import DocViewer from '../components/DocViewer/DocViewer';

const LONG_TEXT = 'A'.repeat(6000);
const FILE = { id: 'f1', name: 'notes.txt', type: 'txt' };

function jsonResponse(body: unknown, init: Partial<Response> = {}) {
    return {
        ok: true,
        status: 200,
        json: async () => body,
        text: async () => JSON.stringify(body),
        headers: { get: () => null },
        ...init,
    } as unknown as Response;
}

describe('DocViewer text mode — full-body load, never a truncated Save Back', () => {
    let fetchMock: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
            const url = String(input);
            const method = init?.method || 'GET';

            if (url.endsWith('/api/files') && method === 'GET') {
                return jsonResponse({ success: true, data: [FILE] });
            }
            if (url.endsWith(`/api/files/${FILE.id}`) && method === 'GET') {
                // The FULL body — never /preview, never truncated.
                return {
                    ok: true,
                    status: 200,
                    headers: { get: (h: string) => (h.toLowerCase() === 'content-length' ? String(LONG_TEXT.length) : null) },
                    text: async () => LONG_TEXT,
                } as unknown as Response;
            }
            if (url.includes(`/api/files/${FILE.id}/preview`)) {
                // If DocViewer ever calls this again for text, fail the test loudly.
                throw new Error('regression: text mode must not call /preview');
            }
            if (url.endsWith(`/api/files/${FILE.id}/content`) && method === 'PUT') {
                return jsonResponse({ success: true, data: { file: FILE, savedPath: null } });
            }
            throw new Error(`unexpected fetch: ${method} ${url}`);
        });
        vi.stubGlobal('fetch', fetchMock);
        vi.stubGlobal('confirm', vi.fn(() => true));
        cleanup();
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('loads the full 6000-char body (not truncated to 5000) and Save Back PUTs the full edited text', async () => {
        render(<DocViewer />);

        // Files list loads first.
        await waitFor(() => expect(fetchMock).toHaveBeenCalled());

        // Deep-link open, as Desktop/CommandPalette do.
        fireEvent(window, new CustomEvent('qualia-docviewer-open-file', { detail: { fileId: FILE.id, name: FILE.name } }));

        const textarea = await screen.findByDisplayValue(LONG_TEXT, undefined, { timeout: 3000 });
        expect((textarea as HTMLTextAreaElement).value.length).toBe(6000);
        // Never truncated to the old 5,000-char /preview cap.
        expect((textarea as HTMLTextAreaElement).value.length).toBeGreaterThan(5000);

        const edited = LONG_TEXT + ' EDITED';
        fireEvent.change(textarea, { target: { value: edited } });

        const saveBtn = await screen.findByRole('button', { name: /save back/i });
        await waitFor(() => expect(saveBtn).not.toBeDisabled());
        fireEvent.click(saveBtn);

        await waitFor(() => {
            const putCall = fetchMock.mock.calls.find(
                (c: unknown[]) => String(c[0]).endsWith(`/api/files/${FILE.id}/content`) && (c[1] as RequestInit)?.method === 'PUT',
            );
            expect(putCall).toBeTruthy();
        });

        const putCall = fetchMock.mock.calls.find(
            (c: unknown[]) => String(c[0]).endsWith(`/api/files/${FILE.id}/content`) && (c[1] as RequestInit)?.method === 'PUT',
        )!;
        const formData = (putCall[1] as RequestInit).body as FormData;
        const filePart = formData.get('file') as Blob;
        const putText = await filePart.text();

        expect(putText).toBe(edited);
        expect(putText.length).toBe(edited.length);
        expect(putText.startsWith(LONG_TEXT)).toBe(true);
    });
});

// R3 (adversarial review): the cap-exceeded / load-failure branch — the
// exact data-loss guard P0 item 2 exists for — had zero test coverage.
// Nothing forced the over-cap or failed-fetch path and asserted the file
// opens read-only with Save Back disabled and the content never partially
// assigned.
describe('DocViewer text mode — over-cap and load-failure open read-only', () => {
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('a declared Content-Length over the 2 MB cap opens read-only, never assigns partial content, disables Save Back', async () => {
        const BIG_FILE = { id: 'f2', name: 'huge.txt', type: 'txt' };
        const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
            const url = String(input);
            const method = init?.method || 'GET';
            if (url.endsWith('/api/files') && method === 'GET') {
                return jsonResponse({ success: true, data: [BIG_FILE] });
            }
            if (url.endsWith(`/api/files/${BIG_FILE.id}`) && method === 'GET') {
                return {
                    ok: true,
                    status: 200,
                    headers: { get: (h: string) => (h.toLowerCase() === 'content-length' ? String(3 * 1024 * 1024) : null) },
                    // A regression that reads the body anyway must not leak it into the textarea.
                    text: async () => 'SHOULD NEVER BE SHOWN',
                } as unknown as Response;
            }
            throw new Error(`unexpected fetch: ${method} ${url}`);
        });
        vi.stubGlobal('fetch', fetchMock);
        cleanup();

        render(<DocViewer />);
        await waitFor(() => expect(fetchMock).toHaveBeenCalled());
        fireEvent(window, new CustomEvent('qualia-docviewer-open-file', { detail: { fileId: BIG_FILE.id, name: BIG_FILE.name } }));

        const textarea = await screen.findByDisplayValue('', undefined, { timeout: 3000 }) as HTMLTextAreaElement;
        expect(textarea).toHaveAttribute('readonly');
        expect(textarea.value).not.toContain('SHOULD NEVER BE SHOWN');

        const saveBtn = await screen.findByRole('button', { name: /save back/i });
        expect(saveBtn).toBeDisabled();
        expect(saveBtn.getAttribute('title')).toMatch(/read-only/i);
    });

    it('a failed fetch opens the file read-only instead of leaving stale/partial content editable', async () => {
        const FAIL_FILE = { id: 'f3', name: 'broken.txt', type: 'txt' };
        const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
            const url = String(input);
            const method = init?.method || 'GET';
            if (url.endsWith('/api/files') && method === 'GET') {
                return jsonResponse({ success: true, data: [FAIL_FILE] });
            }
            if (url.endsWith(`/api/files/${FAIL_FILE.id}`) && method === 'GET') {
                return { ok: false, status: 500, headers: { get: () => null }, text: async () => '' } as unknown as Response;
            }
            throw new Error(`unexpected fetch: ${method} ${url}`);
        });
        vi.stubGlobal('fetch', fetchMock);
        cleanup();

        render(<DocViewer />);
        await waitFor(() => expect(fetchMock).toHaveBeenCalled());
        fireEvent(window, new CustomEvent('qualia-docviewer-open-file', { detail: { fileId: FAIL_FILE.id, name: FAIL_FILE.name } }));

        const textarea = await screen.findByDisplayValue('', undefined, { timeout: 3000 }) as HTMLTextAreaElement;
        expect(textarea).toHaveAttribute('readonly');
        const saveBtn = await screen.findByRole('button', { name: /save back/i });
        expect(saveBtn).toBeDisabled();
    });
});
