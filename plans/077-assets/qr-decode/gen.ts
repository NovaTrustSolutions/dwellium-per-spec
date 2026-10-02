import { encodeQr } from '/Users/ilyaklipinitser/Downloads/Dwellium -Per Spec/.claude/worktrees/077-links-qr/qualia-shell/src/components/Scribe/idocs/blocks/qr.ts';
import { deflateSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';

const crcT = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc = (b: Buffer) => { let c = 0xffffffff; for (const x of b) c = crcT[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const chunk = (t: string, d: Buffer) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([l, td, c]); };
function png(m: boolean[][], px = 8, q = 4): Buffer {
  const dim = (m.length + q * 2) * px, rows: Buffer[] = [];
  for (let y = 0; y < dim; y++) {
    const row = Buffer.alloc(1 + dim, 255); row[0] = 0;
    const my = Math.floor(y / px) - q;
    for (let x = 0; x < dim; x++) { const mx = Math.floor(x / px) - q; if (my >= 0 && mx >= 0 && my < m.length && mx < m.length && m[my][mx]) row[1 + x] = 0; }
    rows.push(row);
  }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(dim, 0); ihdr.writeUInt32BE(dim, 4); ihdr[8] = 8; ihdr[9] = 0;
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(Buffer.concat(rows))), chunk('IEND', Buffer.alloc(0))]);
}
const filler = (n: number) => { let s = 'https://dwellium.example/p/', i = 0; while (s.length < n) s += 'aZ09bY18cX27dW36eV45fU54'[i++ % 24]; return s.slice(0, n); };
const maxN = (() => { let n = 1; while (encodeQr(filler(n + 1), 'M')) n++; return n; })();
console.log('max payload at M (bytes):', maxN, '| n+1 ->', encodeQr(filler(maxN + 1), 'M'));
const cases = [
  ['url30_M', filler(30), 'M'], ['url70_M', filler(70), 'M'], ['url70_L', filler(70), 'L'], ['max_M', filler(maxN), 'M'],
] as const;
const manifest: Record<string, string> = {};
for (const [name, text, ecc] of cases) {
  const m = encodeQr(text, ecc as 'L' | 'M'); if (!m) throw new Error('no fit ' + name);
  writeFileSync(`${name}.png`, png(m)); manifest[name] = text;
  console.log(name, 'len', text.length, 'modules', m.length);
}
writeFileSync('manifest.json', JSON.stringify(manifest));
