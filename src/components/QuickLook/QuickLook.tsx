/**
 * QuickLook — macOS-style space-bar preview overlay for Explorer files
 * Triggered by pressing Space on a focused file in the HierarchyBrowser.
 * Supports PDF, images, text, and generic file previews.
 */
import React, { useEffect, useState, useCallback, useRef } from 'react';
import { API_BASE } from '../../config';
import './QuickLook.css';

export interface QuickLookFile {
    id: string;
    name: string;
    type: string;
    size: number;
}

interface QuickLookProps {
    file: QuickLookFile | null;
    onClose: () => void;
    onOpenInWindow?: (file: QuickLookFile) => void;
}

type PreviewData =
    | { kind: 'loading' }
    | { kind: 'text'; content: string; truncated: boolean }
    | { kind: 'pdf'; url: string }
    | { kind: 'image'; url: string }
    | { kind: 'unsupported'; message: string };

const FILE_TYPE_LABELS: Record<string, string> = {
    pdf: 'PDF Document',
    png: 'PNG Image',
    jpg: 'JPEG Image',
    jpeg: 'JPEG Image',
    gif: 'GIF Image',
    txt: 'Text File',
    md: 'Markdown',
    csv: 'CSV Spreadsheet',
    json: 'JSON Data',
    html: 'HTML Document',
    doc: 'Word Document',
    docx: 'Word Document',
};

function formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1048576).toFixed(1)} MB`;
}

export default function QuickLook({ file, onClose, onOpenInWindow }: QuickLookProps) {
    const [preview, setPreview] = useState<PreviewData>({ kind: 'loading' });
    const overlayRef = useRef<HTMLDivElement>(null);

    // Fetch preview data when file changes
    useEffect(() => {
        if (!file) return;
        setPreview({ kind: 'loading' });

        let cancelled = false;

        async function fetchPreview() {
            try {
                const res = await fetch(`${API_BASE}/api/files/${file!.id}/preview`);
                const json = await res.json();

                if (cancelled) return;

                if (!json?.success || !json?.data?.previewable) {
                    setPreview({
                        kind: 'unsupported',
                        message: json?.data?.message || `Preview not available for .${file!.type} files`,
                    });
                    return;
                }

                const data = json.data;
                if (data.previewType === 'text') {
                    setPreview({ kind: 'text', content: data.content, truncated: data.truncated });
                } else if (data.previewType === 'pdf') {
                    setPreview({ kind: 'pdf', url: `${API_BASE}${data.downloadUrl}` });
                } else if (data.previewType === 'image') {
                    setPreview({ kind: 'image', url: `${API_BASE}${data.downloadUrl}` });
                } else {
                    setPreview({ kind: 'unsupported', message: 'Unknown preview type' });
                }
            } catch {
                if (!cancelled) {
                    setPreview({ kind: 'unsupported', message: 'Failed to load preview' });
                }
            }
        }

        void fetchPreview();
        return () => { cancelled = true; };
    }, [file]);

    // Close on Escape or Space
    useEffect(() => {
        if (!file) return;
        const handleKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape' || e.key === ' ') {
                e.preventDefault();
                e.stopPropagation();
                onClose();
            }
        };
        window.addEventListener('keydown', handleKey, { capture: true });
        return () => window.removeEventListener('keydown', handleKey, { capture: true });
    }, [file, onClose]);

    // Click outside to close
    const handleOverlayClick = useCallback((e: React.MouseEvent) => {
        if (e.target === overlayRef.current) {
            onClose();
        }
    }, [onClose]);

    if (!file) return null;

    const typeLabel = FILE_TYPE_LABELS[file.type?.toLowerCase()] || file.type?.toUpperCase() || 'File';

    return (
        <div className="ql-overlay" ref={overlayRef} onClick={handleOverlayClick}>
            <div className="ql-panel" role="dialog" aria-label={`Quick Look: ${file.name}`}>
                {/* Header */}
                <div className="ql-header">
                    <div className="ql-header__info">
                        <span className="ql-header__icon">{getQuickLookIcon(file.type)}</span>
                        <div className="ql-header__text">
                            <div className="ql-header__name">{file.name}</div>
                            <div className="ql-header__meta">
                                {typeLabel} · {formatSize(file.size)}
                            </div>
                        </div>
                    </div>
                    <div className="ql-header__actions">
                        {onOpenInWindow && (
                            <button
                                className="ql-btn ql-btn--open"
                                onClick={() => { onOpenInWindow(file); onClose(); }}
                                title="Open in Doc Viewer window"
                            >
                                ↗ Open
                            </button>
                        )}
                        <button className="ql-btn ql-btn--close" onClick={onClose} title="Close (Space / Esc)">
                            ✕
                        </button>
                    </div>
                </div>

                {/* Preview Content */}
                <div className="ql-content">
                    {preview.kind === 'loading' && (
                        <div className="ql-loading">
                            <div className="ql-loading__spinner" />
                            <span>Loading preview…</span>
                        </div>
                    )}

                    {preview.kind === 'text' && (
                        <div className="ql-text">
                            <pre className="ql-text__pre">{preview.content}</pre>
                            {preview.truncated && (
                                <div className="ql-text__truncated">
                                    Content truncated — open in Doc Viewer for full view
                                </div>
                            )}
                        </div>
                    )}

                    {preview.kind === 'pdf' && (
                        <iframe
                            className="ql-pdf-frame"
                            src={preview.url}
                            title={`PDF preview: ${file.name}`}
                        />
                    )}

                    {preview.kind === 'image' && (
                        <div className="ql-image">
                            <img
                                src={preview.url}
                                alt={file.name}
                                className="ql-image__img"
                                onError={() => setPreview({ kind: 'unsupported', message: 'Image failed to load' })}
                            />
                        </div>
                    )}

                    {preview.kind === 'unsupported' && (
                        <div className="ql-unsupported">
                            <span className="ql-unsupported__icon">📋</span>
                            <p className="ql-unsupported__text">{preview.message}</p>
                            {onOpenInWindow && (
                                <button
                                    className="ql-btn ql-btn--open ql-btn--large"
                                    onClick={() => { onOpenInWindow(file); onClose(); }}
                                >
                                    ↗ Open in Doc Viewer
                                </button>
                            )}
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="ql-footer">
                    <span className="ql-footer__hint">
                        Press <kbd>Space</kbd> or <kbd>Esc</kbd> to close
                    </span>
                </div>
            </div>
        </div>
    );
}

function getQuickLookIcon(type: string): string {
    const icons: Record<string, string> = {
        pdf: '📄',
        png: '🖼️',
        jpg: '🖼️',
        jpeg: '🖼️',
        gif: '🖼️',
        txt: '📃',
        md: '📃',
        csv: '📊',
        json: '{ }',
        html: '🌐',
        doc: '📝',
        docx: '📝',
    };
    return icons[type?.toLowerCase()] || '📎';
}
