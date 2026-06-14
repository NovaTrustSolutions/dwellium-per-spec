/**
 * kbScan.mjs — walk a local folder for the Scribe knowledge base (2026-06-14).
 * Returns text-bearing files (capped) so the client can AI-summarize each into
 * a short wiki. Runs on the dev server (filesystem access on the user's Mac);
 * exposed via the /__kb/scan route in vite.config.ts.
 */
import fs from 'node:fs';
import path from 'node:path';

const TEXT_EXT = new Set([
    '.md', '.markdown', '.txt', '.rst', '.org',
    '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.py', '.rs', '.go', '.java', '.rb', '.c', '.cpp', '.h',
    '.json', '.yaml', '.yml', '.toml', '.csv', '.html', '.css', '.sh',
]);
const SKIP = new Set(['node_modules', '.git', 'dist', 'build', 'target', 'vendor', '.next', 'out', 'coverage', '__pycache__', '.venv', 'venv']);
const MAX_FILES = 200;
const MAX_BYTES = 24000; // per-file text cap sent to the client

export function scanFolder(dir) {
    const abs = path.resolve(dir.replace(/^~(?=\/|$)/, process.env.HOME || ''));
    const stat = fs.statSync(abs); // throws if missing → caller returns error
    if (!stat.isDirectory()) throw new Error('Not a folder');
    const files = [];
    (function rec(d) {
        if (files.length >= MAX_FILES) return;
        let ents; try { ents = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
        for (const e of ents) {
            if (files.length >= MAX_FILES) break;
            if (e.name.startsWith('.') && e.name !== '.') continue;
            if (SKIP.has(e.name)) continue;
            const p = path.join(d, e.name);
            if (e.isDirectory()) rec(p);
            else if (TEXT_EXT.has(path.extname(e.name).toLowerCase())) {
                let text = ''; try { text = fs.readFileSync(p, 'utf8').slice(0, MAX_BYTES); } catch { continue; }
                files.push({ rel: path.relative(abs, p), name: e.name, ext: path.extname(e.name).toLowerCase(), bytes: text.length, text });
            }
        }
    })(abs);
    return { folder: abs, count: files.length, files };
}
