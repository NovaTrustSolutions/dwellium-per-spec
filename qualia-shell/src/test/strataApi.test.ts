/**
 * strataApi Tests — Regression coverage for the central API wrapper
 *
 * Every module depends on strataApi for data. These tests ensure:
 * - Correct HTTP methods and URL construction
 * - Auth token injection from localStorage
 * - Query param serialization
 * - Error response handling
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// We need to test the module with a mocked fetch.
// strataApi uses global fetch and localStorage.

describe('strataApi', () => {
    let strataGet: typeof import('../components/StrataDashboard/strataApi').strataGet;
    let strataPost: typeof import('../components/StrataDashboard/strataApi').strataPost;
    let strataPut: typeof import('../components/StrataDashboard/strataApi').strataPut;
    let strataDelete: typeof import('../components/StrataDashboard/strataApi').strataDelete;
    let strataUpload: typeof import('../components/StrataDashboard/strataApi').strataUpload;

    beforeEach(async () => {
        // Reset fetch mock
        globalThis.fetch = vi.fn();
        // Re-import to get fresh module
        const mod = await import('../components/StrataDashboard/strataApi');
        strataGet = mod.strataGet;
        strataPost = mod.strataPost;
        strataPut = mod.strataPut;
        strataDelete = mod.strataDelete;
        strataUpload = mod.strataUpload;
    });

    // ── GET ─────────────────────────────────────────────────────────────────

    it('GET calls correct URL and returns parsed JSON', async () => {
        const mockData = { id: '1', name: 'Test Property' };
        (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
            ok: true,
            json: async () => mockData,
        });

        const result = await strataGet('/properties/1');

        expect(globalThis.fetch).toHaveBeenCalledWith('/api/dwellium/properties/1', expect.objectContaining({
            method: 'GET',
        }));
        expect(result).toEqual(mockData);
    });

    it('GET attaches auth token from localStorage', async () => {
        localStorage.setItem('dwellium-auth-token', 'test-jwt-token');
        (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
            ok: true,
            json: async () => ({}),
        });

        await strataGet('/properties');

        const callArgs = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
        expect(callArgs[1].headers['Authorization']).toBe('Bearer test-jwt-token');
    });

    it('GET serializes query params correctly', async () => {
        (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
            ok: true,
            json: async () => ([]),
        });

        await strataGet('/properties', { status: 'active', type: 'residential' });

        const url = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
        expect(url).toContain('status=active');
        expect(url).toContain('type=residential');
    });

    it('GET filters out empty/undefined query params', async () => {
        (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
            ok: true,
            json: async () => ([]),
        });

        await strataGet('/properties', { status: 'active', type: '' });

        const url = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
        expect(url).toContain('status=active');
        expect(url).not.toContain('type=');
    });

    // ── POST ────────────────────────────────────────────────────────────────

    it('POST sends JSON body', async () => {
        const body = { name: 'New Property', address: '123 Main St' };
        (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
            ok: true,
            json: async () => ({ id: '2', ...body }),
        });

        await strataPost('/properties', body);

        const callArgs = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
        expect(callArgs[1].method).toBe('POST');
        expect(callArgs[1].headers['Content-Type']).toBe('application/json');
        expect(JSON.parse(callArgs[1].body)).toEqual(body);
    });

    // ── PUT ─────────────────────────────────────────────────────────────────

    it('PUT sends JSON body', async () => {
        const body = { name: 'Updated Property' };
        (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
            ok: true,
            json: async () => ({ id: '1', ...body }),
        });

        await strataPut('/properties/1', body);

        const callArgs = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
        expect(callArgs[1].method).toBe('PUT');
    });

    // ── DELETE ───────────────────────────────────────────────────────────────

    it('DELETE calls correct method', async () => {
        (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
            ok: true,
            json: async () => ({}),
        });

        await strataDelete('/properties/1');

        const callArgs = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
        expect(callArgs[1].method).toBe('DELETE');
    });

    // ── Error Handling ──────────────────────────────────────────────────────

    it('throws on non-OK response with error message', async () => {
        (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
            ok: false,
            status: 404,
            statusText: 'Not Found',
            json: async () => ({ error: 'Property not found' }),
        });

        await expect(strataGet('/properties/999')).rejects.toThrow('Property not found');
    });

    it('throws with statusText when JSON parse fails', async () => {
        (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
            ok: false,
            status: 500,
            statusText: 'Internal Server Error',
            json: async () => { throw new Error('not json'); },
        });

        await expect(strataGet('/properties/1')).rejects.toThrow('Internal Server Error');
    });

    it('omits auth header when no token in localStorage', async () => {
        (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
            ok: true,
            json: async () => ({}),
        });

        await strataGet('/properties');

        const callArgs = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
        expect(callArgs[1].headers['Authorization']).toBeUndefined();
    });

    // ── X-Qualia-API: v2 header (Task 5.1c — API version bump) ──────────────
    //
    // Per Plan v2 §8 L322: "Bump the API version header X-Qualia-API: v2.
    // Old clients continue to get the v1 shape with new fields omitted.
    // Backward-compat contract." Header is emitted UNCONDITIONALLY on every
    // fetch (no flag-gating; spec-verbatim simplest interpretation).
    // Mirrors Task 3.8 strataUpload<T> shape-contract precedent — header
    // addition is transport-layer, not endpoint-logic; GR-5 spirit preserved.

    it('GET sends X-Qualia-API: v2 header for backward-compat versioning', async () => {
        (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
            ok: true,
            json: async () => ({}),
        });

        await strataGet('/properties');

        const callArgs = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
        expect(callArgs[1].headers['X-Qualia-API']).toBe('v2');
    });

    it('strataUpload sends X-Qualia-API: v2 header for backward-compat versioning', async () => {
        (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
            ok: true,
            json: async () => ({}),
        });

        const formData = new FormData();
        formData.append('file', new Blob(['test-payload'], { type: 'text/plain' }), 'test.txt');
        await strataUpload('/upload', formData);

        const callArgs = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
        expect(callArgs[1].headers['X-Qualia-API']).toBe('v2');
    });
});
