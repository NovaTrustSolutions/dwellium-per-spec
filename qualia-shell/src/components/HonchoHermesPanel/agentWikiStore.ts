/**
 * agentWikiStore — the bidirectional "LLM Wiki" memory spine (Karpathy-style).
 *
 * Two layers, mirroring the third reference image:
 *   (1) IDENTITY — MEMORY.md / USER.md / SOUL.md: "knows YOU". Stable,
 *       hand-curated (or self-curated) facts about the operator and the agent's
 *       own persona/values. Fed into every persona run as system context.
 *   (2) WIKI — raw / wiki / meetings / docs / facts: "knows your WORLD". A
 *       self-growing knowledge base. New material lands in `raw`; the ingestion
 *       pass distils atomic claims into `facts` and FLAGS contradictions against
 *       facts already on file (read → source page → update affected → flag).
 *
 * Bidirectional: identity + facts flow OUT into prompts (`buildWikiContext`),
 * and agent/operator material flows IN via `ingestRaw`. Per-user, local-first,
 * One-Save-synced — same shape as honchoMemoryStore.
 *
 * Storage key:  agent:wiki:<userId>
 */
import { createLocalStorageStore } from '../../utils/createLocalStorageStore';
import { withSync } from '../../lib/oneSaveStore';

export type WikiFolder = 'raw' | 'wiki' | 'meetings' | 'docs' | 'facts';

export const WIKI_FOLDERS: { id: WikiFolder; label: string; icon: string; blurb: string }[] = [
    { id: 'raw', label: 'raw', icon: '', blurb: 'Unprocessed inbox — everything lands here first' },
    { id: 'wiki', label: 'wiki', icon: '', blurb: 'Curated, linked knowledge pages' },
    { id: 'meetings', label: 'meetings', icon: '', blurb: 'Granola / call transcripts & summaries' },
    { id: 'docs', label: 'docs', icon: '', blurb: 'Long-form source documents' },
    { id: 'facts', label: 'facts', icon: '', blurb: 'Atomic, deduped claims distilled from sources' },
];

export interface WikiPage {
    id: string;
    folder: WikiFolder;
    title: string;
    body: string;
    /** Source references (urls, filepaths, "granola:meeting-id", etc). */
    sources: string[];
    /** Ids of related pages (concept links). */
    links: string[];
    /** Set when the ingestion pass thinks this claim conflicts with another. */
    contradicts?: string;
    createdAt: string;
    updatedAt: string;
}

export type IdentityKind = 'MEMORY.md' | 'USER.md' | 'SOUL.md';

export interface AgentWikiState {
    identity: Record<IdentityKind, string>;
    pages: WikiPage[];
}

const DEFAULT_IDENTITY: Record<IdentityKind, string> = {
    'MEMORY.md':
        '# MEMORY\n\nWorking memory the agent keeps about the operator and ongoing work.\n\n- (empty — ingest material or edit this file)\n',
    'USER.md':
        '# USER\n\nWho the operator is, how they like to work, what they care about.\n\n- Name: \n- Role: \n- Preferences: \n',
    'SOUL.md':
        '# SOUL\n\nThe agent\'s own persona, values, and operating principles.\n\n- Be concrete and cite sources.\n- Flag contradictions instead of papering over them.\n- Prefer the operator\'s stated preferences.\n',
};

export const agentWikiUserIdHolder: { current: string | null } = { current: null };

function resolveKey(): string {
    const uid = agentWikiUserIdHolder.current;
    return uid ? `agent:wiki:${uid}` : 'agent:wiki:_anonymous';
}

function deserialize(raw: string | null): AgentWikiState {
    const empty: AgentWikiState = { identity: { ...DEFAULT_IDENTITY }, pages: [] };
    if (!raw) return empty;
    try {
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== 'object') return empty;
        const identity = { ...DEFAULT_IDENTITY, ...(parsed.identity || {}) };
        const pages: WikiPage[] = Array.isArray(parsed.pages)
            ? parsed.pages.filter((p: any): p is WikiPage => p && typeof p.id === 'string' && typeof p.body === 'string')
            : [];
        return { identity, pages };
    } catch {
        return empty;
    }
}

export const agentWikiStore = withSync(
    createLocalStorageStore<AgentWikiState>({
        key: resolveKey,
        deserializer: deserialize,
        defaultValue: { identity: { ...DEFAULT_IDENTITY }, pages: [] },
    }),
    { objectType: 'agent-wiki', holder: agentWikiUserIdHolder, resolveKey },
);

function persist(next: AgentWikiState) {
    agentWikiStore.set(next, () => {
        try { localStorage.setItem(resolveKey(), JSON.stringify(next)); } catch { /* sandboxed */ }
    });
}

function uid(prefix: string): string {
    return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

/** Overwrite one of the identity files. */
export function setIdentityFile(kind: IdentityKind, body: string): void {
    const cur = agentWikiStore.getSnapshot();
    persist({ ...cur, identity: { ...cur.identity, [kind]: body } });
}

/** Add a page to a folder directly. */
export function addPage(input: { folder: WikiFolder; title: string; body: string; sources?: string[]; links?: string[] }): WikiPage {
    const now = new Date().toISOString();
    const page: WikiPage = {
        id: uid('pg'),
        folder: input.folder,
        title: input.title.trim() || 'Untitled',
        body: input.body,
        sources: input.sources ?? [],
        links: input.links ?? [],
        createdAt: now,
        updatedAt: now,
    };
    const cur = agentWikiStore.getSnapshot();
    persist({ ...cur, pages: [page, ...cur.pages] });
    return page;
}

export function deletePage(id: string): void {
    const cur = agentWikiStore.getSnapshot();
    persist({ ...cur, pages: cur.pages.filter(p => p.id !== id) });
}

/** Split a body into atomic claim-like sentences (heuristic distillation). */
function distillClaims(body: string): string[] {
    return body
        .replace(/\s+/g, ' ')
        .split(/(?<=[.!?])\s+(?=[A-Z0-9"'])/)
        .map(s => s.trim())
        .filter(s => s.length >= 16 && s.length <= 240)
        .slice(0, 12);
}

/** Cheap token-overlap similarity for contradiction detection. */
function overlap(a: string, b: string): number {
    const wa = new Set(a.toLowerCase().match(/[a-z0-9]{4,}/g) ?? []);
    const wb = new Set(b.toLowerCase().match(/[a-z0-9]{4,}/g) ?? []);
    if (!wa.size || !wb.size) return 0;
    let n = 0;
    for (const w of wa) if (wb.has(w)) n++;
    return n / Math.min(wa.size, wb.size);
}

const NEGATION = /\b(not|no longer|never|isn'?t|aren'?t|won'?t|doesn'?t|cancel(?:l?ed)?|deprecated|removed|instead of)\b/i;

export interface IngestReport {
    rawPageId: string;
    factsAdded: number;
    contradictions: { newClaim: string; existing: string }[];
}

/**
 * The ingestion pass: drop material in `raw`, distil atomic claims into `facts`,
 * and FLAG contradictions against existing facts (high overlap + opposite
 * polarity). Mirrors the transcript's read → source page → update → flag loop.
 */
export function ingestRaw(input: { title: string; body: string; sources?: string[]; folder?: WikiFolder }): IngestReport {
    const now = new Date().toISOString();
    const cur = agentWikiStore.getSnapshot();
    const folder: WikiFolder = input.folder ?? 'raw';

    const rawPage: WikiPage = {
        id: uid('pg'),
        folder,
        title: input.title.trim() || 'Ingested material',
        body: input.body,
        sources: input.sources ?? [],
        links: [],
        createdAt: now,
        updatedAt: now,
    };

    const existingFacts = cur.pages.filter(p => p.folder === 'facts');
    const claims = distillClaims(input.body);
    const factPages: WikiPage[] = [];
    const contradictions: { newClaim: string; existing: string }[] = [];

    for (const claim of claims) {
        // contradiction = high overlap but opposite polarity. Check FIRST, so a
        // polarity-flip of an existing claim is kept + flagged rather than being
        // swallowed as a near-duplicate.
        const conflict = existingFacts.find(f => {
            const o = overlap(f.body, claim);
            return o > 0.45 && (NEGATION.test(claim) !== NEGATION.test(f.body));
        });
        // dedupe against existing facts (only when it is NOT a contradiction)
        if (!conflict && existingFacts.some(f => overlap(f.body, claim) > 0.8)) continue;
        const fact: WikiPage = {
            id: uid('ft'),
            folder: 'facts',
            title: claim.slice(0, 60),
            body: claim,
            sources: [rawPage.id, ...(input.sources ?? [])],
            links: [],
            contradicts: conflict?.id,
            createdAt: now,
            updatedAt: now,
        };
        if (conflict) contradictions.push({ newClaim: claim, existing: conflict.body });
        factPages.push(fact);
    }

    persist({ ...cur, pages: [rawPage, ...factPages, ...cur.pages] });
    return { rawPageId: rawPage.id, factsAdded: factPages.length, contradictions };
}

/**
 * Bidirectional OUT path: a compact context string (identity + recent facts) to
 * inject into a persona/Hermes run so the agent "knows you and your world".
 */
export function buildWikiContext(maxFacts = 24): string {
    const { identity, pages } = agentWikiStore.getSnapshot();
    const facts = pages.filter(p => p.folder === 'facts').slice(0, maxFacts);
    const lines: string[] = [];
    lines.push('## Operator & agent identity');
    lines.push(identity['USER.md']);
    lines.push(identity['MEMORY.md']);
    lines.push(identity['SOUL.md']);
    if (facts.length) {
        lines.push('\n## Known facts (from the wiki)');
        for (const f of facts) lines.push(`- ${f.body}${f.contradicts ? ' (contested)' : ''}`);
    }
    return lines.join('\n').slice(0, 6000);
}

export function wikiCounts(s: AgentWikiState): Record<WikiFolder, number> {
    const out = { raw: 0, wiki: 0, meetings: 0, docs: 0, facts: 0 } as Record<WikiFolder, number>;
    for (const p of s.pages) out[p.folder]++;
    return out;
}
