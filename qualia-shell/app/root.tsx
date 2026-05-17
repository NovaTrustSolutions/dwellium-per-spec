import { Links, Meta, Outlet, Scripts, ScrollRestoration } from 'react-router';

/**
 * Phase-8+ Task 8.6 — React Router v7 framework-mode canonical root layout
 *
 * Ports `qualia-shell/index.html` HTML shell template (5 SSR-ready meta tags
 * + FOUC IIFE theme application + Google Fonts preconnect/preload) into
 * RR v7 framework-mode `app/root.tsx` altitude per Cowork Verdict 2 LOCK.
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
 *   - Google Fonts preconnect + preload: 16 font families (Inter/Roboto/JetBrains
 *     Mono/etc.) preserved unchanged
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
export default function Root() {
    return (
        <html lang="en">
            <head>
                <meta charSet="UTF-8" />
                <link rel="icon" type="image/svg+xml" href="/vite.svg" />
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
                <meta property="og:image" content="/og-image.png" />
                <script
                    dangerouslySetInnerHTML={{
                        __html: `(function () {
  try {
    var theme = localStorage.getItem('dwellium-theme')
      || localStorage.getItem('qualia-theme')
      || 'dark';
    document.documentElement.className = 'theme-' + theme;
  } catch (e) {
    document.documentElement.className = 'theme-dark';
  }
})();`,
                    }}
                />
                <link rel="preconnect" href="https://fonts.googleapis.com" />
                <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
                <link
                    href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=Roboto:wght@300;400;500;700&family=JetBrains+Mono:wght@400;500;600;700&family=Playfair+Display:wght@400;700;900&family=Montserrat:wght@300;400;500;600;700&family=Cormorant+Garamond:wght@300;400;600;700&family=Poppins:wght@400;500;600;700;800&family=Open+Sans:wght@300;400;600;700&family=Nunito:wght@400;600;700;800&family=Lato:wght@300;400;700;900&family=Space+Grotesk:wght@400;500;600;700&family=IBM+Plex+Sans:wght@400;500;600;700&family=Work+Sans:wght@400;500;600;700&family=Merriweather:wght@300;400;700;900&family=Source+Sans+3:wght@300;400;600;700&family=Lora:wght@400;500;600;700&family=Raleway:wght@300;400;500;600;700&display=swap"
                    rel="stylesheet"
                />
                <Meta />
                <Links />
            </head>
            <body>
                <Outlet />
                <ScrollRestoration />
                <Scripts />
            </body>
        </html>
    );
}
