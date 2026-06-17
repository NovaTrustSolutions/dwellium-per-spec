import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { useIngestion } from '../components/Scribe/ingestion/useIngestion';
import {
    ingestionStore,
    ingestionHandles,
    ingestionUserIdHolder,
    pendingHandles,
} from '../components/Scribe/ingestion/ingestionStore';
import { useScribeStore } from '../components/Scribe/scribeStore';
import type {
    FsDirectoryHandle,
    FsFileHandle,
    FsHandle,
    FsWritableStream,
} from '../components/Scribe/ingestion/fsAccess';

function resetScribeStore() {
    useScribeStore.setState({
        openFiles: [],
        activeFilepath: null,
        loading: false,
        error: null,
        editorMode: 'document',
        findReplaceOpen: false,
        focusMode: false,
        redlines: [],
        selectionToolbar: null,
        redlineLoading: false,
        comments: [],
        editingCommentId: null,
        tocVisible: false,
        minimapVisible: true,
    });
}

function fakeFile(name: string, content: string): FsFileHandle {
    return {
        kind: 'file',
        name,
        async getFile(): Promise<File> {
            return {
                size: content.length,
                text: async () => content,
            } as unknown as File;
        },
        async createWritable(): Promise<FsWritableStream> {
            throw new Error('source files are not written');
        },
    };
}

function fakeSource(children: FsHandle[]): FsDirectoryHandle {
    return {
        kind: 'directory',
        name: 'Source',
        async *values() {
            for (const child of children) yield child;
        },
        getFileHandle: async () => { throw new Error('source is read-only'); },
        getDirectoryHandle: async () => { throw new Error('not used'); },
    };
}

function fakeBackup(): FsDirectoryHandle {
    return {
        kind: 'directory',
        name: 'Backup',
        async *values() { /* not enumerated */ },
        async getFileHandle(name: string): Promise<FsFileHandle> {
            return {
                kind: 'file',
                name,
                getFile: async () => { throw new Error('not read'); },
                async createWritable(): Promise<FsWritableStream> {
                    return {
                        async write() { /* no-op */ },
                        async close() { /* no-op */ },
                    };
                },
            };
        },
        getDirectoryHandle: async () => { throw new Error('not used'); },
    };
}

function Harness() {
    const ingestion = useIngestion();
    return (
        <button type="button" onClick={() => void ingestion.convert()}>
            Convert now
        </button>
    );
}

beforeEach(() => {
    localStorage.clear();
    ingestionStore.reset();
    ingestionUserIdHolder.current = null;
    ingestionHandles.source = null;
    ingestionHandles.backup = null;
    pendingHandles.source = null;
    pendingHandles.backup = null;
    resetScribeStore();
});

afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
});

describe('useIngestion', () => {
    it('imports successfully converted markdown documents into Scribe', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => {
            throw new Error('backend offline');
        }));
        ingestionHandles.source = fakeSource([fakeFile('meeting-notes.txt', 'Line one\nLine two')]);
        ingestionHandles.backup = fakeBackup();

        render(<Harness />);
        fireEvent.click(screen.getByRole('button', { name: /Convert now/i }));

        await waitFor(() => {
            expect(useScribeStore.getState().openFiles).toContainEqual(expect.objectContaining({
                filepath: 'Ingested/meeting-notes.md',
                content: 'Line one\nLine two',
            }));
        });
        expect(ingestionStore.getSnapshot().converted).toContainEqual(expect.objectContaining({
            sourceName: 'meeting-notes.txt',
            destName: 'meeting-notes.md',
            status: 'converted',
        }));
    });
});
