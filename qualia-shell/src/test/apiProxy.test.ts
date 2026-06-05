import { describe, it, expect } from 'vitest';
import { proxyRequest } from '../../app/routes/apiProxy';

describe('apiProxy.proxyRequest — /api/* reverse proxy', () => {
    it('forwards method + path + query to the backend origin and returns the upstream response', async () => {
        let seenUrl = '';
        let seenInit: RequestInit | undefined;
        const fakeFetch = async (url: string, init?: RequestInit) => {
            seenUrl = url;
            seenInit = init;
            return new Response('{"ok":true}', { status: 200, headers: { 'content-type': 'application/json' } });
        };
        const req = new Request('http://localhost:5173/api/tasks/ai-organize?x=1', {
            method: 'POST',
            headers: { 'content-type': 'application/json', host: 'localhost:5173' },
            body: '{"a":1}',
        });
        const res = await proxyRequest(req, 'http://localhost:3000', fakeFetch as any);

        expect(seenUrl).toBe('http://localhost:3000/api/tasks/ai-organize?x=1'); // path + query preserved, origin swapped
        expect(seenInit?.method).toBe('POST');
        // host header must NOT be forwarded (backend should see its own host)
        expect((seenInit?.headers as Headers).get('host')).toBeNull();
        expect((seenInit?.headers as Headers).get('content-type')).toBe('application/json');
        expect(res.status).toBe(200);
        expect(await res.text()).toBe('{"ok":true}');
    });

    it('passes a GET straight through (no body)', async () => {
        let seenUrl = '';
        const fakeFetch = async (url: string) => { seenUrl = url; return new Response('[]', { status: 200 }); };
        const req = new Request('http://localhost:5173/api/tasks', { method: 'GET' });
        const res = await proxyRequest(req, 'http://localhost:3000', fakeFetch as any);
        expect(seenUrl).toBe('http://localhost:3000/api/tasks');
        expect(res.status).toBe(200);
    });

    it('returns a clean 502 (not a crash) when the backend is unreachable', async () => {
        const failFetch = async () => { throw new Error('ECONNREFUSED'); };
        const req = new Request('http://localhost:5173/api/tasks', { method: 'GET' });
        const res = await proxyRequest(req, 'http://localhost:3000', failFetch as any);
        expect(res.status).toBe(502);
        const body = await res.json();
        expect(body.error).toBe('backend_unreachable');
    });

    it('strips the leading-slash trailing edge of the backend origin', async () => {
        let seenUrl = '';
        const fakeFetch = async (url: string) => { seenUrl = url; return new Response('', { status: 204 }); };
        const req = new Request('http://localhost:5173/api/x', { method: 'GET' });
        await proxyRequest(req, 'http://localhost:3000/', fakeFetch as any); // trailing slash on origin
        expect(seenUrl).toBe('http://localhost:3000/api/x'); // no double slash
    });
});
