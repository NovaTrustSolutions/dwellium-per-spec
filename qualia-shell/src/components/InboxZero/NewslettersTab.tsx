/**
 * NewslettersTab — Newsletter management sub-view for InboxZero
 * 
 * Shows detected newsletter senders with read rate stats and unsubscribe controls.
 * Extracted from InboxZero.tsx monolith (Phase 2.1).
 */

import { Newspaper } from 'lucide-react';
import type { NewsletterSender } from './InboxZeroTypes';

interface Props {
    newsletters: NewsletterSender[];
    // authFetch/inboxApiBase/onRefresh are unused since the Unsubscribe button
    // was removed (plan 066 §2c) — kept on the contract for plan 066 §5d.
    authFetch: (url: string, init?: RequestInit) => Promise<Response>;
    inboxApiBase: string;
    onRefresh: () => void;
}

export default function NewslettersTab({ newsletters }: Props) {
    return (
        <div className="iz-newsletters">
            {newsletters.length === 0 ? (
                <div className="iz-empty">
                    <div className="iz-empty__icon"><Newspaper size={32} aria-hidden /></div>
                    <div className="iz-empty__title">No newsletters detected</div>
                    <div className="iz-empty__sub">Sender stats will appear as emails are processed.</div>
                </div>
            ) : (
                newsletters.map(nl => (
                    <div key={nl.sender} className="iz-nl">
                        <div className="iz-nl__info">
                            <div className="iz-nl__avatar">
                                {nl.sender.charAt(0).toUpperCase()}
                            </div>
                            <div className="iz-nl__details">
                                <span className="iz-nl__name">{nl.sender}</span>
                                <span className="iz-nl__meta">
                                    {nl.count} emails · {(nl.readRate * 100).toFixed(0)}% read
                                </span>
                            </div>
                        </div>
                        <div className="iz-nl__bar-wrap">
                            <div className="iz-nl__bar">
                                <div
                                    className="iz-nl__bar-fill"
                                    style={{ width: `${nl.readRate * 100}%` }}
                                />
                            </div>
                        </div>
                        {/* ponytail: Unsubscribe button removed at plan 066 §2c — it
                            called a route that never existed. Restore at plan 066 §5d. */}
                    </div>
                ))
            )}
        </div>
    );
}
