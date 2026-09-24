/**
 * wikiSources — content-backed wiki compilation support (plan wiki-widget-hardening §B).
 *
 * Reads real excerpts from a node's source documents (instead of compiling from
 * titles alone) and builds the compile prompt + system prompt around them.
 * Pure + injectable (`read`) so tests never touch the network/backend.
 */

export interface SourceExcerpt {
    path: string;
    excerpt: string;
}

const BINARY_EXTENSIONS = new Set([
    'pdf', 'png', 'jpg', 'jpeg', 'gif', 'webp', 'zip', 'docx', 'xlsx', 'mp3', 'mp4', 'mov',
]);

function extOf(path: string): string {
    const dot = path.lastIndexOf('.');
    return dot === -1 ? '' : path.slice(dot + 1).toLowerCase();
}

export async function fetchSourceExcerpts(
    paths: string[],
    read: (p: string) => Promise<{ content: string }>,
    opts?: { maxFiles?: number; maxCharsPerFile?: number; maxTotalChars?: number },
): Promise<SourceExcerpt[]> {
    const maxFiles = opts?.maxFiles ?? 8;
    const maxCharsPerFile = opts?.maxCharsPerFile ?? 1500;
    const maxTotalChars = opts?.maxTotalChars ?? 8000;

    const candidates = paths.filter((p) => !BINARY_EXTENSIONS.has(extOf(p))).slice(0, maxFiles);

    const results = await Promise.all(candidates.map(async (path): Promise<SourceExcerpt | null> => {
        try {
            const { content } = await read(path);
            const excerpt = content.trim().slice(0, maxCharsPerFile);
            return excerpt ? { path, excerpt } : null;
        } catch {
            return null; // ponytail: a single failed read shouldn't sink the whole compile
        }
    }));

    const out: SourceExcerpt[] = [];
    let total = 0;
    for (const r of results) {
        if (!r) continue;
        if (total + r.excerpt.length > maxTotalChars) continue; // skip just this one; smaller later files may still fit
        out.push(r);
        total += r.excerpt.length;
    }
    return out;
}

export function buildCompilePrompt(
    node: { tier: string; name: string },
    sources: string[],
    excerpts: SourceExcerpt[],
): string {
    const lines = [
        `Tier: ${node.tier}`,
        `Node: ${node.name}`,
        `Source documents (titles):\n${sources.length ? sources.join('\n') : '(none yet)'}`,
    ];
    if (excerpts.length > 0) {
        const blocks = excerpts.map((e) => `--- ${e.path}\n${e.excerpt}`).join('\n\n');
        lines.push(`Excerpts:\n${blocks}`);
    } else {
        lines.push('Excerpts:\n(none yet)');
    }
    return lines.join('\n\n');
}

export const WIKI_SYSTEM_PROMPT =
    'You compile a knowledge-base wiki page for a node in a Domain→Project→Thread hierarchy. ' +
    'Respond with JSON only: {"overview": string (2-4 sentences), "concepts": string[] (key concepts), ' +
    '"openQuestions": string[], "sources": string[]}. Base it only on the excerpts and titles; ' +
    'do not invent facts; sources must be paths from the list.';
