/**
 * DocViewer — top toolbar: file select, page nav, zoom, Export/Save
 * Back/Cache Local/Open Original, and the info hint line (P2 item 11 module
 * split). Presentational: explicit props only.
 */
import { ChevronLeft, ChevronRight, Download, ExternalLink, Save } from 'lucide-react';
import type { DocFile, PreviewMode } from './docViewerTypes';

export interface DocToolbarProps {
    files: DocFile[];
    selectedFile: DocFile | null;
    onSelectFile: (file: DocFile) => void;

    previewMode: PreviewMode;
    currentPage: number;
    totalPages: number;
    onGoToPage: (page: number) => void;
    zoom: number;
    setZoom: (updater: (z: number) => number) => void;

    onExport: () => void;
    canSaveBack: boolean;
    onSaveBack: () => void;
    saveBackDisabled: boolean;
    saveBackTitle: string;
    isSaving: boolean;

    onCacheLocal: () => void;
    onOpenOriginal: () => void;

    previewMessage: string | null;
    savedLocalPath: string | null;
}

export default function DocToolbar(props: DocToolbarProps) {
    const {
        files, selectedFile, onSelectFile, previewMode, currentPage, totalPages, onGoToPage,
        zoom, setZoom, onExport, canSaveBack, onSaveBack, saveBackDisabled, saveBackTitle, isSaving,
        onCacheLocal, onOpenOriginal, previewMessage, savedLocalPath,
    } = props;

    return (
        <>
            <div className="dv-toolbar">
                <select className="dv-toolbar__file-select"
                    value={selectedFile?.id || ''}
                    onChange={(e) => {
                        const file = files.find(f => f.id === e.target.value);
                        if (file) onSelectFile(file);
                    }}>
                    <option value="">Select a document...</option>
                    {files.map(f => (
                        <option key={f.id} value={f.id}>{f.name}</option>
                    ))}
                </select>

                {selectedFile && (
                    <>
                        {previewMode === 'pdf' && (
                            <>
                                <div className="dv-toolbar__page">
                                    <button className="dv-toolbar__btn" onClick={() => onGoToPage(currentPage - 1)} disabled={currentPage <= 1} aria-label="Previous page"><ChevronLeft size={14} aria-hidden /></button>
                                    <input className="dv-toolbar__page-input" type="number" value={currentPage}
                                        onChange={e => onGoToPage(parseInt(e.target.value) || 1)}
                                        min={1} max={totalPages} />
                                    <span>/ {totalPages}</span>
                                    <button className="dv-toolbar__btn" onClick={() => onGoToPage(currentPage + 1)} disabled={currentPage >= totalPages} aria-label="Next page"><ChevronRight size={14} aria-hidden /></button>
                                </div>

                                <div className="dv-zoom">
                                    <button className="dv-zoom__btn" onClick={() => setZoom(z => Math.max(0.5, z - 0.25))}>−</button>
                                    <span className="dv-zoom__level">{Math.round(zoom * 100)}%</span>
                                    <button className="dv-zoom__btn" onClick={() => setZoom(z => Math.min(3, z + 0.25))}>+</button>
                                </div>
                            </>
                        )}

                        <button className="dv-toolbar__btn dv-toolbar__btn--download" onClick={onExport} title="Export current document">
                            <Download size={14} aria-hidden /> Export
                        </button>
                        {canSaveBack && (
                            <button className="dv-toolbar__btn" onClick={onSaveBack} disabled={saveBackDisabled} title={saveBackTitle}>
                                {isSaving ? 'Saving…' : <><Save size={14} aria-hidden /> Save Back</>}
                            </button>
                        )}
                        <button className="dv-toolbar__btn" onClick={onCacheLocal} title="Materialize local copy and copy path">
                            <Download size={14} aria-hidden /> Cache Local
                        </button>
                        <button className="dv-toolbar__btn" onClick={onOpenOriginal} title="Open original file route">
                            <ExternalLink size={14} aria-hidden /> Open Original
                        </button>
                    </>
                )}
            </div>
            {selectedFile && (previewMessage || savedLocalPath) && (
                <div className="dv-toolbar dv-toolbar--info">
                    {previewMessage && <span className="dv-toolbar__hint">{previewMessage}</span>}
                    {savedLocalPath && <span className="dv-toolbar__hint">Local path: {savedLocalPath}</span>}
                </div>
            )}
        </>
    );
}
