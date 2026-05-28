/**
 * Scribe DnD Routes — drop-into-editor support.
 *
 * Provides:
 *   POST /api/scribe/images           — image upload (multipart). Returns { path, url }
 *   GET  /api/scribe/images/:filename — serves uploaded images
 *   POST /api/scribe/fetch-article    — fetches URL, runs Mozilla Readability,
 *                                       returns { title, content (markdown), byline }
 *
 * All uploads sandboxed to ~/.dwellium/scribe/<userId>/images/. Filename
 * generated as <uuid>.<ext> server-side — client-provided filename used only
 * for the markdown alt text. Path traversal impossible by construction.
 *
 * Installation:
 *   cd ~/dwellium-backend/ai-dashboard369-file-manager
 *   npm install multer @types/multer @mozilla/readability jsdom @types/jsdom turndown @types/turndown
 *   # drop this file at src/routes/scribeDndRoutes.ts
 *   # then patch src/app.ts:
 *   #   import scribeDndRoutes from './routes/scribeDndRoutes';
 *   #   app.use('/api/scribe', scribeDndRoutes);
 *   # restart backend (launchctl kickstart -k gui/$(id -u)/com.dwellium.backend)
 */

import { Router, Request, Response } from 'express';
import multer from 'multer';
import fs from 'fs/promises';
import { createReadStream } from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';
import { JSDOM } from 'jsdom';
import { Readability } from '@mozilla/readability';
import TurndownService from 'turndown';
import { authenticate } from '../services/authMiddleware';

const router = Router();

const ALLOWED_IMAGE_EXTS = ['.png', '.jpg', '.jpeg', '.webp', '.gif', '.svg', '.avif'];
const MAX_IMAGE_BYTES = 10 * 1024 * 1024; // 10 MB
const FETCH_TIMEOUT_MS = 15000;

function getUserImageBase(userId: string): string {
    return path.join(os.homedir(), '.dwellium', 'scribe', userId, 'images');
}

const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: MAX_IMAGE_BYTES, files: 1 },
});

// ── POST /images ── multipart image upload ───────────────────────────────

router.post('/images', authenticate, upload.single('image'), async (req: Request, res: Response) => {
    try {
        const userId = req.user?.id;
        if (!userId) return res.status(401).json({ success: false, error: 'Not authenticated' });
        if (!req.file) return res.status(400).json({ success: false, error: 'No file uploaded (field name must be "image")' });

        const origExt = path.extname(req.file.originalname).toLowerCase();
        if (!ALLOWED_IMAGE_EXTS.includes(origExt)) {
            return res.status(400).json({ success: false, error: `Unsupported image type: ${origExt}` });
        }

        const base = getUserImageBase(userId);
        await fs.mkdir(base, { recursive: true });

        const filename = `${crypto.randomUUID()}${origExt}`;
        const absPath = path.join(base, filename);
        await fs.writeFile(absPath, req.file.buffer);

        // URL points to the serving endpoint — Scribe inserts this verbatim into the markdown
        const url = `/api/scribe/images/${filename}`;
        return res.json({ success: true, path: absPath, url, filename });
    } catch (err: any) {
        console.error('[ScribeDnD] image upload error:', err.message);
        return res.status(500).json({ success: false, error: err.message });
    }
});

// ── GET /images/:filename ── serve uploaded image ────────────────────────

router.get('/images/:filename', authenticate, async (req: Request, res: Response) => {
    try {
        const userId = req.user?.id;
        if (!userId) return res.status(401).json({ success: false, error: 'Not authenticated' });

        const filename = req.params.filename;
        // Sanity check: no path separators allowed in filename
        if (!filename || filename.includes('/') || filename.includes('\\') || filename.includes('..')) {
            return res.status(400).json({ success: false, error: 'Invalid filename' });
        }

        const base = getUserImageBase(userId);
        const absPath = path.join(base, filename);

        // Guard: must resolve inside user's image base
        const resolved = path.resolve(absPath);
        if (!resolved.startsWith(base + path.sep)) {
            return res.status(403).json({ success: false, error: 'Forbidden' });
        }

        try { await fs.stat(resolved); } catch {
            return res.status(404).json({ success: false, error: 'Image not found' });
        }

        // Set Content-Type from extension
        const ext = path.extname(filename).toLowerCase();
        const mime: Record<string, string> = {
            '.png': 'image/png',
            '.jpg': 'image/jpeg',
            '.jpeg': 'image/jpeg',
            '.webp': 'image/webp',
            '.gif': 'image/gif',
            '.svg': 'image/svg+xml',
            '.avif': 'image/avif',
        };
        res.setHeader('Content-Type', mime[ext] ?? 'application/octet-stream');
        res.setHeader('Cache-Control', 'private, max-age=3600');
        createReadStream(resolved).pipe(res);
    } catch (err: any) {
        console.error('[ScribeDnD] image serve error:', err.message);
        return res.status(500).json({ success: false, error: err.message });
    }
});

// ── POST /fetch-article ── URL → readability → markdown ──────────────────

router.post('/fetch-article', authenticate, async (req: Request, res: Response) => {
    try {
        const userId = req.user?.id;
        if (!userId) return res.status(401).json({ success: false, error: 'Not authenticated' });

        const { url } = req.body;
        if (!url || typeof url !== 'string') return res.status(400).json({ success: false, error: 'url is required' });

        // Basic URL validation + http(s) only (block file://, etc.)
        let parsed: URL;
        try { parsed = new URL(url); } catch { return res.status(400).json({ success: false, error: 'Invalid URL' }); }
        if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
            return res.status(400).json({ success: false, error: 'Only http(s) URLs allowed' });
        }
        // SSRF guard — block private/loopback ranges. Not bulletproof (DNS rebinding etc.) but good enough for personal-tool scope.
        const host = parsed.hostname;
        if (
            host === 'localhost' ||
            host === '0.0.0.0' ||
            host.startsWith('127.') ||
            host.startsWith('10.') ||
            host.startsWith('192.168.') ||
            host.startsWith('169.254.') ||
            /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(host)
        ) {
            return res.status(400).json({ success: false, error: 'Private/loopback hosts not allowed' });
        }

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

        let html: string;
        let finalUrl = url;
        try {
            const fetchRes = await fetch(url, {
                signal: controller.signal,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15',
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                },
                redirect: 'follow',
            });
            finalUrl = fetchRes.url;
            if (!fetchRes.ok) {
                return res.status(502).json({ success: false, error: `Upstream returned ${fetchRes.status}` });
            }
            const contentType = fetchRes.headers.get('content-type') ?? '';
            if (!contentType.includes('html')) {
                return res.status(415).json({ success: false, error: `Not HTML (got ${contentType})` });
            }
            html = await fetchRes.text();
        } finally {
            clearTimeout(timeout);
        }

        // Run Readability against a JSDOM-parsed document
        const dom = new JSDOM(html, { url: finalUrl });
        const reader = new Readability(dom.window.document);
        const article = reader.parse();

        if (!article || !article.content) {
            return res.status(422).json({ success: false, error: 'Could not extract article content (page may not be a long-form article)' });
        }

        // Convert article.content (sanitized HTML) → markdown
        const turndown = new TurndownService({
            headingStyle: 'atx',
            codeBlockStyle: 'fenced',
            bulletListMarker: '-',
            emDelimiter: '*',
        });
        // Strip script + style tags — readability usually already does this, but defensively
        turndown.remove(['script', 'style']);
        const markdown = (turndown.turndown(article.content) as string).trim();

        return res.json({
            success: true,
            title: article.title || parsed.hostname,
            content: markdown,
            byline: article.byline ?? undefined,
            excerpt: article.excerpt ?? undefined,
            siteName: article.siteName ?? undefined,
            length: article.length ?? markdown.length,
        });
    } catch (err: any) {
        if (err.name === 'AbortError') {
            return res.status(504).json({ success: false, error: `Fetch timed out after ${FETCH_TIMEOUT_MS / 1000}s` });
        }
        console.error('[ScribeDnD] fetch-article error:', err.message);
        return res.status(500).json({ success: false, error: err.message });
    }
});

export default router;
