/**
 * PublishDialog — wave 3B: publish the doc's export HTML to `/p/<slug>`.
 * Slug (auto from title, editable, `[a-z0-9-]{3,64}`), optional password,
 * SEO title/description, noindex, embed toggle. After publish: public URL +
 * Copy / Open, embed code + Copy, Share on LinkedIn, Re-publish, Unpublish.
 * `doc.publication` is persisted through the store (`updateDoc`).
 */
import { useState } from 'react';
import { exportHtml } from './idocExport';
import { IdocsApiError, embedCodeFor, isValidSlug, linkedInShareUrl, publicUrlFor, publishDoc, slugify, unpublish, type IdocsApiDeps } from './idocsApi';
import { updateDoc } from './idocsStore';
import type { IDoc } from './idocTypes';
import './PublishDialog.css';

export interface PublishDialogProps { doc: IDoc; onClose: () => void; api?: IdocsApiDeps; onToast?: (m: string) => void }

async function copy(text: string, toast?: (m: string) => void, label = 'Copied'): Promise<void> {
    try { await navigator.clipboard.writeText(text); toast?.(label); } catch { toast?.('Clipboard blocked — select and copy the text'); }
}

export default function PublishDialog({ doc, onClose, api, onToast }: PublishDialogProps) {
    const pub = doc.publication ?? null;
    const [slug, setSlug] = useState(pub?.slug ?? slugify(doc.title));
    const [password, setPassword] = useState('');
    const [seoTitle, setSeoTitle] = useState(doc.title);
    const [seoDesc, setSeoDesc] = useState(doc.description ?? '');
    const [noindex, setNoindex] = useState(false);
    const [embedAllowed, setEmbedAllowed] = useState(true);
    const [busy, setBusy] = useState<'publish' | 'unpublish' | null>(null);
    const [error, setError] = useState<string | null>(null);
    const slugOk = isValidSlug(slug);
    const url = pub ? publicUrlFor(pub.slug) : '';

    const publish = async () => {
        if (!slugOk) return;
        setBusy('publish'); setError(null);
        try {
            const r = await publishDoc({
                docId: doc.id, title: doc.title, html: exportHtml(doc), slug,
                password: password || undefined,
                seo: { title: seoTitle || undefined, description: seoDesc || undefined, noindex: noindex || undefined },
                embedAllowed,
            }, api);
            updateDoc(doc.id, { publication: { slug: r.slug, url: r.url, publishedAt: r.publishedAt } });
            setSlug(r.slug); setPassword('');
            onToast?.(pub ? 'Re-published' : 'Published');
        } catch (e) { setError(e instanceof IdocsApiError && e.status === 0 ? 'Backend unreachable — try again when connected.' : `Publish failed: ${(e as Error).message}`); }
        finally { setBusy(null); }
    };
    const doUnpublish = async () => {
        if (!pub) return;
        setBusy('unpublish'); setError(null);
        try { await unpublish(pub.slug, api); updateDoc(doc.id, { publication: undefined }); onToast?.('Unpublished'); }
        catch (e) { setError(`Unpublish failed: ${(e as Error).message}`); }
        finally { setBusy(null); }
    };

    return (
        <div className="scribe-idocs-ed__sheet-backdrop" role="presentation" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
            <div className="scribe-idocs-ed__sheet scribe-idocs-pub" role="dialog" aria-label="Publish" data-testid="idoc-publish">
                <h3>{pub ? 'Published' : 'Publish to the web'}</h3>
                {pub && (
                    <>
                        <div className="scribe-idocs-pub__ok">Live since {new Date(pub.publishedAt).toLocaleString()}</div>
                        <div className="scribe-idocs__field"><span>Public link</span>
                            <code className="scribe-idocs-pub__code" data-testid="idoc-public-url">{url}</code>
                            <div className="scribe-idocs__row">
                                <button type="button" className="scribe-idocs__btn" onClick={() => void copy(url, onToast, 'Link copied')}>Copy link</button>
                                <a className="scribe-idocs__btn" href={url} target="_blank" rel="noopener noreferrer">Open</a>
                                <a className="scribe-idocs__btn" href={linkedInShareUrl(url)} target="_blank" rel="noopener noreferrer">Share on LinkedIn</a>
                            </div>
                        </div>
                        <div className="scribe-idocs__field"><span>Embed code</span>
                            <code className="scribe-idocs-pub__code" data-testid="idoc-embed-code">{embedCodeFor(pub.slug)}</code>
                            <div className="scribe-idocs__row"><button type="button" className="scribe-idocs__btn" onClick={() => void copy(embedCodeFor(pub.slug), onToast, 'Embed code copied')}>Copy embed code</button></div>
                        </div>
                        <hr />
                        <small className="scribe-idocs__hint">Re-publish to push the current content and settings to the same link.</small>
                    </>
                )}
                <label className="scribe-idocs__field"><span>Slug</span>
                    <div className="scribe-idocs-pub__slug"><span>/p/</span>
                        <input type="text" value={slug} onChange={(e) => setSlug(e.target.value.toLowerCase())} aria-label="Slug" aria-invalid={!slugOk} pattern="[a-z0-9-]{3,64}" spellCheck={false} />
                    </div>
                    {!slugOk && <small className="scribe-idocs__warn" role="alert">3–64 chars: lowercase letters, digits, dashes.</small>}
                </label>
                <label className="scribe-idocs__field"><span>Password (optional)</span>
                    <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder={pub ? 'Leave blank to keep the current setting' : 'Viewers must enter this'} aria-label="Password" autoComplete="new-password" />
                </label>
                <label className="scribe-idocs__field"><span>SEO title</span><input type="text" value={seoTitle} onChange={(e) => setSeoTitle(e.target.value)} aria-label="SEO title" /></label>
                <label className="scribe-idocs__field"><span>SEO description</span><textarea rows={2} value={seoDesc} onChange={(e) => setSeoDesc(e.target.value)} aria-label="SEO description" /></label>
                <label className="scribe-idocs-ed__check"><input type="checkbox" checked={noindex} onChange={(e) => setNoindex(e.target.checked)} /> Hide from search engines</label>
                <label className="scribe-idocs-ed__check"><input type="checkbox" checked={embedAllowed} onChange={(e) => setEmbedAllowed(e.target.checked)} /> Allow embedding (iframe)</label>
                {error && <p className="scribe-idocs__warn" role="alert">{error}</p>}
                <div className="scribe-idocs-pub__foot">
                    <button type="button" className="scribe-idocs__btn scribe-idocs__btn--primary" onClick={() => void publish()} disabled={!slugOk || !!busy}>{busy === 'publish' ? 'Publishing…' : pub ? 'Re-publish' : 'Publish'}</button>
                    {pub && <button type="button" className="scribe-idocs__btn" onClick={() => void doUnpublish()} disabled={!!busy}>{busy === 'unpublish' ? 'Unpublishing…' : 'Unpublish'}</button>}
                    <span className="scribe-idocs__spacer" />
                    <button type="button" className="scribe-idocs__btn scribe-idocs__btn--ghost" onClick={onClose}>Close</button>
                </div>
            </div>
        </div>
    );
}
