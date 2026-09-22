/**
 * DocViewer — page thumbnail rail (P2 item 11 module split).
 * Presentational: no state of its own, explicit props only.
 */
export interface PageSidebarProps {
    totalPages: number;
    currentPage: number;
    onGoToPage: (page: number) => void;
    onInsertPage: () => void;
}

export default function PageSidebar({ totalPages, currentPage, onGoToPage, onInsertPage }: PageSidebarProps) {
    if (totalPages <= 0) return null;
    return (
        <div className="dv-nav">
            {Array.from({ length: totalPages }, (_, i) => (
                <div key={i + 1}
                    className={`dv-nav__thumb ${currentPage === i + 1 ? 'dv-nav__thumb--active' : ''}`}
                    onClick={() => onGoToPage(i + 1)}>
                    p.{i + 1}
                </div>
            ))}
            <button className="dv-nav__add-page" onClick={onInsertPage} title="Insert blank page">
                +
            </button>
        </div>
    );
}
