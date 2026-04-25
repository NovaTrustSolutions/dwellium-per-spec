/**
 * AppFolio parity render-layer test — ProjectsModule GR-13 retrofit (Task 3.7)
 *
 * Sibling to fixture-only `projects.test.ts` (Task 2.9; preserved frozen).
 * This file exercises the GR-13 retrofit's render layer landed in commit C
 * (`59b84c1`): ErrorBoundary mount, fallback rendering, and isStaticMode
 * write-skip semantics. Closes plan v2 §15 L491 GR-13 unit-test mandate
 * that Task 2.8 SentimentModule elided.
 *
 * Source of truth: ProjectsModule.tsx commit `59b84c1` (Task 3.7 commit C);
 * ErrorBoundary.tsx semantics; ErrorBoundary.test.tsx vi.mock precedent.
 *
 * §7 follow-up — plan v2 §15 L491 wording mismatch (BUG 2 surface):
 * §15 says "Unit test … asserts that a Sentry breadcrumb was emitted",
 * but actual ErrorBoundary.componentDidCatch (`ErrorBoundary.tsx:64-68`)
 * calls `reportError(error, 'ErrorBoundary', { componentStack })` →
 * `services/errorReporter.ts` → `Sentry.captureException` (NOT
 * `Sentry.addBreadcrumb`). Test #2 below follows actual semantics; the
 * §15 wording correction is logged for Phase-3 v2.12 follow-up
 * (recommended option (i) — update §15 wording, keep ErrorBoundary
 * scope minimal). See completion report §7 entry to be written at
 * Task 3.7 closure.
 *
 * Two PRE-WRITE bugs caught in DoR D, both surfaced before write:
 *   BUG 1 — Mocking `strataGet` to throw won't trigger ErrorBoundary
 *           because `fetchProjects`'s catch (ProjectsModule.tsx:60-70)
 *           swallows fetch errors and renders ErrorState. Fix: throw
 *           at render time inside `FolderKanban` (rendered unconditionally
 *           at L348 in the module header h2) via `vi.mock('lucide-react')`.
 *           The header throw is BEFORE useEffect runs, so ErrorBoundary
 *           catches it cleanly.
 *   BUG 2 — Spying on `Sentry.addBreadcrumb` for the ErrorBoundary path
 *           fails because the boundary calls `reportError` (see §7 note
 *           above). Fix: mock `services/errorReporter` and assert on
 *           `reportError` instead — matches `ErrorBoundary.test.tsx:14-17`
 *           precedent.
 *
 * Test #3's `Sentry.addBreadcrumb` spy is correct as-is — `toggleStatus`
 * calls `Sentry.addBreadcrumb` directly (ProjectsModule.tsx:97-103,107-113).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// Hoisted mock state — shared across all tests in this file. Per-test
// flips happen in beforeEach + at the top of each it-block. Using
// `vi.hoisted` ensures the factory runs before module imports are
// resolved, which vi.mock requires.
const mocks = vi.hoisted(() => ({
    isStaticMode: { value: false },
    folderKanbanShouldThrow: { value: false },
    strataGet: vi.fn(),
    strataPost: vi.fn(),
    strataPut: vi.fn(),
    addBreadcrumb: vi.fn(),
    reportError: vi.fn(),
}));

// strataApi — ProjectsModule reads `isStaticMode` as a named import; ES
// module live-bindings under Vite preserve property reads, so the getter
// is re-evaluated on each read. This lets per-test mutation of
// mocks.isStaticMode.value flow through to ProjectsModule's two read
// sites (ProjectsModule.tsx:82 + L94).
vi.mock('../../components/StrataDashboard/strataApi', () => ({
    strataGet: mocks.strataGet,
    strataPost: mocks.strataPost,
    strataPut: mocks.strataPut,
    get isStaticMode() { return mocks.isStaticMode.value; },
}));

// Sentry — both ProjectsModule.tsx (addBreadcrumb call sites) and
// ErrorBoundary.tsx (Sentry.ErrorBoundary delegation, only when
// isEnabled returns true) import from this module. We force isEnabled
// false so the boundary's custom-class branch fires and our `fallback`
// prop (ProjectsModule.tsx:495) renders directly.
vi.mock('../../services/sentry', () => ({
    Sentry: { addBreadcrumb: mocks.addBreadcrumb },
    isEnabled: () => false,
}));

// errorReporter — ErrorBoundary.componentDidCatch calls reportError on
// every catch. Mocked per ErrorBoundary.test.tsx precedent.
vi.mock('../../services/errorReporter', () => ({
    reportError: mocks.reportError,
}));

// lucide-react — render-time throw for ErrorBoundary fallback test (BUG 1
// fix). Wraps the real `FolderKanban` so non-throw tests still render
// normally; only test #2 sets `mocks.folderKanbanShouldThrow.value = true`.
// NOTE: lucide-react icons are React.forwardRef components — must be
// rendered via JSX (React.createElement), NOT invoked as plain functions.
// Calling `actual.FolderKanban(props)` directly throws TypeError on a
// ForwardRefExoticComponent and the boundary swallows it as a generic
// fallback (caught in dev: this surfaced tests #1 and #3 as false fails
// before the JSX wrap landed).
vi.mock('lucide-react', async (importOriginal) => {
    const actual = await importOriginal<typeof import('lucide-react')>();
    const RealFolderKanban = actual.FolderKanban as any;
    return {
        ...actual,
        FolderKanban: (props: any) => {
            if (mocks.folderKanbanShouldThrow.value) {
                throw new Error('synthetic-render-throw — Task 3.7 ErrorBoundary fallback test');
            }
            return <RealFolderKanban {...props} />;
        },
    };
});

// Imports must come AFTER vi.mock declarations. ProjectsModule pulls
// the mocked strataApi, sentry, and lucide-react via its imports.
import ProjectsModule from '../../components/StrataDashboard/modules/ProjectsModule';

// Synthetic 1-row workitem for test #3 (toggle-skipped path). Cast via
// `as any` follows the projects.test.ts precedent for fixture casting.
// `propertyId: null` lands the row in the "Unassigned / General" group
// per ProjectsModule.tsx:87-89; status: 'open' → isActive=true → toggle
// button text "Mark Inactive" per ProjectsModule.tsx:230.
const ONE_OPEN_WORKITEM = [{
    id: 'wi-test-3-7-render-1',
    title: 'Render-test workitem',
    description: 'Synthetic render-test fixture for Task 3.7 commit D.',
    tags: ['render-test'],
    domain: 'maintenance',
    status: 'open',
    priority: 'medium',
    metadata: {},
    createdAt: '2026-04-25T00:00:00Z',
    updatedAt: '2026-04-25T00:00:00Z',
    type: 'work_order',
    propertyId: null,
    unitId: null,
    assignedTo: null,
}] as any;

describe('projects parity — Task 3.7 GR-13 retrofit (render layer)', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.isStaticMode.value = false;
        mocks.folderKanbanShouldThrow.value = false;
        mocks.strataGet.mockResolvedValue([]);
        // Suppress React's error-boundary console.error noise (mirror
        // ErrorBoundary.test.tsx:31 pattern).
        vi.spyOn(console, 'error').mockImplementation(() => {});
    });

    // ── 1. Mount + ErrorBoundary wrap + module-load breadcrumb ─────────
    it('mounts inside ErrorBoundary; renders projects-module testid root + emits projects.module.loaded breadcrumb', async () => {
        render(<ProjectsModule />);

        // Render-layer assertion: the testid root from commit C (L344) is
        // reachable. fetchProjects resolves to [] → empty-state branch
        // renders, but the root <div data-testid="projects-module"> is
        // outside the conditional.
        const root = await screen.findByTestId('projects-module');
        expect(root).toBeInTheDocument();

        // Module-load breadcrumb fires from useEffect (ProjectsModule.tsx:78-84)
        // after first render. data carries the live isStaticMode value.
        await waitFor(() => {
            expect(mocks.addBreadcrumb).toHaveBeenCalledWith(
                expect.objectContaining({
                    category: 'ui.load',
                    message: 'projects.module.loaded',
                    level: 'info',
                    data: { staticMode: false },
                })
            );
        });

        // Negative: no write actions on a clean mount.
        expect(mocks.strataPut).not.toHaveBeenCalled();
        // Negative: ErrorBoundary not triggered → reportError untouched.
        expect(mocks.reportError).not.toHaveBeenCalled();
    });

    // ── 2. ErrorBoundary fallback contract ─────────────────────────────
    it('ErrorBoundary fallback renders "Projects module unavailable." when an inner component throws at render time; reportError fires with the ErrorBoundary tag', async () => {
        // BUG 1 fix — synthetic render-time throw via mocked FolderKanban
        // (rendered unconditionally at ProjectsModule.tsx:348 inside the
        // module header h2). fetchProjects's try/catch can NOT intercept a
        // header-component render error — only the ErrorBoundary at the
        // module's default export catches it (ProjectsModule.tsx:493-499).
        mocks.folderKanbanShouldThrow.value = true;

        render(<ProjectsModule />);

        // Fallback contract: literal text from commit C (ProjectsModule.tsx:495)
        // — must match SentimentModule's "Sentiment module unavailable." shape
        // (line-for-line analogue per DoR (b)).
        expect(await screen.findByText('Projects module unavailable.')).toBeInTheDocument();

        // The Inner component threw before its root mounted → testid not in DOM.
        expect(screen.queryByTestId('projects-module')).not.toBeInTheDocument();

        // BUG 2 fix — ErrorBoundary.componentDidCatch (ErrorBoundary.tsx:64-68)
        // calls reportError(error, 'ErrorBoundary', { componentStack }), NOT
        // Sentry.addBreadcrumb. Plan v2 §15 L491 wording vs. actual semantics
        // is documented as a §7 follow-up (Phase-3 v2.12 wording correction).
        await waitFor(() => {
            expect(mocks.reportError).toHaveBeenCalledWith(
                expect.any(Error),
                'ErrorBoundary',
                expect.objectContaining({ componentStack: expect.any(String) })
            );
        });
    });

    // ── 3. isStaticMode write-guard + Sentry breadcrumb ─────────────────
    it('isStaticMode === true skips strataPut and surfaces the read-only banner; Sentry.addBreadcrumb fires with projects.status.toggle.skipped', async () => {
        mocks.isStaticMode.value = true;
        mocks.strataGet.mockImplementation(async (path: string) =>
            path === '/workitems' ? ONE_OPEN_WORKITEM : []
        );

        render(<ProjectsModule />);

        // Wait for the synthetic card to render. Card root carries the
        // testid template projects-card-${wi.id} from commit C (L201).
        const card = await screen.findByTestId('projects-card-wi-test-3-7-render-1');

        const user = userEvent.setup();
        // The testid is on the OUTER wrapper (ProjectsModule.tsx:148) which
        // has no onClick; the expand handler lives on the INNER clickable
        // div (L156). Click events bubble UP, not down — clicking the
        // outer wrapper directly does NOT trigger expand. Click a descendant
        // inside the clickable inner div (the title text is deterministic
        // from our synthetic fixture) so the click bubbles through the
        // inner div's onClick handler.
        await user.click(within(card).getByText('Render-test workitem'));
        // "Mark Inactive" button appears in expanded body (L218-231); text
        // selected because wi.status='open' → isActive=true → label
        // "Mark Inactive" per L230.
        const toggleBtn = await screen.findByRole('button', { name: /mark inactive/i });
        await user.click(toggleBtn);

        // (a) strataPut NOT called — isStaticMode early-return at
        // ProjectsModule.tsx:94-105 short-circuits the write path.
        expect(mocks.strataPut).not.toHaveBeenCalled();

        // (b) Read-only banner surfaces with the message text from L95.
        expect(await screen.findByText(/static deck is read-only/i)).toBeInTheDocument();

        // (c) Sentry.addBreadcrumb received the toggle.skipped payload from
        // ProjectsModule.tsx:97-103. Note: addBreadcrumb is also called by
        // the module-load path; toHaveBeenCalledWith allows multiple matches,
        // so we assert presence here and absence of toggle.sent below.
        expect(mocks.addBreadcrumb).toHaveBeenCalledWith(
            expect.objectContaining({
                category: 'ui.submit',
                message: 'projects.status.toggle.skipped',
                level: 'info',
                data: expect.objectContaining({
                    workitemId: 'wi-test-3-7-render-1',
                    attemptedStatus: 'completed',
                }),
            })
        );

        // (d) The "sent" breadcrumb must NOT have fired — write-path was
        // short-circuited cleanly.
        const sentCalls = mocks.addBreadcrumb.mock.calls.filter(
            ([arg]) => arg?.message === 'projects.status.toggle.sent'
        );
        expect(sentCalls).toHaveLength(0);
    });
});
