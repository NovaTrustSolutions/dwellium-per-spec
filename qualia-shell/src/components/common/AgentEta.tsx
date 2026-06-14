/**
 * AgentEta — a shared "thinking with an ETA" indicator (2026-06-14). Every AI
 * agent shows this while working so the user gets an estimate up front instead
 * of an open-ended spinner. The ETA is an estimate (LLM latency isn't knowable
 * exactly); it counts down from `estimateSec`, then switches to "almost there…"
 * and keeps showing elapsed time so a long run is transparent rather than silent.
 */
import { useEffect, useRef, useState } from 'react';

interface Props {
    /** Rough expected duration in seconds (per-agent tunable). */
    estimateSec?: number;
    /** Verb shown before the ETA, e.g. "Hermes is working". */
    label?: string;
}

export default function AgentEta({ estimateSec = 15, label = 'Working' }: Props) {
    const [elapsed, setElapsed] = useState(0);
    const start = useRef(Date.now());
    useEffect(() => {
        const t = setInterval(() => setElapsed(Math.round((Date.now() - start.current) / 1000)), 1000);
        return () => clearInterval(t);
    }, []);
    const remaining = Math.max(0, estimateSec - elapsed);
    return (
        <span className="agent-eta" role="status" aria-live="polite" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontStyle: 'italic', opacity: 0.85 }}>
            <span className="agent-eta__spin" aria-hidden="true" style={{ display: 'inline-block', width: 9, height: 9, borderRadius: '50%', border: '2px solid currentColor', borderTopColor: 'transparent', animation: 'agent-eta-spin .8s linear infinite' }} />
            {label} — {remaining > 0 ? `ETA ~${remaining}s` : 'almost done…'} <span style={{ opacity: 0.6 }}>({elapsed}s elapsed)</span>
            <style>{'@keyframes agent-eta-spin{to{transform:rotate(360deg)}}'}</style>
        </span>
    );
}
