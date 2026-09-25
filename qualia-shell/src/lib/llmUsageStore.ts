/**
 * llmUsageStore — plan 068 v2 AI-spend ledger.
 *
 * v1 (P12-1) kept one ledger per user, whole-replaced on every One Save
 * hydrate — the last device to sync always won (defect C1/C2). v2 keeps one
 * SUB-ledger per DEVICE inside the synced object, so merging on hydrate never
 * has to pick a loser: each device only ever writes its own key. `clearedAt`
 * is a tombstone timestamp (not an empty overwrite) so "Clear" on one device
 * can't silently wipe another device's history on its next hydrate.
 *
 * Pricing lives in `llmPricing.ts`. An unpriced model yields `estCost: null`
 * (never a guessed default) and increments the day's `unpriced` counter.
 * `measured: true` marks entries built from provider-reported tokens instead
 * of the chars/4 fallback estimate.
 *
 * Namespacing rides `llmUsageUserIdHolder`. `userId` is a REQUIRED argument
 * on `recordLlmUsage` (captured by the caller BEFORE its provider `await`)
 * so a logout / account switch mid-call can't land usage in the wrong
 * ledger (defect C4) — a mismatch drops the entry and bumps
 * `droppedUserSwitchCount` instead of writing.
 */
import { useMemo } from 'react';
import { useSyncExternalStore } from 'react';
import { createLocalStorageStore } from '../utils/createLocalStorageStore';
import { withSync } from './oneSaveStore';
import { llmUsageUserIdHolder } from './perUserIdentity';
import { priceFor } from './llmPricing';
import type { LlmProvider } from '../types/integrations';
import type { LlmUsage } from './llmClient';

export interface UsageEntry {
    ts: number;
    provider: LlmProvider;
    model: string;
    /** Tokens — measured (from provider usage) when `measured`, else chars/4 estimate. */
    estIn: number;
    estOut: number;
    /** USD. `null` when the model's price is unknown (never a guessed default). */
    estCost: number | null;
    /** True when built from provider-reported usage rather than the chars/4 fallback. */
    measured: boolean;
    /** Feature that made the call: 'ara' | 'persona' | 'research' | 'skill:web_search' | 'honcho' | 'test' ... */
    source?: string;
}

export interface DailyRollup {
    date: string; // YYYY-MM-DD local
    calls: number;
    estIn: number;
    estOut: number;
    /** Sum of priced entries only — unpriced entries don't contribute (see `unpriced`). */
    estCost: number;
    byProvider: Partial<Record<LlmProvider, { calls: number; estCost: number }>>;
    /** Calls whose model had no known price (their cost is NOT in estCost). */
    unpriced?: number;
    /** Calls priced from provider-reported tokens (vs chars/4 estimate). */
    measuredCalls?: number;
    byModel?: Record<string, { calls: number; estCost: number }>;
    bySource?: Record<string, { calls: number; estCost: number }>;
}

/** Public aggregate shape — UNCHANGED across the v1 → v2 migration. */
export interface UsageLedger {
    entries: UsageEntry[];
    days: Record<string, DailyRollup>;
}

/** One device's own sub-ledger. */
export interface DeviceLedger {
    entries: UsageEntry[];
    days: Record<string, DailyRollup>;
}

/** What's actually persisted (localStorage + One Save `llm-usage`). */
export interface StoredLedgerV2 {
    v: 2;
    /** Tombstone: entries/days older than this were cleared and must not resurrect on merge. */
    clearedAt: number;
    devices: Record<string, DeviceLedger>;
}

const MAX_ENTRIES = 1000;
const MAX_DAY_AGE_MS = 400 * 86_400_000;
/** Reserved device id for pre-v2 (`{entries, days}`) data — see normalize(). */
const LEGACY_DEVICE = 'legacy';
const DEVICE_ID_KEY = 'llmusage-device';

export { llmUsageUserIdHolder };

/** Bumped (never reset in prod) when recordLlmUsage drops an entry for a userId mismatch. Test hook. */
export let droppedUserSwitchCount = 0;

function resolveKey(): string {
    const uid = llmUsageUserIdHolder.current;
    return uid ? `llmusage:${uid}` : 'llmusage:_anonymous';
}

/* ─── Device id: per-browser, not per-user ─── */

let deviceIdCache: string | null = null;

function newId(): string {
    return typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : `dev-${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
}

function deviceId(): string {
    if (deviceIdCache) return deviceIdCache;
    try {
        let id = localStorage.getItem(DEVICE_ID_KEY);
        if (!id) {
            id = newId();
            localStorage.setItem(DEVICE_ID_KEY, id);
        }
        deviceIdCache = id;
    } catch {
        // sandboxed / private browsing — in-memory-only id for this session.
        deviceIdCache = newId();
    }
    return deviceIdCache;
}

/** Test-only: forces the next deviceId() to mint/read fresh (simulate a second device). */
export function _resetDeviceIdForTests(): void {
    deviceIdCache = null;
}

/* ─── Shape normalization: v1 {entries,days} and v2 {v:2,devices} ─── */

function isDeviceLedgerLike(x: unknown): x is DeviceLedger {
    return !!x && typeof x === 'object' && Array.isArray((x as { entries?: unknown }).entries);
}

function normalizeEntry(raw: unknown): UsageEntry | null {
    if (!raw || typeof raw !== 'object') return null;
    const e = raw as Record<string, unknown>;
    if (typeof e.provider !== 'string' || typeof e.model !== 'string') return null;
    return {
        ts: typeof e.ts === 'number' ? e.ts : Date.now(),
        provider: e.provider as LlmProvider,
        model: e.model,
        estIn: typeof e.estIn === 'number' ? e.estIn : 0,
        estOut: typeof e.estOut === 'number' ? e.estOut : 0,
        estCost: typeof e.estCost === 'number' ? e.estCost : null,
        measured: typeof e.measured === 'boolean' ? e.measured : false,
        source: typeof e.source === 'string' ? e.source : undefined,
    };
}

function sanitizeDevice(raw: unknown): DeviceLedger {
    if (!isDeviceLedgerLike(raw)) return { entries: [], days: {} };
    const entries = raw.entries.map(normalizeEntry).filter((e): e is UsageEntry => e != null).slice(-MAX_ENTRIES);
    const rawDays = (raw as { days?: unknown }).days;
    const days = rawDays && typeof rawDays === 'object' ? (rawDays as Record<string, DailyRollup>) : {};
    return { entries, days };
}

/** True when `x` is a v1 payload (`{entries, days}`, no v2 markers) — used by merge()'s stale-tab guard. */
export function isRawV1Shape(x: unknown): boolean {
    if (!x || typeof x !== 'object') return false;
    const o = x as Record<string, unknown>;
    return !(o.v === 2 && o.devices && typeof o.devices === 'object');
}

function emptyStored(): StoredLedgerV2 {
    return { v: 2, clearedAt: 0, devices: {} };
}

/** Normalizes ANY persisted or remote shape (v1, v2, or garbage) into v2. */
export function normalize(parsed: unknown): StoredLedgerV2 {
    if (!parsed || typeof parsed !== 'object') return emptyStored();
    const p = parsed as Record<string, unknown>;
    if (p.v === 2 && p.devices && typeof p.devices === 'object') {
        const devices: Record<string, DeviceLedger> = {};
        for (const [id, dev] of Object.entries(p.devices as Record<string, unknown>)) {
            devices[id] = sanitizeDevice(dev);
        }
        return { v: 2, clearedAt: typeof p.clearedAt === 'number' ? p.clearedAt : 0, devices };
    }
    // v1 shape (or anything entries/days-like) → migrates under the reserved LEGACY device,
    // never under this device's own id (two devices independently migrating the same synced
    // v1 history under their own ids would double-count it — see merge()'s legacy handling).
    if (Array.isArray(p.entries) || (p.days && typeof p.days === 'object')) {
        return { v: 2, clearedAt: 0, devices: { [LEGACY_DEVICE]: sanitizeDevice(p) } };
    }
    return emptyStored();
}

function deserialize(raw: string | null): StoredLedgerV2 {
    if (!raw) return emptyStored();
    try {
        return normalize(JSON.parse(raw));
    } catch {
        return emptyStored();
    }
}

/* ─── Day rollup folding (shared by recordLlmUsage + rebuildDays) ─── */

function emptyDay(date: string): DailyRollup {
    return { date, calls: 0, estIn: 0, estOut: 0, estCost: 0, byProvider: {}, unpriced: 0, measuredCalls: 0, byModel: {}, bySource: {} };
}

function foldEntryIntoDay(day: DailyRollup, entry: UsageEntry): DailyRollup {
    const prov = day.byProvider[entry.provider] ?? { calls: 0, estCost: 0 };
    const modelStats = day.byModel?.[entry.model] ?? { calls: 0, estCost: 0 };
    const srcKey = entry.source ?? 'other';
    const srcStats = day.bySource?.[srcKey] ?? { calls: 0, estCost: 0 };
    const cost = entry.estCost ?? 0;
    return {
        ...day,
        calls: day.calls + 1,
        estIn: day.estIn + entry.estIn,
        estOut: day.estOut + entry.estOut,
        estCost: day.estCost + cost,
        byProvider: { ...day.byProvider, [entry.provider]: { calls: prov.calls + 1, estCost: prov.estCost + cost } },
        unpriced: (day.unpriced ?? 0) + (entry.estCost == null ? 1 : 0),
        measuredCalls: (day.measuredCalls ?? 0) + (entry.measured ? 1 : 0),
        byModel: { ...day.byModel, [entry.model]: { calls: modelStats.calls + 1, estCost: modelStats.estCost + cost } },
        bySource: { ...day.bySource, [srcKey]: { calls: srcStats.calls + 1, estCost: srcStats.estCost + cost } },
    };
}

function pruneDays(days: Record<string, DailyRollup>): Record<string, DailyRollup> {
    const cutoff = Date.now() - MAX_DAY_AGE_MS;
    const out: Record<string, DailyRollup> = {};
    for (const [date, roll] of Object.entries(days)) {
        const t = new Date(`${date}T00:00:00`).getTime();
        if (Number.isNaN(t) || t >= cutoff) out[date] = roll;
    }
    return out;
}

function rebuildDays(entries: UsageEntry[]): Record<string, DailyRollup> {
    const days: Record<string, DailyRollup> = {};
    for (const e of entries) {
        const date = localDate(e.ts);
        days[date] = foldEntryIntoDay(days[date] ?? emptyDay(date), e);
    }
    return pruneDays(days);
}

function maxTs(dev: DeviceLedger): number {
    let m = 0;
    for (const e of dev.entries) if (e.ts > m) m = e.ts;
    return m;
}

/** Filters a device's entries to the clear tombstone and rebuilds its days from survivors. */
function applyClearedAt(dev: DeviceLedger, clearedAt: number): DeviceLedger {
    if (!clearedAt) return dev;
    const entries = dev.entries.filter(e => e.ts >= clearedAt);
    if (entries.length !== dev.entries.length) return { entries, days: rebuildDays(entries) };
    // No entry was dropped, but rollups can outlive their entries (v1 kept days
    // forever while capping entries at 1,000) — drop whole days before the clear.
    const clearDate = localDate(clearedAt);
    const staleDays = Object.keys(dev.days).filter(date => date < clearDate);
    if (staleDays.length === 0) return dev;
    const days = { ...dev.days };
    for (const date of staleDays) delete days[date];
    return { entries, days };
}

/* ─── Store ─── */

const baseStore = createLocalStorageStore<StoredLedgerV2>({
    key: resolveKey,
    deserializer: deserialize,
    defaultValue: emptyStored(),
});

/**
 * Merge rule (plan 068 + orchestrator amendment): devices are additive — each
 * device only ever owns its OWN sub-ledger, so `{...remote.devices, [this]:
 * local.devices[this] ?? remote.devices[this]}` never double-counts. The
 * `legacy` (pre-v2) sub-ledger is the one exception: it isn't owned by any
 * device, so two sides can each have one after an independent v1→v2
 * migration. We keep whichever has the newer content (max entry ts, tie →
 * remote) UNLESS remote is a raw (never-migrated) v1 payload and local
 * already has a legacy sub-ledger — that shape means a stale tab still
 * running pre-068 code just overwrote the whole object, and trusting its
 * timestamp would resurrect data through a payload that doesn't understand
 * devices at all. In that case we keep local's legacy untouched and drop the
 * stale tab's write (a known, small, one-time loss of whatever that tab
 * recorded before this device last synced).
 */
export function merge(local: StoredLedgerV2, remoteRaw: StoredLedgerV2): StoredLedgerV2 {
    const remoteWasRawV1 = isRawV1Shape(remoteRaw);
    const remote = normalize(remoteRaw);
    const clearedAt = Math.max(local.clearedAt ?? 0, remote.clearedAt ?? 0);
    const thisDevice = deviceId();

    const devices: Record<string, DeviceLedger> = { ...remote.devices };
    const mine = local.devices[thisDevice] ?? remote.devices[thisDevice];
    if (mine) devices[thisDevice] = mine;
    else delete devices[thisDevice];

    const localLegacy = local.devices[LEGACY_DEVICE];
    const remoteLegacy = remote.devices[LEGACY_DEVICE];
    if (remoteWasRawV1 && localLegacy) {
        devices[LEGACY_DEVICE] = localLegacy; // stale-tab protection
    } else if (localLegacy && remoteLegacy) {
        devices[LEGACY_DEVICE] = maxTs(remoteLegacy) >= maxTs(localLegacy) ? remoteLegacy : localLegacy;
    } else if (localLegacy) {
        devices[LEGACY_DEVICE] = localLegacy;
    } else if (remoteLegacy) {
        devices[LEGACY_DEVICE] = remoteLegacy;
    } else {
        delete devices[LEGACY_DEVICE];
    }

    const finalDevices: Record<string, DeviceLedger> = {};
    for (const [id, dev] of Object.entries(devices)) finalDevices[id] = applyClearedAt(dev, clearedAt);
    return { v: 2, clearedAt, devices: finalDevices };
}

export const llmUsageStore = withSync(baseStore, { objectType: 'llm-usage', holder: llmUsageUserIdHolder, resolveKey, merge });

function persist(next: StoredLedgerV2): void {
    llmUsageStore.set(next, () => {
        try { localStorage.setItem(resolveKey(), JSON.stringify(next)); } catch { /* sandboxed/full */ }
    });
}

// Cross-tab (C3): another tab's write already landed in localStorage — refresh
// this tab's cache from it and notify subscribers, WITHOUT scheduling a
// write-through (base.set only; bypasses withSync's synced `set`).
if (typeof window !== 'undefined') {
    window.addEventListener('storage', (e) => {
        if (e.key !== resolveKey()) return;
        try {
            baseStore.set(deserialize(localStorage.getItem(resolveKey())), () => { /* already on disk */ });
        } catch { /* ignore */ }
    });
}

/* ─── Aggregation (public UsageLedger shape) ─── */

function mergeCountMap(
    a: Record<string, { calls: number; estCost: number }> | undefined,
    b: Record<string, { calls: number; estCost: number }> | undefined,
): Record<string, { calls: number; estCost: number }> | undefined {
    if (!a && !b) return undefined;
    const out: Record<string, { calls: number; estCost: number }> = { ...a };
    for (const [k, v] of Object.entries(b ?? {})) {
        const prev = out[k] ?? { calls: 0, estCost: 0 };
        out[k] = { calls: prev.calls + v.calls, estCost: prev.estCost + v.estCost };
    }
    return out;
}

function sumDay(a: DailyRollup, b: DailyRollup): DailyRollup {
    const byProvider: DailyRollup['byProvider'] = { ...a.byProvider };
    for (const [k, v] of Object.entries(b.byProvider)) {
        const key = k as LlmProvider;
        const prev = byProvider[key] ?? { calls: 0, estCost: 0 };
        byProvider[key] = { calls: prev.calls + (v?.calls ?? 0), estCost: prev.estCost + (v?.estCost ?? 0) };
    }
    return {
        date: a.date,
        calls: a.calls + b.calls,
        estIn: a.estIn + b.estIn,
        estOut: a.estOut + b.estOut,
        estCost: a.estCost + b.estCost,
        byProvider,
        unpriced: (a.unpriced ?? 0) + (b.unpriced ?? 0),
        measuredCalls: (a.measuredCalls ?? 0) + (b.measuredCalls ?? 0),
        byModel: mergeCountMap(a.byModel, b.byModel),
        bySource: mergeCountMap(a.bySource, b.bySource),
    };
}

function aggregate(stored: StoredLedgerV2): UsageLedger {
    const entries: UsageEntry[] = [];
    const days: Record<string, DailyRollup> = {};
    for (const dev of Object.values(stored.devices)) {
        entries.push(...dev.entries);
        for (const [date, roll] of Object.entries(dev.days)) {
            days[date] = days[date] ? sumDay(days[date], roll) : roll;
        }
    }
    entries.sort((a, b) => a.ts - b.ts);
    return { entries: entries.slice(-MAX_ENTRIES), days };
}

// Single-slot identity cache shared by useLlmUsage() and the non-hook
// lastNDays()/planAdvice() default path, so both see the SAME UsageLedger
// object reference for the same stored snapshot (referential stability).
let aggCacheStored: StoredLedgerV2 | null = null;
let aggCacheResult: UsageLedger | null = null;
function aggregateCached(stored: StoredLedgerV2): UsageLedger {
    if (aggCacheStored === stored && aggCacheResult) return aggCacheResult;
    aggCacheResult = aggregate(stored);
    aggCacheStored = stored;
    return aggCacheResult;
}

/** Chars/4 — the standard rough token estimate. */
export function estTokens(text: string): number {
    return Math.ceil((text?.length ?? 0) / 4);
}

/** Back-compat: delegates to llmPricing.priceFor. `null` = unpriced (never a guessed default). */
export function estimateCost(model: string, estIn: number, estOut: number, provider: LlmProvider): number | null {
    const p = priceFor(model, provider);
    if (!p) return null;
    return (estIn * p.inPerM + estOut * p.outPerM) / 1_000_000;
}

function localDate(ts: number): string {
    const d = new Date(ts);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * Plan 068 contract. `userId` is REQUIRED: capture it with currentUsageUserId()
 * BEFORE the provider `await`, so a logout / account switch mid-call can't
 * land usage in the wrong ledger.
 */
export interface UsageInput {
    provider: LlmProvider;
    model: string;
    /** Fallback estimate inputs (chars/4) — used only when `usage` is absent. */
    promptChars: number;
    responseChars: number;
    /** Provider-reported tokens; preferred when present. */
    usage?: LlmUsage;
    /** Flat per-call fees (web search, image generation), USD. */
    extraCostUsd?: number;
    /** Feature that made the call ('ara' | 'persona' | 'research' | 'skill:web_search' | 'honcho' | 'test' ...). */
    source?: string;
    userId: string | null;
}

/** The ledger owner right now — call BEFORE awaiting the provider. */
export function currentUsageUserId(): string | null {
    return llmUsageUserIdHolder.current;
}

/** Record one completion. NEVER throws (called from inside callLlm). */
export function recordLlmUsage(input: UsageInput): void {
    try {
        if (input.userId !== llmUsageUserIdHolder.current) {
            droppedUserSwitchCount++;
            return;
        }
        const price = priceFor(input.model, input.provider);
        let estIn: number;
        let estOut: number;
        let measured: boolean;
        let cost: number | null;
        if (input.usage) {
            const u = input.usage;
            const cacheRead = u.cacheReadTokens ?? 0;
            const cacheWrite = u.cacheWriteTokens ?? 0;
            estIn = u.inputTokens + cacheRead + cacheWrite;
            estOut = u.outputTokens;
            measured = true;
            cost = price
                ? (u.inputTokens * price.inPerM
                    // Unlisted cache-read price: Anthropic's documented 0.1× rule; other
                    // providers vary, so charge full input (never under-state spend).
                    + cacheRead * (price.cacheReadPerM ?? price.inPerM * (input.provider === 'anthropic' ? 0.1 : 1))
                    + cacheWrite * (price.cacheWritePerM ?? price.inPerM * 1.25)
                    + u.outputTokens * price.outPerM) / 1_000_000
                : null;
        } else {
            estIn = Math.ceil(input.promptChars / 4);
            estOut = Math.ceil(input.responseChars / 4);
            measured = false;
            cost = price ? (estIn * price.inPerM + estOut * price.outPerM) / 1_000_000 : null;
        }
        // A model with no known price stays unpriced even with a flat fee attached
        // (a search/image fee can't retroactively price an unknown token rate).
        if (cost != null) cost += input.extraCostUsd ?? 0;

        const entry: UsageEntry = { ts: Date.now(), provider: input.provider, model: input.model, estIn, estOut, estCost: cost, measured, source: input.source };

        // Re-read localStorage fresh (another tab may have written since our last
        // cached snapshot) rather than trusting llmUsageStore.getSnapshot() (C3).
        let base: StoredLedgerV2;
        try {
            const raw = localStorage.getItem(resolveKey());
            base = raw != null ? deserialize(raw) : llmUsageStore.getSnapshot();
        } catch {
            base = llmUsageStore.getSnapshot();
        }

        const thisDevice = deviceId();
        const dev = base.devices[thisDevice] ?? { entries: [], days: {} };
        const date = localDate(entry.ts);
        const day = foldEntryIntoDay(dev.days[date] ?? emptyDay(date), entry);
        const nextDev: DeviceLedger = { entries: [...dev.entries, entry].slice(-MAX_ENTRIES), days: pruneDays({ ...dev.days, [date]: day }) };
        persist({ ...base, v: 2, devices: { ...base.devices, [thisDevice]: nextDev } });
    } catch { /* ledger must never break an LLM call */ }
}

/* ─── Read helpers (widget + morning brief) ─── */

/** Pure: the calendar-day (not fixed-24h) YYYY-MM-DD strings ending today, oldest first. */
export function calendarDaysBack(nowMs: number, n: number): string[] {
    const now = new Date(nowMs);
    const out: string[] = [];
    for (let i = n - 1; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
        out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`);
    }
    return out;
}

export function lastNDays(n: number, ledger?: UsageLedger): DailyRollup[] {
    const l = ledger ?? aggregateCached(llmUsageStore.getSnapshot());
    return calendarDaysBack(Date.now(), n).map(date => l.days[date] ?? emptyDay(date));
}

export function todayRollup(ledger?: UsageLedger): DailyRollup {
    return lastNDays(1, ledger)[0];
}

/**
 * Plan advice heuristic (the video's "you're only using 20% — downgrade"):
 * compares 7-day estimated spend against common subscription tiers.
 */
export function planAdvice(ledger?: UsageLedger): string {
    const week = lastNDays(7, ledger);
    const weekCost = week.reduce((s, d) => s + d.estCost, 0);
    const weekCalls = week.reduce((s, d) => s + d.calls, 0);
    if (weekCalls === 0) return 'No LLM usage recorded this week yet.';
    const monthly = (weekCost / 7) * 30;
    if (monthly < 5) return `Pace ≈ $${monthly.toFixed(2)}/mo (est.) — pay-as-you-go API keys are cheaper than any subscription at this rate.`;
    if (monthly < 20) return `Pace ≈ $${monthly.toFixed(2)}/mo (est.) — a ~$20 tier would roughly break even.`;
    if (monthly < 100) return `Pace ≈ $${monthly.toFixed(2)}/mo (est.) — mid-tier plan territory; watch the big-model calls.`;
    return `Pace ≈ $${monthly.toFixed(0)}/mo (est.) — heavy usage; route routine work to cheaper models (per-persona models help).`;
}

/** Tombstone clear: every device's entries/days from before now are dropped, not overwritten with an empty payload. */
export function clearLlmUsage(): void {
    const cur = llmUsageStore.getSnapshot();
    const clearedAt = Date.now();
    const devices: Record<string, DeviceLedger> = {};
    for (const [id, dev] of Object.entries(cur.devices)) devices[id] = applyClearedAt(dev, clearedAt);
    persist({ v: 2, clearedAt, devices });
}

/** Test-only: full wipe incl. localStorage, no tombstone (use clearLlmUsage() in prod code). */
export function resetLlmUsage(): void {
    llmUsageStore.set(emptyStored(), () => {
        try { localStorage.removeItem(resolveKey()); } catch { /* sandboxed */ }
    });
}

export function useLlmUsage(): UsageLedger {
    const stored = useSyncExternalStore(llmUsageStore.subscribe, llmUsageStore.getSnapshot, llmUsageStore.getServerSnapshot);
    return useMemo(() => aggregateCached(stored), [stored]);
}
