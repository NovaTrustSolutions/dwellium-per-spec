/**
 * DemoBanner — dismiss-proof "Demo data" strip shown on Strata + Astra while
 * the demo workspace is ON (plan 046 D2). No close control, no "seen" flag:
 * invented money must stay labelled for as long as it is on screen.
 */
import type { CSSProperties } from 'react';
import { useDemoWorkspace } from '../../lib/demoWorkspaceStore';
import { openWidget } from '../../lib/dwelliumCommands';
import { openStrataModule } from '../StrataDashboard/strataDeepLink';

const btn: CSSProperties = {
    fontSize: 11, fontWeight: 600, padding: '3px 9px', borderRadius: 4, cursor: 'pointer',
    background: 'transparent', color: 'var(--text-primary)', border: '1px solid var(--border-default, rgba(255,255,255,0.18))',
};

export function DemoBanner() {
    const demo = useDemoWorkspace();
    if (!demo) return null;
    return (
        <div role="status" className="demo-banner" style={{
            display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
            margin: '8px 12px 0', padding: '6px 10px', borderRadius: 6,
            border: '1px solid #f59e0b', background: 'color-mix(in srgb, #f59e0b 10%, transparent)',
            fontSize: 12, color: 'var(--text-primary)',
        }}>
            <span style={{
                fontSize: 9, fontWeight: 700, letterSpacing: 0.6, textTransform: 'uppercase',
                color: '#f59e0b', border: '1px solid #f59e0b', borderRadius: 3, padding: '1px 5px',
            }}>Demo data</span>
            <span>Demo data — this isn&apos;t your portfolio.</span>
            <span style={{ marginLeft: 'auto', display: 'inline-flex', gap: 6 }}>
                <button type="button" style={btn} onClick={() => openWidget('control-panel')}>Replace with your data →</button>
                <button type="button" style={btn} onClick={() => openStrataModule('properties')}>Add a property</button>
            </span>
        </div>
    );
}
