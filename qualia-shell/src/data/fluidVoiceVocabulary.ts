/**
 * fluidVoiceVocabulary — plan 047 "FluidVoice companion" phase 1: the
 * property-management custom-vocabulary seed for FluidVoice's dictionary API
 * (`POST http://127.0.0.1:47733/v1/dictionary/custom-words`, Local API on).
 *
 * Built from REAL app terms: product/widget proper nouns (widgetRegistry
 * labels), Strata domain jargon (StrataDashboard modules), and seed community
 * names (public/data). Deliberately NO resident/vendor person names —
 * PII never leaves the backend (plan 047 STOP condition / G9).
 *
 * The payload `mode` is ALWAYS 'append' — never 'replace' (upsert-only rule).
 */

export interface VocabularyEntry {
    /** The exact casing FluidVoice should type. */
    text: string;
    /** Optional recognition weight (FluidVoice default when omitted). */
    weight?: number;
    /** Alternate spoken/misheard forms mapped to `text`. */
    aliases?: string[];
}

export const FLUIDVOICE_VOCABULARY: ReadonlyArray<VocabularyEntry> = [
    // ── Product + widget proper nouns (src/registry/widgetRegistry.ts labels)
    { text: 'Dwellium', aliases: ['Dwelium', 'Dwellum'] },
    { text: 'ARA', aliases: ['ARRA'] },
    { text: 'Strata', aliases: ['Strata Dashboard'] },
    { text: 'Astra' },
    { text: 'Scribe' },
    { text: 'Honcho' },
    { text: 'Hermes' },
    { text: 'Hydra' },
    { text: 'Stella' },
    { text: 'Thought Weaver', aliases: ['ThoughtWeaver'] },
    { text: 'OpenJarvis', aliases: ['Open Jarvis'] },
    { text: 'Domaine', aliases: ['Domain'] },
    { text: 'Inbox Zero' },
    { text: 'NotebookLM', aliases: ['Notebook LM'] },
    { text: 'Holocron' },
    { text: 'AppFolio', aliases: ['App Folio'] },
    { text: 'Documenso' },
    { text: 'Excalidraw' },
    { text: 'FluidVoice', aliases: ['Fluid Voice'] },
    // ── Property-management jargon (StrataDashboard modules)
    { text: 'work order', aliases: ['workorder'] },
    { text: 'move-in', aliases: ['move in'] },
    { text: 'move-out', aliases: ['move out'] },
    { text: 'lease renewal' },
    { text: 'security deposit' },
    { text: 'HVAC', aliases: ['H V A C'] },
    { text: 'escrow' },
    { text: 'delinquency' },
    { text: 'make-ready', aliases: ['make ready'] },
    { text: 'turnover' },
    // ── Seed community names (public/data seeds; communities, not people)
    { text: 'Woodland Parc Townhomes', aliases: ['Woodland Park Townhomes'] },
    { text: 'Riverwood Club Apartments' },
    { text: 'Buena Vista' },
];

/** Payload for `/v1/dictionary/custom-words`. ALWAYS append; never replace. */
export function buildVocabularyPayload(): { entries: VocabularyEntry[]; mode: 'append' } {
    return { entries: [...FLUIDVOICE_VOCABULARY], mode: 'append' };
}

/** One-liner Andy runs after "Copy vocabulary" (FluidVoice Local API enabled, port 47733). */
export const SEED_COMMAND =
    "pbpaste | curl -s -X POST -H 'content-type: application/json' --data-binary @- http://127.0.0.1:47733/v1/dictionary/custom-words";
