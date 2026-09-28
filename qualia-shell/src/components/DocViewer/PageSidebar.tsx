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
            {Array.from({ length: totalPages }, (_, i) => {
                const page = i + 1;
                const active = currentPage === page;
                return (
                    // P2 item 13 (a11y): real <button>s — focusable, Enter/Space
                    // activate them natively, aria-current marks the open page.
                    <button key={page} type="button" data-page={page}
                        className={`dv-nav__thumb ${active ? 'dv-nav__thumb--active' : ''}`}
                        aria-current={active ? 'true' : undefined}
                        aria-label={`Page ${page}`}
                        onClick={() => onGoToPage(page)}>
                        p.{page}
                    </button>
                );
            })}
            <button type="button" className="dv-nav__add-page" onClick={onInsertPage}
                aria-label="Insert blank page after current page" title="Insert blank page">
                +
            </button>
        </div>
    );
}
