/**
 * NewslettersTab — Newsletter management sub-view for InboxZero
 *
 * Shows detected newsletter senders with read rate stats and unsubscribe controls.
 * Unsubscribe (plan 066 §5d): PATCH `${inboxApiBase}/newsletters/:sender/unsubscribe`.
 */
import { useState } from 'react';
import { Newspaper } from 'lucide-react';
import type { NewsletterSender } from './InboxZeroTypes';

type AuthFetch = (url: string, init?: RequestInit) => Promise<Response>;

interface Props {
    newsletters: NewsletterSender[];
    authFetch: AuthFetch;
    inboxApiBase: string;
    onRefresh: () => void;
}

function toast(detail: string) {
    window.dispatchEvent(new CustomEvent('qualia-toast', { detail }));
}

export default function NewslettersTab({ newsletters, authFetch, inboxApiBase, onRefresh }: Props) {
    const [busySender, setBusySender] = useState<string | null>(null);

    const handleUnsubscribe = async (sender: string) => {
        setBusySender(sender);
        try {
            const res = await authFetch(`${inboxApiBase}/newsletters/${encodeURIComponent(sender)}/unsubscribe`, { method: 'PATCH' });
            const data = await res.json().catch(() => ({}));
            if (!res.ok || data.success === false) {
                toast(data.error || `Failed to unsubscribe (${res.status})`);
                return;
            }
            const method = data.data?.method;
            const target: string | undefined = data.data?.target;
            if (method === 'one-click') {
                toast('Unsubscribed');
                onRefresh();
            } else if ((method === 'url' || method === 'mailto') && typeof target === 'string' && (target.startsWith('https:') || target.startsWith('mailto:'))) {
                window.open(target, '_blank', 'noopener,noreferrer');
                toast('Open link to finish');
            } else {
                toast('No unsubscribe link');
            }
        } catch {
            toast('Network error');
        } finally {
            setBusySender(null);
        }
    };

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
                        {nl.unsubscribed ? (
                            <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', padding: '4px 10px', borderRadius: '6px', border: '1px solid var(--border-default)' }}>
                                Unsubscribed
                            </span>
                        ) : (
                            <button
                                onClick={() => handleUnsubscribe(nl.sender)}
                                disabled={busySender === nl.sender}
                                style={{
                                    fontSize: '11px', fontWeight: 600, padding: '4px 10px', borderRadius: '6px',
                                    border: '1px solid var(--border-default)', background: 'transparent', color: 'var(--text-primary)',
                                    cursor: 'pointer', opacity: busySender === nl.sender ? 0.6 : 1,
                                }}
                            >
                                {busySender === nl.sender ? 'Unsubscribing…' : 'Unsubscribe'}
                            </button>
                        )}
                    </div>
                ))
            )}
        </div>
    );
}
