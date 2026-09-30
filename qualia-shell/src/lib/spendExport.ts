/**
 * spendExport — plan 068 Phase 2 (F2). CSV export of the raw usage ledger
 * entries (client-side, no server round-trip).
 *
 * RFC 4180 quoting plus a CSV/formula-injection guard: a cell that could be
 * interpreted as a spreadsheet formula (leading =, +, -, @, tab or CR) gets a
 * leading apostrophe. Model ids and sources can come from user-configured
 * custom providers, so they're untrusted text.
 */
import type { UsageEntry } from './llmUsageStore';

const CSV_HEADER = 'timestamp,date,provider,model,source,input_tokens,output_tokens,measured,cost_usd';

function localDateStr(ts: number): string {
    const d = new Date(ts);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// ponytail: single-char formula/tab/CR guard is the whole injection-defense surface; extend if a
// spreadsheet app is found to sniff more prefixes.
function guardFormulaInjection(cell: string): string {
    return /^[=+\-@\t\r]/.test(cell) ? `'${cell}` : cell;
}

function csvCell(value: string): string {
    const guarded = guardFormulaInjection(value);
    return /[",\r\n]/.test(guarded) ? `"${guarded.replace(/"/g, '""')}"` : guarded;
}

export function entriesToCsv(entries: UsageEntry[]): string {
    const rows = entries.map(e => {
        const cost = e.estCost == null ? '' : String(Math.round(e.estCost * 1_000_000) / 1_000_000);
        return [
            new Date(e.ts).toISOString(),
            localDateStr(e.ts),
            csvCell(e.provider),
            csvCell(e.model),
            csvCell(e.source ?? 'other'),
            String(e.estIn),
            String(e.estOut),
            String(e.measured),
            cost,
        ].join(',');
    });
    return [CSV_HEADER, ...rows].join('\r\n');
}

export function downloadCsv(filename: string, csv: string): void {
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    // Revoking synchronously can cancel the download in some browsers — defer it.
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}
