/**
 * DocViewer — top toolbar: file select, page nav, zoom, Export/Save
 * Back/Cache Local/Open Original, and the info hint line (P2 item 11 module
 * split). Presentational: explicit props only.
 */
import { useEffect, useRef } from 'react';
import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Download, ExternalLink, Save, Search } from 'lucide-react';
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

    // 16b: text search — only rendered while previewMode === 'pdf'.
    searchOpen: boolean;
    onToggleSearch: () => void;
    searchQuery: string;
    onSearchQueryChange: (q: string) => void;
    searchIsSearching: boolean;
    searchMatchCount: number;
    searchCurrentIndex: number; // -1 = none
    onSearchNext: () => void;
    onSearchPrev: () => void;
}

export default function DocToolbar(props: DocToolbarProps) {
    const {
        files, selectedFile, onSelectFile, previewMode, currentPage, totalPages, onGoToPage,
        zoom, setZoom, onExport, canSaveBack, onSaveBack, saveBackDisabled, saveBackTitle, isSaving,
        onCacheLocal, onOpenOriginal, previewMessage, savedLocalPath,
        searchOpen, onToggleSearch, searchQuery, onSearchQueryChange, searchIsSearching,
        searchMatchCount, searchCurrentIndex, onSearchNext, onSearchPrev,
    } = props;

    // 16b: focus the search field when it opens — a plain effect instead of
    // the autoFocus prop (jsx-a11y/no-autofocus: autoFocus yanks focus away
    // from wherever the user already was, unconditionally, on every mount;
    // this only fires the ONE time searchOpen flips true).
    const searchInputRef = useRef<HTMLInputElement | null>(null);
    useEffect(() => {
        if (searchOpen) searchInputRef.current?.focus();
    }, [searchOpen]);

    return (
        <>
            <div className="dv-toolbar">
                <select className="dv-toolbar__file-select"
                    aria-label="Select a document"
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
                            <div className="dv-toolbar__page">
                                <button className="dv-toolbar__btn" onClick={() => onGoToPage(currentPage - 1)} disabled={currentPage <= 1} aria-label="Previous page"><ChevronLeft size={14} aria-hidden /></button>
                                <input className="dv-toolbar__page-input" type="number" value={currentPage} aria-label="Current page"
                                    onChange={e => onGoToPage(parseInt(e.target.value) || 1)}
                                    min={1} max={totalPages} />
                                <span>/ {totalPages}</span>
                                <button className="dv-toolbar__btn" onClick={() => onGoToPage(currentPage + 1)} disabled={currentPage >= totalPages} aria-label="Next page"><ChevronRight size={14} aria-hidden /></button>
                            </div>
                        )}

                        {/* P2 item 13 / audit #19: zoom now works for image previews
                            too, not just PDF — the image preview already honors
                            `zoom` via a CSS transform (see DocViewer.tsx), the
                            controls just weren't rendered for it. */}
                        {(previewMode === 'pdf' || previewMode === 'image') && (
                            <div className="dv-zoom">
                                <button className="dv-zoom__btn" onClick={() => setZoom(z => Math.max(0.5, z - 0.25))} aria-label="Zoom out">−</button>
                                <span className="dv-zoom__level">{Math.round(zoom * 100)}%</span>
                                <button className="dv-zoom__btn" onClick={() => setZoom(z => Math.min(3, z + 0.25))} aria-label="Zoom in">+</button>
                            </div>
                        )}

                        {previewMode === 'pdf' && (
                            <button className="dv-toolbar__btn" onClick={onToggleSearch}
                                title="Search document text" aria-pressed={searchOpen} aria-expanded={searchOpen}>
                                <Search size={14} aria-hidden /> Search
                            </button>
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
            {selectedFile && previewMode === 'pdf' && searchOpen && (
                <div className="dv-toolbar dv-toolbar--search">
                    <input
                        ref={searchInputRef}
                        type="text"
                        className="dv-toolbar__search-input"
                        placeholder="Search document text…"
                        aria-label="Search document text"
                        value={searchQuery}
                        onChange={e => onSearchQueryChange(e.target.value)}
                        onKeyDown={e => {
                            if (e.key === 'Enter') {
                                e.preventDefault();
                                if (e.shiftKey) onSearchPrev(); else onSearchNext();
                            } else if (e.key === 'Escape') {
                                e.preventDefault();
                                onToggleSearch();
                            }
                        }}
                    />
                    <span className="dv-toolbar__hint" aria-live="polite">
                        {searchIsSearching ? 'Searching…' : searchQuery.trim() === '' ? '' :
                            searchMatchCount > 0 ? `${searchCurrentIndex + 1} of ${searchMatchCount}` : 'No matches'}
                    </span>
                    <button className="dv-toolbar__btn" onClick={onSearchPrev} disabled={searchMatchCount === 0} aria-label="Previous match" title="Previous match (Shift+Enter)">
                        <ChevronUp size={14} aria-hidden />
                    </button>
                    <button className="dv-toolbar__btn" onClick={onSearchNext} disabled={searchMatchCount === 0} aria-label="Next match" title="Next match (Enter)">
                        <ChevronDown size={14} aria-hidden />
                    </button>
                    <button className="dv-toolbar__btn" onClick={onToggleSearch} aria-label="Close search">
                        ×
                    </button>
                </div>
            )}
            {selectedFile && (previewMessage || savedLocalPath) && (
                <div className="dv-toolbar dv-toolbar--info">
                    {previewMessage && <span className="dv-toolbar__hint">{previewMessage}</span>}
                    {savedLocalPath && <span className="dv-toolbar__hint">Local path: {savedLocalPath}</span>}
                </div>
            )}
        </>
    );
}
