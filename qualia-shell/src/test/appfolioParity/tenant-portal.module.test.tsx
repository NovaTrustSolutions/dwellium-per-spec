/**
 * AppFolio parity render-layer test — TenantPortal GR-13 retrofit (Task 3.9)
 *
 * Sibling to fixture-only `tenant-portal.test.ts` (Task 3.9 commit B
 * + the static-handler exercise for the 3 derived endpoints). This
 * file exercises the GR-13 retrofit's render layer landed in commit
 * C: ErrorBoundary mount, fallback rendering, and isStaticMode
 * write-skip semantics on the SINGLE message-send POST path. Closes
 * plan v2 §15 L491 GR-13 unit-test mandate at the render layer
 * (corrected wording bundled in Task 3.8 commit F per PRE0-4 (ii);
 * Task 3.9 inherits the corrected mandate).
 *
 * Source of truth: TenantPortalModule.tsx commit `2dd71d8` (Task 3.9
 * commit C); ErrorBoundary.tsx semantics; ErrorBoundary.test.tsx
 * vi.mock precedent; Tasks 3.7 + 3.8 module.test.tsx mock-state-hoist
 * + lucide-render-throw pattern (line-for-line precedent except
 * `FolderKanban` / `FileText` → `Users`).
 *
 * Two PRE-WRITE bug carryovers from Tasks 3.7 + 3.8 BUGs 1+2 (both
 * still apply — same forwardRef + reportError semantics):
 *   BUG 1 — Mocking strataGet to throw won't trigger ErrorBoundary
 *           because fetchTabData's catch (TenantPortalModule.tsx —
 *           search for `tenant-portal.fetch.error`) swallows fetch
 *           errors and renders empty list. Fix: render-time throw
 *           via mocked `lucide-react` `Users` (rendered
 *           unconditionally inside the gradient header h2 path —
 *           actually the header has no Users icon, but the
 *           DirectoryTab renders <Users size={32}/> in the empty-
 *           state at L283 AND the KpiRow's first card uses Users
 *           icon at L274; both render before useEffect resolves
 *           since fetchStats/fetchTabData kick off the network call
 *           and the empty `data` state is the initial render).
 *           Wraps the real component via JSX so non-throw tests
 *           render normally.
 *   BUG 2 — Spying on Sentry.addBreadcrumb for the ErrorBoundary
 *           path fails because the boundary calls reportError →
 *           Sentry.captureException (NOT addBreadcrumb). Mocked
 *           `services/errorReporter` per ErrorBoundary.test.tsx
 *           precedent.
 *
 * Test #3's Sentry.addBreadcrumb spy is correct as-is — sendReply
 * calls Sentry.addBreadcrumb directly on the static-mode branch.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const mocks = vi.hoisted(() => ({
    isStaticMode: { value: false },
    usersShouldThrow: { value: false },
    strataGet: vi.fn(),
    strataPost: vi.fn(),
    addBreadcrumb: vi.fn(),
    reportError: vi.fn(),
}));

vi.mock('../../components/StrataDashboard/strataApi', () => ({
    strataGet: mocks.strataGet,
    strataPost: mocks.strataPost,
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
    const RealUsers = actual.Users as any;
    return {
        ...actual,
        Users: (props: any) => {
            if (mocks.usersShouldThrow.value) {
                throw new Error('synthetic-render-throw — Task 3.9 ErrorBoundary fallback test');
            }
            return <RealUsers {...props} />;
        },
    };
});

// useUser stub — TenantPortalModuleInner destructures { hasPermission };
// hasPermission must always return true so all 5 tabs surface (per the
// TAB_PERMS map at TenantPortalModule.tsx).
vi.mock('../../context/UserContext', () => ({
    useUser: () => ({ hasPermission: () => true }),
}));

// CSS file import is a side-effectful Vite asset — mock as no-op so
// the test runner doesn't try to parse the CSS.
vi.mock('./TenantPortal.css', () => ({}));

import TenantPortalModule from '../../components/StrataDashboard/modules/TenantPortalModule';

// Synthetic stats so the KpiRow renders (which surfaces the Users icon
// at the Total Tenants card — second render of Users in the module).
const SYNTHETIC_STATS = {
    totalTenants: 5,
    totalUnits: 10,
    occupiedUnits: 7,
    vacantUnits: 3,
    openMaintenanceRequests: 2,
    expiringLeases: 1,
};

// One inbound message with a tenantId — required for the Reply button
// to surface so test #3 can click Send Reply (which is the SINGLE
// write-trigger in this module).
const ONE_INBOUND_MSG = [{
    id: 'tp-msg-render-test-3-9',
    tenantId: 'render-test-tenant-id',
    tenantName: 'Render-test Tenant',
    direction: 'inbound',
    subject: 'Render-test subject',
    body: 'Render-test body for Task 3.9 commit D.',
    channel: 'email',
    createdAt: '2026-04-25T00:00:00.000Z',
    readStatus: 'unread',
}] as any;

describe('tenant portal parity — Task 3.9 GR-13 retrofit (render layer)', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.isStaticMode.value = false;
        mocks.usersShouldThrow.value = false;
        mocks.strataGet.mockResolvedValue([]);
        mocks.strataPost.mockResolvedValue({});
        // Suppress React's error-boundary console.error noise (mirror
        // Task 3.7 + 3.8 + ErrorBoundary.test.tsx pattern).
        vi.spyOn(console, 'error').mockImplementation(() => {});
    });

    // ── 1. Mount + ErrorBoundary wrap + module-load breadcrumb ─────────
    it('mounts inside ErrorBoundary; renders tenant-portal-module testid root + emits tenant-portal.module.loaded breadcrumb', async () => {
        render(<TenantPortalModule />);

        const root = await screen.findByTestId('tenant-portal-module');
        expect(root).toBeInTheDocument();

        // Module-load breadcrumb fires from useEffect (TenantPortalModule.tsx —
        // search for `tenant-portal.module.loaded`) after first render.
        // data carries the live isStaticMode value.
        await waitFor(() => {
            expect(mocks.addBreadcrumb).toHaveBeenCalledWith(
                expect.objectContaining({
                    category: 'ui.load',
                    message: 'tenant-portal.module.loaded',
                    level: 'info',
                    data: { staticMode: false },
                })
            );
        });

        // Negative: no write actions on a clean mount.
        expect(mocks.strataPost).not.toHaveBeenCalled();
        // Negative: ErrorBoundary not triggered → reportError untouched.
        expect(mocks.reportError).not.toHaveBeenCalled();
    });

    // ── 2. ErrorBoundary fallback contract ─────────────────────────────
    it('ErrorBoundary fallback renders "Tenant Portal module unavailable." when an inner component throws at render time; reportError fires with the ErrorBoundary tag', async () => {
        // BUG 1 fix — synthetic render-time throw via mocked Users.
        // Users renders unconditionally inside the empty-state branch
        // of DirectoryTab (default tab). With strataGet defaulted to []
        // in beforeEach, fetchTabData resolves to [] → empty-state
        // branch fires Users at TenantPortalModule.tsx render path
        // pre-useEffect resolution.
        mocks.usersShouldThrow.value = true;

        render(<TenantPortalModule />);

        // Fallback contract: literal text from commit C wrapper — must
        // match SentimentModule + ProjectsModule + CorporateReview
        // fallback shape line for line per DoR (b).
        expect(await screen.findByText('Tenant Portal module unavailable.')).toBeInTheDocument();

        // The Inner component threw before its root mounted → testid
        // not in DOM.
        expect(screen.queryByTestId('tenant-portal-module')).not.toBeInTheDocument();

        // BUG 2 fix — ErrorBoundary.componentDidCatch calls reportError(
        // error, 'ErrorBoundary', { componentStack }), NOT Sentry.
        // addBreadcrumb. Plan v2 §15 wording correction landed in
        // Task 3.8 commit F.
        await waitFor(() => {
            expect(mocks.reportError).toHaveBeenCalledWith(
                expect.any(Error),
                'ErrorBoundary',
                expect.objectContaining({ componentStack: expect.any(String) })
            );
        });
    });

    // ── 3. isStaticMode write-guard on the SINGLE message-send POST path
    it('isStaticMode === true skips strataPost (sendReply path); banner surfaces with the static-mode message; tenant-portal.message.skipped breadcrumb fires', async () => {
        mocks.isStaticMode.value = true;
        mocks.strataGet.mockImplementation(async (path: string) => {
            if (path === '/tenant/admin/stats') return SYNTHETIC_STATS;
            if (path === '/tenant/admin/messages') return ONE_INBOUND_MSG;
            return [];
        });

        render(<TenantPortalModule />);

        const user = userEvent.setup();

        // Switch to the messages tab so the inbound message renders +
        // the per-row Reply button surfaces.
        const messagesTab = await screen.findByTestId('tenant-portal-tab-messages');
        await user.click(messagesTab);

        // Wait for the synthetic inbound message to render. Targeting
        // the unique body text deterministically defeats any timing
        // race between tab-switch state propagation and the
        // useEffect-driven fetchTabData resolution.
        const msgBody = await screen.findByText('Render-test body for Task 3.9 commit D.');
        const msgRoot = msgBody.closest('.tp-msg') as HTMLElement;
        expect(msgRoot).toBeTruthy();

        // Per-row reply button has className `tp-reply-btn` (NOT a
        // testid — testids cover the module surface, not per-message
        // reply chevrons). Scoping the lookup to the message root
        // avoids any ambiguity with the Send Reply button (which has
        // its own testid).
        const replyBtn = msgRoot.querySelector('.tp-reply-btn') as HTMLButtonElement;
        expect(replyBtn).toBeTruthy();
        await user.click(replyBtn);

        // Reply form surfaces with subject pre-filled via setReplySubject
        // (`Re: ${msg.subject}` at the click handler). Use fireEvent.change
        // (single-shot) instead of userEvent.type (per-character) — the
        // existing module pre-Task-3.9 defines all 5 tab components
        // (DirectoryTab / MaintenanceTab / PaymentsTab / MessagesTab /
        // LeaseAlertsTab) as NESTED CLOSURES inside TenantPortalModuleInner,
        // so every parent re-render creates a new function reference
        // → React unmounts/remounts the entire tab subtree → user-event's
        // per-character typing dispatches on a stale element reference
        // (the input gets recreated each setReplySubject call). The
        // controlled-input value still propagates correctly via React
        // state, so single-shot fireEvent.change works without the
        // remount churn. This matches the React anti-pattern surfaced
        // at PRE1 second-order discovery — see Phase3_Task_3_9_
        // Completion_Report.md §1 for the full ledger entry. Lifting the
        // tab components out of TenantPortalModuleInner is out of scope
        // for the GR-13 retrofit (would touch ~400 LOC structurally
        // unrelated to the observability + write-guard surface).
        const subjectInput = await screen.findByPlaceholderText('Subject…') as HTMLInputElement;
        fireEvent.change(subjectInput, { target: { value: 'Static-mode test subject' } });
        const bodyTextarea = screen.getByPlaceholderText('Write your reply…') as HTMLTextAreaElement;
        fireEvent.change(bodyTextarea, { target: { value: 'Static-mode test body' } });

        // The send button must be enabled before we click — sendReply
        // early-returns on `!replySubject.trim() || !replyBody.trim()`,
        // so an enabled state is the contract that both fields settled.
        const sendBtn = await screen.findByTestId('tenant-portal-send-message-btn');
        await waitFor(() => expect(sendBtn).not.toBeDisabled());
        await user.click(sendBtn);

        // (a) strataPost NOT called — sendReply's isStaticMode early-
        // return short-circuits.
        expect(mocks.strataPost).not.toHaveBeenCalled();

        // (c) tenant-portal.message.skipped breadcrumb received with
        // tenantId payload. Asserting this BEFORE the banner ensures
        // sendReply actually executed (vs. testing UI state that
        // depends on a setState call we can't observe directly).
        await waitFor(() => {
            expect(mocks.addBreadcrumb).toHaveBeenCalledWith(
                expect.objectContaining({
                    category: 'ui.submit',
                    message: 'tenant-portal.message.skipped',
                    level: 'info',
                    data: expect.objectContaining({
                        tenantId: 'render-test-tenant-id',
                    }),
                })
            );
        });

        // (b) Banner surfaces with the static-mode message.
        expect(await screen.findByTestId('tenant-portal-static-banner')).toBeInTheDocument();
        expect(await screen.findByText(/send message requires backend mode/i)).toBeInTheDocument();

        // (d) Negative: no .sent breadcrumb fired — write-path was
        // short-circuited cleanly. Sentry.addBreadcrumb is also called
        // by the module-load path; we filter for the .sent variant.
        const sentCalls = mocks.addBreadcrumb.mock.calls.filter(([arg]) =>
            arg?.message === 'tenant-portal.message.sent'
        );
        expect(sentCalls).toHaveLength(0);
    });
});
