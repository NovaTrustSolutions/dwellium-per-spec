import { Links, Meta, Outlet, Scripts, ScrollRestoration } from 'react-router';
// Global cursor-spotlight bento-card treatment (spec §3.3). The CSS provides the
// opt-in `.spotlight-card` class; the side-effect import attaches one delegated
// pointer listener (SSR-guarded) that drives the --mx/--my custom properties.
import '../src/styles/spotlight.css';
import '../src/utils/spotlight';

/**
 * Phase-8+ Task 8.6 — React Router v7 framework-mode canonical root layout
 *
 * Ports `qualia-shell/index.html` HTML shell template (5 SSR-ready meta tags
 * + FOUC IIFE theme application + Google Fonts preconnect/preload) into
 * RR v7 framework-mode `app/root.tsx` altitude per Cowork Verdict 2 LOCK
 * (Task 8.6 close).
 *
 * Phase-8+ Task 8.7 — REFACTORED to canonical RR v7 framework-mode
 * Layout/Root/HydrateFallback 3-export pattern per Cowork Verdict 15 LOCK
 * (Finding V cementation; FOUC IIFE HTML-shipping at build-time altitude).
 * Empirical signature at HEAD-post-8.6: `grep -c "dwellium-theme" build/client/index.html` = 0
 * (FOUC IIFE not HTML-shipped because RR v7 default HydrateFallback placeholder
 * rendered instead of our Root()). REVISED pattern: `Layout` wraps the document
 * shell (5 meta tags + FOUC IIFE + Google Fonts in `<head>`); `Root` renders
 * `<Outlet />` for matched routes; `HydrateFallback` renders the build-time
 * SPA Mode shell body (per Finding W cementation: entry.server.tsx IS invoked
 * at build time even at ssr: false). Layout wraps both Root AND HydrateFallback
 * per RR v7 framework-mode canonical convention.
 *
 * Empirical equivalence to index.html shell at HEAD-post-8.4 (6742484):
 *
 *   - 5 meta tags: viewport / theme-color / description / og:title / og:description
 *     / og:type / og:image — all preserved byte-for-byte per `Docs/Phase8_Task_8_4_Completion_Report.md §3`
 *   - FOUC IIFE script: dwellium-theme → qualia-theme → 'dark' fallback chain
 *     applies `theme-<value>` className to documentElement BEFORE React hydration
 *     (Phase-8+ Task 8.4 Finding β empirical correction — className pattern
 *     NOT data-attribute pattern; sister-shape to `qualia-shell/src/context/ThemeContext.tsx`
 *     L70-L75 useEffect application altitude)
 *   - Google Fonts preconnect + stylesheet: trimmed to Hanken Grotesk + Inter +
 *     JetBrains Mono at plan 043 (2026-08-16); other pairings load on demand
 *   - `<Meta />` + `<Links />` enable per-route meta/link injection (RR v7
 *     framework-mode `meta` + `links` route module exports)
 *   - `<Outlet />` is where matched route component renders
 *   - `<ScrollRestoration />` enables RR v7 framework-mode scroll restoration
 *     across route transitions (replaces ad-hoc scroll handling)
 *   - `<Scripts />` injects RR v7 framework-mode runtime scripts (replaces
 *     ad-hoc `<script type="module" src="/src/main.tsx">` at index.html L37)
 *
 * Task 8.4 audit doc (`Docs/Phase8_Task_8_3_Provider_Tree_SSR_Audit.md`)
 * Finding J empirical-vs-hypothetical-distinction discipline applied here:
 * meta tags are SSR-ready BUT framework-mode SSR is `ssr: false` initial
 * state per `react-router.config.ts` — full SSR enablement requires
 * provider-tree SSR-safety remediation at Task 8.9 (findings G/H/I).
 */
export function Layout({ children }: { children: React.ReactNode }) {
    return (
        // suppressHydrationWarning: the FOUC IIFE below sets <html class="theme-X">
        // from localStorage BEFORE hydration, so this element's className legitimately
        // differs from the server render. This is the canonical React opt-out for it.
        <html lang="en" suppressHydrationWarning>
            <head>
                <meta charSet="UTF-8" />
                <link rel="icon" type="image/png" href="/favicon.png" />
                <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
                <meta name="theme-color" content="#6366f1" />
                <link rel="manifest" href="/manifest.json" />
                <title>AstraStrata — Property Management</title>
                <meta
                    name="description"
                    content="AstraStrata — Property management platform combining AppFolio parity with AI-driven workflow automation."
                />
                <meta property="og:title" content="AstraStrata — Property Management" />
                <meta
                    property="og:description"
                    content="AstraStrata — Property management platform combining AppFolio parity with AI-driven workflow automation."
                />
                <meta property="og:type" content="website" />
                {/* Crawlers (FB/X/LinkedIn/Slack) need an ABSOLUTE og:image; the SPA can't compute
                    its origin at crawl time. Update if the site moves to a custom domain. */}
                <meta property="og:image" content="https://argyleholocron.netlify.app/og-image.png" />
                <meta property="og:image:width" content="1200" />
                <meta property="og:image:height" content="630" />
                {/* LCP element on the login splash — fetch it before the JS bundle. */}
                <link rel="preload" as="image" href="/assets/hero-bg.webp" fetchPriority="high" />
                <script
                    dangerouslySetInnerHTML={{
                        __html: `(function () {
  try {
    var LEGACY = { dark:1, light:1, trust:1, vibrant:1, luxury:1, healthcare:1, creative:1, 'dark-excellence':1, 'terminal-bl4':1, halocron:1 };
    var theme = localStorage.getItem('dwellium-theme')
      || localStorage.getItem('qualia-theme')
      || 'cosmos';
    if (LEGACY[theme]) theme = 'cosmos';
    document.documentElement.className = 'theme-' + theme;
    document.documentElement.setAttribute('data-theme', theme);
  } catch (e) {
    document.documentElement.className = 'theme-cosmos';
    document.documentElement.setAttribute('data-theme', 'cosmos');
  }
})();`,
                    }}
                />
                <link rel="preconnect" href="https://fonts.googleapis.com" />
                <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
                {/* Boot fonts only: Hanken Grotesk (--font-primary default) + Inter (default pairing)
                    + JetBrains Mono. Non-default font pairings load their own families on demand
                    via ThemeContext (was a 17-family / 183 KB render-blocking request). */}
                <link
                    href="https://fonts.googleapis.com/css2?family=Hanken+Grotesk:wght@300;400;500;600;700;800;900&family=Inter:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500;600;700&display=swap"
                    rel="stylesheet"
                />
                <Meta />
                <Links />
            </head>
            <body>
                {children}
                <ScrollRestoration />
                <Scripts />
            </body>
        </html>
    );
}

/**
 * Root — renders matched route content via `<Outlet />`.
 * Wrapped by `Layout` per RR v7 framework-mode canonical 3-export pattern.
 */
export default function Root() {
    return <Outlet />;
}

/**
 * HydrateFallback — Phase-8+ Task 8.7 Finding V remediation per Cowork Verdict 15 LOCK.
 *
 * Rendered at build time in SPA Mode (`ssr: false`) per Finding W empirical signature:
 * RR v7 default `entry.server.node.tsx` is structurally invoked at build time with
 * `routerContext.isSpaMode: true` branch → `onAllReady` callback → static
 * `build/client/index.html` shell emission. Without this named export, RR v7 falls
 * back to its default placeholder (with "💿 Hey developer 👋" dev-console message)
 * and our `Layout` head content (FOUC IIFE + 5 meta tags + Google Fonts) is NOT
 * HTML-shipped — Task 8.4's HTML-altitude FOUC mitigation regresses at framework-mode
 * altitude.
 *
 * By exporting HydrateFallback, RR v7 framework-mode wraps it in our `Layout`
 * component at build time and ships the resulting document shell at HTML-altitude.
 * The empirical verification at Step-4-bis HALT-IF #2 (per Verdict 15 LOCK):
 * `grep -c "dwellium-theme" build/client/index.html` MUST return non-zero
 * post-Task-8.7-edit (sister-shape to empirical pre-edit signature = 0 that revealed
 * Finding V).
 *
 * Content shape: minimal splash placeholder (no DOM-spec'd script execution; React
 * runtime hydration takes over once entry.client.tsx mounts). The `<script>` element
 * with FOUC IIFE in `Layout` head is rendered to HTML by React's
 * dangerouslySetInnerHTML at build time + executes inline at first parse on the
 * client (per HTML spec inline script execution rules).
 */
export function HydrateFallback() {
    return (
        <div
            style={{
                position: 'fixed',
                inset: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: '#0a0e1a',
                color: '#64748b',
                fontFamily: 'Inter, -apple-system, sans-serif',
                fontSize: 14,
            }}
        >
            <div style={{ textAlign: 'center' }}>
                <div
                    style={{
                        width: 24,
                        height: 24,
                        margin: '0 auto 12px',
                        border: '2px solid rgba(99,102,241,0.3)',
                        borderTopColor: '#6366f1',
                        borderRadius: '50%',
                        animation: 'spin 0.6s linear infinite',
                    }}
                />
                Loading…
            </div>
        </div>
    );
}
