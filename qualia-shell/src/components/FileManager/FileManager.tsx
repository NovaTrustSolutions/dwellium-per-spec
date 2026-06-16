import { useState, useEffect, useCallback, useMemo, useRef, DragEvent, ChangeEvent } from 'react';
import { FolderOpen, Home, Inbox, Menu } from 'lucide-react';
import { useHierarchy } from '../../context/HierarchyContext';
import { useWindows } from '../../context/WindowContext';
import './FileManager.css';
import { API_BASE } from '../../config';

// ============================================
// TYPES
// ============================================

interface FileItem {
    id: string;
    name: string;
    type: string;
    size: number;
    tags?: string[];
}

interface FolderNode {
    id: string;
    name: string;
    type: 'folder';
    children: FileItem[];
}

const API_FILES = `${API_BASE}/api/files`;

const FILE_ICONS: Record<string, string> = {
    pdf: '', doc: '', docx: '', txt: '', md: '',
    jpg: '', jpeg: '', png: '', gif: '', svg: '',
    mp3: '', wav: '', mp4: '', mov: '',
    zip: '', rar: '', csv: '', json: '',
    ts: '', js: '', html: '', css: '',
    unknown: ''
};

// ============================================
// COMPONENT
// ============================================

export default function FileManager() {
    const { hierarchy, selectedId, expandedIds, selectItem, toggleExpand } = useHierarchy();
    const { openWindow } = useWindows();
    const [files, setFiles] = useState<FileItem[]>([]);
    const [selectedFile, setSelectedFile] = useState<string | null>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
    const [isDragging, setIsDragging] = useState(false);
    const [isUploading, setIsUploading] = useState(false);
    const [syncStatus, setSyncStatus] = useState<{ running: boolean; filesWatched: number }>({ running: false, filesWatched: 0 });
    const fileInputRef = useRef<HTMLInputElement>(null);

    // ---- UPLOAD VIA BUTTON ----
    const handleUploadClick = () => fileInputRef.current?.click();

    const handleFileInputChange = async (e: ChangeEvent<HTMLInputElement>) => {
        const selectedFiles = e.target.files;
        if (!selectedFiles || selectedFiles.length === 0) return;
        setIsUploading(true);
        for (const file of Array.from(selectedFiles)) {
            const formData = new FormData();
            formData.append('file', file);
            if (selectedId) formData.append('projectId', selectedId);
            try {
                await fetch(`${API_FILES}/upload`, { method: 'POST', body: formData });
            } catch (err) {
                console.error('Upload failed:', err);
            }
        }
        setIsUploading(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
        fetchFiles();
    };

    // ---- DATA FETCHING ----
    useEffect(() => {
        fetchFiles();
        fetchSyncStatus();
    }, []);



    const fetchFiles = async (query: string = searchQuery) => {
        try {
            let url = API_FILES;
            const params = new URLSearchParams();
            if (query) params.set('q', query);
            if (selectedId) params.set('projectId', selectedId);
            if (params.toString()) url += `?${params.toString()}`;
            const res = await fetch(url);
            const json = await res.json();
            if (json.success) setFiles(json.data);
        } catch {
            // Use demo data when offline
        }
    };

    const fetchSyncStatus = async () => {
        try {
            const res = await fetch(`${API_FILES}/sync/status`);
            const json = await res.json();
            if (json.success) setSyncStatus(json.data);
        } catch { /* offline */ }
    };

    // ---- SEARCH & PROJECT CHANGES ----
    useEffect(() => {
        const debounce = setTimeout(() => {
            fetchFiles(searchQuery.trim());
        }, 300);
        return () => clearTimeout(debounce);
    }, [searchQuery, selectedId]);

    // ---- DRAG AND DROP ----
    const handleDragOver = useCallback((e: DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(true);
    }, []);

    const handleDragLeave = useCallback((e: DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(false);
    }, []);

    const handleDrop = useCallback(async (e: DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(false);

        const droppedFiles = Array.from(e.dataTransfer.files);
        for (const file of droppedFiles) {
            const formData = new FormData();
            formData.append('file', file);
            if (selectedId) formData.append('projectId', selectedId);

            try {
                await fetch(`${API_FILES}/upload`, { method: 'POST', body: formData });
            } catch (err) {
                console.error('Upload failed:', err);
            }
        }

        // Refresh
        fetchFiles();
    }, [selectedId]);

    // ---- HELPERS ----
    const getIcon = (type: string) => FILE_ICONS[type] || FILE_ICONS.unknown;

    const formatSize = (bytes: number) => {
        if (bytes < 1024) return `${bytes} B`;
        if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
        return `${(bytes / 1048576).toFixed(1)} MB`;
    };

    // Types that can be previewed in the DocViewer
    const VIEWABLE_TYPES = new Set([
        'pdf', 'jpg', 'jpeg', 'png', 'gif', 'svg', 'txt', 'md',
        'html', 'json', 'csv', 'mp3', 'wav', 'mp4', 'mov',
        'doc', 'docx',
    ]);

    const handleOpenFile = useCallback((file: FileItem) => {
        if (VIEWABLE_TYPES.has(file.type)) {
            // Store pending request globally so DocViewer can pick it up on cold mount
            const detail = { fileId: file.id, name: file.name };
            (window as any).__qualiaDocViewerPendingFile = detail;
            // Open DocViewer window (may be lazy-loaded)
            openWindow('doc-viewer', file.name, '');
            // Dispatch event with retry — DocViewer needs time to mount and register listener
            const dispatch = (attempt: number) => {
                if (attempt > 5) return;
                window.dispatchEvent(new CustomEvent('qualia-docviewer-open-file', { detail }));
                setTimeout(() => dispatch(attempt + 1), 300 * Math.pow(2, attempt));
            };
            setTimeout(() => dispatch(0), 300);
        } else {
            // Trigger download for binary files
            const downloadUrl = `${API_FILES}/${file.id}`;
            const a = document.createElement('a');
            a.href = downloadUrl;
            a.download = file.name;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
        }
    }, [openWindow]);

    const visibleFiles = useMemo(() => {
        const query = searchQuery.trim();
        if (query.length > 0 || selectedId) {
            return files;
        }
        return files;
    }, [searchQuery, files, selectedId]);

    // ---- RENDER ----
    return (
        <div className="file-manager" onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop}>
            {/* Sidebar — Hierarchy Tree */}
            <div className="fm-sidebar">
                <div className="fm-sidebar__header">
                    <span><FolderOpen size={14} /></span>
                    <span className="fm-sidebar__title">Files</span>
                </div>
                <div className="fm-sidebar__tree">
                    <div className={`fm-tree-item ${!selectedId ? 'fm-tree-item--active' : ''}`}
                        onClick={() => selectItem('')}>
                        <span className="fm-tree-item__icon"><Home size={14} /></span>
                        <span className="fm-tree-item__name">All Files</span>
                    </div>
                    {hierarchy.map(domain => (
                        <div key={domain.id}>
                            <div className={`fm-tree-item fm-tree-item--domain ${selectedId === domain.id ? 'fm-tree-item--active' : ''}`}
                                onClick={() => { selectItem(domain.id); toggleExpand(domain.id); }}>
                                <span className="fm-tree-item__icon">{domain.icon || ''}</span>
                                <span className="fm-tree-item__name">{domain.name}</span>
                                <span className="fm-tree-item__count">{expandedIds.has(domain.id) ? '▾' : '▸'}</span>
                            </div>
                            {expandedIds.has(domain.id) && domain.children?.map(node => (
                                <div key={node.id}>
                                    <div className={`fm-tree-item fm-tree-item--node ${selectedId === node.id ? 'fm-tree-item--active' : ''}`}
                                        onClick={() => { selectItem(node.id); toggleExpand(node.id); }}
                                        style={{ paddingLeft: 24 }}>
                                        <span className="fm-tree-item__icon">{node.icon || ''}</span>
                                        <span className="fm-tree-item__name">{node.name}</span>
                                        <span className="fm-tree-item__count">{node.children ? (expandedIds.has(node.id) ? '▾' : '▸') : ''}</span>
                                    </div>
                                    {expandedIds.has(node.id) && node.children?.map(project => (
                                        <div key={project.id}
                                            className={`fm-tree-item fm-tree-item--project ${selectedId === project.id ? 'fm-tree-item--active' : ''}`}
                                            onClick={() => selectItem(project.id)}
                                            style={{ paddingLeft: 44 }}>
                                            <span className="fm-tree-item__icon">{project.icon || ''}</span>
                                            <span className="fm-tree-item__name">{project.name}</span>
                                        </div>
                                    ))}
                                </div>
                            ))}
                        </div>
                    ))}
                </div>
            </div>

            {/* Main Content */}
            <div className="fm-content" style={{ position: 'relative' }}>
                {/* Toolbar */}
                <div className="fm-toolbar">
                    <input className="fm-toolbar__search" type="text" placeholder="Search files..."
                        value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
                    <button className="fm-toolbar__btn fm-toolbar__btn--upload"
                        onClick={handleUploadClick} title="Upload Files" disabled={isUploading}>
                        {isUploading ? '' : ''} Upload
                    </button>
                    <input ref={fileInputRef} type="file" multiple style={{ display: 'none' }}
                        onChange={handleFileInputChange} />
                    <button className={`fm-toolbar__btn ${viewMode === 'grid' ? 'fm-toolbar__btn--active' : ''}`}
                        onClick={() => setViewMode('grid')} title="Grid View">⊞</button>
                    <button className={`fm-toolbar__btn ${viewMode === 'list' ? 'fm-toolbar__btn--active' : ''}`}
                        onClick={() => setViewMode('list')} title="List View"><Menu size={16} /></button>
                </div>

                {/* Files Grid/List */}
                {visibleFiles.length > 0 ? (
                    <div className={`fm-grid ${viewMode === 'list' ? 'fm-grid--list' : ''}`}>
                        {visibleFiles.map(file => (
                            <div key={file.id}
                                className={`fm-file ${selectedFile === file.id ? 'fm-file--selected' : ''}`}
                                onClick={() => setSelectedFile(file.id === selectedFile ? null : file.id)}
                                onDoubleClick={() => handleOpenFile(file)}>
                                <span className="fm-file__icon">{getIcon(file.type)}</span>
                                <span className="fm-file__name">{file.name}</span>
                                <span className="fm-file__meta">{formatSize(file.size)}</span>
                                <div className="fm-file__share-bar" onClick={(e) => e.stopPropagation()}>
                                    <button
                                        className="fm-share-btn fm-share-btn--open"
                                        title="Open in Doc Viewer"
                                        onClick={() => handleOpenFile(file)}
                                    >
                                       
                                    </button>
                                    <button
                                        className="fm-share-btn fm-share-btn--airdrop"
                                        title="Share via AirDrop / System Share"
                                        onClick={async () => {
                                            try {
                                                const res = await fetch(`${API_FILES}/${file.id}`);
                                                const blob = await res.blob();
                                                const shareFile = new File([blob], file.name, { type: blob.type });
                                                if (navigator.share && navigator.canShare?.({ files: [shareFile] })) {
                                                    await navigator.share({ files: [shareFile], title: file.name });
                                                } else {
                                                    // Fallback: download the file
                                                    const url = URL.createObjectURL(blob);
                                                    const a = document.createElement('a');
                                                    a.href = url; a.download = file.name; a.click();
                                                    URL.revokeObjectURL(url);
                                                }
                                            } catch (err) {
                                                console.error('Share failed:', err);
                                            }
                                        }}
                                    >
                                       
                                    </button>
                                    <button
                                        className="fm-share-btn fm-share-btn--email"
                                        title="Send via Email"
                                        onClick={() => {
                                            const subject = encodeURIComponent(`File: ${file.name}`);
                                            const body = encodeURIComponent(
                                                `Here is the file "${file.name}" (${formatSize(file.size)}).\n\n` +
                                                `Download: ${window.location.origin}/api/files/${file.id}`
                                            );
                                            window.open(`mailto:?subject=${subject}&body=${body}`, '_blank');
                                        }}
                                    >
                                       
                                    </button>
                                    <button
                                        className="fm-share-btn fm-share-btn--sms"
                                        title="Send via Text Message"
                                        onClick={() => {
                                            const body = encodeURIComponent(
                                                `File: ${file.name} — ${window.location.origin}/api/files/${file.id}`
                                            );
                                            window.open(`sms:?&body=${body}`, '_blank');
                                        }}
                                    >
                                       
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="fm-empty">
                        <span className="fm-empty__icon"><FolderOpen size={14} /></span>
                        <span className="fm-empty__text">
                            {searchQuery ? 'No matching files' : 'Drop files here to upload'}
                        </span>
                    </div>
                )}

                {/* Drop Zone Overlay */}
                {isDragging && (
                    <div className="fm-dropzone">
                        <span className="fm-dropzone__icon"><Inbox size={14} /></span>
                        <span className="fm-dropzone__text">Drop files to upload</span>
                    </div>
                )}

                {/* Sync Status */}
                <div className="fm-sync">
                    <span className={`fm-sync__dot ${syncStatus.running ? 'fm-sync__dot--active' : 'fm-sync__dot--inactive'}`} />
                    <span>Sync: {syncStatus.running ? 'Active' : 'Inactive'}</span>
                    <span>• {syncStatus.filesWatched} files tracked</span>
                </div>
            </div>
        </div>
    );
}
