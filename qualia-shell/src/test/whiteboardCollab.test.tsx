/**
 * Whiteboard live collaboration — the vendored Excalidraw room client
 * (src/components/Whiteboard/collab/, MIT, monorepo @ v0.18.1).
 *
 * Covers: room link generate/parse round-trip, AES-GCM encrypt/decrypt
 * (real SubtleCrypto — available in this jsdom), portal message
 * serialization + the encrypted socket envelope, version-gated diff
 * broadcasting, reconciliation applying remote elements, a full two-client
 * broadcast→receive cycle over a mocked socket, and the widget UI states
 * (start session / participant count / copy link / leave / join-from-#room=
 * fragment). The excalidraw-room server itself is not run here — the socket
 * mock stands in for it, relaying the exact wire arguments.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';

vi.mock('../lib/oneSaveClient', () => ({
    ONE_SAVE_ENABLED: false,
    oneSaveClient: {
        get: vi.fn().mockResolvedValue(null),
        put: vi.fn().mockResolvedValue(undefined),
        remove: vi.fn().mockResolvedValue(undefined),
        history: vi.fn(),
    },
}));

/* ── socket.io-client mock: io() returns an inspectable fake socket ─────── */
type Handler = (...args: unknown[]) => void;
const socketMocks = vi.hoisted(() => {
    class FakeSocket {
        id = `sock-${Math.random().toString(36).slice(2, 8)}`;
        closed = false;
        emitted: Array<{ event: string; args: unknown[] }> = [];
        private handlers = new Map<string, Set<Handler>>();
        on(event: string, fn: Handler) {
            if (!this.handlers.has(event)) this.handlers.set(event, new Set());
            this.handlers.get(event)!.add(fn);
            return this;
        }
        once(event: string, fn: Handler) {
            const wrapper: Handler = (...args) => { this.off(event, wrapper); fn(...args); };
            return this.on(event, wrapper);
        }
        off(event: string, fn?: Handler) {
            if (!fn) this.handlers.delete(event);
            else this.handlers.get(event)?.delete(fn);
            return this;
        }
        emit(event: string, ...args: unknown[]) {
            this.emitted.push({ event, args });
            return this;
        }
        close() { this.closed = true; }
        /** Test helper: deliver a server→client event. */
        fire(event: string, ...args: unknown[]) {
            [...(this.handlers.get(event) ?? [])].forEach((fn) => fn(...args));
        }
        /** Test helper: emitted frames for one event name. */
        sent(event: string) { return this.emitted.filter((e) => e.event === event); }
    }
    const created: InstanceType<typeof FakeSocket>[] = [];
    const io = vi.fn(() => {
        const s = new FakeSocket();
        created.push(s);
        return s;
    });
    return { FakeSocket, created, io };
});
vi.mock('socket.io-client', () => ({ io: socketMocks.io }));

/* ── Excalidraw package mock (jsdom-safe; collab utils real-ish) ────────── */
const captured = vi.hoisted(() => ({
    props: [] as Array<Record<string, unknown>>,
    api: null as Record<string, ReturnType<typeof vi.fn>> | null,
}));
vi.mock('@excalidraw/excalidraw', async () => {
    const React = await import('react');
    return {
        Excalidraw: (props: Record<string, unknown> & {
            excalidrawAPI?: (api: unknown) => void;
        }) => {
            captured.props.push(props);
            const { excalidrawAPI } = props;
            React.useEffect(() => { excalidrawAPI?.(captured.api); }, [excalidrawAPI]);
            return React.createElement('div', { 'data-testid': 'excalidraw-stub' });
        },
        MIME_TYPES: {
            excalidraw: 'application/vnd.excalidraw+json',
            excalidrawlib: 'application/vnd.excalidrawlib+json',
        },
        languages: [{ code: 'en' }],
        exportToBlob: vi.fn(),
        exportToSvg: vi.fn(),
        serializeAsJSON: vi.fn(),
        loadSceneOrLibraryFromBlob: vi.fn(),
        convertToExcalidrawElements: (skeletons: unknown[]) => skeletons,
        // Vendored-client dependencies — behavior-preserving minimal versions.
        getSceneVersion: (els: Array<{ version?: number }>) =>
            els.reduce((acc, e) => acc + (e.version ?? 0), 0),
        restoreElements: (els: unknown[]) => els,
        reconcileElements: (
            local: Array<{ id: string; version?: number }>,
            remote: Array<{ id: string; version?: number }>,
        ) => {
            const byId = new Map(local.map((e) => [e.id, e]));
            for (const r of remote) {
                const l = byId.get(r.id);
                if (!l || (r.version ?? 0) >= (l.version ?? 0)) byId.set(r.id, r);
            }
            return [...byId.values()];
        },
        isInvisiblySmallElement: () => false,
        CaptureUpdateAction: { IMMEDIATELY: 'IMMEDIATELY', NEVER: 'NEVER', EVENTUALLY: 'EVENTUALLY' },
        UserIdleState: { ACTIVE: 'active', AWAY: 'away', IDLE: 'idle' },
    };
});

import Whiteboard from '../components/Whiteboard/Whiteboard';
import { CollabSession } from '../components/Whiteboard/collab/Collab';
import { decryptData, encryptData, generateEncryptionKey } from '../components/Whiteboard/collab/encryption';
import {
    generateCollaborationLinkData,
    getCollaborationLink,
    getCollaborationLinkData,
    isCollaborationLink,
    WS_SUBTYPES,
} from '../components/Whiteboard/collab/protocol';
import { getWhiteboardDoc, resetWhiteboard, whiteboardNoticeStore } from '../lib/whiteboardStore';
import type { ExcalidrawImperativeAPI } from '@excalidraw/excalidraw/types';
import type { OrderedExcalidrawElement } from '@excalidraw/excalidraw/element/types';

interface FakeElement {
    id: string;
    version: number;
    updated: number;
    isDeleted: boolean;
}
const el = (id: string, version = 1): FakeElement => ({ id, version, updated: Date.now(), isDeleted: false });

function makeFakeApi(initial: FakeElement[] = []) {
    let elements: FakeElement[] = [...initial];
    const api = {
        getSceneElementsIncludingDeleted: vi.fn(() => elements),
        getSceneElements: vi.fn(() => elements.filter((e) => !e.isDeleted)),
        getAppState: vi.fn(() => ({ selectedElementIds: {}, viewBackgroundColor: '#111' })),
        getFiles: vi.fn(() => ({})),
        updateScene: vi.fn((data: { elements?: FakeElement[] }) => {
            if (data.elements) elements = [...data.elements];
        }),
        addFiles: vi.fn(),
        updateLibrary: vi.fn().mockResolvedValue([]),
        setElements: (next: FakeElement[]) => { elements = next; },
    };
    return api;
}
type FakeApi = ReturnType<typeof makeFakeApi>;
const asApi = (api: FakeApi) => api as unknown as ExcalidrawImperativeAPI;
const asElements = (els: FakeElement[]) => els as unknown as readonly OrderedExcalidrawElement[];

const flushAsync = () => act(() => new Promise<void>((r) => setTimeout(r, 0)));

async function decryptFrame(frame: { args: unknown[] }, roomKey: string) {
    const [, buffer, iv] = frame.args as [string, ArrayBuffer, Uint8Array];
    const decrypted = await decryptData(iv, buffer, roomKey);
    return JSON.parse(new TextDecoder().decode(new Uint8Array(decrypted)));
}

/** Start a session on a fake api and walk it to "initialized" (first in room). */
async function startedSession(api: FakeApi, existing: { roomId: string; roomKey: string } | null = null) {
    const errors: string[] = [];
    const session = new CollabSession({
        excalidrawAPI: asApi(api),
        serverUrl: 'wss://room.test',
        username: 'Andy',
        onError: (m) => errors.push(m),
    });
    await session.start(existing);
    const socket = socketMocks.created[socketMocks.created.length - 1];
    return { session, socket, errors };
}

beforeEach(() => {
    localStorage.clear();
    captured.props.length = 0;
    captured.api = makeFakeApi() as unknown as Record<string, ReturnType<typeof vi.fn>>;
    socketMocks.created.length = 0;
    socketMocks.io.mockClear();
    resetWhiteboard();
    Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: { writeText: vi.fn().mockResolvedValue(undefined) },
    });
});
afterEach(() => {
    vi.unstubAllEnvs();
    whiteboardNoticeStore.reset();
    window.history.replaceState({}, '', '/');
});

/* ─────────────────────── room links (#room=<id>,<key>) ─────────────────── */

describe('room link generate/parse round-trip', () => {
    it('generates a 10-byte hex room id and a 22-char AES-128 key, and parses them back', async () => {
        const { roomId, roomKey } = await generateCollaborationLinkData();
        expect(roomId).toMatch(/^[0-9a-f]{20}$/);
        expect(roomKey).toMatch(/^[a-zA-Z0-9_-]{22}$/);
        const link = getCollaborationLink({ roomId, roomKey });
        expect(link).toContain(`#room=${roomId},${roomKey}`);
        expect(isCollaborationLink(link)).toBe(true);
        expect(getCollaborationLinkData(link)).toEqual({ roomId, roomKey });
    });
    it('rejects malformed links (wrong key length, missing fragment, garbage)', () => {
        expect(getCollaborationLinkData('https://x.test/#room=abc,tooshort')).toBeNull();
        expect(getCollaborationLinkData('https://x.test/')).toBeNull();
        expect(getCollaborationLinkData('not a url')).toBeNull();
        expect(isCollaborationLink('https://x.test/#room=abc')).toBe(false);
    });
});

/* ───────────────────────── encryption (AES-GCM) ────────────────────────── */

describe('end-to-end encryption encode/decode', () => {
    it('encrypts with a 12-byte IV and decrypts back to the same payload', async () => {
        const key = await generateEncryptionKey();
        const { encryptedBuffer, iv } = await encryptData(key, JSON.stringify({ type: 'SCENE_UPDATE' }));
        expect(iv).toHaveLength(12);
        expect(encryptedBuffer.byteLength).toBeGreaterThan(0);
        const decrypted = await decryptData(iv, encryptedBuffer, key);
        expect(JSON.parse(new TextDecoder().decode(new Uint8Array(decrypted)))).toEqual({ type: 'SCENE_UPDATE' });
    });
    it('rejects decryption with the wrong key (AES-GCM integrity)', async () => {
        const key = await generateEncryptionKey();
        const wrongKey = await generateEncryptionKey();
        const { encryptedBuffer, iv } = await encryptData(key, 'secret');
        await expect(decryptData(iv, encryptedBuffer, wrongKey)).rejects.toBeDefined();
    });
});

/* ───────────── portal: handshake + serialized encrypted frames ─────────── */

describe('portal message serialization over the socket', () => {
    it('join handshake: init-room → join-room with the room id', async () => {
        const api = makeFakeApi();
        const { session, socket } = await startedSession(api);
        socket.fire('init-room');
        expect(socket.sent('join-room')).toHaveLength(1);
        expect(socket.sent('join-room')[0].args[0]).toBe(session.portal.roomId);
        session.stop();
    });
    it('broadcasts a version-gated SCENE_UPDATE as an encrypted server-broadcast frame', async () => {
        const api = makeFakeApi([el('a', 1)]);
        const { session, socket } = await startedSession(api);
        socket.fire('first-in-room'); // room initialized (we are alone)

        session.syncElements(asElements(api.getSceneElementsIncludingDeleted()));
        await waitFor(() => expect(socket.sent('server-broadcast').length).toBeGreaterThanOrEqual(1));
        const frames = socket.sent('server-broadcast');
        expect(frames[0].args[0]).toBe(session.portal.roomId);
        const payload = await decryptFrame(frames[0], session.portal.roomKey!);
        expect(payload.type).toBe(WS_SUBTYPES.UPDATE);
        expect(payload.payload.elements.map((e: FakeElement) => e.id)).toEqual(['a']);

        // Same scene version again → the gate blocks a re-broadcast.
        const before = socket.sent('server-broadcast').length;
        session.syncElements(asElements(api.getSceneElementsIncludingDeleted()));
        await act(() => new Promise<void>((r) => setTimeout(r, 50))); // real window for a would-be re-broadcast
        expect(socket.sent('server-broadcast')).toHaveLength(before);
        session.stop();
    });
    it('a joining peer triggers a full SCENE_INIT sync (new-user → INIT, syncAll)', async () => {
        const api = makeFakeApi([el('a', 3)]);
        const { session, socket } = await startedSession(api);
        socket.fire('first-in-room');
        socket.fire('new-user', 'sock-remote');
        await waitFor(() => expect(socket.sent('server-broadcast').length).toBeGreaterThanOrEqual(1));
        const frames = socket.sent('server-broadcast');
        const payload = await decryptFrame(frames[frames.length - 1], session.portal.roomKey!);
        expect(payload.type).toBe(WS_SUBTYPES.INIT);
        expect(payload.payload.elements.map((e: FakeElement) => e.id)).toEqual(['a']);
        session.stop();
    });
});

/* ─────────────── reconciliation + full broadcast→receive cycle ─────────── */

describe('reconciliation and the two-client broadcast→receive cycle', () => {
    it('applies remote elements via reconcile + updateScene(captureUpdate: NEVER), never re-broadcasts them', async () => {
        // Client A creates the room with one element.
        const apiA = makeFakeApi([el('e1', 2)]);
        const { session: a, socket: sockA } = await startedSession(apiA);
        sockA.fire('init-room');
        sockA.fire('first-in-room');
        const roomData = getCollaborationLinkData(a.getSnapshot().roomLink)!;
        expect(roomData).toBeTruthy();

        // Client B joins the same room via the link data.
        const apiB = makeFakeApi();
        const { session: b, socket: sockB } = await startedSession(apiB, roomData);
        sockB.fire('init-room');

        // Server tells A someone joined → A broadcasts SCENE_INIT.
        sockA.fire('new-user', sockB.id);
        await waitFor(() => expect(sockA.sent('server-broadcast').length).toBeGreaterThanOrEqual(1));
        const initFrame = sockA.sent('server-broadcast').pop()!;

        // Relay the encrypted frame to B (exactly what excalidraw-room does).
        sockB.fire('client-broadcast', initFrame.args[1], initFrame.args[2]);
        // WebCrypto decrypt completes off-thread in Node — a single
        // setTimeout(0) hop loses the race on slow CI runners (failed in CI
        // 2026-08-26 while green locally). Poll with real timers instead.
        await waitFor(() => expect(apiB.updateScene).toHaveBeenCalled());
        const applied = apiB.updateScene.mock.calls.find((c) => (c[0] as { elements?: unknown[] }).elements);
        expect(applied).toBeTruthy();
        expect((applied![0] as { elements: FakeElement[] }).elements.map((e) => e.id)).toContain('e1');
        expect((applied![0] as { captureUpdate?: string }).captureUpdate).toBe('NEVER');

        // Received scene is version-bookmarked → B does NOT echo it back.
        b.syncElements(asElements(apiB.getSceneElementsIncludingDeleted()));
        await act(() => new Promise<void>((r) => setTimeout(r, 50))); // real window for a would-be echo
        expect(sockB.sent('server-broadcast')).toHaveLength(0);

        // B draws a new element → broadcast → relay to A → A's scene gains it.
        apiB.setElements([...apiB.getSceneElementsIncludingDeleted(), el('e2', 1)]);
        b.syncElements(asElements(apiB.getSceneElementsIncludingDeleted()));
        await waitFor(() => expect(sockB.sent('server-broadcast')[0]).toBeTruthy());
        const updateFrame = sockB.sent('server-broadcast')[0];
        sockA.fire('client-broadcast', updateFrame.args[1], updateFrame.args[2]);
        await waitFor(() => expect(apiA.getSceneElementsIncludingDeleted().map((e) => e.id).sort()).toEqual(['e1', 'e2']));

        a.stop();
        b.stop();
        expect(sockA.closed).toBe(true);
        expect(sockB.closed).toBe(true);
    });
    it('presence: room-user-change updates the collaborator map and count', async () => {
        const api = makeFakeApi();
        const { session, socket } = await startedSession(api);
        socket.fire('first-in-room');
        socket.fire('room-user-change', [socket.id, 'sock-peer']);
        expect(session.getSnapshot().collaboratorCount).toBe(2);
        const call = api.updateScene.mock.calls.find((c) => (c[0] as { collaborators?: Map<string, unknown> }).collaborators);
        expect(call).toBeTruthy();
        const collaborators = (call![0] as { collaborators: Map<string, { isCurrentUser?: boolean }> }).collaborators;
        expect(collaborators.get(socket.id)?.isCurrentUser).toBe(true);
        expect(collaborators.has('sock-peer')).toBe(true);
        session.stop();
    });
});

/* ───────────────────────────── widget UI states ────────────────────────── */

describe('widget UI: start / in-session / leave / join-from-fragment', () => {
    it('Start session creates a room, copies the link, shows count + Copy link + Leave; Leave persists and tears down', async () => {
        vi.stubEnv('VITE_EXCALIDRAW_COLLAB_URL', 'wss://room.dwellium.example');
        render(<Whiteboard />);
        fireEvent.click(screen.getByText('Live collab'));
        await act(async () => {
            fireEvent.click(screen.getByText('Start session'));
        });
        await waitFor(() => expect(screen.getByText('Leave')).toBeDefined());

        // io() dialed the configured server; the link landed on the clipboard + URL.
        expect(socketMocks.io).toHaveBeenCalledWith('wss://room.dwellium.example', expect.anything());
        const writeText = navigator.clipboard.writeText as ReturnType<typeof vi.fn>;
        await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
        const link = writeText.mock.calls[0][0] as string;
        expect(getCollaborationLinkData(link)).toBeTruthy();
        expect(window.location.hash).toMatch(/^#room=/);
        expect(screen.getByText(/1 participant/)).toBeDefined();
        expect(screen.getByText('Copy link')).toBeDefined();

        // A peer joins → participant count updates in the toolbar + panel.
        const socket = socketMocks.created[socketMocks.created.length - 1];
        act(() => { socket.fire('room-user-change', [socket.id, 'sock-peer']); });
        expect(screen.getByText(/2 participants/)).toBeDefined();
        expect(screen.getByText(/Live collab \(2\)/)).toBeDefined();
        // The one honest limitation is stated in the panel.
        expect(screen.getByRole('note').textContent).toContain('Images are not synced live');

        // Leave: persists the current scene to the board and closes the socket.
        (captured.api as unknown as FakeApi).setElements([el('kept', 1)]);
        await act(async () => {
            fireEvent.click(screen.getByText('Leave'));
        });
        expect(socket.closed).toBe(true);
        expect(window.location.hash).toBe('');
        await waitFor(() => {
            const scene = getWhiteboardDoc().boards.default.scene;
            expect((scene.elements as FakeElement[]).map((e) => e.id)).toEqual(['kept']);
        });
        expect(screen.getByText('Start session')).toBeDefined();
    });
    it('opening the whiteboard with a #room= fragment auto-joins the session', async () => {
        vi.stubEnv('VITE_EXCALIDRAW_COLLAB_URL', 'wss://room.dwellium.example');
        const roomId = 'ab12cd34ef56ab78cd90';
        const roomKey = 'k'.repeat(22);
        window.history.replaceState({}, '', `/#room=${roomId},${roomKey}`);
        render(<Whiteboard />);
        await waitFor(() => expect(screen.getByText('Leave')).toBeDefined());
        expect(socketMocks.io).toHaveBeenCalledTimes(1);
        // Joined the EXISTING room (no new room generated, no clipboard write).
        const socket = socketMocks.created[0];
        socket.fire('init-room');
        expect(socket.sent('join-room')[0].args[0]).toBe(roomId);
        expect(navigator.clipboard.writeText).not.toHaveBeenCalled();
    });
    it('an invalid pasted link is refused with a visible notice, not a dead session', async () => {
        vi.stubEnv('VITE_EXCALIDRAW_COLLAB_URL', 'wss://room.dwellium.example');
        render(<Whiteboard />);
        fireEvent.click(screen.getByText('Live collab'));
        fireEvent.change(screen.getByLabelText('Join with link'), { target: { value: 'https://x.test/#room=bad,short' } });
        await act(async () => {
            fireEvent.click(screen.getByText('Join'));
        });
        expect(socketMocks.io).not.toHaveBeenCalled();
        expect(screen.getByRole('status').textContent).toContain('not a valid room link');
    });
});
