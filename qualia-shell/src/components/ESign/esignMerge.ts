/**
 * esignMerge — pure view logic for the E-Sign widget (plan 053).
 *
 * Merges Dwellium's local lease records (/api/esign/documents) with the live
 * envelope list straight from Documenso (/api/esign/envelopes): live status
 * wins for matched rows (matched by externalId → workitemId, else by envelope
 * id), and envelopes Dwellium never sent (created in Documenso directly, or
 * via the widget's generic send) appear as their own rows.
 */
import type { DocumensoEnvelope, EsignDocument, EsignRecipient } from './esignApi';

/** Upstream envelope statuses (Documenso v2). */
export const ESIGN_STATUSES = ['DRAFT', 'PENDING', 'COMPLETED', 'REJECTED', 'CANCELLED'] as const;
export type EsignPill = (typeof ESIGN_STATUSES)[number] | 'UNKNOWN';

export interface MergedEsignRow {
    /** Empty string when the row exists only in Documenso (no Dwellium lease). */
    workitemId: string;
    title: string;
    docStatus: string;
    envelopeId: string | null;
    documentId: number | string | null;
    status: string | null;
    recipients: EsignRecipient[];
    sentAt: string | null;
    source: 'local' | 'documenso';
    pill: EsignPill;
}

/** Upstream status when we have it; otherwise derived from Dwellium's docStatus machine. */
export function esignPill(status: string | null | undefined, docStatus: string): EsignPill {
    const s = String(status || '').toUpperCase();
    if ((ESIGN_STATUSES as readonly string[]).includes(s)) return s as EsignPill;
    switch (docStatus) {
        case 'draft': return 'DRAFT';
        case 'sent':
        case 'signed': return 'PENDING'; // signed = tenant done, countersign outstanding
        case 'countersigned': return 'COMPLETED';
        default: return 'UNKNOWN';
    }
}

function envId(env: DocumensoEnvelope): string {
    return String(env.envelopeId ?? env.id ?? '');
}

export function mergeEsignRows(local: EsignDocument[], live: DocumensoEnvelope[]): MergedEsignRow[] {
    const rows: MergedEsignRow[] = local.map(d => ({
        workitemId: d.workitemId,
        title: d.title,
        docStatus: d.docStatus,
        envelopeId: d.envelopeId ?? null,
        documentId: d.documentId ?? null,
        status: d.status ?? null,
        recipients: d.recipients || [],
        sentAt: d.sentAt,
        source: 'local',
        pill: esignPill(d.status, d.docStatus),
    }));
    const leftovers: DocumensoEnvelope[] = [];
    for (const env of live) {
        const id = envId(env);
        const row = rows.find(r =>
            (env.externalId && r.workitemId && String(env.externalId) === r.workitemId)
            || (id && r.envelopeId && String(r.envelopeId) === id));
        if (row) {
            if (env.status) row.status = String(env.status);
            if (!row.envelopeId && id) row.envelopeId = id;
            if (Array.isArray(env.recipients) && env.recipients.length) row.recipients = env.recipients;
            row.pill = esignPill(row.status, row.docStatus);
        } else {
            leftovers.push(env);
        }
    }
    for (const env of leftovers) {
        const id = envId(env);
        rows.push({
            workitemId: '',
            title: String(env.title || 'Untitled document'),
            docStatus: '',
            envelopeId: id || null,
            documentId: null,
            status: env.status ? String(env.status) : null,
            recipients: Array.isArray(env.recipients) ? env.recipients : [],
            sentAt: env.createdAt ? String(env.createdAt) : null,
            source: 'documenso',
            pill: esignPill(env.status, ''),
        });
    }
    return rows;
}
