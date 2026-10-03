/**
 * Theme-token helpers shared by the File Explorer widget (no hard-coded palette).
 * Raw --text-secondary/--text-tertiary (latte #7c6aad) are < 4.5:1 on light surfaces and raw --danger
 * is 3.5:1, so text colours are mixed toward --text-primary. Verified against every theme (see W3 report).
 */
export const MUTED_TEXT = 'color-mix(in srgb, var(--text-tertiary) 60%, var(--text-primary))';
export const DANGER_TEXT = 'color-mix(in srgb, var(--danger) 60%, var(--text-primary))';
export const WARN_TEXT = 'color-mix(in srgb, var(--warning) 45%, var(--text-primary))';
export const ACCENT_TEXT = 'color-mix(in srgb, var(--accent-text) 70%, var(--text-primary))';
/** Filled danger button: darkened danger fill with white text (theme-independent on-colour). */
export const DANGER_FILL = 'color-mix(in srgb, var(--danger) 70%, black)';
export const ON_DANGER = 'white';
/** Modal scrim: a darkening overlay is theme-independent by design. */
export const SCRIM = 'color-mix(in srgb, black 55%, transparent)';
/** Minimum interactive hit area (px). */
export const HIT = 32;
