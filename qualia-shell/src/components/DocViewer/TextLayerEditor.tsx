/**
 * DocViewer — the editText-mode text layer (per-item click targets + the
 * inline single-line editor) (P2 item 11 module split). Presentational:
 * explicit props only; commit/cancel/keydown logic stays in DocViewer since
 * it also drives pdf-lib bake + undo history.
 */
import { useEffect, useRef } from 'react';
import type { TextItem, TextEdit } from './docViewerTypes';

export interface TextLayerEditorProps {
    width: number;
    height: number;
    textItems: TextItem[];
    editingTextItem: TextItem | null;
    editedText: string;
    setEditedText: (text: string) => void;
    currentPage: number;
    textEdits: TextEdit[];
    onTextItemClick: (item: TextItem) => void;
    onCommitTextEdit: () => void;
    onKeyDown: (e: React.KeyboardEvent) => void;
}

export default function TextLayerEditor(props: TextLayerEditorProps) {
    const {
        width, height, textItems, editingTextItem, editedText, setEditedText,
        currentPage, textEdits, onTextItemClick, onCommitTextEdit, onKeyDown,
    } = props;

    // P2 item 13 (a11y): focus the editor input via a ref, not the
    // `autoFocus` prop (eslint's jsx-a11y/no-autofocus forbids it) — fires
    // whenever a NEW text item starts being edited.
    const editorInputRef = useRef<HTMLInputElement | null>(null);
    useEffect(() => {
        if (editingTextItem) editorInputRef.current?.focus();
    }, [editingTextItem]);

    return (
        <div className="dv-text-layer" style={{ width, height }}>
            {textItems.map((item, idx) => (
                // P2 item 13 (a11y): a real <button>, not a <span> with a
                // click handler — keyboard-reachable, and the (invisible,
                // color: transparent) text content alone isn't a useful name,
                // so it gets an explicit aria-label too.
                <button
                    type="button"
                    key={`text-${item.itemIndex}-${idx}`}
                    className={`dv-text-item ${editingTextItem?.itemIndex === item.itemIndex ? 'dv-text-item--editing' : ''
                        } ${textEdits.some(e => e.pageNum === currentPage && e.itemIndex === item.itemIndex) ? 'dv-text-item--edited' : ''
                        }`}
                    style={{
                        left: `${item.x}px`,
                        top: `${item.y}px`,
                        width: `${item.width}px`,
                        height: `${item.height}px`,
                        fontSize: `${item.height * 0.85}px`,
                    }}
                    onClick={() => onTextItemClick(item)}
                    aria-label={`Edit text: "${item.str}"`}
                    title={`Click to edit: "${item.str}"`}
                >
                    {item.str}
                </button>
            ))}

            {editingTextItem && (
                <div className="dv-text-editor-container" style={{
                    left: `${editingTextItem.x}px`,
                    top: `${editingTextItem.y - 4}px`,
                }}>
                    <input
                        ref={editorInputRef}
                        className="dv-text-editor-input"
                        type="text"
                        value={editedText}
                        onChange={e => setEditedText(e.target.value)}
                        onKeyDown={onKeyDown}
                        onBlur={onCommitTextEdit}
                        aria-label="Edit page text"
                        style={{
                            fontSize: `${editingTextItem.height * 0.85}px`,
                            minWidth: `${Math.max(editingTextItem.width, 120)}px`,
                        }}
                    />
                    <div className="dv-text-editor-hint">
                        Enter to save · Esc to cancel
                    </div>
                </div>
            )}
        </div>
    );
}
