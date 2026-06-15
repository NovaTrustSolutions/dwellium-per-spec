/**
 * IngestionPanel — Scribe folder-ingestion UI (Cycle 4).
 *
 * Lets the user pick a SOURCE folder and a BACKUP DESTINATION folder via the
 * File System Access API, shows the picked folder names + last-sync state, and
 * exposes a "Convert now" button. The actual enumerate→convert→write pass is
 * wired in Cycle 5 (passed in as `onConvert`); until then the button stays
 * disabled. The panel is self-contained + SSR-safe (all FS-API access is
 * event-handler-gated via useIngestion).
 *
 * a11y (Cycle-10 polish): every control carries discernible text (buttons are
 * text-labelled; no icon-only controls here). Picker + conversion errors surface
 * in assertive alert regions (role="alert"); the sync-status line is a polite
 * live region (role="status") so "Last sync" updates are announced.
 */
import { useState } from 'react';
import { useIngestion } from './useIngestion';

export interface IngestionPanelProps {
    /**
     * Run the conversion pass. Provided by Scribe from Cycle 5 onward; when
     * absent the Convert button stays disabled (feature not yet wired).
     */
    onConvert?: () => void | Promise<void>;
    /** Conversion in progress — disables controls + shows a busy label. */
    converting?: boolean;
    /** Error from the last conversion run, surfaced under the button. */
    convertError?: string | null;
}

export default function IngestionPanel({ onConvert, converting = false, convertError = null }: IngestionPanelProps) {
    const ingestion = useIngestion();
    const [pickError, setPickError] = useState<string | null>(null);

    const choose = async (which: 'source' | 'backup') => {
        setPickError(null);
        try {
            if (which === 'source') await ingestion.pickSource();
            else await ingestion.pickBackup();
        } catch (err) {
            setPickError(err instanceof Error ? err.message : 'Could not open the folder picker.');
        }
    };

    const doReconnect = async (which: 'source' | 'backup') => {
        setPickError(null);
        try {
            await ingestion.reconnect(which);
        } catch (err) {
            setPickError(err instanceof Error ? err.message : 'Could not reconnect the folder.');
        }
    };

    const ready = ingestion.hasSource && ingestion.hasBackup;
    const convertDisabled = converting || !ready || !onConvert;

    if (!ingestion.supported) {
        return (
            <section className="scribe-ingest" aria-labelledby="scribe-ingest-title">
                <h3 id="scribe-ingest-title" className="scribe-ingest__title">Folder ingestion</h3>
                <p className="scribe-ingest__unsupported" role="status">
                    Folder ingestion needs the File System Access API, which this browser doesn’t
                    expose. Use a Chromium-based browser (Chrome / Edge) or the desktop app to pick
                    a source and backup folder.
                </p>
            </section>
        );
    }

    return (
        <section className="scribe-ingest" aria-labelledby="scribe-ingest-title">
            <h3 id="scribe-ingest-title" className="scribe-ingest__title">Folder ingestion</h3>
            <p className="scribe-ingest__hint">
                Pick a source folder and a backup destination. Files are converted to Markdown and
                written to the backup folder.
            </p>

            <div className="scribe-ingest__row">
                <button
                    type="button"
                    className="scribe-ingest__pick"
                    onClick={() => void choose('source')}
                    disabled={converting}
                >
                    {ingestion.sourceFolderName ? 'Change source folder' : 'Choose source folder'}
                </button>
                <span className="scribe-ingest__path" data-testid="ingest-source-name">
                    {ingestion.sourceFolderName
                        ? (ingestion.hasSource
                            ? ingestion.sourceFolderName
                            : ingestion.needsReconnectSource
                                ? `${ingestion.sourceFolderName} (reconnect to restore access)`
                                : `${ingestion.sourceFolderName} (re-pick after reload)`)
                        : 'No source folder chosen'}
                </span>
                {ingestion.needsReconnectSource && !ingestion.hasSource && (
                    <button
                        type="button"
                        className="scribe-ingest__reconnect"
                        onClick={() => void doReconnect('source')}
                        disabled={converting}
                    >
                        Reconnect
                    </button>
                )}
            </div>

            <div className="scribe-ingest__row">
                <button
                    type="button"
                    className="scribe-ingest__pick"
                    onClick={() => void choose('backup')}
                    disabled={converting}
                >
                    {ingestion.backupFolderName ? 'Change backup folder' : 'Choose backup destination'}
                </button>
                <span className="scribe-ingest__path" data-testid="ingest-backup-name">
                    {ingestion.backupFolderName
                        ? (ingestion.hasBackup
                            ? ingestion.backupFolderName
                            : ingestion.needsReconnectBackup
                                ? `${ingestion.backupFolderName} (reconnect to restore access)`
                                : `${ingestion.backupFolderName} (re-pick after reload)`)
                        : 'No backup folder chosen'}
                </span>
                {ingestion.needsReconnectBackup && !ingestion.hasBackup && (
                    <button
                        type="button"
                        className="scribe-ingest__reconnect"
                        onClick={() => void doReconnect('backup')}
                        disabled={converting}
                    >
                        Reconnect
                    </button>
                )}
            </div>

            {pickError && (
                <p className="scribe-ingest__error" role="alert">{pickError}</p>
            )}

            <div className="scribe-ingest__actions">
                <button
                    type="button"
                    className="scribe-ingest__convert"
                    onClick={() => { if (onConvert) void onConvert(); }}
                    disabled={convertDisabled}
                >
                    {converting ? 'Converting…' : 'Convert now'}
                </button>
                {!ready && (
                    <span className="scribe-ingest__caption">Choose both folders to enable conversion.</span>
                )}
                {ready && !onConvert && (
                    <span className="scribe-ingest__caption">Conversion is being wired up.</span>
                )}
            </div>

            {convertError && (
                <p className="scribe-ingest__error" role="alert">{convertError}</p>
            )}

            <p className="scribe-ingest__status" data-testid="ingest-status" role="status">
                {ingestion.lastSyncAt
                    ? `Last sync: ${ingestion.lastSyncAt} · ${ingestion.converted.length} file(s) in index`
                    : 'No conversions yet.'}
            </p>
        </section>
    );
}
