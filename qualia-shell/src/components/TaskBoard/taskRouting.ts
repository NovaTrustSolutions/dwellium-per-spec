/**
 * taskRouting — PURE helpers for routing a task card to an AI agent or a person.
 *
 * No side effects here (no fetch, no window) so it's fully unit-testable. The
 * store performs the actual dispatch (AI POST) / opens the Gmail draft and logs
 * the result through the board's audit path.
 *
 * Email policy: we NEVER auto-send. For person targets we build a Gmail "compose"
 * URL that opens a pre-filled draft the user reviews and sends themselves.
 */
import type { Assignee } from './taskBoardModel';

/** Built-in routing targets. ARA + Stella are AI agents; Lisa is a person (email). */
export const BUILT_IN_TARGETS: Assignee[] = [
    { kind: 'ai', id: 'ara', label: 'ARA' },
    { kind: 'ai', id: 'stella', label: 'Stella' },
    { kind: 'person', id: 'lisa', label: 'Lisa', email: '' },
];

export function routeKind(a: Assignee | null | undefined): 'ai' | 'person' | 'none' {
    return a ? a.kind : 'none';
}

export function describeRoute(a: Assignee | null | undefined): string {
    if (!a) return 'Unassigned';
    return a.kind === 'ai' ? `AI · ${a.label}` : `${a.label}${a.email ? ` <${a.email}>` : ''}`;
}

/** The agent endpoint for an AI target id. */
export function aiEndpoint(id: string): string {
    return id === 'stella' ? '/api/stella/chat' : '/api/ara/chat';
}

/**
 * Gmail web "compose" URL — opens a pre-filled draft for the user to review and
 * send. Pure + testable. (We deliberately use Gmail compose rather than mailto:
 * so it lands in a real, editable draft window.)
 */
export function buildGmailComposeUrl(opts: { to?: string; subject?: string; body?: string }): string {
    const p = new URLSearchParams();
    p.set('view', 'cm');
    p.set('fs', '1');
    if (opts.to) p.set('to', opts.to);
    if (opts.subject) p.set('su', opts.subject);
    if (opts.body) p.set('body', opts.body);
    return `https://mail.google.com/mail/?${p.toString()}`;
}

/** Build the subject + body for routing a card to a person. Pure. */
export function composeCardEmail(card: { title: string; description?: string }): { subject: string; body: string } {
    return {
        subject: `Task: ${card.title}`,
        body: `${card.description ? card.description.trim() + '\n\n' : ''}— Sent from the Dwellium Task Board`,
    };
}

/** Build the message body handed to an AI agent for a card. Pure. */
export function composeCardPrompt(card: { title: string; description?: string }): string {
    return `Please handle this task:\n\nTitle: ${card.title}` +
        (card.description ? `\nDetails: ${card.description}` : '');
}
