/**
 * Cycle 4 — Scribe IngestionPanel folder-picker UI tests.
 *
 * Exercises the File System Access API picker path behind a MOCKED
 * `window.showDirectoryPicker` (the real API is unavailable in jsdom). Covers:
 *   - unsupported-browser banner when the API is absent
 *   - source + backup folder picking → names render, store updates
 *   - user-cancel (picker resolves null) is a silent no-op
 *   - Convert button gating: disabled until both folders + onConvert present,
 *     then click fires onConvert
 *
 * Real clock only (no fake timers — Phase-7 Finding (B) convention). The
 * factory-produced ingestionStore + in-memory handle refs are reset in
 * beforeEach (v2.72.1 standing convention).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import IngestionPanel from '../components/Scribe/ingestion/IngestionPanel';
import { ingestionStore, ingestionHandles, ingestionUserIdHolder } from '../components/Scribe/ingestion/ingestionStore';

type WinWithPicker = Window & { showDirectoryPicker?: (opts?: unknown) => Promise<unknown> };

function fakeDirHandle(name: string) {
    return {
        kind: 'directory' as const,
        name,
        // eslint-disable-next-line require-yield
        async *values() { /* empty dir for Cycle 4 — enumeration lands in Cycle 5 */ },
        getFileHandle: vi.fn(),
        getDirectoryHandle: vi.fn(),
    };
}

beforeEach(() => {
    localStorage.clear();
    ingestionStore.reset();
    ingestionUserIdHolder.current = null;
    ingestionHandles.source = null;
    ingestionHandles.backup = null;
});

afterEach(() => {
    cleanup();
    delete (window as WinWithPicker).showDirectoryPicker;
});

describe('IngestionPanel — unsupported browser', () => {
    it('shows a fallback banner and no pickers when showDirectoryPicker is absent', () => {
        // No window.showDirectoryPicker defined → unsupported.
        render(<IngestionPanel />);
        expect(screen.getByText(/needs the File System Access API/i)).toBeInTheDocument();
        expect(screen.queryByText(/Choose source folder/i)).not.toBeInTheDocument();
    });
});

describe('IngestionPanel — supported browser', () => {
    beforeEach(() => {
        (window as WinWithPicker).showDirectoryPicker = vi.fn();
    });

    it('renders both pickers and the gating caption', () => {
        render(<IngestionPanel />);
        expect(screen.getByText(/Choose source folder/i)).toBeInTheDocument();
        expect(screen.getByText(/Choose backup destination/i)).toBeInTheDocument();
        expect(screen.getByText(/Choose both folders to enable conversion/i)).toBeInTheDocument();
        expect(screen.getByTestId('ingest-source-name')).toHaveTextContent('No source folder chosen');
    });

    it('picks a source folder and renders its name', async () => {
        (window as WinWithPicker).showDirectoryPicker = vi.fn().mockResolvedValue(fakeDirHandle('MySource'));
        render(<IngestionPanel />);
        fireEvent.click(screen.getByText(/Choose source folder/i));
        await waitFor(() => {
            expect(screen.getByTestId('ingest-source-name')).toHaveTextContent('MySource');
        });
        expect(ingestionHandles.source).not.toBeNull();
        expect(ingestionStore.getSnapshot().sourceFolderName).toBe('MySource');
    });

    it('picks a backup folder and renders its name', async () => {
        (window as WinWithPicker).showDirectoryPicker = vi.fn().mockResolvedValue(fakeDirHandle('Backups'));
        render(<IngestionPanel />);
        fireEvent.click(screen.getByText(/Choose backup destination/i));
        await waitFor(() => {
            expect(screen.getByTestId('ingest-backup-name')).toHaveTextContent('Backups');
        });
        expect(ingestionHandles.backup).not.toBeNull();
    });

    it('treats a cancelled picker (null) as a silent no-op', async () => {
        (window as WinWithPicker).showDirectoryPicker = vi.fn().mockRejectedValue(
            Object.assign(new Error('cancelled'), { name: 'AbortError' }),
        );
        render(<IngestionPanel />);
        fireEvent.click(screen.getByText(/Choose source folder/i));
        await waitFor(() => {
            // No name set, no error surfaced.
            expect(screen.getByTestId('ingest-source-name')).toHaveTextContent('No source folder chosen');
        });
        expect(ingestionHandles.source).toBeNull();
    });

    it('Convert button stays disabled without onConvert and fires it when wired + both folders picked', async () => {
        const onConvert = vi.fn();
        (window as WinWithPicker).showDirectoryPicker = vi.fn()
            .mockResolvedValueOnce(fakeDirHandle('Src'))
            .mockResolvedValueOnce(fakeDirHandle('Dst'));
        const { rerender } = render(<IngestionPanel onConvert={onConvert} />);

        const convertBtn = () => screen.getByRole('button', { name: /Convert now/i });
        expect(convertBtn()).toBeDisabled(); // no folders yet

        fireEvent.click(screen.getByText(/Choose source folder/i));
        await waitFor(() => expect(screen.getByTestId('ingest-source-name')).toHaveTextContent('Src'));
        fireEvent.click(screen.getByText(/Choose backup destination/i));
        await waitFor(() => expect(screen.getByTestId('ingest-backup-name')).toHaveTextContent('Dst'));

        rerender(<IngestionPanel onConvert={onConvert} />);
        await waitFor(() => expect(convertBtn()).toBeEnabled());
        fireEvent.click(convertBtn());
        expect(onConvert).toHaveBeenCalledTimes(1);
    });

    it('a11y (Cycle 10): sync-status is a polite live region and a picker error is an assertive alert', async () => {
        // Status line announces politely.
        render(<IngestionPanel />);
        const status = screen.getByTestId('ingest-status');
        expect(status).toHaveAttribute('role', 'status');
        expect(status).toHaveTextContent('No conversions yet.');

        // A failed (non-abort) picker surfaces in a role="alert" region.
        (window as WinWithPicker).showDirectoryPicker = vi.fn().mockRejectedValue(
            new Error('disk on fire'),
        );
        fireEvent.click(screen.getByText(/Choose source folder/i));
        const alert = await screen.findByRole('alert');
        expect(alert).toHaveTextContent('disk on fire');
    });

    it('disables Convert when no onConvert is provided even with both folders', async () => {
        (window as WinWithPicker).showDirectoryPicker = vi.fn()
            .mockResolvedValueOnce(fakeDirHandle('Src'))
            .mockResolvedValueOnce(fakeDirHandle('Dst'));
        render(<IngestionPanel />);
        fireEvent.click(screen.getByText(/Choose source folder/i));
        await waitFor(() => expect(screen.getByTestId('ingest-source-name')).toHaveTextContent('Src'));
        fireEvent.click(screen.getByText(/Choose backup destination/i));
        await waitFor(() => expect(screen.getByTestId('ingest-backup-name')).toHaveTextContent('Dst'));
        expect(screen.getByText(/Conversion is being wired up/i)).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /Convert now/i })).toBeDisabled();
    });
});
