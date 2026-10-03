/**
 * Accessible-name contract for the Trello Board widget (plan 078 Phase 1).
 * The component, its tests and the standalone harness all import from here, so
 * a renamed control fails a test instead of silently breaking a screen reader.
 */
export const TRELLO_A11Y = {
    boardSelect: 'Trello board',                 // aria-label on the board <select>
    refresh: 'Refresh board',                    // aria-label on the refresh button
    addCard: 'Add',                              // visible text of the submit button in the add-card form
    cancelAdd: 'Cancel',                         // aria-label on the cancel button
    addCardOpen: '+ Add a card',                 // visible text of the per-list opener
    closeDetail: 'Close card details',           // aria-label on the dialog close button
    moveTo: 'Move to list',                      // aria-label on the keyboard move <select> in the detail dialog
    openInTrello: 'Open in Trello',              // link text (↗ is decorative)
    retry: 'Retry',                              // visible text; refetches, never reloads the page
    loadingBoards: 'Connecting to Trello…',
    loadingCard: 'Loading card…',
    detailOverlayClass: 'trello-detail-overlay', // clicking the overlay closes the dialog
    cardClass: 'trello-card',                    // the <button> for a card carries this class
    columnClass: 'trello-column',
} as const;

/** Card button accessible name: the card title (labels and due date are decorative). */
export const cardButtonName = (title: string): string => title;
