/**
 * DocViewer — PDF editing toolbar: tool buttons, color/size/font pickers,
 * shape sub-tools, stamp picker, page-manipulation + undo/redo (P2 item 11
 * module split). Presentational: state (activeTool, pickers, undo stack…)
 * stays owned by DocViewer and is threaded through as explicit props, so
 * behavior is byte-for-byte what the inline JSX did before the split.
 */
import { useEffect, useRef } from 'react';
import {
    ArrowRight, ArrowUp, Bookmark, Circle, Eraser, Highlighter, Minus, PenTool, Pencil,
    Plus, Redo2, RotateCw, Square, Trash2, Undo2,
} from 'lucide-react';
import type { ToolMode, ShapeType, StampType } from './docViewerTypes';
import { STAMP_COLORS } from './docViewerTypes';

const COLORS = ['#ef4444', '#f59e0b', '#22c55e', '#3b82f6', '#D6FE51', '#ec4899', '#1a1a2e', '#ffffff'];
// P2 item 13 (a11y): the color swatches are icon-only (a colored square, no
// text) — each needs a name a screen reader can say.
const COLOR_NAMES: Record<string, string> = {
    '#ef4444': 'Red', '#f59e0b': 'Orange', '#22c55e': 'Green', '#3b82f6': 'Blue',
    '#D6FE51': 'Lime', '#ec4899': 'Pink', '#1a1a2e': 'Dark navy', '#ffffff': 'White',
};
const SHAPES: ShapeType[] = ['rectangle', 'circle', 'line', 'arrow'];

export interface EditToolbarProps {
    activeTool: ToolMode;
    setActiveTool: (tool: ToolMode) => void;
    onEnterSelectTool: () => void; // also clears any in-progress text edit
    showToast: (msg: string) => void;

    drawColor: string;
    setDrawColor: (color: string) => void;
    drawSize: number;
    setDrawSize: (size: number) => void;
    fontSize: number;
    setFontSize: (size: number) => void;
    selectedShape: ShapeType;
    setSelectedShape: (shape: ShapeType) => void;
    selectedStamp: StampType;
    setSelectedStamp: (stamp: StampType) => void;

    showColorPicker: boolean;
    setShowColorPicker: (show: boolean) => void;
    showStampPicker: boolean;
    setShowStampPicker: (show: boolean) => void;

    onOpenSignatureModal: () => void;
    onInsertPage: () => void;
    onDeletePage: () => void;
    onRotatePage: (direction: 'cw' | 'ccw') => void;
    onUndo: () => void;
    onRedo: () => void;
    canUndo: boolean;
    canRedo: boolean;
    onClearAnnotations: () => void;
}

export default function EditToolbar(props: EditToolbarProps) {
    const {
        activeTool, setActiveTool, onEnterSelectTool, showToast,
        drawColor, setDrawColor, drawSize, setDrawSize, fontSize, setFontSize,
        selectedShape, setSelectedShape, selectedStamp, setSelectedStamp,
        showColorPicker, setShowColorPicker, showStampPicker, setShowStampPicker,
        onOpenSignatureModal, onInsertPage, onDeletePage, onRotatePage,
        onUndo, onRedo, canUndo, canRedo, onClearAnnotations,
    } = props;

    // P2 item 13 (a11y): the color/stamp pickers close on Escape and on a
    // click outside both the picker panel and its own toggle button (the
    // toggle click bubbles to `document` too, so checking its own ref stops
    // that click from closing the panel it just opened).
    const colorToggleRef = useRef<HTMLButtonElement | null>(null);
    const colorPanelRef = useRef<HTMLDivElement | null>(null);
    const stampToggleRef = useRef<HTMLButtonElement | null>(null);
    const stampPanelRef = useRef<HTMLDivElement | null>(null);
    useEffect(() => {
        if (!showColorPicker && !showStampPicker) return;
        const inside = (ref: React.RefObject<HTMLElement | null>, target: Node) => !!ref.current && ref.current.contains(target);
        const handlePointer = (e: PointerEvent) => {
            const target = e.target as Node;
            if (showColorPicker && !inside(colorToggleRef, target) && !inside(colorPanelRef, target)) setShowColorPicker(false);
            if (showStampPicker && !inside(stampToggleRef, target) && !inside(stampPanelRef, target)) setShowStampPicker(false);
        };
        const handleKey = (e: KeyboardEvent) => {
            if (e.key !== 'Escape') return;
            setShowColorPicker(false);
            setShowStampPicker(false);
        };
        document.addEventListener('pointerdown', handlePointer);
        document.addEventListener('keydown', handleKey);
        return () => {
            document.removeEventListener('pointerdown', handlePointer);
            document.removeEventListener('keydown', handleKey);
        };
    }, [showColorPicker, showStampPicker, setShowColorPicker, setShowStampPicker]);

    return (
        <div className="dv-edit-toolbar">
            <div className="dv-edit-toolbar__group">
                <button className={`dv-edit-btn ${activeTool === 'select' ? 'dv-edit-btn--active' : ''}`}
                    onClick={onEnterSelectTool} title="Select" aria-pressed={activeTool === 'select'}>
                    <span className="dv-edit-btn__icon"><ArrowUp size={14} /></span>
                    <span className="dv-edit-btn__label">Select</span>
                </button>
                <button className={`dv-edit-btn ${activeTool === 'editText' ? 'dv-edit-btn--active' : ''}`}
                    onClick={() => { setActiveTool('editText'); showToast('Click on any text to edit it'); }} title="Edit Existing Text" aria-pressed={activeTool === 'editText'}>
                    <span className="dv-edit-btn__icon"><Pencil size={14} /></span>
                    <span className="dv-edit-btn__label">Edit Text</span>
                </button>
                <button className={`dv-edit-btn ${activeTool === 'text' ? 'dv-edit-btn--active' : ''}`}
                    onClick={() => setActiveTool('text')} title="Add Text" aria-pressed={activeTool === 'text'}>
                    <span className="dv-edit-btn__icon" aria-hidden="true">T</span>
                    <span className="dv-edit-btn__label">Text</span>
                </button>
                <button className={`dv-edit-btn ${activeTool === 'highlight' ? 'dv-edit-btn--active' : ''}`}
                    onClick={() => { setActiveTool('highlight'); setDrawColor('#f59e0b'); }} title="Highlight" aria-pressed={activeTool === 'highlight'}>
                    <span className="dv-edit-btn__icon"><Highlighter size={14} /></span>
                    <span className="dv-edit-btn__label">Highlight</span>
                </button>
                <button className={`dv-edit-btn ${activeTool === 'draw' ? 'dv-edit-btn--active' : ''}`}
                    onClick={() => setActiveTool('draw')} title="Freehand Draw" aria-pressed={activeTool === 'draw'}>
                    <span className="dv-edit-btn__icon"><Pencil size={14} /></span>
                    <span className="dv-edit-btn__label">Draw</span>
                </button>
                <button className={`dv-edit-btn ${activeTool === 'shape' ? 'dv-edit-btn--active' : ''}`}
                    onClick={() => setActiveTool('shape')} title="Shapes" aria-pressed={activeTool === 'shape'}>
                    <span className="dv-edit-btn__icon"><Square size={14} aria-hidden /></span>
                    <span className="dv-edit-btn__label">Shapes</span>
                </button>
            </div>

            <div className="dv-edit-toolbar__divider" />

            <div className="dv-edit-toolbar__group">
                <button className={`dv-edit-btn ${activeTool === 'signature' ? 'dv-edit-btn--active' : ''}`}
                    onClick={onOpenSignatureModal} title="Signature" aria-pressed={activeTool === 'signature'}>
                    <span className="dv-edit-btn__icon"><PenTool size={14} /></span>
                    <span className="dv-edit-btn__label">Sign</span>
                </button>
                <button ref={stampToggleRef} className={`dv-edit-btn ${activeTool === 'stamp' ? 'dv-edit-btn--active' : ''}`}
                    onClick={() => { setActiveTool('stamp'); setShowStampPicker(!showStampPicker); }} title="Stamps"
                    aria-pressed={activeTool === 'stamp'} aria-expanded={showStampPicker} aria-haspopup="true">
                    <span className="dv-edit-btn__icon"><Bookmark size={14} /></span>
                    <span className="dv-edit-btn__label">Stamp</span>
                </button>
            </div>

            <div className="dv-edit-toolbar__divider" />

            <div className="dv-edit-toolbar__group">
                <button className="dv-edit-btn" onClick={onInsertPage} title="Insert Blank Page">
                    <span className="dv-edit-btn__icon"><Plus size={14} aria-hidden /></span>
                    <span className="dv-edit-btn__label">Insert</span>
                </button>
                <button className="dv-edit-btn" onClick={onDeletePage} title="Delete Current Page">
                    <span className="dv-edit-btn__icon"><Trash2 size={14} /></span>
                    <span className="dv-edit-btn__label">Delete</span>
                </button>
                <button className="dv-edit-btn" onClick={() => onRotatePage('cw')} title="Rotate CW">
                    <span className="dv-edit-btn__icon"><RotateCw size={14} aria-hidden /></span>
                    <span className="dv-edit-btn__label">Rotate</span>
                </button>
            </div>

            <div className="dv-edit-toolbar__divider" />

            <div className="dv-edit-toolbar__group">
                <button className="dv-edit-btn" onClick={onUndo} title="Undo (Ctrl+Z)" disabled={!canUndo}>
                    <span className="dv-edit-btn__icon"><Undo2 size={14} aria-hidden /></span>
                    <span className="dv-edit-btn__label">Undo</span>
                </button>
                <button className="dv-edit-btn" onClick={onRedo} title="Redo (Ctrl+Shift+Z)" disabled={!canRedo}>
                    <span className="dv-edit-btn__icon"><Redo2 size={14} aria-hidden /></span>
                    <span className="dv-edit-btn__label">Redo</span>
                </button>
                <button className="dv-edit-btn" onClick={onClearAnnotations} title="Clear Annotations">
                    <span className="dv-edit-btn__icon"><Eraser size={14} /></span>
                    <span className="dv-edit-btn__label">Clear</span>
                </button>
            </div>

            {(activeTool === 'text' || activeTool === 'draw' || activeTool === 'highlight' || activeTool === 'shape') && (
                <div className="dv-edit-toolbar__group dv-color-group">
                    <div className="dv-edit-toolbar__divider" />
                    <button ref={colorToggleRef} className="dv-edit-btn dv-color-toggle"
                        onClick={() => setShowColorPicker(!showColorPicker)}
                        title="Color" aria-label="Color" aria-expanded={showColorPicker} aria-haspopup="true">
                        <span className="dv-color-swatch" style={{ background: drawColor }} />
                    </button>
                    {showColorPicker && (
                        <div className="dv-color-picker" ref={colorPanelRef}>
                            {COLORS.map(c => (
                                <button key={c}
                                    className={`dv-color-picker__item ${drawColor === c ? 'dv-color-picker__item--active' : ''}`}
                                    style={{ background: c }}
                                    aria-label={COLOR_NAMES[c] ?? c}
                                    aria-pressed={drawColor === c}
                                    onClick={() => { setDrawColor(c); setShowColorPicker(false); }}
                                />
                            ))}
                        </div>
                    )}
                </div>
            )}

            {(activeTool === 'draw' || activeTool === 'shape') && (
                <div className="dv-edit-toolbar__group">
                    <input type="range" min="1" max="12" value={drawSize}
                        onChange={e => setDrawSize(parseInt(e.target.value))}
                        className="dv-size-slider" title={`Size: ${drawSize}`} aria-label={`Draw size: ${drawSize}`} />
                </div>
            )}

            {activeTool === 'text' && (
                <div className="dv-edit-toolbar__group">
                    <input type="number" min="8" max="72" value={fontSize}
                        onChange={e => setFontSize(parseInt(e.target.value) || 16)}
                        className="dv-font-size-input" title="Font size" aria-label="Font size" />
                </div>
            )}

            {activeTool === 'shape' && (
                <div className="dv-edit-toolbar__group dv-shape-group">
                    <div className="dv-edit-toolbar__divider" />
                    {SHAPES.map(s => (
                        <button key={s}
                            className={`dv-edit-btn dv-edit-btn--small ${selectedShape === s ? 'dv-edit-btn--active' : ''}`}
                            onClick={() => setSelectedShape(s)} title={s} aria-label={s} aria-pressed={selectedShape === s}>
                            <span className="dv-edit-btn__icon">
                                {s === 'rectangle' ? <Square size={14} aria-hidden /> : s === 'circle' ? <Circle size={14} aria-hidden /> : s === 'line' ? <Minus size={14} aria-hidden /> : <ArrowRight size={14} aria-hidden />}
                            </span>
                        </button>
                    ))}
                </div>
            )}

            {showStampPicker && activeTool === 'stamp' && (
                <div className="dv-stamp-picker" ref={stampPanelRef}>
                    {(Object.keys(STAMP_COLORS) as StampType[]).map(s => (
                        <button key={s}
                            className={`dv-stamp-picker__item ${selectedStamp === s ? 'dv-stamp-picker__item--active' : ''}`}
                            style={{ borderColor: STAMP_COLORS[s], color: STAMP_COLORS[s] }}
                            aria-pressed={selectedStamp === s}
                            onClick={() => { setSelectedStamp(s); setShowStampPicker(false); }}>
                            {s}
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}
