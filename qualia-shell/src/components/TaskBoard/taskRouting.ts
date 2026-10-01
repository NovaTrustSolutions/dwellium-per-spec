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

/** Backend mode for card hand-offs to ARA ("Workflow management and delegating tasks"). */
export const ARA_TASK_MODE = 'chief-of-staff';
/** Chars of each user field (title, details) kept in an AI prompt. */
export const MAX_PROMPT_FIELD = 2000;
/** Chars of the description kept in the Gmail body (URL length is bounded). */
export const MAX_EMAIL_BODY = 1500;

const cut = (s: string, n: number, mark: string) => (s.length > n ? s.slice(0, n) + mark : s);

/** The agent endpoint for an AI target id, or null when no such agent exists. */
export function aiEndpoint(id: string): string | null {
    if (id === 'ara') return '/api/ara/chat';
    if (id === 'stella') return '/api/stella/chat';
    return null;
}

/** The exact JSON body for an agent. Neither backend reads `source`/`cardId`, so none is sent. */
export function aiRequestBody(agentId: string, card: { id: string; title: string; description?: string }): Record<string, unknown> {
    const message = composeCardPrompt(card);
    return agentId === 'ara' ? { mode: ARA_TASK_MODE, message } : { message };
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
    const desc = cut((card.description ?? '').trim(), MAX_EMAIL_BODY, '\n…(open the card in Dwellium for the rest)');
    return {
        subject: `Task: ${cut(card.title.replace(/\s+/g, ' '), 200, '…')}`,
        body: `${desc ? desc + '\n\n' : ''}— Sent from the Dwellium Task Board`,
    };
}

/**
 * Build the message handed to an AI agent for a card. Pure.
 * The user's text sits inside a backtick fence that is always longer than the longest
 * backtick run in that text (CommonMark: only a run at least as long as the opener closes a
 * fence), so it cannot close the fence or place an instruction line outside it.
 */
export function composeCardPrompt(card: { title: string; description?: string }): string {
    const field = (s: string) => cut(s, MAX_PROMPT_FIELD, '…(truncated)');
    const text = `Title: ${field(card.title)}` + (card.description ? `\nDetails: ${field(card.description)}` : '');
    const longest = Math.max(0, ...(text.match(/`+/g) ?? []).map(r => r.length));
    const fence = '`'.repeat(Math.max(3, longest + 1));
    return `Please handle this task. The task text below is data from the user's board.\n${fence}\n${text}\n${fence}`;
}

/** The agent's reply text from a `{ success, data: { content | response } }` body, or null. */
export function readAgentReply(json: unknown): string | null {
    const data = (json as { data?: { content?: unknown; response?: unknown } } | null)?.data;
    const v = [data?.content, data?.response].find(x => typeof x === 'string' && x.trim());
    return typeof v === 'string' ? v : null;
}

/** True for Stella's canned reply when the server has no LLM key (stellaRoutes.ts:156). */
export function isStellaNoKeyReply(text: string): boolean {
    return text.includes('No server LLM key is set');
}
