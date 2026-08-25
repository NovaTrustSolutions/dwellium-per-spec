/**
 * qr — minimal QR encoder for booking links (plan 053).
 *
 * No new dependency: the repo ships no QR library (the Links & QR widget gets
 * its PNG from Dub's API, which needs DUB_API_KEY — a second setup gate we do
 * not want on the Scheduling widget). This is byte-mode, ECC level L, mask 0,
 * versions 1–6 — enough for every prefilled cal.com booking URL (≤134 bytes).
 *
 * ponytail: capped at version 6 / ECC L / fixed mask 0. Longer payloads return
 * null and the UI falls back to copy-only. Add versions 7+ (needs the 18-bit
 * version-info blocks) and mask selection only if a link ever exceeds 134 bytes.
 * A fixed mask is spec-legal — decoders read the mask from the format bits.
 */

/** Byte-mode data capacity per version at ECC level L. */
const CAPACITY_L = [0, 17, 32, 53, 78, 106, 134];
/** [dataCodewords, ecCodewordsPerBlock, blockCount] per version at ECC level L. */
const BLOCKS_L: Array<[number, number, number]> = [
    [0, 0, 0], [19, 7, 1], [34, 10, 1], [55, 15, 1], [80, 20, 1], [108, 26, 1], [136, 18, 2],
];
/** Alignment-pattern centre coordinates per version (v1 has none). */
const ALIGN: number[][] = [[], [], [6, 18], [6, 22], [6, 26], [6, 30], [6, 34]];

// ── GF(256) with primitive polynomial 0x11D ─────────────────────────────────
const EXP = new Uint8Array(512);
const LOG = new Uint8Array(256);
for (let i = 0, x = 1; i < 255; i++) {
    EXP[i] = x;
    LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d;
}
for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];

const gfMul = (a: number, b: number): number => (a === 0 || b === 0 ? 0 : EXP[LOG[a] + LOG[b]]);

/** Generator polynomial of degree `degree`. */
function generatorPoly(degree: number): number[] {
    let poly = [1];
    for (let d = 0; d < degree; d++) {
        const next = new Array(poly.length + 1).fill(0);
        for (let i = 0; i < poly.length; i++) {
            next[i] ^= poly[i];                      // × x
            next[i + 1] ^= gfMul(poly[i], EXP[d]);   // × α^d
        }
        poly = next;
    }
    return poly;
}

/** Reed-Solomon error-correction codewords for one data block. */
function ecCodewords(data: number[], ecLen: number): number[] {
    const gen = generatorPoly(ecLen);
    const rem = new Array(ecLen).fill(0);
    for (const byte of data) {
        const factor = byte ^ rem[0];
        rem.shift();
        rem.push(0);
        if (factor !== 0) for (let i = 0; i < ecLen; i++) rem[i] ^= gfMul(gen[i + 1], factor);
    }
    return rem;
}

/** 15-bit format information for ECC L (01) + mask 0 (000), BCH(15,5) + mask 0x5412. */
function formatBits(): number {
    const data = 0b01000; // ECC L, mask 0
    let rem = data;
    for (let i = 0; i < 10; i++) {
        rem <<= 1;
        if (rem & 0x400) rem ^= 0x537;
    }
    return ((data << 10) | rem) ^ 0x5412;
}

/**
 * Encode `text` as a QR matrix of booleans (true = dark module).
 * Returns null when the payload exceeds the supported capacity (134 bytes).
 */
export function qrMatrix(text: string): boolean[][] | null {
    const bytes = Array.from(new TextEncoder().encode(text));
    const version = CAPACITY_L.findIndex((cap, v) => v > 0 && bytes.length <= cap);
    if (version < 1) return null;

    const [dataTotal, ecLen, blockCount] = BLOCKS_L[version];
    const size = 17 + version * 4;

    // ── Bit stream: mode 0100, length (8 bits for v<10), payload, terminator, pad ──
    const bits: number[] = [];
    const push = (value: number, len: number) => { for (let i = len - 1; i >= 0; i--) bits.push((value >> i) & 1); };
    push(0b0100, 4);
    push(bytes.length, 8);
    for (const b of bytes) push(b, 8);
    for (let i = 0; i < 4 && bits.length < dataTotal * 8; i++) bits.push(0);
    while (bits.length % 8 !== 0) bits.push(0);

    const dataBytes: number[] = [];
    for (let i = 0; i < bits.length; i += 8) {
        dataBytes.push(bits.slice(i, i + 8).reduce((acc, bit) => (acc << 1) | bit, 0));
    }
    for (let i = 0; dataBytes.length < dataTotal; i++) dataBytes.push(i % 2 === 0 ? 0xec : 0x11);

    // ── Split into blocks, compute EC, interleave ──
    const perBlock = dataTotal / blockCount;
    const dataBlocks: number[][] = [];
    const ecBlocks: number[][] = [];
    for (let b = 0; b < blockCount; b++) {
        const block = dataBytes.slice(b * perBlock, (b + 1) * perBlock);
        dataBlocks.push(block);
        ecBlocks.push(ecCodewords(block, ecLen));
    }
    const final: number[] = [];
    for (let i = 0; i < perBlock; i++) for (const block of dataBlocks) final.push(block[i]);
    for (let i = 0; i < ecLen; i++) for (const block of ecBlocks) final.push(block[i]);

    // ── Matrix: modules + a reserved-function mask ──
    const matrix: boolean[][] = Array.from({ length: size }, () => new Array(size).fill(false));
    const reserved: boolean[][] = Array.from({ length: size }, () => new Array(size).fill(false));
    const set = (r: number, c: number, dark: boolean) => { matrix[r][c] = dark; reserved[r][c] = true; };

    // Finder patterns + separators
    for (const [fr, fc] of [[0, 0], [0, size - 7], [size - 7, 0]]) {
        for (let r = -1; r <= 7; r++) {
            for (let c = -1; c <= 7; c++) {
                const rr = fr + r; const cc = fc + c;
                if (rr < 0 || cc < 0 || rr >= size || cc >= size) continue;
                const inRing = (r >= 0 && r <= 6 && (c === 0 || c === 6)) || (c >= 0 && c <= 6 && (r === 0 || r === 6));
                const inCore = r >= 2 && r <= 4 && c >= 2 && c <= 4;
                set(rr, cc, inRing || inCore);
            }
        }
    }
    // Timing patterns
    for (let i = 8; i < size - 8; i++) { set(6, i, i % 2 === 0); set(i, 6, i % 2 === 0); }
    // Alignment patterns (skip the three finder corners)
    const centres = ALIGN[version];
    for (const ar of centres) {
        for (const ac of centres) {
            if ((ar <= 8 && ac <= 8) || (ar <= 8 && ac >= size - 9) || (ar >= size - 9 && ac <= 8)) continue;
            for (let r = -2; r <= 2; r++) {
                for (let c = -2; c <= 2; c++) {
                    set(ar + r, ac + c, Math.abs(r) === 2 || Math.abs(c) === 2 || (r === 0 && c === 0));
                }
            }
        }
    }
    // Dark module + reserve the format-info strips
    set(size - 8, 8, true);
    for (let i = 0; i < 9; i++) {
        if (!reserved[8][i]) set(8, i, false);
        if (!reserved[i][8]) set(i, 8, false);
    }
    for (let i = 0; i < 8; i++) {
        if (!reserved[8][size - 1 - i]) set(8, size - 1 - i, false);
        if (!reserved[size - 1 - i][8]) set(size - 1 - i, 8, false);
    }

    // ── Place data in the zigzag, applying mask 0 ((row + col) % 2 === 0) ──
    let bitIndex = 0;
    let upward = true;
    for (let right = size - 1; right > 0; right -= 2) {
        if (right === 6) right = 5; // column 6 is the vertical timing pattern
        for (let step = 0; step < size; step++) {
            const row = upward ? size - 1 - step : step;
            for (const col of [right, right - 1]) {
                if (reserved[row][col]) continue;
                const byte = final[bitIndex >> 3];
                const bit = byte === undefined ? 0 : (byte >> (7 - (bitIndex & 7))) & 1;
                bitIndex++;
                matrix[row][col] = ((bit === 1) !== ((row + col) % 2 === 0));
            }
        }
        upward = !upward;
    }

    // ── Format information (both copies) ──
    const fmt = formatBits();
    // Placement index k runs 0→14 and takes format bit (14 − k) — MSB first.
    const fbit = (k: number) => ((fmt >> (14 - k)) & 1) === 1;
    // Copy 1 — around the top-left finder
    for (let k = 0; k <= 5; k++) matrix[8][k] = fbit(k);
    matrix[8][7] = fbit(6);
    matrix[8][8] = fbit(7);
    matrix[7][8] = fbit(8);
    for (let k = 9; k <= 14; k++) matrix[14 - k][8] = fbit(k);
    // Copy 2 — bottom-left vertical (k 0–6) then top-right horizontal (k 7–14)
    for (let k = 0; k <= 6; k++) matrix[size - 1 - k][8] = fbit(k);
    for (let k = 7; k <= 14; k++) matrix[8][size - 15 + k] = fbit(k);
    matrix[size - 8][8] = true; // dark module — always set, never a format bit

    return matrix;
}

/**
 * Render `text` as a self-contained SVG data URI (usable as an <img> src),
 * or null when the payload is too long for the supported versions.
 */
export function qrDataUri(text: string, moduleSize = 4, quiet = 4): string | null {
    const matrix = qrMatrix(text);
    if (!matrix) return null;
    const size = matrix.length;
    const dim = (size + quiet * 2) * moduleSize;
    let path = '';
    for (let r = 0; r < size; r++) {
        for (let c = 0; c < size; c++) {
            if (matrix[r][c]) path += `M${(c + quiet) * moduleSize} ${(r + quiet) * moduleSize}h${moduleSize}v${moduleSize}h-${moduleSize}z`;
        }
    }
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${dim}" height="${dim}" viewBox="0 0 ${dim} ${dim}"><rect width="${dim}" height="${dim}" fill="#fff"/><path d="${path}" fill="#000"/></svg>`;
    return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}
