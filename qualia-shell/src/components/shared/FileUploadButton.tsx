import { getAuthToken } from '../../context/UserContext';
/**
 * FileUploadButton — Shared upload component for Stella, ARA, and Jarvis
 * 
 * Features:
 * - Drag-and-drop or click-to-browse
 * - Supports images, PDF, txt, md, docx (≤20MB)
 * - Shows upload progress indicator
 * - Optional AI analysis prompt customization
 * - Optional "save as document" toggle
 * - Returns analysis result to parent via onResult callback
 */

import React, { useState, useRef, useCallback } from 'react';
import { API_BASE } from '../../config';

export interface UploadResult {
    originalName: string;
    mimetype: string;
    size: number;
    analysis: string;
    savedDocumentId: string | null;
    extractedTextLength: number;
}

interface FileUploadButtonProps {
    /** Called with analysis result when upload completes */
    onResult: (result: UploadResult) => void;
    /** Optional CSS class override for the trigger button */
    className?: string;
    /** Optional prompt pre-fill */
    defaultPrompt?: string;
    /** Size variant */
    size?: 'sm' | 'md';
    /** Show as icon-only (no label text) */
    iconOnly?: boolean;
}

const ACCEPTED_TYPES = [
    'image/jpeg', 'image/png', 'image/webp', 'image/gif',
    'application/pdf', 'text/plain', 'text/markdown',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
];
const ACCEPTED_EXTS = '.jpg,.jpeg,.png,.webp,.gif,.pdf,.txt,.md,.doc,.docx';
const MAX_SIZE_MB = 20;

type UploadPhase = 'idle' | 'selecting' | 'uploading' | 'done' | 'error';

export function FileUploadButton({
    onResult,
    className = '',
    defaultPrompt = '',
    size = 'md',
    iconOnly = false,
}: FileUploadButtonProps) {
    const [phase, setPhase] = useState<UploadPhase>('idle');
    const [progress, setProgress] = useState(0);
    const [errorMsg, setErrorMsg] = useState('');
    const [isDragging, setIsDragging] = useState(false);
    const [showModal, setShowModal] = useState(false);
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const [prompt, setPrompt] = useState(defaultPrompt);
    const [saveAsDoc, setSaveAsDoc] = useState(false);
    const [docTitle, setDocTitle] = useState('');

    const inputRef = useRef<HTMLInputElement>(null);

    const getToken = () => getAuthToken();

    const validateFile = (file: File): string | null => {
        if (!ACCEPTED_TYPES.includes(file.type) && !file.name.endsWith('.md')) {
            return `Unsupported type: ${file.type}. Allowed: images, PDF, txt, md, docx`;
        }
        if (file.size > MAX_SIZE_MB * 1024 * 1024) {
            return `File too large (${(file.size / 1024 / 1024).toFixed(1)}MB). Max: ${MAX_SIZE_MB}MB`;
        }
        return null;
    };

    const openFileForUpload = (file: File) => {
        const err = validateFile(file);
        if (err) { setErrorMsg(err); setPhase('error'); return; }

        setSelectedFile(file);
        setDocTitle(file.name.replace(/\.[^.]+$/, ''));
        setPhase('selecting');
        setShowModal(true);
        setErrorMsg('');
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) openFileForUpload(file);
        if (inputRef.current) inputRef.current.value = '';
    };

    const handleDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
        const file = e.dataTransfer.files[0];
        if (file) openFileForUpload(file);
    }, []);

    const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); setIsDragging(true); };
    const handleDragLeave = () => setIsDragging(false);

    const doUpload = async () => {
        if (!selectedFile) return;
        setPhase('uploading');
        setProgress(10);

        try {
            const formData = new FormData();
            formData.append('file', selectedFile);
            if (prompt) formData.append('prompt', prompt);
            if (saveAsDoc) {
                formData.append('save_as_document', 'true');
                formData.append('document_title', docTitle || selectedFile.name);
            }

            const token = getToken();
            const headers: Record<string, string> = {};
            if (token) headers['Authorization'] = `Bearer ${token}`;

            // Fake progress pulses while waiting for AI
            const progressInterval = setInterval(() => {
                setProgress(p => Math.min(p + Math.random() * 15, 85));
            }, 800);

            const resp = await fetch(`${API_BASE}/api/upload-analyze`, {
                method: 'POST',
                headers,
                body: formData,
            });

            clearInterval(progressInterval);
            setProgress(95);

            if (!resp.ok) {
                const err = await resp.json().catch(() => ({ error: resp.statusText }));
                throw new Error(err.error || `Upload failed: ${resp.status}`);
            }

            const data = await resp.json();
            if (!data.success) throw new Error(data.error || 'Upload failed');

            setProgress(100);
            setPhase('done');
            setShowModal(false);
            onResult(data.data);
        } catch (e: any) {
            setPhase('error');
            setErrorMsg(e.message || 'Upload failed');
        }
    };

    const reset = () => {
        setPhase('idle');
        setProgress(0);
        setErrorMsg('');
        setSelectedFile(null);
        setShowModal(false);
        setPrompt(defaultPrompt);
        setSaveAsDoc(false);
    };

    const isUploading = phase === 'uploading';
    const btnClass = [
        'fub-trigger',
        `fub-trigger--${size}`,
        isDragging ? 'fub-trigger--drag' : '',
        isUploading ? 'fub-trigger--uploading' : '',
        className,
    ].filter(Boolean).join(' ');

    return (
        <>
            {/* Hidden file input */}
            <input
                ref={inputRef}
                type="file"
                accept={ACCEPTED_EXTS}
                onChange={handleFileChange}
                style={{ display: 'none' }}
                id="fub-file-input"
            />

            {/* Trigger Button */}
            <button
                className={btnClass}
                onClick={() => inputRef.current?.click()}
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                title="Upload file for AI analysis (images, PDF, txt, docx)"
                disabled={isUploading}
                type="button"
            >
                {isUploading ? (
                    <span className="fub-spinner" />
                ) : (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                        <polyline points="17 8 12 3 7 8" />
                        <line x1="12" y1="3" x2="12" y2="15" />
                    </svg>
                )}
                {!iconOnly && <span className="fub-label">{isUploading ? 'Analyzing…' : 'Upload'}</span>}
            </button>

            {/* Upload Modal */}
            {showModal && (
                <div className="fub-modal-overlay" onClick={reset}>
                    <div className="fub-modal" onClick={e => e.stopPropagation()}>
                        <div className="fub-modal-header">
                            <span>📎 Upload & Analyze</span>
                            <button onClick={reset} className="fub-modal-close">×</button>
                        </div>

                        {/* File preview */}
                        <div className="fub-file-pill">
                            <span className="fub-file-icon">
                                {selectedFile?.type.startsWith('image/') ? '🖼️' :
                                    selectedFile?.type === 'application/pdf' ? '📄' : '📝'}
                            </span>
                            <div className="fub-file-info">
                                <span className="fub-file-name">{selectedFile?.name}</span>
                                <span className="fub-file-size">{((selectedFile?.size || 0) / 1024).toFixed(1)} KB</span>
                            </div>
                            <button onClick={() => inputRef.current?.click()} className="fub-file-change" title="Change file">↺</button>
                        </div>

                        {/* Analysis prompt */}
                        <div className="fub-field">
                            <label className="fub-label-text">What should AI focus on?</label>
                            <textarea
                                className="fub-prompt"
                                value={prompt}
                                onChange={e => setPrompt(e.target.value)}
                                placeholder="e.g. Summarize this lease, extract the rent amount, identify risk clauses…"
                                rows={3}
                            />
                        </div>

                        {/* Save as document toggle */}
                        <div className="fub-save-row">
                            <label className="fub-toggle-row">
                                <input
                                    type="checkbox"
                                    checked={saveAsDoc}
                                    onChange={e => setSaveAsDoc(e.target.checked)}
                                    className="fub-checkbox"
                                />
                                <span>Save analysis as document</span>
                            </label>
                            {saveAsDoc && (
                                <input
                                    type="text"
                                    className="fub-doc-title"
                                    value={docTitle}
                                    onChange={e => setDocTitle(e.target.value)}
                                    placeholder="Document title…"
                                />
                            )}
                        </div>

                        {/* Error state */}
                        {phase === 'error' && (
                            <div className="fub-error">⚠️ {errorMsg}</div>
                        )}

                        {/* Progress bar */}
                        {phase === 'uploading' && (
                            <div className="fub-progress-bar">
                                <div className="fub-progress-fill" style={{ width: `${progress}%` }} />
                                <span className="fub-progress-label">Analyzing with AI… {Math.round(progress)}%</span>
                            </div>
                        )}

                        {/* Actions */}
                        <div className="fub-modal-actions">
                            <button onClick={reset} className="fub-btn-cancel" disabled={isUploading}>Cancel</button>
                            <button
                                onClick={doUpload}
                                className="fub-btn-upload"
                                disabled={!selectedFile || isUploading}
                            >
                                {isUploading ? '⏳ Analyzing…' : '🔍 Analyze'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}

export default FileUploadButton;
