/**
 * Markdown renderer for the Foundry Review panel.
 *
 * Smaller-scoped than CodexPreview's MarkdownReader — Foundry content
 * has no wikilinks, no citations, no custom-protocol hrefs. Just plain
 * markdown rendering with safe-by-default link sanitization, but with
 * external `http(s):` links opening in the system browser (rather than
 * stealing the Electron renderer).
 *
 * The styles mirror Holocron's reading typography — same `lineHeight: 1.6`
 * and `maxWidth: 760` as CodexPreview so the Review panel reads like a
 * preview tab.
 */
import ReactMarkdown from 'react-markdown'

interface MarkdownViewProps {
  content: string
}

export function MarkdownView({ content }: MarkdownViewProps): JSX.Element {
  return (
    <div
      style={{
        fontSize: 14,
        lineHeight: 1.6,
        color: 'var(--text-primary)',
        maxWidth: 760,
      }}
      className="codex-preview-md"
    >
      <ReactMarkdown
        // Identity transform so any custom-protocol hrefs (none expected
        // in Foundry content, but defensive) pass through; safe because
        // we render text content, not user-provided HTML.
        transformLinkUri={(uri) => uri}
        components={{
          // External links → system browser. Without this, clicks fire
          // Electron's will-navigate (which is blocked) and the link
          // silently does nothing. Matches the gotcha-line-61 pattern.
          a: ({ href, children }) => {
            if (!href) return <span>{children}</span>
            if (/^(https?:|mailto:)/i.test(href)) {
              return (
                <a
                  href={href}
                  onClick={(e) => {
                    e.preventDefault()
                    window.open(href, '_blank', 'noopener,noreferrer')
                  }}
                  style={{ color: 'var(--accent-cyan)', textDecoration: 'underline' }}
                >
                  {children}
                </a>
              )
            }
            // In-page anchors + everything else: render inert. The
            // Foundry preview has no in-page nav to scroll to and no
            // file system the user can land on usefully.
            return <span>{children}</span>
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  )
}
