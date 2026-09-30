/**
 * ClaudeCodeRow — plan 068 Phase 3. Shows Claude Code (CLI) usage inside the
 * AI Spend widget as an API-EQUIVALENT figure only — never spend, since
 * Ilya's Max subscription already covers it. Renders nothing when there's
 * no dev-only stats file to read (see lib/cliUsage.ts for why).
 */
import { useClaudeCodeUsage } from '../../lib/cliUsage';
import './ClaudeCodeRow.css';

const abbrev = (n: number) => {
    const v = Number(n) || 0;
    if (Math.abs(v) >= 1e9) return `${(v / 1e9).toFixed(1)}B`;
    if (Math.abs(v) >= 1e6) return `${(v / 1e6).toFixed(1)}M`;
    if (Math.abs(v) >= 1e3) return `${(v / 1e3).toFixed(1)}k`;
    return String(v);
};

export default function ClaudeCodeRow() {
    const usage = useClaudeCodeUsage();
    if (!usage) return null;

    const { totals, periodLabel, apiEquivalentUsd } = usage;

    return (
        <div className="cc-row">
            <div className="cc-row__head">
                <span className="cc-row__title">Claude Code (CLI)</span>
                <span className="cc-row__hint">dev build only</span>
            </div>
            <p className="cc-row__tokens">
                {abbrev(totals.freshInputTokens)} in
                {' · '}{abbrev(totals.cacheReadTokens)} cache read
                {' · '}{abbrev(totals.cacheCreationTokens)} cache write
                {' · '}{abbrev(totals.outputTokens)} out
            </p>
            <p className="cc-row__price">
                {apiEquivalentUsd !== null
                    ? `≈ $${apiEquivalentUsd.toFixed(2)} at API rates`
                    : 'API-equivalent unavailable — model not recorded'}
            </p>
            <p className="cc-row__note">Covered by your plan — not counted in spend</p>
            <p className="cc-row__period">{periodLabel}</p>
        </div>
    );
}
