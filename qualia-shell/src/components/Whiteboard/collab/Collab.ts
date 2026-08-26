/**
 * Vendored from Excalidraw (MIT) — see LICENSE.excalidraw in this directory.
 * Source: excalidraw-app/collab/Collab.tsx @ v0.18.1.
 * Copyright (c) 2020 Excalidraw.
 *
 * Adaptations for Dwellium:
 * - React PureComponent + jotai shell → a framework-free `CollabSession`
 *   class with a tiny subscribe/getSnapshot surface (the Whiteboard widget
 *   renders the UI; upstream rendered an ErrorDialog itself).
 * - ALL Firebase persistence stripped (loadFromFirebase / saveToFirebase /
 *   FileManager): scene persistence stays Dwellium's whiteboardStore +
 *   One Save; consequently image files are NOT synced in a live session —
 *   the widget shows one visible notice instead of silently broken images.
 * - Username comes from the Dwellium account (no @excalidraw/random-username).
 * - Follow-mode (viewport broadcasting / zoomToFitBounds on
 *   USER_VISIBLE_SCENE_BOUNDS) not wired — incoming messages of that subtype
 *   are ignored.
 * - lodash.throttle → local throttle (same leading+trailing semantics for
 *   the two call sites that remain).
 *
 * Kept upstream-verbatim: the reconciliation flow (restoreElements →
 * reconcileElements → version bookkeeping so received scenes are never
 * re-broadcast), scene version gating in `syncElements`, the 20 s full-scene
 * resync, the AES-GCM payload decrypt, idle/active/away detection and the
 * join/init handshake against the official excalidraw-room server.
 */
import { io } from 'socket.io-client';

import {
    CaptureUpdateAction,
    getSceneVersion,
    reconcileElements,
    restoreElements,
    UserIdleState,
} from '@excalidraw/excalidraw';

import type {
    Collaborator,
    ExcalidrawImperativeAPI,
    Gesture,
    SocketId,
} from '@excalidraw/excalidraw/types';
import type {
    ExcalidrawElement,
    OrderedExcalidrawElement,
} from '@excalidraw/excalidraw/element/types';
import type {
    ReconciledExcalidrawElement,
    RemoteExcalidrawElement,
} from '@excalidraw/excalidraw/data/reconcile';

import Portal from './Portal';
import { decryptData } from './encryption';
import {
    ACTIVE_THRESHOLD,
    CURSOR_SYNC_TIMEOUT,
    IDLE_THRESHOLD,
    INITIAL_SCENE_UPDATE_TIMEOUT,
    SYNC_FULL_SCENE_INTERVAL_MS,
    WS_SUBTYPES,
    generateCollaborationLinkData,
    getCollaborationLink,
} from './protocol';
import type { SocketUpdateDataIncoming, SocketUpdateDataSource } from './protocol';

/** ponytail: minimal leading+trailing throttle — replaces lodash.throttle for
 * the two remaining call sites (cursor 33 ms, full resync 20 s). */
function throttle<T extends unknown[]>(fn: (...args: T) => void, wait: number) {
    let last = 0;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let lastArgs: T | null = null;
    const invoke = () => {
        last = Date.now();
        timer = null;
        const args = lastArgs!;
        lastArgs = null;
        fn(...args);
    };
    const throttled = (...args: T) => {
        lastArgs = args;
        const remaining = wait - (Date.now() - last);
        if (remaining <= 0) {
            if (timer !== null) { clearTimeout(timer); timer = null; }
            invoke();
        } else if (timer === null) {
            timer = setTimeout(invoke, remaining);
        }
    };
    throttled.cancel = () => {
        if (timer !== null) { clearTimeout(timer); timer = null; }
        lastArgs = null;
    };
    return throttled;
}

export interface CollabSessionSnapshot {
    /** Sharable `#room=<id>,<key>` link (key stays in the fragment). */
    roomLink: string;
    /** Participants currently in the room, including this client. */
    collaboratorCount: number;
}

export interface CollabSessionOptions {
    excalidrawAPI: ExcalidrawImperativeAPI;
    /** ws/https origin of the excalidraw-room server (VITE_EXCALIDRAW_COLLAB_URL). */
    serverUrl: string;
    /** Presence name — the Dwellium account name. */
    username: string;
    /** Non-fatal problems (decrypt failure, server unreachable) — one visible notice. */
    onError: (message: string) => void;
}

export class CollabSession {
    portal: Portal;
    excalidrawAPI: ExcalidrawImperativeAPI;

    private serverUrl: string;
    private username: string;
    private onError: (message: string) => void;

    private collaborators = new Map<SocketId, Collaborator>();
    private lastBroadcastedOrReceivedSceneVersion: number = -1;
    private socketInitializationTimer: ReturnType<typeof setTimeout> | null = null;
    private idleTimeoutId: ReturnType<typeof setTimeout> | null = null;
    private activeIntervalId: ReturnType<typeof setInterval> | null = null;
    private applyingRemote = false;
    private stopped = false;

    private snapshot: CollabSessionSnapshot;
    private listeners = new Set<() => void>();

    constructor(opts: CollabSessionOptions) {
        this.excalidrawAPI = opts.excalidrawAPI;
        this.serverUrl = opts.serverUrl;
        this.username = opts.username;
        this.onError = opts.onError;
        this.portal = new Portal(this);
        this.snapshot = { roomLink: '', collaboratorCount: 1 };
    }

    /* ── tiny store surface for the widget (replaces upstream jotai atoms) ── */

    subscribe = (listener: () => void): (() => void) => {
        this.listeners.add(listener);
        return () => { this.listeners.delete(listener); };
    };

    getSnapshot = (): CollabSessionSnapshot => this.snapshot;

    private notify(partial: Partial<CollabSessionSnapshot>) {
        this.snapshot = { ...this.snapshot, ...partial };
        this.listeners.forEach((l) => l());
    }

    getUsername = () => this.username;

    /** True while a remote scene update is being applied (widget skips echo-persist). */
    isApplyingRemote = () => this.applyingRemote;

    /* ── lifecycle ─────────────────────────────────────────────────────── */

    /**
     * Connect to the room server and join (existing link data) or create
     * (null) a room. Upstream: startCollaboration().
     */
    async start(existingRoomLinkData: { roomId: string; roomKey: string } | null): Promise<void> {
        if (this.portal.socket) return;

        let roomId: string;
        let roomKey: string;
        if (existingRoomLinkData) {
            ({ roomId, roomKey } = existingRoomLinkData);
        } else {
            ({ roomId, roomKey } = await generateCollaborationLinkData());
        }
        const roomLink = getCollaborationLink({ roomId, roomKey });

        const socket = io(this.serverUrl, {
            transports: ['websocket', 'polling'],
        });
        this.portal.open(socket, roomId, roomKey);

        // Upstream falls back to a Firebase scene fetch when the socket cannot
        // connect; Dwellium's scene is already local, so the fallback is just
        // "consider the room initialized so broadcasts flow after reconnect".
        const fallbackInitializationHandler = () => {
            this.initializeRoom();
            this.onError('Could not reach the room server yet — retrying in the background.');
        };
        socket.once('connect_error', fallbackInitializationHandler);

        // fallback in case you're not alone in the room but still don't
        // receive the initial SCENE_INIT message
        this.socketInitializationTimer = setTimeout(
            () => this.initializeRoom(),
            INITIAL_SCENE_UPDATE_TIMEOUT,
        );

        socket.on('client-broadcast', async (encryptedData: ArrayBuffer, iv: Uint8Array) => {
            if (!this.portal.roomKey) return;

            const decryptedData = await this.decryptPayload(iv, encryptedData, this.portal.roomKey);

            switch (decryptedData.type) {
                case WS_SUBTYPES.INVALID_RESPONSE:
                    return;
                case WS_SUBTYPES.INIT: {
                    if (!this.portal.socketInitialized) {
                        this.initializeRoom();
                        const remoteElements = decryptedData.payload.elements;
                        this.handleRemoteSceneUpdate(this._reconcileElements(remoteElements));
                    }
                    break;
                }
                case WS_SUBTYPES.UPDATE:
                    this.handleRemoteSceneUpdate(
                        this._reconcileElements(decryptedData.payload.elements),
                    );
                    break;
                case WS_SUBTYPES.MOUSE_LOCATION: {
                    const { pointer, button, username, selectedElementIds, socketId } =
                        decryptedData.payload;
                    this.updateCollaborator(socketId, {
                        pointer,
                        button,
                        selectedElementIds,
                        username,
                    });
                    break;
                }
                case WS_SUBTYPES.IDLE_STATUS: {
                    const { userState, socketId, username } = decryptedData.payload;
                    this.updateCollaborator(socketId, { userState, username });
                    break;
                }
                case WS_SUBTYPES.USER_VISIBLE_SCENE_BOUNDS:
                    // Follow-mode is not wired in Dwellium (adaptation) — ignore.
                    break;
                default:
                    break;
            }
        });

        socket.on('first-in-room', () => {
            socket.off('first-in-room');
            // Upstream fetches the scene from Firebase here; Dwellium's board
            // already holds the local scene — the room simply starts from it.
            this.initializeRoom();
        });

        this.initializeIdleDetector();
        this.notify({ roomLink });
    }

    /** Upstream: initializeRoom() minus the Firebase fetch. */
    private initializeRoom() {
        if (this.socketInitializationTimer !== null) {
            clearTimeout(this.socketInitializationTimer);
            this.socketInitializationTimer = null;
        }
        this.portal.socketInitialized = true;
    }

    /** Leave the room and tear everything down. Upstream: stopCollaboration + destroySocketClient. */
    stop() {
        if (this.stopped) return;
        this.stopped = true;
        this.queueBroadcastAllElements.cancel();
        this.onPointerUpdate.cancel();
        if (this.socketInitializationTimer !== null) {
            clearTimeout(this.socketInitializationTimer);
            this.socketInitializationTimer = null;
        }
        this.destroyIdleDetector();
        this.lastBroadcastedOrReceivedSceneVersion = -1;
        this.portal.close();
        this.collaborators = new Map();
        this.excalidrawAPI.updateScene({ collaborators: this.collaborators });
        this.notify({ collaboratorCount: 1 });
    }

    /* ── scene sync (upstream-verbatim mechanics) ──────────────────────── */

    getSceneElementsIncludingDeleted = () =>
        this.excalidrawAPI.getSceneElementsIncludingDeleted();

    public setLastBroadcastedOrReceivedSceneVersion = (version: number) => {
        this.lastBroadcastedOrReceivedSceneVersion = version;
    };

    public getLastBroadcastedOrReceivedSceneVersion = () =>
        this.lastBroadcastedOrReceivedSceneVersion;

    /** Called from the widget's onChange. Upstream: syncElements (minus the Firebase queue). */
    syncElements = (elements: readonly OrderedExcalidrawElement[]) => {
        this.broadcastElements(elements);
    };

    broadcastElements = (elements: readonly OrderedExcalidrawElement[]) => {
        if (getSceneVersion(elements) > this.getLastBroadcastedOrReceivedSceneVersion()) {
            void this.portal.broadcastScene(WS_SUBTYPES.UPDATE, elements, false);
            this.lastBroadcastedOrReceivedSceneVersion = getSceneVersion(elements);
            this.queueBroadcastAllElements();
        }
    };

    queueBroadcastAllElements = throttle(() => {
        void this.portal.broadcastScene(
            WS_SUBTYPES.UPDATE,
            this.excalidrawAPI.getSceneElementsIncludingDeleted(),
            true,
        );
        const currentVersion = this.getLastBroadcastedOrReceivedSceneVersion();
        const newVersion = Math.max(
            currentVersion,
            getSceneVersion(this.getSceneElementsIncludingDeleted()),
        );
        this.setLastBroadcastedOrReceivedSceneVersion(newVersion);
    }, SYNC_FULL_SCENE_INTERVAL_MS);

    _reconcileElements = (
        remoteElements: readonly ExcalidrawElement[],
    ): ReconciledExcalidrawElement[] => {
        const localElements = this.getSceneElementsIncludingDeleted();
        const appState = this.excalidrawAPI.getAppState();
        const restoredRemoteElements = restoreElements(remoteElements, null);
        const reconciledElements = reconcileElements(
            localElements,
            restoredRemoteElements as RemoteExcalidrawElement[],
            appState,
        );

        // Avoid broadcasting to the rest of the collaborators the scene
        // we just received!
        // Note: this needs to be set before updating the scene as it
        // synchronously calls render.
        this.setLastBroadcastedOrReceivedSceneVersion(getSceneVersion(reconciledElements));

        return reconciledElements;
    };

    handleRemoteSceneUpdate = (elements: ReconciledExcalidrawElement[]) => {
        // Best-effort echo guard for the widget's persist path; the version
        // bookkeeping above is what actually prevents re-broadcasting.
        this.applyingRemote = true;
        try {
            this.excalidrawAPI.updateScene({
                elements,
                captureUpdate: CaptureUpdateAction.NEVER,
            });
        } finally {
            this.applyingRemote = false;
        }
    };

    private decryptPayload = async (
        iv: Uint8Array,
        encryptedData: ArrayBuffer,
        decryptionKey: string,
    ): Promise<SocketUpdateDataIncoming> => {
        try {
            const decrypted = await decryptData(iv, encryptedData, decryptionKey);
            const decodedData = new TextDecoder('utf-8').decode(new Uint8Array(decrypted));
            return JSON.parse(decodedData) as SocketUpdateDataIncoming;
        } catch (error) {
            console.error(error);
            this.onError('Could not decrypt a collaboration update — wrong room key?');
            return { type: WS_SUBTYPES.INVALID_RESPONSE };
        }
    };

    /* ── presence (collaborator cursors, names, idle states) ───────────── */

    setCollaborators(sockets: SocketId[]) {
        const collaborators = new Map<SocketId, Collaborator>();
        for (const socketId of sockets) {
            collaborators.set(
                socketId,
                Object.assign({}, this.collaborators.get(socketId), {
                    isCurrentUser: socketId === this.portal.socket?.id,
                }),
            );
        }
        this.collaborators = collaborators;
        this.excalidrawAPI.updateScene({ collaborators });
        this.notify({ collaboratorCount: Math.max(1, collaborators.size) });
    }

    updateCollaborator = (socketId: SocketId, updates: Partial<Collaborator>) => {
        const collaborators = new Map(this.collaborators);
        const user = Object.assign({}, collaborators.get(socketId), updates, {
            isCurrentUser: socketId === this.portal.socket?.id,
        });
        collaborators.set(socketId, user);
        this.collaborators = collaborators;
        this.excalidrawAPI.updateScene({ collaborators });
        this.notify({ collaboratorCount: Math.max(1, collaborators.size) });
    };

    /** Wire to the Excalidraw `onPointerUpdate` prop. Upstream-verbatim gating. */
    onPointerUpdate = throttle(
        (payload: {
            pointer: SocketUpdateDataSource['MOUSE_LOCATION']['payload']['pointer'];
            button: SocketUpdateDataSource['MOUSE_LOCATION']['payload']['button'];
            pointersMap: Gesture['pointers'];
        }) => {
            if (payload.pointersMap.size < 2 && this.portal.socket) {
                void this.portal.broadcastMouseLocation(payload);
            }
        },
        CURSOR_SYNC_TIMEOUT,
    );

    /* ── idle detection (upstream-verbatim thresholds and transitions) ─── */

    private onPointerMove = () => {
        if (this.idleTimeoutId) {
            clearTimeout(this.idleTimeoutId);
            this.idleTimeoutId = null;
        }
        this.idleTimeoutId = setTimeout(this.reportIdle, IDLE_THRESHOLD);
        if (!this.activeIntervalId) {
            this.activeIntervalId = setInterval(this.reportActive, ACTIVE_THRESHOLD);
        }
    };

    private onVisibilityChange = () => {
        if (document.hidden) {
            if (this.idleTimeoutId) {
                clearTimeout(this.idleTimeoutId);
                this.idleTimeoutId = null;
            }
            if (this.activeIntervalId) {
                clearInterval(this.activeIntervalId);
                this.activeIntervalId = null;
            }
            this.onIdleStateChange(UserIdleState.AWAY);
        } else {
            this.idleTimeoutId = setTimeout(this.reportIdle, IDLE_THRESHOLD);
            this.activeIntervalId = setInterval(this.reportActive, ACTIVE_THRESHOLD);
            this.onIdleStateChange(UserIdleState.ACTIVE);
        }
    };

    private reportIdle = () => {
        this.onIdleStateChange(UserIdleState.IDLE);
        if (this.activeIntervalId) {
            clearInterval(this.activeIntervalId);
            this.activeIntervalId = null;
        }
    };

    private reportActive = () => {
        this.onIdleStateChange(UserIdleState.ACTIVE);
    };

    private initializeIdleDetector = () => {
        document.addEventListener('pointermove', this.onPointerMove);
        document.addEventListener('visibilitychange', this.onVisibilityChange);
    };

    private destroyIdleDetector = () => {
        document.removeEventListener('pointermove', this.onPointerMove);
        document.removeEventListener('visibilitychange', this.onVisibilityChange);
        if (this.idleTimeoutId) {
            clearTimeout(this.idleTimeoutId);
            this.idleTimeoutId = null;
        }
        if (this.activeIntervalId) {
            clearInterval(this.activeIntervalId);
            this.activeIntervalId = null;
        }
    };

    onIdleStateChange = (userState: UserIdleState) => {
        void this.portal.broadcastIdleChange(userState);
    };
}
