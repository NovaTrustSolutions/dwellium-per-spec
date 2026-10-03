/**
 * Upload for the File Explorer (Upload button, Finder drops, pasted screenshots).
 * Plan 076 P4: files go to the multipart /upload route (binary OK, never overwrites),
 * replacing the old 900 KB text-only /touch path. The server judges each file; this
 * module only turns the per-file results into one user-facing line.
 */
import { uploadFiles, type UploadResult } from './fileExplorerApi';

export interface UploadOutcome {
    /** Always set: "Uploaded N of M" plus the files that were skipped and why. */
    message: string;
    tone: 'info' | 'error';
    /** How many files were stored. */
    ok: number;
}

const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e));

function skippedLine(r: UploadResult): string {
    const why = r.status === 'exists' ? 'already exists here'
        : r.status === 'invalid' ? 'not an accepted name or file'
        : (r.error || 'upload failed');
    return `"${r.name}": ${why}`;
}

/** Pure: per-file results -> one summary (files the server did not report count as skipped). */
export function summarizeUploads(files: Array<{ name: string }>, results: UploadResult[]): UploadOutcome {
    const ok = results.filter((r) => r.status === 'ok').length;
    const skipped = results.filter((r) => r.status !== 'ok').map(skippedLine);
    const reported = new Set(results.map((r) => r.name));
    for (const f of files) if (!reported.has(f.name)) skipped.push(`"${f.name}": no result from the server`);
    const head = `Uploaded ${ok} of ${files.length}`;
    return {
        message: skipped.length ? `${head}. Skipped:\n${skipped.join('\n')}` : head,
        tone: ok === files.length ? 'info' : 'error',
        ok,
    };
}

/** Upload `files` into `dest` ('' = root). Never throws: a failed request becomes an error outcome. */
export async function uploadAndSummarize(files: File[], dest: string): Promise<UploadOutcome> {
    try {
        return summarizeUploads(files, await uploadFiles(files, dest));
    } catch (err) {
        return { message: `Upload failed: ${errMsg(err)}`, tone: 'error', ok: 0 };
    }
}
