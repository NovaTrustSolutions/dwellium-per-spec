/**
 * Vendored from Excalidraw (MIT) — see LICENSE.excalidraw in this directory.
 * Source: excalidraw-app/collab/Portal.tsx @ v0.18.1.
 * Copyright (c) 2020 Excalidraw.
 *
 * Adaptations: `queueFileUpload` (Firebase Storage image sync) stripped —
 * Dwellium does not vendor firebase, so images are NOT synced in a live
 * session (the widget shows one visible notice); `trackEvent` analytics
 * stripped; follow-mode broadcasts (`broadcastVisibleSceneBounds`,
 * `broadcastUserFollowed`) dropped with the feature; lodash.throttle not
 * needed once file upload is gone. Everything that touches the wire —
 * event names, join handshake, encryption envelope, scene diffing by
 * element version — is upstream verbatim.
 */
import type { Socket } from 'socket.io-client';

import type { OrderedExcalidrawElement } from '@excalidraw/excalidraw/element/types';
import type { SocketId } from '@excalidraw/excalidraw/types';
import type { UserIdleState } from '@excalidraw/excalidraw/constants';

import { encryptData } from './encryption';
import { WS_EVENTS, WS_SUBTYPES, isSyncableElement } from './protocol';
import type { SocketUpdateDataIncoming, SocketUpdateDataSource } from './protocol';
import type { CollabSession } from './Collab';

class Portal {
    collab: CollabSession;
    socket: Socket | null = null;
    socketInitialized: boolean = false; // we don't want the socket to emit any updates until it is fully initialized
    roomId: string | null = null;
    roomKey: string | null = null;
    broadcastedElementVersions: Map<string, number> = new Map();

    constructor(collab: CollabSession) {
        this.collab = collab;
    }

    open(socket: Socket, id: string, key: string) {
        this.socket = socket;
        this.roomId = id;
        this.roomKey = key;

        // Initialize socket listeners
        this.socket.on('init-room', () => {
            if (this.socket) {
                this.socket.emit('join-room', this.roomId);
            }
        });
        this.socket.on('new-user', async (_socketId: string) => {
            void this.broadcastScene(
                WS_SUBTYPES.INIT,
                this.collab.getSceneElementsIncludingDeleted(),
                /* syncAll */ true,
            );
        });
        this.socket.on('room-user-change', (clients: SocketId[]) => {
            this.collab.setCollaborators(clients);
        });

        return socket;
    }

    close() {
        if (!this.socket) {
            return;
        }
        this.socket.close();
        this.socket = null;
        this.roomId = null;
        this.roomKey = null;
        this.socketInitialized = false;
        this.broadcastedElementVersions = new Map();
    }

    isOpen() {
        return !!(this.socketInitialized && this.socket && this.roomId && this.roomKey);
    }

    async _broadcastSocketData(data: SocketUpdateDataIncoming, volatile: boolean = false) {
        if (this.isOpen()) {
            const json = JSON.stringify(data);
            const encoded = new TextEncoder().encode(json);
            const { encryptedBuffer, iv } = await encryptData(this.roomKey!, encoded);

            this.socket?.emit(
                volatile ? WS_EVENTS.SERVER_VOLATILE : WS_EVENTS.SERVER,
                this.roomId,
                encryptedBuffer,
                iv,
            );
        }
    }

    broadcastScene = async (
        updateType: WS_SUBTYPES.INIT | WS_SUBTYPES.UPDATE,
        elements: readonly OrderedExcalidrawElement[],
        syncAll: boolean,
    ) => {
        if (updateType === WS_SUBTYPES.INIT && !syncAll) {
            throw new Error('syncAll must be true when sending SCENE.INIT');
        }

        // sync out only the elements we think we need to to save bandwidth.
        // periodically we'll resync the whole thing to make sure no one diverges
        // due to a dropped message (server goes down etc).
        const syncableElements = elements.reduce((acc, element) => {
            if (
                (syncAll ||
                    !this.broadcastedElementVersions.has(element.id) ||
                    element.version > this.broadcastedElementVersions.get(element.id)!) &&
                isSyncableElement(element)
            ) {
                acc.push(element);
            }
            return acc;
        }, [] as OrderedExcalidrawElement[]);

        const data: SocketUpdateDataSource[typeof updateType] = {
            type: updateType,
            payload: {
                elements: syncableElements,
            },
        };

        for (const syncableElement of syncableElements) {
            this.broadcastedElementVersions.set(syncableElement.id, syncableElement.version);
        }

        await this._broadcastSocketData(data);
    };

    broadcastIdleChange = (userState: UserIdleState) => {
        if (this.socket?.id) {
            const data: SocketUpdateDataSource['IDLE_STATUS'] = {
                type: WS_SUBTYPES.IDLE_STATUS,
                payload: {
                    socketId: this.socket.id as SocketId,
                    userState,
                    username: this.collab.getUsername(),
                },
            };
            return this._broadcastSocketData(
                data,
                true, // volatile
            );
        }
    };

    broadcastMouseLocation = (payload: {
        pointer: SocketUpdateDataSource['MOUSE_LOCATION']['payload']['pointer'];
        button: SocketUpdateDataSource['MOUSE_LOCATION']['payload']['button'];
    }) => {
        if (this.socket?.id) {
            const data: SocketUpdateDataSource['MOUSE_LOCATION'] = {
                type: WS_SUBTYPES.MOUSE_LOCATION,
                payload: {
                    socketId: this.socket.id as SocketId,
                    pointer: payload.pointer,
                    button: payload.button || 'up',
                    selectedElementIds: this.collab.excalidrawAPI.getAppState().selectedElementIds,
                    username: this.collab.getUsername(),
                },
            };

            return this._broadcastSocketData(
                data,
                true, // volatile
            );
        }
    };
}

export default Portal;
