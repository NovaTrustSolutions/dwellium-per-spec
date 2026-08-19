/**
 * WidgetTip — plan 047 §4 per-widget first-open tip (once per user per widget).
 *
 * Mounted by Window.tsx as a SIBLING after `.window__content` (zero-DOM
 * contract: the widget root stays the first child of `.window__content`).
 * Three bullets from the registry — what it does (`description`), try this
 * (`tip.tryThis`), related (`tip.related` chips → open-widget bus) — plus
 * "Got it". Seen-state lives in onboardingStore (One Save); auto-dismiss at
 * 20 s counts as seen too (`dismissed: 'timeout'` in the activity log).
 *
 * Shows only for users who picked an onboarding role (legacy users are not
 * spammed after deploy) and only for windows mounted AFTER the role was set —
 * the two default-stack windows that auto-open before the role pick stay
 * quiet (FirstRunCard owns that moment). Titlebar "?" / ⌘K "help: <widget>"
 * force it open via `dwellium:show-tip`.
 */
import { useEffect, useRef, useState } from 'react';
import { getWidgetMeta } from '../../registry/widgetRegistry';
import { markTipSeen, useOnboarding } from '../../lib/onboardingStore';
import { openWidget } from '../../lib/dwelliumCommands';
import { SHOW_TIP_EVENT } from '../../lib/helpCommands';
import './WidgetTip.css';

export const WIDGET_TIP_TIMEOUT_MS = 20_000;

export default function WidgetTip({ widgetId }: { widgetId: string }) {
    const ob = useOnboarding();
    const roleAtMount = useRef(ob.role);
    const [forced, setForced] = useState(false);

    useEffect(() => {
        const onShow = (e: Event) => {
            if ((e as CustomEvent<{ widgetId?: string }>).detail?.widgetId === widgetId) setForced(true);
        };
        window.addEventListener(SHOW_TIP_EVENT, onShow);
        return () => window.removeEventListener(SHOW_TIP_EVENT, onShow);
    }, [widgetId]);

    const reg = getWidgetMeta(widgetId);
    const seen = ob.seenTips.includes(widgetId);
    const visible = !!reg?.tip && (forced || (roleAtMount.current !== null && ob.role !== null && !seen));

    const dismiss = (how: 'button' | 'timeout') => { markTipSeen(widgetId, how); setForced(false); };

    useEffect(() => {
        if (!visible) return;
        const t = window.setTimeout(() => dismiss('timeout'), WIDGET_TIP_TIMEOUT_MS);
        return () => window.clearTimeout(t);
        // dismiss is stable per widgetId
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [visible, widgetId]);

    if (!visible || !reg?.tip) return null;
    const related = reg.tip.related.map(id => getWidgetMeta(id)).filter((r): r is NonNullable<typeof r> => !!r);

    return (
        <aside className="widget-tip" role="note" aria-label={`${reg.label} — first-open tip`}>
            <div className="widget-tip__head">
                <span className="widget-tip__title">{reg.label}</span>
                <button type="button" className="widget-tip__got-it" onClick={() => dismiss('button')}>Got it</button>
            </div>
            <ul className="widget-tip__list">
                <li><b>What it does.</b> {reg.description}</li>
                <li><b>Try this.</b> {reg.tip.tryThis}</li>
                {related.length > 0 && (
                    <li>
                        <b>Related.</b>{' '}
                        {related.map(r => (
                            <button key={r.id} type="button" className="widget-tip__chip" onClick={() => openWidget(r.id)}>{r.label}</button>
                        ))}
                    </li>
                )}
            </ul>
        </aside>
    );
}
