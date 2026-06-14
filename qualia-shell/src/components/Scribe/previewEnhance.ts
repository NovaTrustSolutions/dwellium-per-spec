/**
 * previewEnhance — runtime CDN lazy-loads for the Scribe preview's MacDown
 * extras: Prism (syntax highlighting), KaTeX (math), Mermaid (diagrams).
 *
 * No npm dependency: loaded from cdnjs on first use so the build stays lean and
 * nothing breaks if the network/CSP blocks them — every step is wrapped in
 * try/catch and degrades to plain rendering. Call enhancePreview(el) after each
 * markdown render.
 */

const CDN = 'https://cdnjs.cloudflare.com/ajax/libs';
const loaded = new Set<string>();

function loadScript(src: string): Promise<void> {
    if (loaded.has(src)) return Promise.resolve();
    return new Promise((resolve) => {
        const s = document.createElement('script');
        s.src = src; s.async = true;
        s.onload = () => { loaded.add(src); resolve(); };
        s.onerror = () => resolve(); // degrade silently
        document.head.appendChild(s);
    });
}
function loadCss(href: string): void {
    if (loaded.has(href)) return;
    const l = document.createElement('link');
    l.rel = 'stylesheet'; l.href = href;
    document.head.appendChild(l); loaded.add(href);
}

/* eslint-disable @typescript-eslint/no-explicit-any */
async function highlight(el: HTMLElement): Promise<void> {
    if (!el.querySelector('pre code')) return;
    try {
        loadCss(`${CDN}/prism/1.29.0/themes/prism-tomorrow.min.css`);
        await loadScript(`${CDN}/prism/1.29.0/prism.min.js`);
        await loadScript(`${CDN}/prism/1.29.0/plugins/autoloader/prism-autoloader.min.js`);
        (window as any).Prism?.highlightAllUnder?.(el);
    } catch { /* degrade */ }
}

async function math(el: HTMLElement): Promise<void> {
    if (!/\$|\\\(|\\\[/.test(el.textContent || '')) return;
    try {
        loadCss(`${CDN}/KaTeX/0.16.9/katex.min.css`);
        await loadScript(`${CDN}/KaTeX/0.16.9/katex.min.js`);
        await loadScript(`${CDN}/KaTeX/0.16.9/contrib/auto-render.min.js`);
        (window as any).renderMathInElement?.(el, {
            delimiters: [
                { left: '$$', right: '$$', display: true },
                { left: '$', right: '$', display: false },
                { left: '\\(', right: '\\)', display: false },
                { left: '\\[', right: '\\]', display: true },
            ],
            throwOnError: false,
        });
    } catch { /* degrade */ }
}

async function mermaid(el: HTMLElement): Promise<void> {
    const blocks = el.querySelectorAll('pre code.language-mermaid, code.language-mermaid');
    if (!blocks.length) return;
    try {
        await loadScript(`${CDN}/mermaid/10.9.1/mermaid.min.js`);
        const m = (window as any).mermaid;
        if (!m) return;
        m.initialize({ startOnLoad: false, theme: 'dark', securityLevel: 'strict' });
        let i = 0;
        for (const code of Array.from(blocks)) {
            const pre = code.closest('pre') || code;
            const src = code.textContent || '';
            try {
                const { svg } = await m.render(`scribe-mmd-${Date.now()}-${i++}`, src);
                const wrap = document.createElement('div');
                wrap.className = 'scribe-mermaid'; wrap.innerHTML = svg;
                pre.replaceWith(wrap);
            } catch { /* leave the code block as-is */ }
        }
    } catch { /* degrade */ }
}

export function enhancePreview(el: HTMLElement | null): void {
    if (!el) return;
    void highlight(el);
    void math(el);
    void mermaid(el);
}
