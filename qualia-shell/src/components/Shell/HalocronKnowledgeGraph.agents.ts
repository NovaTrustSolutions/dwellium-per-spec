/**
 * KG_AGENTS — data-only extraction of the Holocron "gods" agent rail.
 *
 * Lives in its own tiny module so that BOTH `HalocronKnowledgeGraph.tsx` (the
 * heavy component) and `HalocronOS.tsx` (the shell) can import this plain
 * constant statically WITHOUT statically pulling the heavy KG component into
 * the Desktop chunk. This lets `HalocronOS.tsx` `React.lazy` the KG component
 * (plan 008) — a default-only `React.lazy` cannot also bind a named export, so
 * the constant is hoisted here. No React / LLM / markdown imports → cheap.
 */

export interface KgAgent {
    id: string;
    name: string;
    god: string;
    color: string;
    online: boolean;
}

// The user's agents, represented as gods (matches the reference's AGENTS rail).
export const KG_AGENTS: KgAgent[] = [
    { id: 'hermes', name: 'Hermes', god: 'Messenger', color: '#e7c879', online: true },
    { id: 'ara', name: 'ARA', god: 'Athena', color: '#4d8aff', online: true },
    { id: 'stella', name: 'Stella', god: 'Hestia', color: '#ff5a8a', online: true },
    { id: 'hydra', name: 'Hydra', god: 'Hydra', color: '#a855f7', online: false },
    { id: 'honcho', name: 'Honcho', god: 'Mnemosyne', color: '#34d399', online: false },
];
