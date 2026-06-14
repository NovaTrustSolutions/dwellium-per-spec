/**
 * kgAnalyze.mjs — deterministic "found in code" graph builder, shared by the
 * one-off CLI seed and the dev-server "Add a project" route (vite.config.ts).
 *
 * analyzeRepo(dir, id)  → graph object (nodes/edges/clusters/importantFiles/savings)
 * cloneAndAnalyze(url)  → clones the repo (shallow) into a temp dir, analyzes it,
 *                         writes public/data/kg/<id>.json, returns a project card.
 *
 * No LLM, no inference: nodes are real files, edges are real import/require/from
 * relationships, importance = in-degree. This is the verifiable layer.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';

const EXT = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.py', '.rs', '.go']);
const SKIP = new Set(['node_modules', '.git', 'dist', 'build', 'target', 'vendor', '.next', 'out', 'coverage', '__pycache__', 'fixtures', 'testdata']);
const MAX_NODES = 600;

function walk(root) {
    const files = [];
    (function rec(d) {
        let ents; try { ents = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
        for (const e of ents) {
            if (e.name.startsWith('.') && e.name !== '.') continue;
            if (SKIP.has(e.name)) continue;
            const p = path.join(d, e.name);
            if (e.isDirectory()) rec(p);
            else if (EXT.has(path.extname(e.name))) files.push(p);
        }
    })(root);
    return files;
}

function resolveRel(fromFile, spec, fileSet) {
    if (!spec.startsWith('.')) return null;
    const base = path.resolve(path.dirname(fromFile), spec);
    const cands = [base, base + '.ts', base + '.tsx', base + '.js', base + '.jsx', base + '.mjs', base + '.py', base + '.rs',
        path.join(base, 'index.ts'), path.join(base, 'index.tsx'), path.join(base, 'index.js'), path.join(base, '__init__.py'), path.join(base, 'mod.rs')];
    for (const c of cands) if (fileSet.has(c)) return c;
    return null;
}

function importsOf(file, content) {
    const specs = [];
    const ext = path.extname(file);
    if (['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'].includes(ext)) {
        for (const m of content.matchAll(/(?:import|export)[^'"]*?from\s*['"]([^'"]+)['"]/g)) specs.push(m[1]);
        for (const m of content.matchAll(/require\(\s*['"]([^'"]+)['"]\s*\)/g)) specs.push(m[1]);
        for (const m of content.matchAll(/import\(\s*['"]([^'"]+)['"]\s*\)/g)) specs.push(m[1]);
    } else if (ext === '.py') {
        for (const m of content.matchAll(/^\s*from\s+(\.[.\w]*)\s+import/gm)) specs.push(m[1].replace(/\./g, '/').replace(/^\//, './'));
    }
    return specs;
}

const LANG_BY_EXT = { '.py': 'PYTHON', '.rs': 'RUST', '.go': 'GO', '.ts': 'TYPESCRIPT', '.tsx': 'TYPESCRIPT', '.js': 'JAVASCRIPT', '.jsx': 'JAVASCRIPT' };

export function analyzeRepo(dir, id) {
    const files = walk(dir);
    const fileSet = new Set(files);
    const idx = new Map(files.map((f, i) => [f, i]));
    const rel = (f) => path.relative(dir, f);
    const cluster = (f) => { const seg = rel(f).split(path.sep); return seg.length > 1 ? seg[0] : '(root)'; };
    const indeg = new Array(files.length).fill(0);
    const edges = [];
    const langCount = {};
    let bytes = 0;
    for (const f of files) {
        langCount[LANG_BY_EXT[path.extname(f)] || 'OTHER'] = (langCount[LANG_BY_EXT[path.extname(f)] || 'OTHER'] || 0) + 1;
        let c = ''; try { c = fs.readFileSync(f, 'utf8'); bytes += c.length; } catch { continue; }
        for (const spec of importsOf(f, c)) {
            const tgt = resolveRel(f, spec, fileSet);
            if (tgt && tgt !== f) { edges.push([idx.get(f), idx.get(tgt)]); indeg[idx.get(tgt)]++; }
        }
    }
    const order = files.map((_, i) => i).sort((a, b) => indeg[b] - indeg[a]);
    const keep = new Set(order.slice(0, MAX_NODES));
    const clusters = [...new Set(files.map(cluster))];
    const clIdx = new Map(clusters.map((c, i) => [c, i]));
    const nodes = [...keep].map((i) => ({ label: rel(files[i]), cluster: clIdx.get(cluster(files[i])), importance: indeg[i], deg: indeg[i] }));
    const remap = new Map([...keep].map((i, n) => [i, n]));
    const links = edges.filter(([a, b]) => keep.has(a) && keep.has(b)).map(([a, b]) => [remap.get(a), remap.get(b)]);
    const importantFiles = order.slice(0, 7).map((i) => ({ name: path.basename(files[i]), score: indeg[i] }));
    const maxScore = importantFiles[0]?.score || 1;
    importantFiles.forEach((f) => { f.pct = Math.max(8, Math.round((f.score / maxScore) * 100)); });
    const tokens = Math.round(bytes / 4);
    const usdPerSession = +(tokens / 1e6 * 3).toFixed(2);
    const lang = Object.entries(langCount).sort((a, b) => b[1] - a[1])[0]?.[0] || 'OTHER';
    return { id, lang, files: files.length, edges: edges.length, clusters: clusters.length, tokens, usdPerSession, importantFiles, nodes, links, builtAt: new Date().toISOString(), source: 'static-import-graph' };
}

function run(cmd, args, opts) {
    return new Promise((resolve, reject) => {
        execFile(cmd, args, { timeout: 150000, maxBuffer: 64 * 1024 * 1024, ...opts }, (err, stdout, stderr) => {
            if (err) reject(new Error(stderr || err.message)); else resolve(stdout);
        });
    });
}

function slug(url) {
    const m = url.replace(/\.git$/, '').match(/github\.com\/([^/]+)\/([^/]+)/i);
    const name = m ? m[2] : url.split('/').pop();
    return (name || 'repo').toLowerCase().replace(/[^a-z0-9-]/g, '-');
}

function titleCase(s) { return s.replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()); }

/** Clone (shallow) + analyze + write public/data/kg/<id>.json. Returns a project card. */
export async function cloneAndAnalyze(url, outDir) {
    if (!/^https:\/\/github\.com\/[\w.-]+\/[\w.-]+/i.test(url)) throw new Error('Only https://github.com/<owner>/<repo> URLs are allowed');
    const id = slug(url);
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kg-'));
    const repoDir = path.join(tmp, id);
    try {
        await run('git', ['clone', '--depth', '1', '--single-branch', url, repoDir]);
        const g = analyzeRepo(repoDir, id);
        const dest = outDir || path.join(process.cwd(), 'public', 'data', 'kg');
        fs.mkdirSync(dest, { recursive: true });
        fs.writeFileSync(path.join(dest, id + '.json'), JSON.stringify(g));
        return { id, name: titleCase(id), lang: g.lang, files: g.files, clusters: g.clusters, edges: g.edges, blurb: `${url.replace(/^https:\/\/github\.com\//, '')} — graphed from the repo.` };
    } finally {
        try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* ignore */ }
    }
}
