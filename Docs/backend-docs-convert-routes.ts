/**
 * Document Conversion Routes — LibreOffice headless via soffice.
 *
 * Supports converting between PDF and Office formats by shelling out to
 * `soffice --headless --convert-to <fmt>`. Falls back gracefully when
 * soffice is not on PATH (returns 503 with a friendly message so the
 * frontend can show its existing "requires LibreOffice on the backend"
 * notice).
 *
 * Endpoints:
 *   GET  /capabilities                  — { sofficeAvailable, supportedFormats }
 *   POST /convert                        — multipart file upload + targetFormat
 *
 * Format aliases (frontend → soffice):
 *   docx, xlsx, pptx        → docx/xlsx/pptx (text-doc/calc/impress)
 *   pdf-from-docx/xlsx/pptx → pdf
 *   rtf, html, odt          → rtf/html/odt
 *
 * Installation:
 *   cp this file to ~/dwellium-backend/.../src/routes/docsConvertRoutes.ts
 *   patch src/app.ts:
 *     import docsConvertRoutes from './routes/docsConvertRoutes';
 *     app.use('/api/docs', docsConvertRoutes);
 *   restart backend (launchctl kickstart -k gui/$(id -u)/com.dwellium.backend)
 */
import { Router, Request, Response } from 'express';
import { spawn } from 'child_process';
import { existsSync, promises as fsp } from 'fs';
import os from 'os';
import path from 'path';
import multer from 'multer';
import { randomUUID } from 'crypto';

const router = Router();

// Resolve soffice binary path — prefer PATH, fall back to /Applications/LibreOffice.app
function findSoffice(): string | null {
    const candidates = [
        process.env.SOFFICE_PATH,
        '/Applications/LibreOffice.app/Contents/MacOS/soffice',
        '/opt/homebrew/bin/soffice',
        '/usr/local/bin/soffice',
        '/usr/bin/soffice',
    ].filter(Boolean) as string[];
    for (const c of candidates) {
        if (existsSync(c)) return c;
    }
    return null;
}

// Map frontend target format → soffice convert-to argument
function mapTargetFormat(target: string): { ext: string; convertTo: string } | null {
    switch (target) {
        case 'docx': return { ext: 'docx', convertTo: 'docx' };
        case 'xlsx': return { ext: 'xlsx', convertTo: 'xlsx' };
        case 'pptx': return { ext: 'pptx', convertTo: 'pptx' };
        case 'pdf-from-docx':
        case 'pdf-from-xlsx':
        case 'pdf-from-pptx':
        case 'pdf':
            return { ext: 'pdf', convertTo: 'pdf' };
        case 'rtf': return { ext: 'rtf', convertTo: 'rtf' };
        case 'html': return { ext: 'html', convertTo: 'html' };
        case 'odt': return { ext: 'odt', convertTo: 'odt' };
        case 'ods': return { ext: 'ods', convertTo: 'ods' };
        case 'odp': return { ext: 'odp', convertTo: 'odp' };
        case 'txt': return { ext: 'txt', convertTo: 'txt:Text (encoded):UTF8' };
        default: return null;
    }
}

// Multer: store in OS tmp with a UUID prefix so concurrent uploads don't collide
const upload = multer({
    storage: multer.diskStorage({
        destination: (_req, _file, cb) => cb(null, os.tmpdir()),
        filename: (_req, file, cb) => cb(null, `dwellium-conv-${randomUUID()}-${file.originalname}`),
    }),
    limits: { fileSize: 100 * 1024 * 1024 }, // 100 MB
});

router.get('/capabilities', (_req: Request, res: Response) => {
    const sofficePath = findSoffice();
    res.json({
        success: true,
        sofficeAvailable: !!sofficePath,
        sofficePath: sofficePath ?? null,
        supportedTargets: sofficePath
            ? ['docx', 'xlsx', 'pptx', 'pdf-from-docx', 'pdf-from-xlsx', 'pdf-from-pptx', 'pdf', 'rtf', 'html', 'odt', 'ods', 'odp', 'txt']
            : [],
    });
});

router.post('/convert', upload.single('file'), async (req: Request, res: Response) => {
    const file = (req as any).file as Express.Multer.File | undefined;
    if (!file) {
        return res.status(400).json({ success: false, error: 'No file uploaded' });
    }

    const targetFormat = String(req.body?.targetFormat || '').toLowerCase();
    const mapping = mapTargetFormat(targetFormat);
    if (!mapping) {
        await safeUnlink(file.path);
        return res.status(400).json({ success: false, error: `Unsupported target format: ${targetFormat}` });
    }

    const sofficePath = findSoffice();
    if (!sofficePath) {
        await safeUnlink(file.path);
        return res.status(503).json({
            success: false,
            error: 'LibreOffice is not installed on the backend. Install with: brew install --cask libreoffice',
        });
    }

    // Output goes to a per-request tmpdir so we can find the result file
    const outDir = path.join(os.tmpdir(), `dwellium-conv-out-${randomUUID()}`);
    await fsp.mkdir(outDir, { recursive: true });

    try {
        // PDF input → office output requires the PDF import filter so soffice
        // opens it via Draw and re-flows the text into a Writer doc.
        const inputExt = path.extname(file.originalname).toLowerCase().replace(/^\./, '');
        const isPdfInput = inputExt === 'pdf' || file.mimetype === 'application/pdf';
        const isOfficeOutput = ['docx', 'xlsx', 'pptx', 'rtf', 'odt', 'ods', 'odp', 'html', 'txt'].includes(mapping.ext);
        const inFilter = (isPdfInput && isOfficeOutput) ? 'writer_pdf_import' : null;
        // Match soffice's preferred filter name for DOCX out (MS Word 2007 XML)
        const convertToArg = (isPdfInput && mapping.ext === 'docx')
            ? 'docx:MS Word 2007 XML'
            : mapping.convertTo;
        await runSoffice(sofficePath, file.path, outDir, convertToArg, inFilter);

        // soffice names the output by stripping the input extension and adding the target
        const inputBase = path.basename(file.path, path.extname(file.path));
        const expectedOut = path.join(outDir, `${inputBase}.${mapping.ext}`);

        let outputPath = expectedOut;
        if (!existsSync(outputPath)) {
            // Fallback: pick the first file in outDir
            const files = await fsp.readdir(outDir);
            if (files.length === 0) {
                throw new Error('soffice produced no output');
            }
            outputPath = path.join(outDir, files[0]);
        }

        const buf = await fsp.readFile(outputPath);
        const downloadName = `${path.basename(file.originalname, path.extname(file.originalname))}.${mapping.ext}`;

        res.setHeader('Content-Type', mimeForExt(mapping.ext));
        res.setHeader('Content-Disposition', `attachment; filename="${downloadName}"`);
        res.send(buf);
    } catch (err: any) {
        console.error('[docs/convert] failed:', err);
        res.status(500).json({ success: false, error: err.message || 'Conversion failed' });
    } finally {
        await safeUnlink(file.path);
        await safeRmrf(outDir);
    }
});

function runSoffice(soffice: string, inputPath: string, outDir: string, convertTo: string, inFilter?: string | null): Promise<void> {
    return new Promise((resolve, reject) => {
        // Use a temp user profile so soffice doesn't fight with a desktop GUI session
        const userProfile = path.join(os.tmpdir(), `dwellium-soffice-${randomUUID()}`);
        const args = [
            '--headless',
            '--nologo',
            '--nofirststartwizard',
            `-env:UserInstallation=file://${userProfile}`,
        ];
        if (inFilter) args.push(`--infilter=${inFilter}`);
        args.push('--convert-to', convertTo, '--outdir', outDir, inputPath);
        const proc = spawn(soffice, args, {
            // 60s wall clock; cleaned up below if killed
            timeout: 60000,
        });

        let stderr = '';
        proc.stderr.on('data', (chunk) => { stderr += chunk.toString(); });

        proc.on('close', (code) => {
            // Best-effort cleanup of user profile dir
            void fsp.rm(userProfile, { recursive: true, force: true }).catch(() => undefined);
            if (code === 0) {
                resolve();
            } else {
                reject(new Error(`soffice exited ${code}: ${stderr.trim().slice(0, 500)}`));
            }
        });
        proc.on('error', (err) => {
            reject(new Error(`Failed to start soffice: ${err.message}`));
        });
    });
}

function mimeForExt(ext: string): string {
    switch (ext) {
        case 'pdf': return 'application/pdf';
        case 'docx': return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
        case 'xlsx': return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
        case 'pptx': return 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
        case 'rtf': return 'application/rtf';
        case 'html': return 'text/html';
        case 'odt': return 'application/vnd.oasis.opendocument.text';
        case 'ods': return 'application/vnd.oasis.opendocument.spreadsheet';
        case 'odp': return 'application/vnd.oasis.opendocument.presentation';
        case 'txt': return 'text/plain';
        default: return 'application/octet-stream';
    }
}

async function safeUnlink(p: string): Promise<void> {
    try { await fsp.unlink(p); } catch { /* ignore */ }
}

async function safeRmrf(p: string): Promise<void> {
    try { await fsp.rm(p, { recursive: true, force: true }); } catch { /* ignore */ }
}

export default router;
