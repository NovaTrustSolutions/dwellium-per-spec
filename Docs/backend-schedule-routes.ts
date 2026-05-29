/**
 * Schedule Routes — daily/weekly ThoughtWeaver report + to-do generation on a
 * REAL background schedule, plus delivery (notification / email).
 *
 * WHY THIS EXISTS / SCOPE BOUNDARY
 * ────────────────────────────────
 * ThoughtWeaver generates, all local-first (per-user createLocalStorageStore):
 *   - a DAILY report (narrative summary of the day's captures),
 *   - a WEEKLY summary (Mon-anchored rollup),
 *   - DAILY + WEEKLY to-do seeds (fed into todoStore via syncTodosFromCaptures),
 *   - NON-OBVIOUS cross-capture insights.
 * The pure generation engine ships on this branch:
 *   - qualia-shell/src/components/ThoughtWeaver/insights.ts      (LLM-injectable helpers)
 *   - qualia-shell/src/components/ThoughtWeaver/reportEngine.ts  (orchestration + due-predicates)
 *   - qualia-shell/src/components/ThoughtWeaver/reportStore.ts   (per-user local persistence)
 *
 * The browser CAN, today (in-app, no backend):
 *   - ON-OPEN CATCH-UP. When ThoughtWeaver mounts, reportEngine's
 *     isDailyReportDue() / isWeeklyReportDue() compare lastDailyReportDate /
 *     lastWeeklyReportWeek against "today"; if due, it generates the missed
 *     daily report + refreshes to-do lists (and a weekly summary on week
 *     rollover). See ThoughtWeaver.tsx on-open catch-up effect (Cycle 13).
 *   - GENERATE NOW. A manual "✨ Generate now" button runs the full pass
 *     (daily + weekly + to-dos + insights) on demand.
 * That whole path ships on this branch and does NOT need this contract.
 *
 * The browser CANNOT do one thing, which is exactly what these routes cover:
 *   1. A TRUE BACKGROUND SCHEDULE. A browser tab cannot run a daily cron — it
 *      only catches up when the user happens to open the app. A backend daemon
 *      (or, per Ilya, the planned ELECTRON main process) runs the generation on
 *      a real schedule even when no tab is open, and DELIVERS the result
 *      (OS notification / email / in-app inbox) so the user is nudged rather
 *      than having to remember to open ThoughtWeaver.
 *
 * STATUS: OUT OF SCOPE FOR THE `feat/scribe-ingestion-honcho` BRANCH.
 * Implemented by the sibling backend (`ai-dashboard369-file-manager`) OR — the
 * intended home per Ilya's "the app will be converted to Electron later" note —
 * the Electron main process (see ELECTRON MAIN-PROCESS NOTE at the bottom).
 * The web build degrades gracefully via on-open catch-up until this exists; no
 * frontend client is wired against these routes yet (unlike ingestionApi.ts),
 * because catch-up + "Generate now" already cover the web UX. A thin
 * scheduleApi.ts can be added later if/when the backend ships these.
 *
 * CONTRACT:
 *   POST   /api/schedule/register     { kind, cron?, delivery, tz? }
 *                                       → { success, data: ScheduleRegistration }
 *   GET    /api/schedule/status        → { success, data: ScheduleStatus }
 *   POST   /api/schedule/run-now       { kind }
 *                                       → { success, data: ScheduleRun }
 *   DELETE /api/schedule/register/:id  → { success, data: { removed: boolean } }
 *
 * REUSE NOTE: the actual report/to-do/insight GENERATION must NOT be
 * re-implemented here. The pure engine in reportEngine.ts + insights.ts is
 * environment-agnostic (date context + an LlmFn are INJECTED, never read from
 * window/Date internally — see the "today"/"nowIso"/LlmFn params). The scheduler
 * is a THIN trigger: on each fire it (a) loads the user's captures, (b) calls the
 * SAME generateReports(ctx, sink, opts) with a server/Electron-side LlmFn and a
 * sink that writes the user's report store (or a server mirror), then (c)
 * delivers. Port the engine, do not fork its logic.
 *
 * Installation (backend variant):
 *   cd ~/dwellium-backend/ai-dashboard369-file-manager
 *   # drop this file at src/routes/scheduleRoutes.ts
 *   # then patch src/app.ts:
 *   #   import scheduleRoutes from './routes/scheduleRoutes';
 *   #   app.use('/api/schedule', scheduleRoutes);
 *   # the cron needs a scheduler lib — `node-cron` is the reference choice
 *   #   (npm i node-cron); registrations persist to a per-user JSON ledger
 *   #   under ~/.dwellium/schedule/<userId>/schedules.json and are re-armed on
 *   #   process boot. Delivery needs a transport (nodemailer for email; the
 *   #   Electron variant uses the native Notification module instead).
 */

import { Router, Request, Response } from 'express';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
// import cron from 'node-cron';                  // scheduler lib (npm i node-cron)
import { authenticate } from '../services/authMiddleware';

const router = Router();

// ── Shared types ──────────────────────────────────────────────────────────

/** What to generate on a fire. Mirrors reportEngine's run scopes. */
type ScheduleKind = 'daily-report' | 'weekly-summary' | 'todos' | 'full';

/** How the generated artifacts reach the user once produced off-tab. */
interface DeliveryConfig {
    /** OS/desktop notification (Electron Notification, or web-push if granted). */
    notify?: boolean;
    /** Email the daily/weekly digest. */
    email?: { to: string };
    /** Drop into an in-app inbox the user sees on next open. Default true. */
    inApp?: boolean;
}

interface ScheduleRegistration {
    /** Server-assigned id. */
    id: string;
    kind: ScheduleKind;
    /**
     * Cron expression for the fire. If omitted, the server applies a sensible
     * default per kind: daily-report "0 18 * * *" (18:00 local), weekly-summary
     * "0 18 * * 0" (Sun 18:00), todos "0 7 * * *" (07:00 local), full = daily.
     */
    cron: string;
    delivery: DeliveryConfig;
    /** IANA tz the cron is evaluated in (e.g. "America/New_York"). */
    tz: string;
    /** ISO timestamp the schedule was registered. */
    registeredAt: string;
}

interface ScheduleRun {
    /** Which registration fired (or "manual" for run-now). */
    scheduleId: string;
    kind: ScheduleKind;
    /** ISO timestamp of the run. */
    ranAt: string;
    /** What was produced — counts only; the artifacts land in the report store. */
    produced: {
        dailyReports: number;
        weeklySummaries: number;
        todoSeeds: number;
        insights: number;
    };
    /** How it was delivered. */
    delivered: { notify: boolean; email: boolean; inApp: boolean };
}

interface ScheduleStatus {
    /** Registrations currently armed for this user. */
    schedules: ScheduleRegistration[];
    /** Most recent runs (newest-first, capped). */
    recentRuns: ScheduleRun[];
    /** ISO timestamp of the next scheduled fire across all registrations, or null. */
    nextFireAt: string | null;
}

// ── Per-user ledger (registrations persist + re-arm across restarts) ──────

function getUserScheduleRoot(userId: string): string {
    return path.join(os.homedir(), '.dwellium', 'schedule', userId);
}

function ledgerPath(userId: string): string {
    return path.join(getUserScheduleRoot(userId), 'schedules.json');
}

interface Ledger {
    schedules: ScheduleRegistration[];
    recentRuns: ScheduleRun[];
}

async function readLedger(userId: string): Promise<Ledger> {
    try {
        const raw = await fs.readFile(ledgerPath(userId), 'utf-8');
        const parsed = JSON.parse(raw);
        return {
            schedules: Array.isArray(parsed.schedules) ? parsed.schedules : [],
            recentRuns: Array.isArray(parsed.recentRuns) ? parsed.recentRuns : [],
        };
    } catch {
        return { schedules: [], recentRuns: [] };
    }
}

async function writeLedger(userId: string, ledger: Ledger): Promise<void> {
    await fs.mkdir(getUserScheduleRoot(userId), { recursive: true });
    // Cap run history so the ledger doesn't grow unbounded.
    ledger.recentRuns = ledger.recentRuns.slice(0, 50);
    await fs.writeFile(ledgerPath(userId), JSON.stringify(ledger, null, 2), 'utf-8');
}

const VALID_KINDS = new Set<ScheduleKind>(['daily-report', 'weekly-summary', 'todos', 'full']);

const DEFAULT_CRON: Record<ScheduleKind, string> = {
    'daily-report': '0 18 * * *',
    'weekly-summary': '0 18 * * 0',
    todos: '0 7 * * *',
    full: '0 18 * * *',
};

function validateKind(k: unknown): k is ScheduleKind {
    return typeof k === 'string' && VALID_KINDS.has(k as ScheduleKind);
}

// ── POST /register ─ arm a daily/weekly schedule with the daemon ──────────

router.post('/register', authenticate, async (req: Request, res: Response) => {
    try {
        const userId = req.user?.id;
        if (!userId) return res.status(401).json({ success: false, error: 'Not authenticated' });
        const { kind, cron: cronExpr, delivery, tz } = req.body;
        if (!validateKind(kind)) {
            return res.status(400).json({ success: false, error: 'kind must be daily-report | weekly-summary | todos | full' });
        }
        const ledger = await readLedger(userId);
        // Idempotent on (kind) — one schedule per kind per user; re-register updates it.
        const reg: ScheduleRegistration = {
            id: `sched_${kind}_${Buffer.from(userId).toString('base64url').slice(0, 8)}`,
            kind,
            cron: typeof cronExpr === 'string' && cronExpr.trim() ? cronExpr : DEFAULT_CRON[kind],
            delivery: {
                notify: !!delivery?.notify,
                email: delivery?.email?.to ? { to: String(delivery.email.to) } : undefined,
                inApp: delivery?.inApp !== false, // default true
            },
            tz: typeof tz === 'string' && tz ? tz : 'UTC',
            registeredAt: new Date().toISOString(),
        };
        ledger.schedules = ledger.schedules.filter((s) => s.kind !== kind);
        ledger.schedules.push(reg);
        await writeLedger(userId, ledger);
        // cron.schedule(reg.cron, () => runGeneration(userId, reg), { timezone: reg.tz });
        res.json({ success: true, data: reg });
    } catch (err: any) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// ── GET /status ─ armed schedules + recent runs ───────────────────────────

router.get('/status', authenticate, async (req: Request, res: Response) => {
    try {
        const userId = req.user?.id;
        if (!userId) return res.status(401).json({ success: false, error: 'Not authenticated' });
        const ledger = await readLedger(userId);
        const status: ScheduleStatus = {
            schedules: ledger.schedules,
            recentRuns: ledger.recentRuns,
            // A real impl computes this from the cron parser (e.g. cron-parser
            // .parseExpression(s.cron, { tz: s.tz }).next()).
            nextFireAt: null,
        };
        res.json({ success: true, data: status });
    } catch (err: any) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// ── POST /run-now ─ fire one kind immediately (server-side equivalent of the
//                    web "Generate now" button, but delivered off-tab) ──────

router.post('/run-now', authenticate, async (req: Request, res: Response) => {
    try {
        const userId = req.user?.id;
        if (!userId) return res.status(401).json({ success: false, error: 'Not authenticated' });
        const { kind } = req.body;
        if (!validateKind(kind)) {
            return res.status(400).json({ success: false, error: 'kind must be daily-report | weekly-summary | todos | full' });
        }
        // REUSE: load captures for this user, then call the SAME pure engine:
        //   import { generateReports } from '<port of reportEngine.ts>';
        //   const ctx = { captures, today: todayYMD(tz), nowIso: new Date().toISOString(), llm };
        //   const produced = await generateReports(ctx, serverSink, scopeFor(kind));
        //   await deliver(userId, reg.delivery, produced);
        // Below is the response SHAPE the frontend/inbox expects once that lands:
        const run: ScheduleRun = {
            scheduleId: 'manual',
            kind,
            ranAt: new Date().toISOString(),
            produced: { dailyReports: 0, weeklySummaries: 0, todoSeeds: 0, insights: 0 },
            delivered: { notify: false, email: false, inApp: false },
        };
        return res.status(501).json({
            success: false,
            error: 'Scheduled generation not implemented yet — port reportEngine.ts/insights.ts (engine is environment-agnostic; inject date + LlmFn) and a delivery transport.',
            // data: run,  // ← uncomment when implemented
        });
        // res.json({ success: true, data: run });
    } catch (err: any) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// ── DELETE /register/:id ─ disarm a schedule ──────────────────────────────

router.delete('/register/:id', authenticate, async (req: Request, res: Response) => {
    try {
        const userId = req.user?.id;
        if (!userId) return res.status(401).json({ success: false, error: 'Not authenticated' });
        const ledger = await readLedger(userId);
        const before = ledger.schedules.length;
        ledger.schedules = ledger.schedules.filter((s) => s.id !== req.params.id);
        const removed = ledger.schedules.length < before;
        if (removed) await writeLedger(userId, ledger);
        // cron task .stop() in the real impl (keep a Map<id, ScheduledTask>).
        res.json({ success: true, data: { removed } });
    } catch (err: any) {
        res.status(500).json({ success: false, error: err.message });
    }
});

export default router;

/**
 * ELECTRON MAIN-PROCESS NOTE (the intended home — "converted to Electron later")
 * ──────────────────────────────────────────────────────────────────────────────
 * If/when Dwellium ships as Electron, the cleanest implementation is NOT an HTTP
 * server but a main-process scheduler — no network hop, direct disk + native
 * notifications:
 *
 *   // electron/main/scheduler.ts
 *   import cron from 'node-cron';
 *   import { Notification } from 'electron';
 *   import { generateReports } from '../../shared/reportEngine'; // ported pure engine
 *
 *   // On app ready, re-arm each user's persisted schedules:
 *   for (const reg of loadSchedules(userId)) {
 *     cron.schedule(reg.cron, async () => {
 *       const produced = await generateReports(
 *         { captures: loadCaptures(userId), today: todayYMD(reg.tz),
 *           nowIso: new Date().toISOString(), llm: mainProcessLlm },
 *         reportStoreSink(userId),          // writes the SAME per-user store
 *         scopeFor(reg.kind),
 *       );
 *       if (reg.delivery.notify) {
 *         new Notification({
 *           title: 'ThoughtWeaver',
 *           body: `${produced.dailyReports} report · ${produced.todoSeeds} to-dos · ${produced.insights} insights`,
 *         }).show();
 *       }
 *       if (reg.delivery.email?.to) await sendDigestEmail(reg.delivery.email.to, produced);
 *     }, { timezone: reg.tz });
 *   }
 *
 * The renderer keeps doing on-open catch-up unchanged (belt-and-suspenders: if
 * the machine was asleep at fire time, catch-up still fills the gap on next
 * open). The web build behaves exactly as it does today — catch-up + "Generate
 * now" — and simply gains a true background schedule + delivery under Electron.
 *
 * KEY INVARIANT: the generation logic lives in ONE place (reportEngine.ts +
 * insights.ts, both pure + injectable). Web on-open catch-up, the backend cron,
 * and the Electron cron are all THIN callers of that one engine. Never fork it.
 */
