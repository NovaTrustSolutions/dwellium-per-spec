/**
 * AutonomousRuns — library of long-running autonomous-run harnesses (spec §1.4).
 * Surfaces the repo's `launch_*_autorun.sh` harnesses as an in-app catalog with
 * descriptions + the exact launch command (copyable) and a shortcut to the
 * Terminal. The runs themselves (2–8h) execute via the Terminal/backend — this
 * is the library + launcher, honestly labeled.
 */
import { useState } from 'react';
import { Bot, Copy, TerminalSquare, Clock } from 'lucide-react';

const ACCENT = '#D6FE51';

interface RunDef { id: string; name: string; cmd: string; blurb: string; eta: string }
const RUNS: RunDef[] = [
    { id: 'ara', name: 'ARA — research/inbox autorun', cmd: 'bash launch_ara_autorun.sh', blurb: 'Autonomous research + inbox triage loop (ARA/Stella).', eta: '2–8h' },
    { id: 'dashboard', name: 'Dashboard bring-up autorun', cmd: 'bash launch_dashboard_autorun.sh', blurb: 'Long-running dashboard functionality bring-up + parity checks.', eta: '2–6h' },
    { id: 'ingest', name: 'Ingestion autorun', cmd: 'bash launch_ingest_autorun.sh', blurb: 'Continuous corpus ingestion + watch.', eta: '1–4h' },
    { id: 'integrations', name: 'Integrations autorun', cmd: 'bash launch_integrations_autorun.sh', blurb: 'Per-user integrations wiring + verification.', eta: '1–3h' },
    { id: 'workspace', name: 'Workspace autorun', cmd: 'bash launch_workspace_autorun.sh', blurb: 'Workspace/file hierarchy bring-up + maintenance.', eta: '1–4h' },
    { id: 'cleanup', name: 'Cleanup autorun', cmd: 'bash launch_cleanup_autorun.sh', blurb: 'Repo/UI cleanup + housekeeping sweep.', eta: '1–2h' },
];

export default function AutonomousRuns() {
    const [copied, setCopied] = useState<string | null>(null);
    const copy = (id: string, cmd: string) => { try { void navigator.clipboard.writeText(cmd); setCopied(id); setTimeout(() => setCopied(null), 1500); } catch { /* */ } };
    const openTerminal = () => window.dispatchEvent(new CustomEvent('qualia-open-widget', { detail: 'terminal' }));

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%', width: '100%', background: '#000', color: '#ccc', fontFamily: 'inherit', fontSize: 13, overflow: 'hidden' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 16px', borderBottom: '1px solid #222', flexShrink: 0 }}>
                <Bot size={15} style={{ color: ACCENT }} />
                <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#888', flex: 1 }}>Autonomous Runs</span>
                <button onClick={openTerminal} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 12px', borderRadius: 6, border: '1px solid #333', background: 'transparent', color: '#ccc', fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                    <TerminalSquare size={13} /> Open Terminal
                </button>
            </div>
            <div style={{ padding: '8px 16px', borderBottom: '1px solid #161616', fontSize: 11, color: '#777' }}>
                Long-running harnesses. Launch from the repo root in the Terminal; they run unattended for hours and write progress logs.
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: 14, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 12, alignContent: 'start' }}>
                {RUNS.map((r) => (
                    <div key={r.id} className="spotlight-card" style={{ borderRadius: 10, padding: 12, background: '#0c0c0c' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                            <span style={{ fontWeight: 700, color: '#fff', flex: 1, fontSize: 13 }}>{r.name}</span>
                            <span style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 10, color: '#888' }}><Clock size={11} /> {r.eta}</span>
                        </div>
                        <div style={{ fontSize: 11.5, color: '#999', marginBottom: 10, lineHeight: 1.5 }}>{r.blurb}</div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <code style={{ flex: 1, fontSize: 11, color: ACCENT, background: '#000', border: '1px solid #222', borderRadius: 5, padding: '5px 8px', fontFamily: "'JetBrains Mono','Fira Code',monospace", overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.cmd}</code>
                            <button onClick={() => copy(r.id, r.cmd)} title="Copy command" style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '5px 10px', borderRadius: 5, border: `1px solid ${copied === r.id ? ACCENT : '#333'}`, background: 'transparent', color: copied === r.id ? ACCENT : '#ccc', fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0 }}>
                                <Copy size={12} /> {copied === r.id ? 'Copied' : 'Copy'}
                            </button>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
