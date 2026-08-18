/**
 * qr — tiny local QR encoder (ISO 18004): byte mode, ECC L/M, versions 1–10,
 * all 8 masks with penalty scoring. Zero deps; output is a boolean matrix and
 * an SVG string. Ported from the well-known public-domain algorithm shape
 * (Nayuki-style), trimmed to what idocs needs.
 *
 * ponytail: versions >10 / alphanumeric+kanji modes / ECC Q,H omitted — 10-M
 * holds 213 bytes, plenty for a URL. Extend the tables if ever needed.
 */

export type QrEcc = 'L' | 'M';

// Index = version (0 unused).
const ECC_CODEWORDS_PER_BLOCK: Record<QrEcc, number[]> = {
    L: [0, 7, 10, 15, 20, 26, 18, 20, 24, 30, 18],
    M: [0, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26],
};
const NUM_ECC_BLOCKS: Record<QrEcc, number[]> = {
    L: [0, 1, 1, 1, 1, 1, 2, 2, 2, 2, 4],
    M: [0, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5],
};
const ECC_FORMAT_BITS: Record<QrEcc, number> = { L: 1, M: 0 };
export const QR_MAX_VERSION = 10;

function numRawDataModules(ver: number): number {
    let result = (16 * ver + 128) * ver + 64;
    if (ver >= 2) {
        const numAlign = Math.floor(ver / 7) + 2;
        result -= (25 * numAlign - 10) * numAlign - 55;
        if (ver >= 7) result -= 36;
    }
    return result;
}
function numDataCodewords(ver: number, ecc: QrEcc): number {
    return Math.floor(numRawDataModules(ver) / 8) - ECC_CODEWORDS_PER_BLOCK[ecc][ver] * NUM_ECC_BLOCKS[ecc][ver];
}
function alignmentPositions(ver: number): number[] {
    if (ver === 1) return [];
    const numAlign = Math.floor(ver / 7) + 2;
    const size = ver * 4 + 17;
    const step = Math.floor((ver * 8 + numAlign * 3 + 5) / (numAlign * 4 - 4)) * 2;
    const result = [6];
    for (let pos = size - 7; result.length < numAlign; pos -= step) result.splice(1, 0, pos);
    return result;
}

// ── GF(256) Reed–Solomon ──
function gfMul(x: number, y: number): number {
    let z = 0;
    for (let i = 7; i >= 0; i--) {
        z = (z << 1) ^ ((z >>> 7) * 0x11d);
        z ^= ((y >>> i) & 1) * x;
    }
    return z;
}
function rsDivisor(degree: number): number[] {
    const result = new Array<number>(degree).fill(0);
    result[degree - 1] = 1;
    let root = 1;
    for (let i = 0; i < degree; i++) {
        for (let j = 0; j < degree; j++) {
            result[j] = gfMul(result[j], root);
            if (j + 1 < degree) result[j] ^= result[j + 1];
        }
        root = gfMul(root, 0x02);
    }
    return result;
}
function rsRemainder(data: number[], divisor: number[]): number[] {
    const result = divisor.map(() => 0);
    for (const b of data) {
        const factor = b ^ (result.shift() as number);
        result.push(0);
        divisor.forEach((coef, i) => { result[i] ^= gfMul(coef, factor); });
    }
    return result;
}

function bit(x: number, i: number): boolean { return ((x >>> i) & 1) !== 0; }

/** Encode UTF-8 bytes of `text`. Returns null when it doesn't fit in version 10. */
/** `forceMask` (0–7) skips penalty selection — test hook for cross-checking against reference encoders. */
export function encodeQr(text: string, ecc: QrEcc = 'M', forceMask?: number): boolean[][] | null {
    const bytes = Array.from(new TextEncoder().encode(text));
    let ver = 1;
    for (; ver <= QR_MAX_VERSION; ver++) {
        const cap = numDataCodewords(ver, ecc) * 8;
        const need = 4 + (ver <= 9 ? 8 : 16) + bytes.length * 8;
        if (need <= cap) break;
    }
    if (ver > QR_MAX_VERSION) return null;

    // Bit stream: mode 0100, count, data, terminator, byte-align, pad.
    const bits: number[] = [];
    const push = (val: number, len: number) => { for (let i = len - 1; i >= 0; i--) bits.push((val >>> i) & 1); };
    push(0b0100, 4);
    push(bytes.length, ver <= 9 ? 8 : 16);
    for (const b of bytes) push(b, 8);
    const capBits = numDataCodewords(ver, ecc) * 8;
    push(0, Math.min(4, capBits - bits.length));
    push(0, (8 - bits.length % 8) % 8);
    for (let pad = 0xec; bits.length < capBits; pad ^= 0xec ^ 0x11) push(pad, 8);
    const data: number[] = [];
    bits.forEach((b, i) => { data[i >>> 3] = (data[i >>> 3] ?? 0) | (b << (7 - (i & 7))); });

    // ECC + interleave.
    const numBlocks = NUM_ECC_BLOCKS[ecc][ver], blockEccLen = ECC_CODEWORDS_PER_BLOCK[ecc][ver];
    const rawCodewords = Math.floor(numRawDataModules(ver) / 8);
    const numShortBlocks = numBlocks - (rawCodewords % numBlocks);
    const shortBlockLen = Math.floor(rawCodewords / numBlocks);
    const blocks: number[][] = [];
    const rsDiv = rsDivisor(blockEccLen);
    for (let i = 0, k = 0; i < numBlocks; i++) {
        const datLen = shortBlockLen - blockEccLen + (i < numShortBlocks ? 0 : 1);
        const dat = data.slice(k, k + datLen);
        k += datLen;
        const eccW = rsRemainder(dat, rsDiv);
        if (i < numShortBlocks) dat.push(0);
        blocks.push(dat.concat(eccW));
    }
    const codewords: number[] = [];
    for (let i = 0; i < blocks[0].length; i++) {
        blocks.forEach((block, j) => { if (i !== shortBlockLen - blockEccLen || j >= numShortBlocks) codewords.push(block[i]); });
    }

    // Matrix + function patterns.
    const size = ver * 4 + 17;
    const modules: boolean[][] = Array.from({ length: size }, () => new Array<boolean>(size).fill(false));
    const isFunc: boolean[][] = Array.from({ length: size }, () => new Array<boolean>(size).fill(false));
    const set = (x: number, y: number, dark: boolean) => { modules[y][x] = dark; isFunc[y][x] = true; };
    for (let i = 0; i < size; i++) { set(6, i, i % 2 === 0); set(i, 6, i % 2 === 0); }
    const finder = (cx: number, cy: number) => {
        for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) {
            const dist = Math.max(Math.abs(dx), Math.abs(dy)), x = cx + dx, y = cy + dy;
            if (x >= 0 && x < size && y >= 0 && y < size) set(x, y, dist !== 2 && dist !== 4);
        }
    };
    finder(3, 3); finder(size - 4, 3); finder(3, size - 4);
    const align = alignmentPositions(ver);
    for (let i = 0; i < align.length; i++) for (let j = 0; j < align.length; j++) {
        if ((i === 0 && j === 0) || (i === 0 && j === align.length - 1) || (i === align.length - 1 && j === 0)) continue;
        for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) set(align[i] + dx, align[j] + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
    }
    const drawFormat = (mask: number) => {
        const dataBits = (ECC_FORMAT_BITS[ecc] << 3) | mask;
        let rem = dataBits;
        for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
        const f = ((dataBits << 10) | rem) ^ 0x5412;
        for (let i = 0; i <= 5; i++) set(8, i, bit(f, i));
        set(8, 7, bit(f, 6)); set(8, 8, bit(f, 7)); set(7, 8, bit(f, 8));
        for (let i = 9; i < 15; i++) set(14 - i, 8, bit(f, i));
        for (let i = 0; i < 8; i++) set(size - 1 - i, 8, bit(f, i));
        for (let i = 8; i < 15; i++) set(8, size - 15 + i, bit(f, i));
        set(8, size - 8, true);
    };
    drawFormat(0);
    if (ver >= 7) {
        let rem = ver;
        for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
        const v = (ver << 12) | rem;
        for (let i = 0; i < 18; i++) {
            const a = size - 11 + (i % 3), b = Math.floor(i / 3);
            set(a, b, bit(v, i)); set(b, a, bit(v, i));
        }
    }

    // Zigzag data placement.
    let i = 0;
    for (let right = size - 1; right >= 1; right -= 2) {
        if (right === 6) right = 5;
        for (let vert = 0; vert < size; vert++) {
            for (let j = 0; j < 2; j++) {
                const x = right - j, upward = ((right + 1) & 2) === 0, y = upward ? size - 1 - vert : vert;
                if (!isFunc[y][x] && i < codewords.length * 8) { modules[y][x] = bit(codewords[i >>> 3], 7 - (i & 7)); i++; }
            }
        }
    }

    // Masking: try all 8, keep the lowest penalty.
    const MASKS: ((x: number, y: number) => boolean)[] = [
        (x, y) => (x + y) % 2 === 0, (_x, y) => y % 2 === 0, (x) => x % 3 === 0, (x, y) => (x + y) % 3 === 0,
        (x, y) => (Math.floor(y / 2) + Math.floor(x / 3)) % 2 === 0, (x, y) => (x * y) % 2 + (x * y) % 3 === 0,
        (x, y) => ((x * y) % 2 + (x * y) % 3) % 2 === 0, (x, y) => ((x + y) % 2 + (x * y) % 3) % 2 === 0,
    ];
    const applyMask = (m: number) => { for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) if (!isFunc[y][x] && MASKS[m](x, y)) modules[y][x] = !modules[y][x]; };
    const penalty = (): number => {
        let p = 0;
        const runPenalty = (line: boolean[]) => {
            let run = 0, prev: boolean | null = null;
            for (const c of line) { if (c === prev) { run++; if (run === 5) p += 3; else if (run > 5) p++; } else { prev = c; run = 1; } }
        };
        for (let y = 0; y < size; y++) runPenalty(modules[y]);
        for (let x = 0; x < size; x++) runPenalty(modules.map((r) => r[x]));
        for (let y = 0; y + 1 < size; y++) for (let x = 0; x + 1 < size; x++) {
            const c = modules[y][x];
            if (c === modules[y][x + 1] && c === modules[y + 1][x] && c === modules[y + 1][x + 1]) p += 3;
        }
        const finderLike = (line: boolean[]) => {
            const s = '0000' + line.map((c) => (c ? '1' : '0')).join('') + '0000'; // edges count as light
            let idx = -1;
            while ((idx = s.indexOf('10111010000', idx + 1)) >= 0) p += 40;
            idx = -1;
            while ((idx = s.indexOf('00001011101', idx + 1)) >= 0) p += 40;
        };
        for (let y = 0; y < size; y++) finderLike(modules[y]);
        for (let x = 0; x < size; x++) finderLike(modules.map((r) => r[x]));
        const dark = modules.flat().filter(Boolean).length, total = size * size;
        p += Math.floor(Math.abs(dark * 20 - total * 10) / total) * 10;
        return p;
    };
    let best = forceMask ?? 0, bestScore = Infinity;
    for (let m = 0; m < 8 && forceMask == null; m++) {
        applyMask(m); drawFormat(m);
        const score = penalty();
        if (score < bestScore) { bestScore = score; best = m; }
        applyMask(m); // undo (XOR)
    }
    applyMask(best); drawFormat(best);
    return modules;
}

/** Single-path geometry for the code (4-module quiet zone included in `dim`). Null when text doesn't fit. */
export function qrPath(text: string, ecc: QrEcc = 'M'): { dim: number; d: string } | null {
    const m = encodeQr(text, ecc);
    if (!m) return null;
    const n = m.length, q = 4;
    let d = '';
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (m[y][x]) d += `M${x + q},${y + q}h1v1h-1z`;
    return { dim: n + q * 2, d };
}

/**
 * Standalone SVG string (HTML export). Black-on-white on purpose: QR scanners
 * expect dark modules on a light ground regardless of doc theme.
 */
export function qrSvg(text: string, opts: { ecc?: QrEcc; size?: number; title?: string } = {}): string | null {
    const p = qrPath(text, opts.ecc ?? 'M');
    if (!p) return null;
    const px = opts.size ?? 200;
    const title = opts.title ? `<title>${opts.title.replace(/[<&]/g, (c) => (c === '<' ? '&lt;' : '&amp;'))}</title>` : '';
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${p.dim} ${p.dim}" width="${px}" height="${px}" role="img" shape-rendering="crispEdges">${title}<rect width="${p.dim}" height="${p.dim}" fill="#fff"/><path d="${p.d}" fill="#000"/></svg>`;
}
