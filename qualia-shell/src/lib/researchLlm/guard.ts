/**
 * researchLlm/guard — outbound data firewall for the Research Lab (defense in
 * depth; the structural firewall is researchLabImportGuard.test.ts).
 *
 * Every prompt headed to a free provider is scanned BEFORE the request is
 * built. Three outcomes:
 *   - block: card-number shapes, SSN shapes, ABA routing numbers. Hard stop
 *     with a clear message — never a silent strip.
 *   - warn:  housing-record vocabulary (lease/tenant/resident/rent roll).
 *     Research about housing LAW is legitimate; pasting a rent roll is not.
 *     Warned once per *distinct prompt* per session (tracked by a hash of the
 *     trimmed, lowercased text) — seeing the exact same prompt again stays
 *     quiet, but a different prompt with housing vocabulary warns again, so
 *     the protection does not decay to silence over a long session. The user
 *     may explicitly confirm and proceed.
 *   - ok:    everything else.
 *
 * Card regex is the repo PII-guard family /\b(?:\d[ -]*?){13,19}\b/ — known to
 * false-positive on the 16-hex-digit prefixes of raw UUIDs (see repo CLAUDE.md
 * "PII" convention). UUID-shaped substrings are removed before the card scan
 * so pasting an id like 12345678-1234-1234-1234-123456789012 stays legal;
 * both directions are pinned in researchGuard.test.ts.
 */

/** Repo PII regex family — 13-19 digits allowing space/dash separators. */
const CARD_RE = /\b(?:\d[ -]*?){13,19}\b/;
/** 8-4-4-4-12 hex UUID — stripped before the card scan (known false positive). */
const UUID_RE = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi;
const SSN_RE = /\b\d{3}-\d{2}-\d{4}\b/;
/** Candidate bank-routing shapes: bare 9-digit runs, validated by ABA checksum. */
const NINE_DIGIT_RE = /\b\d{9}\b/g;

/** ABA routing checksum: 3(d1+d4+d7) + 7(d2+d5+d8) + (d3+d6+d9) ≡ 0 (mod 10). */
function isAbaRoutingNumber(digits: string): boolean {
    const d = digits.split('').map(Number);
    return (3 * (d[0] + d[3] + d[6]) + 7 * (d[1] + d[4] + d[7]) + (d[2] + d[5] + d[8])) % 10 === 0;
}

const WARN_RE = /\b(lease|tenant|resident|rent\s*roll)s?\b/i;

export type GuardVerdict =
    | { kind: 'ok' }
    | { kind: 'block'; reason: string }
    | { kind: 'warn'; reason: string };

/**
 * Cheap non-crypto hash (FNV-1a, 32-bit) of the trimmed, lowercased prompt —
 * this is a UX latch to avoid re-warning on a prompt already confirmed this
 * session, not a security boundary. Collisions just mean an unrelated prompt
 * stays quiet a little too often; that failure mode is acceptable here.
 */
function hashPrompt(text: string): string {
    const normalized = text.trim().toLowerCase();
    let hash = 0x811c9dc5;
    for (let i = 0; i < normalized.length; i++) {
        hash ^= normalized.charCodeAt(i);
        hash = Math.imul(hash, 0x01000193);
    }
    return (hash >>> 0).toString(16);
}

/** Prompts (by hash) already warned-on-or-confirmed this session (in-memory — a reload re-arms it on purpose). */
const warnedPromptHashes = new Set<string>();

/** Test escape hatch (v2.72.1 standing convention). */
export function resetGuardSession(): void {
    warnedPromptHashes.clear();
}

/**
 * Scan outgoing text. `confirmed` = the user explicitly accepted the housing
 * warning for this run; it never bypasses a block.
 */
export function guardOutbound(text: string, opts?: { confirmed?: boolean }): GuardVerdict {
    // Blocks first — a confirm can never override these.
    const withoutUuids = text.replace(UUID_RE, ' ');
    if (CARD_RE.test(withoutUuids)) {
        return { kind: 'block', reason: 'Blocked: the prompt contains a card-number-shaped sequence (13–19 digits). Free research providers must never receive financial data.' };
    }
    if (SSN_RE.test(text)) {
        return { kind: 'block', reason: 'Blocked: the prompt contains an SSN-shaped sequence (###-##-####). Free research providers must never receive personal identifiers.' };
    }
    for (const m of withoutUuids.match(NINE_DIGIT_RE) ?? []) {
        if (isAbaRoutingNumber(m)) {
            return { kind: 'block', reason: 'Blocked: the prompt contains a bank-routing-shaped number (valid ABA checksum). Free research providers must never receive financial data.' };
        }
    }
    const warnHit = WARN_RE.exec(text);
    if (warnHit) {
        const hash = hashPrompt(text);
        if (opts?.confirmed) {
            warnedPromptHashes.add(hash);
        } else if (!warnedPromptHashes.has(hash)) {
            warnedPromptHashes.add(hash);
            return { kind: 'warn', reason: `Heads up: "${warnHit[0]}" — asking about housing law is fine, but never paste actual resident, lease, or rent-roll records here. Free providers may train on what you type. Confirm to send anyway.` };
        }
    }
    return { kind: 'ok' };
}
