/**
 * NotYet — the one inline chip for every "not built yet" stub (plan 046 D3).
 * Replaces ad-hoc "Coming soon — Phase-N wires …" prose so every stub reads
 * the same and is grep-able. The chip text is literally "Coming soon" so the
 * existing `/Coming soon/i` parity assertions keep passing.
 */
export function NotYet({ reason, testId }: { reason: string; testId?: string }) {
    return (
        <div data-testid={testId} className="not-yet" role="note"
            style={{ fontSize: 11, color: 'var(--text-tertiary)', fontStyle: 'italic', display: 'flex', gap: 6, alignItems: 'center' }}>
            <span style={{ border: '1px solid currentColor', borderRadius: 3, padding: '0 5px', fontSize: 9, fontWeight: 700, letterSpacing: 0.6, textTransform: 'uppercase', fontStyle: 'normal' }}>Coming soon</span>
            {reason}
        </div>
    );
}

/**
 * String-state variant for the 4 static-mode write guards. Keeps "not " in the
 * text so SentimentModule's red/green regex still classifies it as an error.
 */
export const notYetMessage = (action: string): string => `${action} is not available in this read-only preview.`;
