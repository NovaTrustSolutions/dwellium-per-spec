/**
 * Trello label colours + AA-contrast text colour (plan 078 Phase 1, finding FE10).
 * Pure functions: no React, no CSS import.
 *
 * Base hexes are Trello's long-standing label palette (the ones the old widget used).
 * The `_dark` / `_light` hexes could not be sourced from an authoritative place offline,
 * so they are DERIVED: `_dark` = base mixed 25% toward black, `_light` = base mixed 40%
 * toward white. They are close to, not byte-identical with, Trello's own variants.
 */
export const TRELLO_LABEL_COLORS: Record<string, string> = {
    green: '#61bd4f', green_dark: '#498e3b', green_light: '#a0d795',
    yellow: '#f2d600', yellow_dark: '#b6a100', yellow_light: '#f7e666',
    orange: '#ff9f1a', orange_dark: '#bf7714', orange_light: '#ffc576',
    red: '#eb5a46', red_dark: '#b04435', red_light: '#f39c90',
    purple: '#c377e0', purple_dark: '#9259a8', purple_light: '#dbadec',
    blue: '#0079bf', blue_dark: '#005b8f', blue_light: '#66afd9',
    sky: '#00c2e0', sky_dark: '#0092a8', sky_light: '#66daec',
    lime: '#51e898', lime_dark: '#3dae72', lime_light: '#97f1c1',
    pink: '#ff78cb', pink_dark: '#bf5a98', pink_light: '#ffaee0',
    black: '#344563', black_dark: '#27344a', black_light: '#858fa1',
};

const channel = (hex: string, i: number): number => {
    const v = parseInt(hex.replace('#', '').slice(i, i + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
};

const luminance = (hex: string): number =>
    0.2126 * channel(hex, 0) + 0.7152 * channel(hex, 2) + 0.0722 * channel(hex, 4);

/** WCAG 2.x contrast ratio between two #rrggbb colours (1 to 21). */
export function contrastRatio(hexA: string, hexB: string): number {
    const [hi, lo] = [luminance(hexA), luminance(hexB)].sort((a, b) => b - a);
    return (hi + 0.05) / (lo + 0.05);
}

/** Whichever of near-black / white has the higher contrast against `bgHex`. */
export function labelTextColor(bgHex: string): '#111111' | '#ffffff' {
    return contrastRatio('#111111', bgHex) >= contrastRatio('#ffffff', bgHex) ? '#111111' : '#ffffff';
}

/** Inline style for a label chip. Unknown / missing colour gets a neutral chip from theme tokens. */
export function labelStyle(color: string | null | undefined): { background: string; color: string; outline?: string } {
    const hex = color ? TRELLO_LABEL_COLORS[color] : undefined;
    return hex
        ? { background: hex, color: labelTextColor(hex) }
        : { background: 'var(--bg-surface-elevated)', color: 'var(--text-primary)' };
}

/** `name` if non-empty, else the colour humanised (`green_dark` -> `Green (dark)`), else `Label`. */
export function labelDisplayName(label: { name?: string | null; color?: string | null }): string {
    const name = label.name?.trim();
    if (name) return name;
    if (!label.color) return 'Label';
    const [base, variant] = label.color.split('_');
    const title = base.charAt(0).toUpperCase() + base.slice(1);
    return variant ? `${title} (${variant})` : title;
}
