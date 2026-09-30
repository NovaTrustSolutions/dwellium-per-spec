/**
 * hermesGraphNightly — nightly (once-per-calendar-day, first check at/after
 * 02:00 local) knowledge-graph rebuild, run by Hermes (Labyrinth — its
 * systems-mapping persona best fits "knowledge/connections" work).
 *
 * Sister-shape to honchoBackgroundRunner's "claim the day" pattern: the day is
 * claimed in localStorage BEFORE the network call so two tabs / a StrictMode
 * double-mount can't both rebuild. Unlike Honcho's reflection loop, the
 * rebuild itself needs no LLM key — graphify does the raw work — so this runs
 * for every signed-in user regardless of LLM configuration.
 */
import { useContext, useEffect, useRef } from 'react';
import { UserContext, getAuthHeaders } from '../context/UserContext';
import { API_BASE } from '../config';
import { captureOwner } from '../lib/perUserIdentity';
import { dayKey } from '../lib/dailySynthesis';
import { recordRun as recordPersonaRun } from '../lib/agents/personaWorkStore';

const FIRST_DELAY_MS = 60 * 1000;        // first check ~1 min after mount
const CHECK_EVERY_MS = 10 * 60 * 1000;   // re-evaluate every 10 min while logged in
const NIGHTLY_HOUR = 2;                  // 02:00 local is the earliest a rebuild may fire
const POLL_EVERY_MS = 5 * 1000;
const POLL_TIMEOUT_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS_PER_DAY = 3;
/** Labyrinth: "maps complex systems and finds the path through them" — the
 *  Hermes persona whose description best fits knowledge-graph work. */
const NIGHTLY_PERSONA_ID = 'hermes-labyrinth';

interface KgStatus {
    built: boolean;
    building: boolean;
    builtAt: string | null;
    lastError: string | null;
    nodes: number;
}
interface ClaimState {
    day: string;
    attempts: number;
    /** true while a rebuild is in flight this tick — blocks a concurrent duplicate call. */
    claimed: boolean;
}

const claimKey = (uid: string) => `hermes:kg:nightly:${uid}`;

function readClaim(storage: Pick<Storage, 'getItem'>, uid: string): ClaimState | null {
    try {
        const raw = storage.getItem(claimKey(uid));
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed.day === 'string' && typeof parsed.attempts === 'number') return parsed as ClaimState;
    } catch { /* ignore */ }
    return null;
}
function writeClaim(storage: Pick<Storage, 'setItem'>, uid: string, state: ClaimState): void {
    try { storage.setItem(claimKey(uid), JSON.stringify(state)); } catch { /* ignore */ }
}

async function kgFetchStatus(): Promise<KgStatus | null> {
    try {
        const res = await fetch(`${API_BASE}/api/knowledge-graph/status`, {
            headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        });
        const json = await res.json();
        return json?.success ? (json.data as KgStatus) : null;
    } catch { return null; }
}
async function kgRebuild(): Promise<{ ok: boolean; status?: number }> {
    try {
        const res = await fetch(`${API_BASE}/api/knowledge-graph/rebuild`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        });
        return { ok: res.ok, status: res.status };
    } catch { return { ok: false }; }
}
const realWait = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));

export interface RunNightlyDeps {
    uid: string;
    now?: () => number;
    storage?: Pick<Storage, 'getItem' | 'setItem'>;
    fetchStatus?: () => Promise<KgStatus | null>;
    rebuild?: () => Promise<{ ok: boolean; status?: number }>;
    wait?: (ms: number) => Promise<void>;
    recordRun?: (personaId: string, summary: string, durationMs: number, outcome: 'success' | 'fail') => void;
    captureOwnerFn?: () => () => boolean;
    personaId?: string;
}

/**
 * One nightly check. Call every ~10 min while signed in; no-ops unless it's
 * past 02:00 local and today hasn't already been claimed/rebuilt/exhausted.
 * Pure/injectable — testable without real timers or network.
 */
export async function runHermesGraphNightly(deps: RunNightlyDeps): Promise<void> {
    const now = deps.now ?? Date.now;
    const storage = deps.storage ?? (typeof localStorage !== 'undefined' ? localStorage : undefined);
    if (!storage) return;
    if (new Date(now()).getHours() < NIGHTLY_HOUR) return;

    const today = dayKey(new Date(now()));
    const prior = readClaim(storage, deps.uid);
    if (prior && prior.day === today && (prior.claimed || prior.attempts >= MAX_ATTEMPTS_PER_DAY)) return;

    const attempts = (prior && prior.day === today ? prior.attempts : 0) + 1;
    // Claim BEFORE any network call — a concurrent call (2nd tab, StrictMode
    // double-mount) sees `claimed: true` at the read above and returns early.
    writeClaim(storage, deps.uid, { day: today, attempts, claimed: true });

    const fetchStatus = deps.fetchStatus ?? kgFetchStatus;
    const rebuild = deps.rebuild ?? kgRebuild;
    const wait = deps.wait ?? realWait;
    const record = deps.recordRun ?? recordPersonaRun;
    const stillOwner = (deps.captureOwnerFn ?? captureOwner)();
    const personaId = deps.personaId ?? NIGHTLY_PERSONA_ID;

    const status = await fetchStatus();
    if (!status) { writeClaim(storage, deps.uid, { day: today, attempts, claimed: false }); return; } // couldn't reach it — retry next tick
    if (status.building) return; // someone else is building — day is spoken for
    if (status.builtAt && dayKey(new Date(status.builtAt)) === today) return; // already rebuilt today (e.g. manually)

    const startedAt = now();
    const res = await rebuild();
    if (!stillOwner()) return; // account switched mid-request — never record cross-account

    if (!res.ok && res.status !== 409) {
        writeClaim(storage, deps.uid, { day: today, attempts, claimed: false }); // network/5xx — let a later tick retry
        return;
    }
    if (res.status === 409) return; // someone else started building — treat as done for today

    const deadline = now() + POLL_TIMEOUT_MS;
    let finalStatus: KgStatus | null = null;
    while (now() < deadline) {
        await wait(POLL_EVERY_MS);
        if (!stillOwner()) return;
        const s = await fetchStatus();
        if (s && !s.building) { finalStatus = s; break; }
    }
    if (!stillOwner() || !finalStatus) return;

    const durationMs = Math.max(0, now() - startedAt);
    if (finalStatus.lastError) {
        record(personaId, `Nightly knowledge-graph rebuild failed: ${finalStatus.lastError}`, durationMs, 'fail');
    } else {
        record(personaId, `Nightly knowledge-graph rebuild: ${finalStatus.nodes} nodes`, durationMs, 'success');
    }
}

/** Mount once inside the signed-in shell. */
export function useHermesGraphNightly(): void {
    const userCtx = useContext(UserContext);
    const uid = userCtx?.user?.id ?? null;
    const runningRef = useRef(false);

    useEffect(() => {
        if (!uid) return;
        let cancelled = false;

        const tick = async () => {
            if (cancelled || runningRef.current) return;
            runningRef.current = true;
            try {
                await runHermesGraphNightly({ uid });
            } finally {
                runningRef.current = false;
            }
        };

        const first = setTimeout(tick, FIRST_DELAY_MS);
        const interval = setInterval(tick, CHECK_EVERY_MS);
        return () => { cancelled = true; clearTimeout(first); clearInterval(interval); };
    }, [uid]);
}
