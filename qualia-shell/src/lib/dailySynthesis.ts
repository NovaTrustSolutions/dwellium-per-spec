/**
 * dailySynthesis — P12-5 dream expansion (gap item 3, 2026-06-12).
 *
 * The video's pitch: "overnight it re-reads EVERYTHING — conversations,
 * skills you used, your goals — and surfaces patterns." Dwellium's dreamer
 * (honchoBackgroundRunner) previously read Honcho memories only. This module
 * builds the WIDE corpus from every queryable knowledge surface:
 *
 *   memories (Honcho) · ARA exchanges (hermes-learning ara-chat records) ·
 *   goals + progress (Mission Control) · ThoughtWeaver captures ·
 *   artifacts produced · AI usage/spend (P12-1 ledger)
 *
 * Pure reads over store snapshots (holders are set by the runner/login);
 * every section is capped so the dream prompt stays small.
 */
import { memoryStore, type LocalMemory } from '../components/HonchoHermesPanel/honchoMemoryStore';
import { hermesLearningStore } from '../components/HonchoHermesPanel/hermesLearningStore';
import { goalsStore, goalProgress } from './goalsStore';
import { thoughtWeaverStore } from '../components/ThoughtWeaver/thoughtWeaverStore';
import { artifactStore } from './artifactStore';
import { lastNDays, planAdvice } from './llmUsageStore';
import { personaWorkStore } from './agents/personaWorkStore';
import { getCostKpi } from './costKpiStore';
import { costAdvisoryLines } from './costAdvisor';

export interface DreamCorpus {
    /** Markdown-ish prompt body, sections in a stable order. */
    text: string;
    /** Non-empty section count — the "is there material?" gate. */
    sections: number;
    /** Per-section item counts (observability + tests). */
    counts: Record<string, number>;
}

const cap = (s: string, n: number) => (s.length > n ? `${s.slice(0, n)}…` : s);

/** Build the wide dream corpus from current store snapshots. */
export function buildDreamCorpus(): DreamCorpus {
    const parts: string[] = [];
    const counts: Record<string, number> = {};

    const memories = memoryStore.getSnapshot().slice(0, 12);
    counts.memories = memories.length;
    if (memories.length > 0) {
        parts.push(`## Memories\n${memories.map((m: LocalMemory, i) => `${i + 1}. [${m.memoryType}] ${cap(m.content, 200)}`).join('\n')}`);
    }

    const runs = hermesLearningStore.getSnapshot().slice(0, 8);
    counts.conversations = runs.length;
    if (runs.length > 0) {
        parts.push(`## Recent agent exchanges\n${runs.map(r => `- (${r.taskType}${r.rating !== undefined ? `, rated ${r.rating > 0 ? '' : ''}` : ''}) ${cap(r.prompt, 140)}${r.summary ? ` → ${cap(r.summary, 120)}` : ''}`).join('\n')}`);
    }

    const goals = goalsStore.getSnapshot().filter(g => g.status !== 'done').slice(0, 6);
    counts.goals = goals.length;
    if (goals.length > 0) {
        parts.push(`## Active goals\n${goals.map(g => {
            const open = g.plan?.clarifyingQuestions?.length ?? 0;
            return `- ${cap(g.title, 100)} — ${goalProgress(g)}% done${open ? `, ${open} open question${open === 1 ? '' : 's'}` : ''}`;
        }).join('\n')}`);
    }

    const captures = thoughtWeaverStore.getSnapshot().slice(0, 8);
    counts.captures = captures.length;
    if (captures.length > 0) {
        parts.push(`## Captured thoughts\n${captures.map(c => `- ${cap(c.text, 140)}`).join('\n')}`);
    }

    const artifacts = artifactStore.getSnapshot().slice(0, 8);
    counts.artifacts = artifacts.length;
    if (artifacts.length > 0) {
        parts.push(`## Documents produced\n${artifacts.map(a => `- [${a.type}] ${cap(a.title, 80)}${a.summary ? ` — ${cap(a.summary, 90)}` : ''}`).join('\n')}`);
    }

    const week = lastNDays(7).filter(d => d.calls > 0);
    counts.usageDays = week.length;
    if (week.length > 0) {
        const calls = week.reduce((s, d) => s + d.calls, 0);
        const cost = week.reduce((s, d) => s + d.estCost, 0);
        parts.push(`## AI usage (7 days)\n- ${calls} calls, ~$${cost.toFixed(2)} estimated\n- ${planAdvice()}`);
    }

    const kpi = getCostKpi();
    const costLines = costAdvisoryLines(personaWorkStore.getSnapshot(), kpi, 3);
    counts.costFlags = costLines.length;
    if (costLines.length > 0) {
        parts.push(`## Cost optimization (your time at $${kpi}/hr)\n${costLines.map(l => `- ${l}`).join('\n')}`);
    }

    return { text: parts.join('\n\n'), sections: parts.length, counts };
}

/* ─── Deep (nightly) dream ─── */

export interface DeepDream {
    insights: Array<{ title: string; text: string }>;
    suggestions: string[];
}

export const DEEP_DREAM_SYSTEM =
    'You are Honcho, Dwellium\'s overnight reflection agent. You just re-read everything the user did ' +
    'recently: memories, agent conversations, goals and their progress, captured thoughts, documents produced, and AI usage. ' +
    'Surface what they would NOT notice themselves: cross-cutting patterns, stalled goals, unused capabilities, waste. ' +
    'Respond as STRICT JSON: {"insights":[{"title":"3-6 words","text":"1-2 sentences"}],"suggestions":["one imperative sentence"]} ' +
    'with 2-3 insights and 2-3 suggestions. No preamble, no code fences.';

/** Parse + sanitize the deep-dream LLM reply. Null when unusable. */
export function parseDeepDream(raw: string | null | undefined): DeepDream | null {
    if (!raw) return null;
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
        const parsed = JSON.parse(match[0]) as { insights?: unknown; suggestions?: unknown };
        const insights = (Array.isArray(parsed.insights) ? parsed.insights : [])
            .filter((i): i is { title: string; text: string } =>
                !!i && typeof (i as { title?: unknown }).title === 'string' && typeof (i as { text?: unknown }).text === 'string')
            .map(i => ({ title: i.title.slice(0, 80), text: i.text.slice(0, 400) }))
            .slice(0, 3);
        const suggestions = (Array.isArray(parsed.suggestions) ? parsed.suggestions : [])
            .filter((s): s is string => typeof s === 'string' && !!s.trim())
            .map(s => s.slice(0, 200))
            .slice(0, 3);
        if (insights.length === 0 && suggestions.length === 0) return null;
        return { insights, suggestions };
    } catch {
        return null;
    }
}

/** Local YYYY-MM-DD (calendar-day key for the nightly cycle + brief). */
export function dayKey(d = new Date()): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${dd}`;
}
