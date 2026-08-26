/**
 * Vendored from Excalidraw (MIT) — see LICENSE.excalidraw in this directory.
 * Sources @ v0.18.1: excalidraw-app/app_constants.ts (event names, subtypes,
 * timing constants, ROOM_ID_BYTES), excalidraw-app/data/index.ts (room link
 * helpers, syncable-element filter, socket message shapes) and
 * packages/excalidraw/constants.ts (idle thresholds).
 * Copyright (c) 2020 Excalidraw.
 *
 * Adaptations: Firebase share-link/backend import-export dropped (Dwellium
 * persists scenes via whiteboardStore + One Save); `getCollaborationLinkData`
 * returns null instead of window.alert on a malformed key; i18n strings
 * dropped. The wire constants are kept verbatim — they are the protocol the
 * official `excalidraw/excalidraw-room` server speaks.
 */
import { isInvisiblySmallElement } from '@excalidraw/excalidraw';

import type { OrderedExcalidrawElement } from '@excalidraw/excalidraw/element/types';
import type { AppState, SocketId } from '@excalidraw/excalidraw/types';
import type { UserIdleState } from '@excalidraw/excalidraw/constants';

import { bytesToHexString, generateEncryptionKey } from './encryption';

/* ── wire protocol constants (app_constants.ts @ v0.18.1 — keep verbatim) ── */

export const INITIAL_SCENE_UPDATE_TIMEOUT = 5000;
export const SYNC_FULL_SCENE_INTERVAL_MS = 20000;
export const CURSOR_SYNC_TIMEOUT = 33; // ~30fps
export const DELETED_ELEMENT_TIMEOUT = 24 * 60 * 60 * 1000; // 1 day
export const ROOM_ID_BYTES = 10;

export const WS_EVENTS = {
    SERVER_VOLATILE: 'server-volatile-broadcast',
    SERVER: 'server-broadcast',
    USER_FOLLOW_CHANGE: 'user-follow',
    USER_FOLLOW_ROOM_CHANGE: 'user-follow-room-change',
} as const;

export enum WS_SUBTYPES {
    INVALID_RESPONSE = 'INVALID_RESPONSE',
    INIT = 'SCENE_INIT',
    UPDATE = 'SCENE_UPDATE',
    MOUSE_LOCATION = 'MOUSE_LOCATION',
    IDLE_STATUS = 'IDLE_STATUS',
    USER_VISIBLE_SCENE_BOUNDS = 'USER_VISIBLE_SCENE_BOUNDS',
}

/* packages/excalidraw/constants.ts @ v0.18.1 */
export const IDLE_THRESHOLD = 60_000;
export const ACTIVE_THRESHOLD = 3_000;

/* ── syncable elements (data/index.ts @ v0.18.1) ────────────────────────── */

export const isSyncableElement = (element: OrderedExcalidrawElement): boolean => {
    if (element.isDeleted) {
        return element.updated > Date.now() - DELETED_ELEMENT_TIMEOUT;
    }
    return !isInvisiblySmallElement(element);
};

export const getSyncableElements = (elements: readonly OrderedExcalidrawElement[]) =>
    elements.filter((element) => isSyncableElement(element));

/* ── socket message shapes (data/index.ts @ v0.18.1) ────────────────────── */

export type SocketUpdateDataSource = {
    INVALID_RESPONSE: {
        type: WS_SUBTYPES.INVALID_RESPONSE;
    };
    SCENE_INIT: {
        type: WS_SUBTYPES.INIT;
        payload: {
            elements: readonly OrderedExcalidrawElement[];
        };
    };
    SCENE_UPDATE: {
        type: WS_SUBTYPES.UPDATE;
        payload: {
            elements: readonly OrderedExcalidrawElement[];
        };
    };
    MOUSE_LOCATION: {
        type: WS_SUBTYPES.MOUSE_LOCATION;
        payload: {
            socketId: SocketId;
            pointer: { x: number; y: number; tool: 'pointer' | 'laser' };
            button: 'down' | 'up';
            selectedElementIds: AppState['selectedElementIds'];
            username: string;
        };
    };
    USER_VISIBLE_SCENE_BOUNDS: {
        type: WS_SUBTYPES.USER_VISIBLE_SCENE_BOUNDS;
        payload: {
            socketId: SocketId;
            username: string;
            sceneBounds: readonly [number, number, number, number];
        };
    };
    IDLE_STATUS: {
        type: WS_SUBTYPES.IDLE_STATUS;
        payload: {
            socketId: SocketId;
            userState: UserIdleState;
            username: string;
        };
    };
};

export type SocketUpdateDataIncoming = SocketUpdateDataSource[keyof SocketUpdateDataSource];

/* ── room links (data/index.ts @ v0.18.1) ───────────────────────────────── */

const RE_COLLAB_LINK = /^#room=([a-zA-Z0-9_-]+),([a-zA-Z0-9_-]+)$/;

export const isCollaborationLink = (link: string) => {
    try {
        return RE_COLLAB_LINK.test(new URL(link).hash);
    } catch {
        return false;
    }
};

/** Adaptation: malformed key → null (upstream window.alert()s); caller shows the notice. */
export const getCollaborationLinkData = (link: string): { roomId: string; roomKey: string } | null => {
    let hash: string;
    try {
        hash = new URL(link).hash;
    } catch {
        return null;
    }
    const match = hash.match(RE_COLLAB_LINK);
    if (!match) return null;
    // A 128-bit AES-GCM jwk `k` is exactly 22 base64url chars.
    if (match[2].length !== 22) return null;
    return { roomId: match[1], roomKey: match[2] };
};

const generateRoomId = () => {
    const buffer = new Uint8Array(ROOM_ID_BYTES);
    window.crypto.getRandomValues(buffer);
    return bytesToHexString(buffer);
};

export const generateCollaborationLinkData = async () => {
    const roomId = generateRoomId();
    const roomKey = await generateEncryptionKey();
    return { roomId, roomKey };
};

export const getCollaborationLink = (data: { roomId: string; roomKey: string }) => {
    // The key rides the URL fragment only — it is never sent to any server.
    return `${window.location.origin}${window.location.pathname}#room=${data.roomId},${data.roomKey}`;
};
