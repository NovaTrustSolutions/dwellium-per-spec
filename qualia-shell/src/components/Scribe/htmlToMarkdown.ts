/**
 * Minimal HTML → Markdown converter for drop/paste payloads.
 *
 * No external deps (turndown ~30 KB) — handles the common subset we see in
 * dropped browser snippets: headings, paragraphs, lists, links, code, bold,
 * italic, strikethrough, blockquote, hr, br. Anything else falls through
 * as plain text from textContent.
 *
 * Uses DOMParser (browser-native) instead of jsdom (which is a server dep
 * we want to keep server-side). Acceptable for the drop-paste use case
 * since this only runs on user gesture in a browser context.
 */

function escapeMarkdownChars(s: string): string {
    // Preserve text content; escape only chars that would create markdown structure
    return s.replace(/([\\`*_{}\[\]()#+\-.!|])/g, '\\$1');
}

function inlineFromNode(node: ChildNode): string {
    if (node.nodeType === Node.TEXT_NODE) {
        return (node.textContent ?? '').replace(/\s+/g, ' ');
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return '';

    const el = node as HTMLElement;
    const tag = el.tagName.toLowerCase();
    const inner = Array.from(el.childNodes).map(inlineFromNode).join('');

    switch (tag) {
        case 'br': return '  \n';
        case 'strong':
        case 'b': return inner.trim() ? `**${inner.trim()}**` : '';
        case 'em':
        case 'i': return inner.trim() ? `*${inner.trim()}*` : '';
        case 'del':
        case 's':
        case 'strike': return inner.trim() ? `~~${inner.trim()}~~` : '';
        case 'code': return inner ? `\`${inner}\`` : '';
        case 'a': {
            const href = el.getAttribute('href');
            const text = inner.trim() || href || '';
            return href ? `[${text}](${href})` : text;
        }
        case 'img': {
            const src = el.getAttribute('src') ?? '';
            const alt = el.getAttribute('alt') ?? '';
            return src ? `![${alt}](${src})` : '';
        }
        case 'span':
        case 'sub':
        case 'sup':
        default:
            return inner;
    }
}

function blockFromNode(node: ChildNode, depth = 0): string {
    if (node.nodeType === Node.TEXT_NODE) {
        const t = (node.textContent ?? '').trim();
        return t ? t + '\n\n' : '';
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return '';

    const el = node as HTMLElement;
    const tag = el.tagName.toLowerCase();

    switch (tag) {
        case 'h1': return `# ${inlineFromNode(el).trim()}\n\n`;
        case 'h2': return `## ${inlineFromNode(el).trim()}\n\n`;
        case 'h3': return `### ${inlineFromNode(el).trim()}\n\n`;
        case 'h4': return `#### ${inlineFromNode(el).trim()}\n\n`;
        case 'h5': return `##### ${inlineFromNode(el).trim()}\n\n`;
        case 'h6': return `###### ${inlineFromNode(el).trim()}\n\n`;
        case 'p': return `${inlineFromNode(el).trim()}\n\n`;
        case 'blockquote': {
            const inner = Array.from(el.childNodes).map((c) => blockFromNode(c, depth)).join('').trim();
            return inner.split('\n').map((l) => l ? `> ${l}` : '>').join('\n') + '\n\n';
        }
        case 'pre': {
            const code = el.querySelector('code');
            const text = code ? (code.textContent ?? '') : (el.textContent ?? '');
            return '```\n' + text.replace(/\n$/, '') + '\n```\n\n';
        }
        case 'ul': {
            const items = Array.from(el.children).filter((c) => c.tagName.toLowerCase() === 'li');
            return items.map((li) => `${'  '.repeat(depth)}- ${inlineFromNode(li).trim()}`).join('\n') + '\n\n';
        }
        case 'ol': {
            const items = Array.from(el.children).filter((c) => c.tagName.toLowerCase() === 'li');
            return items.map((li, i) => `${'  '.repeat(depth)}${i + 1}. ${inlineFromNode(li).trim()}`).join('\n') + '\n\n';
        }
        case 'hr': return '---\n\n';
        case 'br': return '\n';
        case 'table': {
            // Best-effort table conversion: header row + separator + body rows
            const rows = Array.from(el.querySelectorAll('tr'));
            if (rows.length === 0) return '';
            const cellsOf = (tr: Element) => Array.from(tr.querySelectorAll('th,td')).map((c) => inlineFromNode(c as HTMLElement).trim().replace(/\|/g, '\\|'));
            const headerCells = cellsOf(rows[0]);
            const out = [`| ${headerCells.join(' | ')} |`, `|${headerCells.map(() => '---').join('|')}|`];
            for (let i = 1; i < rows.length; i++) out.push(`| ${cellsOf(rows[i]).join(' | ')} |`);
            return out.join('\n') + '\n\n';
        }
        case 'div':
        case 'section':
        case 'article':
        case 'main':
        case 'header':
        case 'footer':
        case 'aside':
            // Recurse into block containers
            return Array.from(el.childNodes).map((c) => blockFromNode(c, depth)).join('');
        default:
            // Inline-ish element appearing at block level — wrap in paragraph
            const t = inlineFromNode(el).trim();
            return t ? t + '\n\n' : '';
    }
}

export function htmlToMarkdown(html: string): string {
    try {
        const doc = new DOMParser().parseFromString(`<div id="__root">${html}</div>`, 'text/html');
        const root = doc.getElementById('__root');
        if (!root) return '';
        const md = Array.from(root.childNodes).map((n) => blockFromNode(n)).join('').trim();
        // Collapse 3+ blank lines into 2 for readability
        return md.replace(/\n{3,}/g, '\n\n');
    } catch {
        // Fallback: strip tags + return plain text
        const tmp = document.createElement('div');
        tmp.innerHTML = html;
        return (tmp.textContent ?? '').trim();
    }
}
