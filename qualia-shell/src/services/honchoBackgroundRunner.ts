/**
 * Honcho background runner — keeps Honcho "running in the background".
 *
 * Mounted ONCE at the app shell (AdminShell) after auth, this hook runs Honcho's
 * reflection loop independently of whether the Honcho widget window is open: on a
 * conservative cadence it asks the user's active LLM to synthesize a short "dream"
 * (a reflection over recent memories) and appends it to the per-user dream store,
 * so Honcho keeps working in the background and you see new reflections when you
 * next open it.
 *
 * Safe by construction:
 *  - No-op unless signed in, an LLM is configured (hasActiveLlm), AND there are
 *    enough memories to reflect on.
 *  - At most one synthesis per MIN_GAP_MS, persisted per-user, so it never spams
 *    the provider — even across reloads.
 *  - Effect-time only (SSR-safe); a single in-flight guard; errors are swallowed
 *    (a background task must never surface a user-facing failure).
 *
 * 2026-06-07 — addresses the "Honcho should run in the background" ask.
 */
import { useContext, useEffect, useRef } from 'react';
import { UserContext } from '../context/UserContext';
import { useIntegrations } from '../hooks/useIntegrations';
import { callLlm, hasActiveLlm } from '../lib/llmClient';
import { memoryStore, memoryUserIdHolder } from '../components/HonchoHermesPanel/honchoMemoryStore';
import { dreamStore, dreamUserIdHolder, appendDream } from '../components/StellaAgent/honchoDreamStore';
// P12-5/6 (gap items 3+4): wide dream corpus + nightly deep cycle + brief.
import { buildDreamCorpus, parseDeepDream, DEEP_DREAM_SYSTEM, dayKey } from '../lib/dailySynthesis';
import { hermesLearningUserIdHolder } from '../components/HonchoHermesPanel/hermesLearningStore';
import { thoughtWeaverUserIdHolder } from '../components/ThoughtWeaver/thoughtWeaverStore';
import { upsertBrief } from '../lib/morningBriefStore';
import { goalsStore, goalProgress } from '../lib/goalsStore';
import { artifactStore } from '../lib/artifactStore';
import { lastNDays, planAdvice } from '../lib/llmUsageStore';

const CHECK_EVERY_MS = 10 * 60 * 1000;   // re-evaluate every 10 min while logged in
const MIN_GAP_MS = 6 * 60 * 60 * 1000;   // at most one auto-reflection per 6 h
const MIN_MEMORIES = 3;                   // need material to reflect on
const FIRST_DELAY_MS = 60 * 1000;         // first check ~1 min after login

const lastRunKey = (uid: string | null) => `honcho:bg:lastRun:${uid || '_anonymous'}`;
/** P12-6: which calendar day the nightly deep cycle last ran for. */
const deepDayKey = (uid: string | null) => `honcho:bg:deepDay:${uid || '_anonymous'}`;
function readLastRun(uid: string | null): number {
    try { return Number(localStorage.getItem(lastRunKey(uid))) || 0; } catch { return 0; }
}
function writeLastRun(uid: string | null, ts: number) {
    try { localStorage.setItem(lastRunKey(uid), String(ts)); } catch { /* ignore */ }
}

/**
 * Always-on Honcho reflection loop. Call once near the top of the authenticated
 * shell. Returns nothing — it manages its own timers + cleanup.
 */
export function useHonchoBackgroundRunner(): void {
    const userCtx = useContext(UserContext);
    const uid = userCtx?.user?.id ?? null;
    const { integrations } = useIntegrations();
    const llm = integrations.llm;
    const runningRef = useRef(false);

    useEffect(() => {
        if (!uid) return; // only while signed in
        // Point the per-user store keys at this user even while the widget is closed,
        // so getSnapshot()/appendDream() resolve to the right namespace.
        memoryUserIdHolder.current = uid;
        dreamUserIdHolder.current = uid;
        // P12-5: the wide corpus reads these too (goals/artifacts/usage ride
        // integrationsUserIdHolder, already set by UserProvider).
        hermesLearningUserIdHolder.current = uid;
        thoughtWeaverUserIdHolder.current = uid;

        let cancelled = false;

        // ── P12-6: nightly deep cycle — once per CALENDAR DAY (the practical
        // "overnight" for an app that may be closed overnight: the first tick
        // of a new day re-reads EVERYTHING and writes the morning brief).
        // Data lines need NO LLM key; insights/suggestions do.
        const deepCycle = async () => {
            const today = dayKey();
            try { if (localStorage.getItem(deepDayKey(uid)) === today) return; } catch { return; }
            try { localStorage.setItem(deepDayKey(uid), today); } catch { /* claim the day first */ }

            // Hard-data lines (always available).
            const dataLines: string[] = [];
            const goals = goalsStore.getSnapshot().filter(g => g.status !== 'done');
            if (goals.length > 0) {
                const top = goals.slice(0, 3).map(g => `${g.title} ${goalProgress(g)}%`).join(' · ');
                dataLines.push(`Goals: ${top}`);
            }
            const week = lastNDays(7);
            const calls = week.reduce((s, d) => s + d.calls, 0);
            const cost = week.reduce((s, d) => s + d.estCost, 0);
            if (calls > 0) dataLines.push(`AI usage 7d: ${calls} calls (~$${cost.toFixed(2)}). ${planAdvice()}`);
            const artifacts = artifactStore.getSnapshot();
            if (artifacts.length > 0) dataLines.push(`Artifacts on file: ${artifacts.length} (latest: ${artifacts[0].title})`);

            // Deep dream (LLM, optional).
            let insights: Array<{ title: string; text: string }> = [];
            let suggestions: string[] = [];
            if (hasActiveLlm(llm)) {
                const corpus = buildDreamCorpus();
                if (corpus.sections >= 1) {
                    try {
                        const res = await callLlm({
                            systemPrompt: DEEP_DREAM_SYSTEM,
                            prompt: corpus.text,
                            maxTokens: 700,
                            temperature: 0.6,
                            responseFormat: 'json',
                        }, llm);
                        const deep = parseDeepDream(res?.text);
                        if (deep) {
                            insights = deep.insights;
                            suggestions = deep.suggestions;
                            for (const i of insights) appendDream({ title: i.title, text: i.text, sources: [] });
                        }
                    } catch { /* key-less or provider hiccup — data-only brief */ }
                }
            }
            if (dataLines.length > 0 || insights.length > 0) {
                upsertBrief({ date: today, insights, suggestions, dataLines });
            }
        };

        const tick = async () => {
            if (cancelled || runningRef.current) return;
            runningRef.current = true;
            try {
                await deepCycle(); // once per day, LLM-optional
                if (cancelled || !hasActiveLlm(llm)) return; // light dream needs a key
                const memories = memoryStore.getSnapshot();
                if (memories.length < MIN_MEMORIES) return;      // not enough material
                const now = Date.now();
                if (now - readLastRun(uid) < MIN_GAP_MS) return; // throttle (persisted across reloads)
                writeLastRun(uid, now); // claim the slot immediately so a reload can't double-fire

                // P12-5: the light 6-hourly dream now reads the WIDE corpus
                // (memories + agent exchanges + goals + captures + artifacts
                // + usage), not memories alone.
                const corpus = buildDreamCorpus();
                if (corpus.sections === 0) return;
                const priorTitles = dreamStore.getSnapshot().slice(0, 3).map((d) => d.title).filter(Boolean).join('; ');
                const res = await callLlm({
                    systemPrompt:
                        'You are Honcho, a background reflection agent. Look across EVERYTHING below — memories, agent ' +
                        'conversations, goals, captured thoughts, documents, AI usage — and surface ONE non-obvious pattern, ' +
                        'connection, or unsurfaced to-do. Respond as STRICT JSON: ' +
                        '{"title":"3-6 word headline","text":"1-2 sentence reflection"}. No preamble, no code fences.',
                    prompt:
                        `${corpus.text}\n\n` +
                        (priorTitles ? `Avoid repeating these prior reflections: ${priorTitles}\n\n` : '') +
                        'Synthesize one fresh reflection as JSON.',
                    maxTokens: 300,
                    temperature: 0.6,
                    responseFormat: 'json',
                }, llm);
                if (cancelled || !res?.text) return;
                let title = '';
                let text = '';
                try {
                    const parsed = JSON.parse(res.text.trim().replace(/^```json\s*|```$/g, '').trim());
                    title = String(parsed.title || '').slice(0, 80);
                    text = String(parsed.text || '').slice(0, 600);
                } catch { /* provider returned non-JSON — skip this cycle */ }
                if (title && text) appendDream({ title, text, sources: memories.slice(0, 12).map((m) => m.id) });
            } catch {
                /* background task — never surface */
            } finally {
                runningRef.current = false;
            }
        };

        const first = setTimeout(tick, FIRST_DELAY_MS);
        const interval = setInterval(tick, CHECK_EVERY_MS);
        return () => { cancelled = true; clearTimeout(first); clearInterval(interval); };
    }, [uid, llm]);
}
