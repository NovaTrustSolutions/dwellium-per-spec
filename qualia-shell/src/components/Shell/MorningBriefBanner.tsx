/**
 * MorningBriefBanner — P12-6 (gap item 4): "a short morning brief every day."
 *
 * Shows once per day when an unseen brief exists (written by the background
 * runner's nightly cycle). "Read brief" opens ARA and posts the brief as an
 * assistant message via the morningBriefStore pending-slot bus; dismiss marks
 * it seen. SystemHealthBanner sister shape (incl. importing its own CSS —
 * the lesson from the "AI services split screen" 564151d).
 */
import { useMorningBrief, markBriefSeen, requestBriefInAra } from '../../lib/morningBriefStore';
import { Sunrise, X } from 'lucide-react';
import { useWindows } from '../../context/WindowContext';
import './MorningBriefBanner.css';

export default function MorningBriefBanner() {
    const { today } = useMorningBrief();
    const { openWindow } = useWindows();

    if (!today || today.seen) return null;

    const open = () => {
        try { openWindow('ara-console', 'ARA', 'sparkles'); } catch { /* ignore */ }
        requestBriefInAra(today.date);
        markBriefSeen(today.date);
    };

    return (
        <div className="mbrief-banner" role="status">
            <span className="mbrief-banner-sun" aria-hidden><Sunrise size={14} /></span>
            <span className="mbrief-banner-text">
                Your morning brief is ready{today.insights.length > 0 ? ` — ${today.insights[0].title}` : ''}.
            </span>
            <button className="mbrief-banner-open" onClick={open}>Read brief</button>
            <button className="mbrief-banner-x" onClick={() => markBriefSeen(today.date)} aria-label="Dismiss morning brief"><X size={16} /></button>
        </div>
    );
}
