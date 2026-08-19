/**
 * ThemeEditor — Wave 2 custom theme editor for Interactive Docs.
 *
 * Mount (agent C / IDocEditor):
 *   <ThemeEditor
 *     doc={doc}                                  // current doc (seeds the editor from doc.customTheme or the active named theme)
 *     customThemes={customThemes}                // idocsStore state.customThemes
 *     onApply={(t: CustomTheme) => …}            // set doc.theme = 'custom' + doc.customTheme = t
 *     onSave={(t: CustomTheme) => …}             // idocsStore.saveCustomTheme(t)
 *     onDelete={(name: string) => …}             // idocsStore.deleteCustomTheme(name)
 *     onClose={() => …}
 *   />
 *
 * Edits the 9 `--idoc-*` vars (6 colors, heading/body font, radius), uploads
 * fonts (TTF/OTF/WOFF/WOFF2 → data URL → `customTheme.fontFaces`; the renderer
 * and exportHtml emit the `@font-face` rules), a logo, and imports/exports the
 * theme as JSON (our `CustomTheme` shape). Live preview = IDocRenderer on a
 * sample card. Pure component: no store access.
 */
import { useMemo, useState, type ChangeEvent } from 'react';
import { fileToDataUrl } from '../../../lib/imageDownscale';
import { IDOC_THEMES, themeById, type CustomTheme, type IDoc } from './idocTypes';
import IDocRenderer from './IDocRenderer';
import { ImagePicker } from './BlockEditor';
import { download } from './idocExport';

export interface ThemeEditorProps {
    doc: IDoc;
    customThemes: CustomTheme[];
    onApply: (theme: CustomTheme) => void;
    onSave: (theme: CustomTheme) => void;
    onDelete: (name: string) => void;
    onClose: () => void;
}

const COLOR_VARS: { key: string; label: string }[] = [
    { key: '--idoc-bg', label: 'Background' }, { key: '--idoc-surface', label: 'Card' }, { key: '--idoc-text', label: 'Text' },
    { key: '--idoc-muted', label: 'Muted' }, { key: '--idoc-accent', label: 'Accent' }, { key: '--idoc-border', label: 'Border' },
];
const FONT_PRESETS = [
    "'Hanken Grotesk', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    "'Inter', 'Hanken Grotesk', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    "Georgia, 'Times New Roman', serif",
    "'Playfair Display', Georgia, serif",
    "'JetBrains Mono', ui-monospace, monospace",
    'system-ui, sans-serif',
];
const HEX = /^#[0-9a-f]{6}$/i;
const MAX_FONT_BYTES = 2 * 1024 * 1024;

/** Seed vars: doc.customTheme, else the active named theme (paper for `inherit`, whose vars are app tokens). */
function seedTheme(doc: IDoc): CustomTheme {
    if (doc.customTheme) return { ...doc.customTheme, vars: { ...doc.customTheme.vars }, fontFaces: [...(doc.customTheme.fontFaces ?? [])] };
    const base = themeById(doc.theme === 'inherit' || doc.theme === 'custom' ? 'paper' : doc.theme);
    return { name: 'My theme', vars: { ...base.vars } };
}

function isCustomTheme(v: unknown): v is CustomTheme {
    const t = v as CustomTheme;
    return !!t && typeof t === 'object' && typeof t.name === 'string' && !!t.vars && typeof t.vars === 'object'
        && Object.entries(t.vars).every(([k, x]) => k.startsWith('--idoc-') && typeof x === 'string');
}

const SAMPLE_CARD = { id: 'theme-sample', title: 'Sample card', layout: 'default' as const, blocks: [
    { id: 's1', type: 'heading' as const, level: 2 as const, text: 'Headings use the heading font' },
    { id: 's2', type: 'text' as const, md: 'Body text uses the body font. **Bold**, *italic*, and a [link](#).' },
    { id: 's3', type: 'callout' as const, tone: 'info' as const, md: 'Accent color drives callouts, buttons and charts.' },
    { id: 's4', type: 'button' as const, label: 'Primary button', href: 'https://example.com', variant: 'primary' as const },
] };

export default function ThemeEditor({ doc, customThemes, onApply, onSave, onDelete, onClose }: ThemeEditorProps) {
    const [theme, setTheme] = useState<CustomTheme>(() => seedTheme(doc));
    const [err, setErr] = useState('');
    const setVar = (k: string, v: string) => setTheme((t) => ({ ...t, vars: { ...t.vars, [k]: v } }));
    const radius = parseInt(theme.vars['--idoc-radius'] ?? '8', 10) || 0;
    const uploadedFamilies = (theme.fontFaces ?? []).map((f) => `"${f.family}", sans-serif`);
    const fontOptions = [...uploadedFamilies, ...FONT_PRESETS];
    const previewDoc = useMemo<IDoc>(() => ({ ...doc, theme: 'custom', customTheme: theme, cards: [SAMPLE_CARD], chrome: undefined, pageSize: 'fluid' }), [doc, theme]);
    const savedMatch = customThemes.find((t) => t.name === theme.name);

    const onFontFile = async (e: ChangeEvent<HTMLInputElement>) => {
        const f = e.target.files?.[0];
        e.target.value = '';
        if (!f) return;
        setErr('');
        if (!/\.(ttf|otf|woff2?)$/i.test(f.name)) { setErr('Font must be .ttf, .otf, .woff or .woff2'); return; }
        if (f.size > MAX_FONT_BYTES) { setErr('Font file too large (max 2 MB — docs are stored locally)'); return; }
        const dataUrl = await fileToDataUrl(f);
        const family = f.name.replace(/\.(ttf|otf|woff2?)$/i, '').replace(/[-_]+/g, ' ').trim() || 'Custom font';
        setTheme((t) => ({ ...t, fontFaces: [...(t.fontFaces ?? []).filter((x) => x.family !== family), { family, dataUrl }] }));
    };
    const onImport = async (e: ChangeEvent<HTMLInputElement>) => {
        const f = e.target.files?.[0];
        e.target.value = '';
        if (!f) return;
        setErr('');
        try {
            const parsed: unknown = JSON.parse(await f.text());
            const t = (parsed as { customTheme?: unknown })?.customTheme ?? parsed; // accept a whole .idoc.json too
            if (!isCustomTheme(t)) throw new Error('Not a theme JSON ({ name, vars: { "--idoc-…": … } })');
            setTheme({ name: t.name, vars: { ...t.vars }, fontFaces: Array.isArray(t.fontFaces) ? t.fontFaces.filter((x) => x && typeof x.family === 'string' && typeof x.dataUrl === 'string') : undefined, logo: typeof t.logo === 'string' ? t.logo : undefined });
        } catch (ex) { setErr((ex as Error)?.message || 'Import failed'); }
    };
    const clean = (): CustomTheme => {
        const t: CustomTheme = { name: theme.name.trim() || 'My theme', vars: { ...theme.vars } };
        if (theme.fontFaces?.length) t.fontFaces = theme.fontFaces;
        if (theme.logo) t.logo = theme.logo;
        return t;
    };

    return (
        <div className="scribe-idocs__themeed" role="dialog" aria-label="Theme editor">
            <div className="scribe-idocs__themeed-form">
                <div className="scribe-idocs__row">
                    <input value={theme.name} onChange={(e) => setTheme((t) => ({ ...t, name: e.target.value }))} placeholder="Theme name" aria-label="Theme name" />
                    {customThemes.length > 0 && (
                        <select value="" onChange={(e) => { const t = customThemes.find((x) => x.name === e.target.value); if (t) setTheme({ ...t, vars: { ...t.vars } }); }} aria-label="Load saved theme">
                            <option value="">Load saved…</option>
                            {customThemes.map((t) => <option key={t.name} value={t.name}>{t.name}</option>)}
                        </select>
                    )}
                    <select value="" onChange={(e) => { const t = IDOC_THEMES.find((x) => x.id === e.target.value); if (t) setTheme((cur) => ({ ...cur, vars: { ...t.vars } })); }} aria-label="Start from preset">
                        <option value="">Start from preset…</option>
                        {IDOC_THEMES.filter((t) => t.id !== 'inherit').map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
                    </select>
                </div>

                <div className="scribe-idocs__themeed-colors">
                    {COLOR_VARS.map(({ key, label }) => (
                        <label key={key} className="scribe-idocs__inline">
                            <input type="color" value={HEX.test(theme.vars[key] ?? '') ? theme.vars[key] : '#888888'} onChange={(e) => setVar(key, e.target.value)} aria-label={`${label} color`} />
                            <span>{label}</span>
                            <input className="scribe-idocs__themeed-hex" value={theme.vars[key] ?? ''} onChange={(e) => setVar(key, e.target.value)} aria-label={`${label} value`} />
                        </label>
                    ))}
                </div>

                <div className="scribe-idocs__row scribe-idocs__row--stretch">
                    <label className="scribe-idocs__inline">Heading font
                        <input list="idoc-theme-fonts" value={theme.vars['--idoc-heading-font'] ?? ''} onChange={(e) => setVar('--idoc-heading-font', e.target.value)} aria-label="Heading font" />
                    </label>
                    <label className="scribe-idocs__inline">Body font
                        <input list="idoc-theme-fonts" value={theme.vars['--idoc-body-font'] ?? ''} onChange={(e) => setVar('--idoc-body-font', e.target.value)} aria-label="Body font" />
                    </label>
                    <datalist id="idoc-theme-fonts">{fontOptions.map((f) => <option key={f} value={f} />)}</datalist>
                </div>
                <div className="scribe-idocs__row">
                    <label className="scribe-idocs__inline">Radius
                        <input type="range" min={0} max={24} value={radius} onChange={(e) => setVar('--idoc-radius', `${e.target.value}px`)} aria-label="Corner radius" />
                        <span>{radius}px</span>
                    </label>
                    <label className="scribe-idocs__filebtn">Upload font<input type="file" accept=".ttf,.otf,.woff,.woff2,font/*" onChange={(e) => void onFontFile(e)} hidden /></label>
                    <label className="scribe-idocs__filebtn">Import JSON<input type="file" accept=".json,application/json" onChange={(e) => void onImport(e)} hidden /></label>
                    <button type="button" className="scribe-idocs__minibtn" onClick={() => download(`${(theme.name || 'theme').replace(/[^\w-]+/g, '-')}.idoc-theme.json`, 'application/json', JSON.stringify(clean(), null, 2))}>Export JSON</button>
                </div>
                {theme.fontFaces && theme.fontFaces.length > 0 && (
                    <ul className="scribe-idocs__themeed-fonts" aria-label="Uploaded fonts">
                        {theme.fontFaces.map((f) => (
                            <li key={f.family}>
                                <span style={{ fontFamily: `"${f.family}"` }}>{f.family}</span>
                                <button type="button" className="scribe-idocs__minibtn" onClick={() => setVar('--idoc-heading-font', `"${f.family}", sans-serif`)}>use for headings</button>
                                <button type="button" className="scribe-idocs__minibtn" onClick={() => setVar('--idoc-body-font', `"${f.family}", sans-serif`)}>use for body</button>
                                <button type="button" onClick={() => setTheme((t) => ({ ...t, fontFaces: (t.fontFaces ?? []).filter((x) => x.family !== f.family) }))} aria-label={`Remove font ${f.family}`}>✕</button>
                            </li>
                        ))}
                    </ul>
                )}
                <div className="scribe-idocs__themeed-logo">
                    <span className="scribe-idocs__hint">Logo</span>
                    <ImagePicker value={theme.logo ?? ''} onChange={(logo) => setTheme((t) => ({ ...t, logo: logo || undefined }))} />
                </div>
                {err && <small className="scribe-idocs__hint scribe-idocs__hint--err" role="alert">{err}</small>}
                <div className="scribe-idocs__row scribe-idocs__themeed-actions">
                    <button type="button" className="scribe-idocs__minibtn is-primary" onClick={() => onApply(clean())}>Apply to this doc</button>
                    <button type="button" className="scribe-idocs__minibtn" onClick={() => onSave(clean())}>{savedMatch ? 'Update saved theme' : 'Save as custom theme'}</button>
                    {savedMatch && <button type="button" className="scribe-idocs__minibtn" onClick={() => onDelete(savedMatch.name)}>Delete</button>}
                    <button type="button" className="scribe-idocs__minibtn" onClick={onClose}>Close</button>
                </div>
            </div>
            <div className="scribe-idocs__themeed-preview" aria-label="Theme preview">
                <IDocRenderer doc={previewDoc} interactive={false} />
            </div>
        </div>
    );
}
