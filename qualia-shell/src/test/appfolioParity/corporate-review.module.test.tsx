/**
 * AppFolio parity render-layer test — CorporateReview GR-13 retrofit (Task 3.8)
 *
 * Sibling to fixture-only `corporate-review.test.ts` (Task 3.8 commit B
 * + the static-handler exercise). This file exercises the GR-13 retrofit's
 * render layer landed in commit C: ErrorBoundary mount, fallback rendering,
 * and isStaticMode write-skip semantics across BOTH new write paths
 * (`strataPost` for sub-actions + `strataUpload` for multipart). Closes
 * plan v2 §15 L491 GR-13 unit-test mandate (corrected wording bundled in
 * Task 3.8 commit F per PRE0-4 (ii)).
 *
 * Source of truth: CorporateReview.tsx commit `1a7a913` (Task 3.8 commit C);
 * ErrorBoundary.tsx semantics; ErrorBoundary.test.tsx vi.mock precedent;
 * Task 3.7 projects.module.test.tsx mock-state-hoist + lucide-render-throw
 * pattern (line-for-line precedent except `FolderKanban` → `FileText`).
 *
 * Two PRE-WRITE bug carryovers from Task 3.7's BUGs 1+2 (both still apply):
 *   BUG 1 — Mocking strataGet to throw won't trigger ErrorBoundary because
 *           fetchDocs's catch (CorporateReview.tsx:62-72) swallows fetch
 *           errors and renders empty list. Fix: render-time throw via
 *           mocked `lucide-react` `FileText` (rendered unconditionally
 *           inside the empty-state branch at L274 + inside each card's
 *           first-row at L286 — both paths fire FileText, so the
 *           empty-state pre-effect render is sufficient since `docs` is
 *           [] before useEffect resolves). Wraps the real component via
 *           JSX (React.createElement-style) so non-throw tests render
 *           normally — direct-call invocation of a forwardRef component
 *           triggers a TypeError that the boundary swallows as a generic
 *           fallback (BUG 3 from Task 3.7 carryover).
 *   BUG 2 — Spying on Sentry.addBreadcrumb for the ErrorBoundary path
 *           fails because the boundary calls reportError → Sentry.
 *           captureException (NOT addBreadcrumb). Mocked
 *           `services/errorReporter` per ErrorBoundary.test.tsx:14-17
 *           precedent. The plan v2 §15 wording correction is bundled
 *           in Task 3.8 commit F (per PRE0-4 (ii)).
 *
 * Test #3's Sentry.addBreadcrumb spy is correct as-is — both submitWrite
 * and handleUpload call Sentry.addBreadcrumb directly on the static-mode
 * branches.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const mocks = vi.hoisted(() => ({
    isStaticMode: { value: false },
    fileTextShouldThrow: { value: false },
    strataGet: vi.fn(),
    strataPost: vi.fn(),
    strataUpload: vi.fn(),
    addBreadcrumb: vi.fn(),
    reportError: vi.fn(),
}));

vi.mock('../../components/StrataDashboard/strataApi', () => ({
    strataGet: mocks.strataGet,
    strataPost: mocks.strataPost,
    strataUpload: mocks.strataUpload,
    get isStaticMode() { return mocks.isStaticMode.value; },
}));

vi.mock('../../services/sentry', () => ({
    Sentry: { addBreadcrumb: mocks.addBreadcrumb },
    isEnabled: () => false,
}));

vi.mock('../../services/errorReporter', () => ({
    reportError: mocks.reportError,
}));

vi.mock('lucide-react', async (importOriginal) => {
    const actual = await importOriginal<typeof import('lucide-react')>();
    const RealFileText = actual.FileText as any;
    return {
        ...actual,
        FileText: (props: any) => {
            if (mocks.fileTextShouldThrow.value) {
                throw new Error('synthetic-render-throw — Task 3.8 ErrorBoundary fallback test');
            }
            return <RealFileText {...props} />;
        },
    };
});

import CorporateReview from '../../components/StrataDashboard/modules/CorporateReview';

// One pending doc so the triage-high action button surfaces on expand.
// Status 'pending' is required for the Triage cluster to render
// (CorporateReview.tsx:309-330) — approve/reject also surface for
// pending/triaged, but triage-high is the test target for the
// strataPost-skip assertion.
const ONE_PENDING_DOC = [{
    id: 'doc-render-test-3-8-pending-01',
    filename: 'test-render-pending.pdf',
    uploadedBy: 'andy@dwellium.test',
    status: 'pending',
    priority: 'medium',
    category: 'Invoice',
    notes: 'Render-test fixture for Task 3.8 commit D.',
    workitemId: null,
    createdAt: '2026-04-25T00:00:00.000Z',
    updatedAt: '2026-04-25T00:00:00.000Z',
}] as any;

describe('corporate review parity — Task 3.8 GR-13 retrofit (render layer)', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.isStaticMode.value = false;
        mocks.fileTextShouldThrow.value = false;
        mocks.strataGet.mockResolvedValue([]);
        mocks.strataPost.mockResolvedValue({});
        mocks.strataUpload.mockResolvedValue({});
        // Suppress React's error-boundary console.error noise (mirror
        // Task 3.7 + ErrorBoundary.test.tsx:31 pattern).
        vi.spyOn(console, 'error').mockImplementation(() => {});
    });

    // ── 1. Mount + ErrorBoundary wrap + module-load breadcrumb ─────────
    it('mounts inside ErrorBoundary; renders corporate-review-module testid root + emits corporate-review.module.loaded breadcrumb', async () => {
        render(<CorporateReview />);

        const root = await screen.findByTestId('corporate-review-module');
        expect(root).toBeInTheDocument();

        // Module-load breadcrumb fires from useEffect (CorporateReview.tsx:79-85)
        // after first render. data carries the live isStaticMode value.
        await waitFor(() => {
            expect(mocks.addBreadcrumb).toHaveBeenCalledWith(
                expect.objectContaining({
                    category: 'ui.load',
                    message: 'corporate-review.module.loaded',
                    level: 'info',
                    data: { staticMode: false },
                })
            );
        });

        // Negative: no write actions on a clean mount.
        expect(mocks.strataPost).not.toHaveBeenCalled();
        expect(mocks.strataUpload).not.toHaveBeenCalled();
        // Negative: ErrorBoundary not triggered → reportError untouched.
        expect(mocks.reportError).not.toHaveBeenCalled();
    });

    // ── 2. ErrorBoundary fallback contract ─────────────────────────────
    it('ErrorBoundary fallback renders "Corporate Review module unavailable." when an inner component throws at render time; reportError fires with the ErrorBoundary tag', async () => {
        // BUG 1 fix — synthetic render-time throw via mocked FileText. With
        // strataGet defaulted to [] in beforeEach, fetchDocs resolves to []
        // → empty-state branch renders FileText at L274 unconditionally.
        // Card-row FileText at L286 also renders the same component for
        // any populated docs, but the empty-state fires first (pre-
        // useEffect resolution) and is sufficient.
        mocks.fileTextShouldThrow.value = true;

        render(<CorporateReview />);

        // Fallback contract: literal text from commit C wrapper — must
        // match SentimentModule + ProjectsModule fallback shape line for
        // line per DoR (b).
        expect(await screen.findByText('Corporate Review module unavailable.')).toBeInTheDocument();

        // The Inner component threw before its root mounted → testid not in DOM.
        expect(screen.queryByTestId('corporate-review-module')).not.toBeInTheDocument();

        // BUG 2 fix — ErrorBoundary.componentDidCatch calls reportError(
        // error, 'ErrorBoundary', { componentStack }), NOT Sentry.
        // addBreadcrumb. Plan v2 §15 wording correction bundled in
        // Task 3.8 commit F.
        await waitFor(() => {
            expect(mocks.reportError).toHaveBeenCalledWith(
                expect.any(Error),
                'ErrorBoundary',
                expect.objectContaining({ componentStack: expect.any(String) })
            );
        });
    });

    // ── 3. isStaticMode write-guard across BOTH paths (strataPost + strataUpload)
    it('isStaticMode === true skips strataPost (triage path) AND strataUpload (multipart path); banner surfaces; submit.skipped + upload.skipped breadcrumbs fire', async () => {
        mocks.isStaticMode.value = true;
        mocks.strataGet.mockImplementation(async (path: string) =>
            path === '/corporate-review' ? ONE_PENDING_DOC : []
        );

        render(<CorporateReview />);

        const user = userEvent.setup();

        // ── (A) strataUpload skip path — multipart upload guard ────────
        // Open the upload modal via the top-level upload trigger button.
        await user.click(await screen.findByTestId('corporate-review-upload-btn'));

        // Inject a synthetic File into the file input. The modal-internal
        // file input has no testid (per DoR (d) — testids cover module
        // surface, not the upload form internals); querySelector by type
        // is the canonical fallback.
        const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
        expect(fileInput).toBeTruthy();
        const syntheticFile = new File(['render-test-content'], 'render-test.pdf', { type: 'application/pdf' });
        await user.upload(fileInput, syntheticFile);

        // Modal-internal "Upload" button — distinct from the trigger
        // button whose accessible name reads "Upload Document". Match
        // the exact-text submit button.
        const modalUploadBtn = screen.getByRole('button', { name: /^upload$/i });
        await user.click(modalUploadBtn);

        // (a1) strataUpload NOT called — handleUpload's isStaticMode
        // early-return at CorporateReview.tsx:97-110 short-circuits.
        expect(mocks.strataUpload).not.toHaveBeenCalled();
        // (a2) Banner surfaces with the upload-specific message.
        expect(await screen.findByText(/upload requires backend mode/i)).toBeInTheDocument();
        // (a3) upload.skipped breadcrumb received.
        expect(mocks.addBreadcrumb).toHaveBeenCalledWith(
            expect.objectContaining({
                category: 'ui.submit',
                message: 'corporate-review.upload.skipped',
                level: 'info',
                data: expect.objectContaining({
                    filename: 'render-test.pdf',
                    category: 'Invoice',
                    priority: 'medium',
                }),
            })
        );

        // ── (B) strataPost skip path — triage sub-action guard ─────────
        // Modal auto-closes via the static-mode early-return (
        // CorporateReview.tsx:104-106 sets showUpload=false). Now click
        // the pending card to expand and surface the triage cluster.
        const card = await screen.findByTestId(`corporate-review-card-${ONE_PENDING_DOC[0].id}`);
        await user.click(within(card).getByText(ONE_PENDING_DOC[0].filename));

        const triageHighBtn = await screen.findByTestId(
            `corporate-review-action-triage-high-${ONE_PENDING_DOC[0].id}`
        );
        await user.click(triageHighBtn);

        // (b1) strataPost NOT called — submitWrite's isStaticMode early-
        // return at CorporateReview.tsx:140-153 short-circuits.
        expect(mocks.strataPost).not.toHaveBeenCalled();
        // (b2) Banner now reads the triage-specific message (sticky-until-
        // replaced semantics — the upload message was overwritten).
        expect(await screen.findByText(/triage requires backend mode/i)).toBeInTheDocument();
        // (b3) submit.skipped breadcrumb received with action: 'triage'.
        // Note: the action data field is normalized via .toLowerCase().
        // replace(' ', '-') so 'Triage' → 'triage' (single word, no
        // hyphenation).
        expect(mocks.addBreadcrumb).toHaveBeenCalledWith(
            expect.objectContaining({
                category: 'ui.submit',
                message: 'corporate-review.submit.skipped',
                level: 'info',
                data: expect.objectContaining({
                    docId: ONE_PENDING_DOC[0].id,
                    action: 'triage',
                }),
            })
        );

        // ── (C) Negative: no .sent breadcrumbs fired across BOTH paths.
        // Either fan-out would indicate the static-mode guard short-
        // circuited too late (or not at all). Sentry.addBreadcrumb is
        // also called by the module-load path (test #1 covers); we
        // filter for the .sent variants here.
        const sentCalls = mocks.addBreadcrumb.mock.calls.filter(([arg]) =>
            arg?.message === 'corporate-review.upload.sent' ||
            arg?.message === 'corporate-review.submit.sent'
        );
        expect(sentCalls).toHaveLength(0);
    });
});
