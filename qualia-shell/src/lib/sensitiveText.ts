/**
 * sensitiveText — shared "does this look like a secret or personal data?"
 * check. Used before auto-captured text (CoPaw facts, agent activity
 * snippets) is stored, recalled into prompts, or shown as a preview.
 * Moved out of components/Hive/copawStore.ts (plan 071 phase 3).
 */
// ponytail: regex denylist for secret/PII detection; swap for an LLM/aidefence classifier if false negatives show up
export const ZERO_WIDTH = /[​-‍⁠﻿]/g;
const SECRET_OR_PII: RegExp[] = [
    // A credential label followed (within a clause) by is/was/:/= and a value that looks like a secret:
    // has a digit or symbol, or is 16+ chars. "The secret to low vacancy is fast turnover." stays a fact.
    /\b(password|passwd|pwd|pw|passcode|passphrase|pin|api[ _-]?key|secret|token|private key)\b[^.!?\n]{0,40}?(?:\bis\b|\bwas\b|:|=)\s*["'`*]*(?=[^\s"'`*]*[\d!@#$%^&_]|[^\s"'`*]{16,})[^\s"'`*]{4,}/i,
    /\bsk[-_][A-Za-z0-9_-]{16,}/,              // OpenAI / Stripe-style secret keys (sk-…, sk_live_…)
    /\b[rs]k[-_](live|test|proj)[-_]/,
    /\bAKIA[0-9A-Z]{16}\b/,
    /-----BEGIN [A-Z ]*PRIVATE KEY/,
    /\beyJ[\w-]{8,}\.[\w-]{8,}\./,             // JWT
    /\bgh[pousr]_[A-Za-z0-9]{20,}\b/,
    /\bxox[abpr]-/,
    /\b\d{3}([ .-])\d{2}\1\d{4}\b/,           // SSN with separators (a bare 9-digit parcel id stays)
    /\b(ssn|social security)\b/i,
    /\b(?:\d[ -]?){13,19}\b/,                  // card-like digit run
    /\b[\w.+-]+@[\w-]+\.[\w.-]+\b/,             // email
    /(?:\+?1[ .-]?)?\(?\b\d{3}\)?[ .-]\d{3}[ .-]\d{4}\b/, // US phone (separators required)
];

/** True if `text` looks like it contains a secret or PII (see SECRET_OR_PII). */
export function isSensitiveFact(text: string): boolean {
    const t = text.replace(ZERO_WIDTH, '');
    return SECRET_OR_PII.some((re) => re.test(t));
}
