/**
 * DocViewer — the editText-mode text layer (per-item click targets + the
 * inline single-line editor) (P2 item 11 module split). Presentational:
 * explicit props only; commit/cancel/keydown logic stays in DocViewer since
 * it also drives pdf-lib bake + undo history.
 */
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

    return (
        <div className="dv-text-layer" style={{ width, height }}>
            {textItems.map((item, idx) => (
                <span
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
                    title={`Click to edit: "${item.str}"`}
                >
                    {item.str}
                </span>
            ))}

            {editingTextItem && (
                <div className="dv-text-editor-container" style={{
                    left: `${editingTextItem.x}px`,
                    top: `${editingTextItem.y - 4}px`,
                }}>
                    <input
                        className="dv-text-editor-input"
                        type="text"
                        value={editedText}
                        onChange={e => setEditedText(e.target.value)}
                        onKeyDown={onKeyDown}
                        onBlur={onCommitTextEdit}
                        autoFocus
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
