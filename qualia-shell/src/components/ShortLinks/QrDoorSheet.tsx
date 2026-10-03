/**
 * QrDoorSheet — printable per-unit QR grid for a property (plan 053; plan 077 phase 2).
 *
 * Pick a property (Strata's properties when it has any, else Andy's two Georgia
 * communities from andyLinkPresets.ts — see linkProperties.ts), edit the unit
 * roster (seeded from Strata units, or the fallback roster), and set the destination pattern — prefilled from that
 * property's "Maintenance request" destination (entered in the links view) and
 * `{unit}` is optional (substituted per unit when present). Generate snapshots
 * the inputs, mints one short link per unit (POST /api/links/bulk, an upsert by
 * key) and only then renders: each code encodes the SHORT link, with the short
 * URL and the destination printed under it. Editing the pattern or roster
 * afterwards changes nothing until Generate is pressed again. When minting
 * fails or the backend is unreachable the codes point straight at the
 * destination and a notice on the sheet says so. QR encoding is client-side
 * (Scribe idocs qrSvg).
 *
 * Plan 077 phase 4: a `request` (the "print maintenance QR" deep link, see
 * doorSheetLink.ts) selects a property and optionally pins the roster to the
 * given units. A property the list does not know (fallback mode, or Strata not
 * loaded yet) becomes a transient entry so the sheet still works. A later
 * request (new `requestKey`) replaces the current selection. The roster
 * re-seeds when a property's units arrive or the property changes, never over
 * text the user has typed (a picker change is a deliberate re-seed).
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Printer, QrCode } from 'lucide-react';
import { qrSvg } from '../Scribe/idocs/blocks/qr';
import {
    HTTP_URL_RE,
    KEY_RE,
    presetUrl,
    unitKey,
    type DestinationsMemory,
} from './andyLinkPresets';
import { propertyTag, useLinkProperties, type LinkProperty } from './linkProperties';
import type { DoorSheetRequest } from './doorSheetLink';
import { bulkCreateShortLinks } from './shortLinksApi';

function parseUnits(text: string): string[] {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const raw of text.split(/\n+/)) { // one per line — a comma is part of a unit label ("12, Rear")
        const unit = raw.trim();
        if (unit && !seen.has(unit)) { seen.add(unit); out.push(unit); }
    }
    return out;
}

export function unitUrl(pattern: string, unit: string): string {
    return pattern.split('{unit}').join(encodeURIComponent(unit));
}

export interface Cell { unit: string; url: string; short: string | null }
/** What Generate rendered from — immutable until the next Generate. */
export interface Generated { propertyName: string; pattern: string; cells: Cell[]; fallback: string | null }

const esc = (t: string): string => t.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string));

/**
 * The printable sheet as a standalone HTML document. Printing the widget's own DOM
 * cannot work: it sits inside scrolling window containers, so the browser prints one
 * clipped page (the Phase 2 print check caught 4 of 30 codes). A self-contained
 * document paginates cleanly; unit labels and URLs are user text, so they are escaped.
 */
export function doorSheetHtml(g: Generated): string {
    const cells = g.cells.map(({ unit, url, short }) => {
        const svg = qrSvg(short ?? url, { size: 160, title: `QR code for unit ${unit}` });
        return `<figure class="cell">${svg ?? '<span class="muted">URL too long for a QR code</span>'}<figcaption><strong>Unit ${esc(unit)}</strong><span class="short">${esc(short ?? url)}</span>${short ? `<span class="url">${esc(url)}</span>` : ''}</figcaption></figure>`;
    }).join('');
    return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(g.propertyName)} — unit QR codes</title><style>
@page { size: auto; margin: 12mm; }
body { margin: 0; font-family: system-ui, sans-serif; color: #000; background: #fff; }
h1 { font-size: 16px; margin: 0 0 12px; }
.fallback { font-size: 11px; color: #444; margin: 0 0 12px; }
.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(190px, 1fr)); gap: 12px; }
.cell { display: flex; flex-direction: column; align-items: center; gap: 6px; margin: 0; padding: 10px; border: 1px solid #000; break-inside: avoid; page-break-inside: avoid; text-align: center; }
.cell svg { width: 160px; height: 160px; }
figcaption { display: flex; flex-direction: column; gap: 2px; font-size: 12px; }
.short { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 11px; overflow-wrap: anywhere; }
.url { font-size: 9px; color: #444; overflow-wrap: anywhere; }
.muted { font-size: 11px; color: #666; }
</style></head><body><h1>${esc(g.propertyName)} — unit QR codes</h1>${g.fallback ? `<p class="fallback">${esc(g.fallback)}</p>` : ''}<div class="grid">${cells}</div></body></html>`;
}

/** Print the sheet from a hidden iframe so the widget's scroll containers never clip it. */
export function printDoorSheet(g: Generated): void {
    const frame = document.createElement('iframe');
    frame.setAttribute('aria-hidden', 'true');
    frame.style.cssText = 'position:fixed;width:0;height:0;border:0;opacity:0;pointer-events:none';
    frame.srcdoc = doorSheetHtml(g);
    frame.onload = () => {
        const w = frame.contentWindow;
        if (!w) { frame.remove(); return; }
        w.addEventListener('afterprint', () => frame.remove());
        w.focus();
        w.print();
        setTimeout(() => frame.remove(), 60_000); // afterprint is not fired by every browser
    };
    document.body.appendChild(frame);
}

interface QrDoorSheetProps {
    destinations: DestinationsMemory;
    /** Which shortener answered the list call; 'unavailable' = no backend to mint with. */
    links: 'builtin' | 'dub' | 'loading' | 'needs-setup' | 'unavailable';
    onBack: () => void;
    /** "Print maintenance QR" deep link: which property (and units) to open on. */
    request?: DoorSheetRequest | null;
    /** Changes with every request, so a second identical request still applies. */
    requestKey?: number;
}

const EMPTY_HINT = 'Set a maintenance destination for this property (Destinations, in the links view) or type one here';

const transientFor = (r: DoorSheetRequest): LinkProperty =>
    ({ id: r.propertyId, name: r.propertyName, tag: propertyTag(r.propertyName), units: r.units ?? [] });

export default function QrDoorSheet({ destinations, links, onBack, request, requestKey = 0 }: QrDoorSheetProps) {
    const maintenance = (p: LinkProperty): string => presetUrl(destinations, p.id, 'maintenance') ?? '';
    const list = useLinkProperties();
    const [picked, setPicked] = useState<string | null>(request?.propertyId ?? null);
    // A requested property the list does not (yet) know: still usable, under its own name.
    const [transient, setTransient] = useState<LinkProperty | null>(() =>
        request && !list.properties.some(p => p.id === request.propertyId) ? transientFor(request) : null);
    const property: LinkProperty = list.properties.find(p => p.id === picked)
        ?? (transient && transient.id === picked ? transient : undefined)
        ?? list.properties[0];
    const options = list.properties.some(p => p.id === property.id) ? list.properties : [property, ...list.properties];
    const { unitsFor, source } = useLinkProperties(property.id);
    const unitsKey = unitsFor(property.id).join('\n');
    const [unitsText, setUnitsText] = useState(() => request?.units ? request.units.join('\n') : unitsKey);
    // lastSeed = what the effect last wrote (null = re-seed whatever is current); pinned = text the user or a request put there.
    const lastSeed = useRef<string | null>(request?.units ? null : unitsKey);
    const pinned = useRef(!!request?.units);
    const appliedKey = useRef(requestKey);
    // null = follow the property's maintenance destination, so one entered after this sheet opened still shows up.
    const [typedPattern, setTypedPattern] = useState<string | null>(null);
    const pattern = typedPattern ?? maintenance(property);
    const [generated, setGenerated] = useState<Generated | null>(null);
    const [refusal, setRefusal] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    const run = useRef(0); // a Generate that lost to a newer one / a property switch must not render

    const patternOk = HTTP_URL_RE.test(pattern.trim());
    const units = useMemo(() => parseUnits(unitsText), [unitsText]);
    const svgs = useMemo(() => generated?.cells.map(({ unit, url, short }) => qrSvg(short ?? url, { size: 160, title: `QR code for unit ${unit}` })) ?? [], [generated]);

    const resetSheet = () => {
        run.current += 1;
        setBusy(false);
        setTypedPattern(null);
        setGenerated(null);
        setRefusal(null);
    };

    const pickProperty = (id: string) => {
        resetSheet();
        setPicked(id);
        pinned.current = false;
        lastSeed.current = null; // the effect below seeds the roster for the new property (and again when its units arrive)
    };

    // Seed the roster when the property changes or its units load — never over typed/pinned text.
    useEffect(() => {
        if (pinned.current || unitsKey === lastSeed.current) return;
        lastSeed.current = unitsKey;
        setUnitsText(unitsKey);
    }, [property.id, unitsKey]);

    // A new deep-link request replaces the current selection.
    useEffect(() => {
        if (requestKey === appliedKey.current || !request) return;
        appliedKey.current = requestKey;
        resetSheet();
        setPicked(request.propertyId);
        setTransient(list.properties.some(p => p.id === request.propertyId) ? null : transientFor(request));
        pinned.current = !!request.units;
        lastSeed.current = null;
        if (request.units) setUnitsText(request.units.join('\n'));
        else if (request.propertyId === property.id) setUnitsText(unitsKey); // same property: no change for the effect above to see
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [requestKey]);

    /** Why this roster cannot be minted as-is (two labels → one key, or a label that makes no valid key), or null. */
    const keyProblem = (tag: string, labels: string[]): string | null => {
        const seen = new Map<string, string>();
        for (const unit of labels) {
            const key = unitKey(tag, unit);
            if (!KEY_RE.test(key)) return `Unit "${unit}" cannot become a short-link key (letters, digits, - and _, at most 64 characters in all)`;
            const other = seen.get(key);
            if (other !== undefined) return `Units "${other}" and "${unit}" would share one code (${key}) — rename one`;
            seen.set(key, unit);
        }
        return null;
    };

    const generate = async () => {
        const snap = { property, pattern: pattern.trim(), units };
        const problem = keyProblem(snap.property.tag, snap.units);
        setRefusal(problem);
        if (problem) return;
        const cells: Cell[] = snap.units.map(unit => ({ unit, url: unitUrl(snap.pattern, unit), short: null }));
        const id = ++run.current;
        let fallback: string | null = null;
        if (links === 'unavailable' || links === 'needs-setup') {
            fallback = `Short links unavailable (${links === 'needs-setup' ? 'short links are not set up on this backend' : 'the backend is not reachable'}) — these codes point straight at the destination`;
        } else {
            setBusy(true);
            const r = await bulkCreateShortLinks(cells.map(c => ({
                url: c.url,
                key: unitKey(snap.property.tag, c.unit),
                title: `${snap.property.name} unit ${c.unit}`,
                ...(links === 'dub' ? { tagNames: [snap.property.tag, 'door-qr'] } : {}),
            })));
            if (id !== run.current) return;
            setBusy(false);
            if (r.kind === 'ok') {
                const byKey = new Map(r.data.map(row => [row.key, row.shortLink]));
                for (const c of cells) c.short = byKey.get(unitKey(snap.property.tag, c.unit)) ?? null;
            } else {
                const why = r.kind === 'needs-setup' ? 'short links are not set up on this backend' : r.message;
                fallback = `Short links unavailable (${why}) — these codes point straight at the destination`;
            }
        }
        setGenerated({ propertyName: snap.property.name, pattern: snap.pattern, cells, fallback });
    };

    return (
        <div className="qr-door-sheet">
            <div className="qr-door-sheet__controls">
                <button className="short-links__btn short-links__btn--ghost" onClick={onBack} aria-label="Back to links">
                    <ArrowLeft size={14} aria-hidden /> Back
                </button>
                <label className="qr-door-sheet__field">
                    Property
                    <select className="short-links__input" value={property.id} onChange={e => pickProperty(e.target.value)} aria-label="Property" disabled={list.loading}>
                        {options.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                </label>
                <label className="qr-door-sheet__field qr-door-sheet__field--wide">
                    Destination pattern ({'{unit}'} is replaced per unit when present)
                    <input className="short-links__input" value={pattern} onChange={e => setTypedPattern(e.target.value)} aria-label="Destination pattern" />
                </label>
                <label className="qr-door-sheet__field qr-door-sheet__field--wide">
                    Units — one per line ({source === 'strata' ? 'from Strata' : 'no Strata data — fallback roster'})
                    <textarea
                        className="short-links__input qr-door-sheet__units"
                        value={unitsText}
                        onChange={e => { pinned.current = true; setUnitsText(e.target.value); }}
                        rows={4}
                        aria-label="Units"
                    />
                </label>
                <div className="qr-door-sheet__actions">
                    <button
                        className="short-links__btn"
                        disabled={!patternOk || units.length === 0 || busy || links === 'loading' || list.loading}
                        onClick={() => void generate()}
                    >
                        <QrCode size={13} aria-hidden /> {busy ? 'Generating…' : 'Generate sheet'}
                    </button>
                    {generated && (
                        <button className="short-links__btn" onClick={() => printDoorSheet(generated)} aria-label="Print sheet">
                            <Printer size={13} aria-hidden /> Print
                        </button>
                    )}
                </div>
                {(links === 'loading' || list.loading) && <p className="short-links__muted">Loading…</p>}
                {units.length === 0 && <p className="short-links__muted">No units for this property — paste the roster, one per line.</p>}
                {!pattern.trim() && <p className="short-links__muted">{EMPTY_HINT}</p>}
                {pattern.trim() && !patternOk && <p className="short-links__muted">The destination must be an http(s) URL.</p>}
                {refusal && <p className="short-links__notice" role="status">{refusal}</p>}
            </div>

            {generated && (
                <div className="qr-door-sheet__print" data-testid="qr-door-sheet-print">
                    <h3 className="qr-door-sheet__title">{generated.propertyName} — unit QR codes</h3>
                    {generated.fallback && <p className="qr-door-sheet__fallback">{generated.fallback}</p>}
                    <div className="qr-door-sheet__grid">
                        {generated.cells.map(({ unit, url, short }, i) => {
                            const svg = svgs[i];
                            return (
                                <figure key={unit} className="qr-door-sheet__cell" data-testid="qr-door-sheet-cell">
                                    {svg
                                        ? <span dangerouslySetInnerHTML={{ __html: svg }} />
                                        : <span className="short-links__muted">URL too long for a QR code</span>}
                                    <figcaption>
                                        <strong>Unit {unit}</strong>
                                        <span className="qr-door-sheet__short">{short ?? url}</span>
                                        {short && <span className="qr-door-sheet__url">{url}</span>}
                                    </figcaption>
                                </figure>
                            );
                        })}
                    </div>
                </div>
            )}
        </div>
    );
}
