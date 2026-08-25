/**
 * QrDoorSheet — printable per-unit QR grid for a property (plan 053).
 *
 * Pick a property (Andy's two Georgia communities from andyLinkPresets.ts),
 * edit the unit roster, choose a destination pattern with a {unit} placeholder
 * (default: maintenance request with ?unit=), then Generate → a print-CSS
 * grid of labelled QR codes, one per unit. QR encoding is fully client-side
 * via the repo's zero-dep encoder (Scribe idocs qrSvg) — it works even before
 * Dub is configured. When Dub IS configured, "Mint short links" bulk-creates
 * tagged short links for the same units through POST /api/links/bulk.
 */
import { useMemo, useState } from 'react';
import { ArrowLeft, Printer, QrCode } from 'lucide-react';
import { qrSvg } from '../Scribe/idocs/blocks/qr';
import {
    ANDY_PROPERTIES,
    DOOR_SHEET_DEFAULT_PATTERN,
    unitKey,
    type AndyProperty,
} from './andyLinkPresets';
import { bulkCreateShortLinks } from './shortLinksApi';

function parseUnits(text: string): string[] {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const raw of text.split(/[\n,]+/)) {
        const unit = raw.trim();
        if (unit && !seen.has(unit)) { seen.add(unit); out.push(unit); }
    }
    return out;
}

export function unitUrl(pattern: string, unit: string): string {
    return pattern.split('{unit}').join(encodeURIComponent(unit));
}

interface QrDoorSheetProps {
    /** Dub proxy configured → offers the bulk "Mint short links" action. */
    configured: boolean;
    onBack: () => void;
}

export default function QrDoorSheet({ configured, onBack }: QrDoorSheetProps) {
    const [property, setProperty] = useState<AndyProperty>(ANDY_PROPERTIES[0]);
    const [unitsText, setUnitsText] = useState(ANDY_PROPERTIES[0].units.join('\n'));
    const [pattern, setPattern] = useState(DOOR_SHEET_DEFAULT_PATTERN);
    const [generated, setGenerated] = useState<string[] | null>(null);
    const [notice, setNotice] = useState<string | null>(null);
    const [minting, setMinting] = useState(false);

    const patternOk = /^https?:\/\/\S+$/i.test(pattern.trim()) && pattern.includes('{unit}');
    const units = useMemo(() => parseUnits(unitsText), [unitsText]);

    const pickProperty = (id: string) => {
        const next = ANDY_PROPERTIES.find(p => p.id === id) ?? ANDY_PROPERTIES[0];
        setProperty(next);
        setUnitsText(next.units.join('\n'));
        setGenerated(null);
    };

    const mint = async () => {
        if (!generated) return;
        setMinting(true);
        setNotice(null);
        const r = await bulkCreateShortLinks(generated.map(unit => ({
            url: unitUrl(pattern.trim(), unit),
            key: unitKey(property.tag, unit),
            tagNames: [property.tag, 'door-qr'],
        })));
        setMinting(false);
        setNotice(r.kind === 'ok'
            ? `Minted ${r.data.length} short links (tagged ${property.tag}, door-qr)`
            : r.kind === 'needs-setup' ? 'Dub is not configured — set DUB_API_KEY first' : r.message);
    };

    return (
        <div className="qr-door-sheet">
            <div className="qr-door-sheet__controls">
                <button className="short-links__btn short-links__btn--ghost" onClick={onBack} aria-label="Back to links">
                    <ArrowLeft size={14} aria-hidden /> Back
                </button>
                <label className="qr-door-sheet__field">
                    Property
                    <select className="short-links__input" value={property.id} onChange={e => pickProperty(e.target.value)} aria-label="Property">
                        {ANDY_PROPERTIES.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                </label>
                <label className="qr-door-sheet__field qr-door-sheet__field--wide">
                    Destination pattern ({'{unit}'} is replaced per unit)
                    <input className="short-links__input" value={pattern} onChange={e => setPattern(e.target.value)} aria-label="Destination pattern" />
                </label>
                <label className="qr-door-sheet__field qr-door-sheet__field--wide">
                    Units — one per line (seeded from Strata data; paste the full roster to print a building)
                    <textarea
                        className="short-links__input qr-door-sheet__units"
                        value={unitsText}
                        onChange={e => setUnitsText(e.target.value)}
                        rows={4}
                        aria-label="Units"
                    />
                </label>
                <div className="qr-door-sheet__actions">
                    <button
                        className="short-links__btn"
                        disabled={!patternOk || units.length === 0}
                        onClick={() => { setGenerated(units); setNotice(null); }}
                    >
                        <QrCode size={13} aria-hidden /> Generate sheet
                    </button>
                    {generated && (
                        <button className="short-links__btn" onClick={() => window.print()} aria-label="Print sheet">
                            <Printer size={13} aria-hidden /> Print
                        </button>
                    )}
                    {generated && configured && (
                        <button className="short-links__btn" disabled={minting} onClick={() => void mint()}>
                            {minting ? 'Minting…' : 'Mint short links for these units'}
                        </button>
                    )}
                </div>
                {!patternOk && <p className="short-links__muted">The pattern must be an http(s) URL containing {'{unit}'}.</p>}
                {notice && <p className="short-links__notice">{notice}</p>}
            </div>

            {generated && (
                <div className="qr-door-sheet__print" data-testid="qr-door-sheet-print">
                    <h3 className="qr-door-sheet__title">{property.name} — unit QR codes</h3>
                    <div className="qr-door-sheet__grid">
                        {generated.map(unit => {
                            const url = unitUrl(pattern.trim(), unit);
                            const svg = qrSvg(url, { size: 160, title: `QR code for unit ${unit}` });
                            return (
                                <figure key={unit} className="qr-door-sheet__cell" data-testid="qr-door-sheet-cell">
                                    {svg
                                        ? <span dangerouslySetInnerHTML={{ __html: svg }} />
                                        : <span className="short-links__muted">URL too long for a QR code</span>}
                                    <figcaption>
                                        <strong>Unit {unit}</strong>
                                        <span className="qr-door-sheet__url">{url}</span>
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
