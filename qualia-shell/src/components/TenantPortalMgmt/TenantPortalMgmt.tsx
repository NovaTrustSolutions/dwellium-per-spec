/**
 * TenantPortalMgmt — Standalone widget wrapper for Shell
 * Wraps TenantPortalModule for use outside of Strata dashboard
 *
 * 2026-05-26 patch: added `strata-dashboard` to className so that
 * s-resident-link / s-property-link button-reset styles (scoped under
 * `.strata-dashboard .s-resident-link`/`.s-property-link` at
 * StrataDashboard.css:2148+2165) apply when TenantPortalModule renders
 * outside the Strata dashboard. Without this className, browser-default
 * `<button>` styling leaks through, producing white/gray boxes behind
 * tenant names, emails, and property-name links. Also removed inline
 * `fontFamily: 'Inter, ...'` (stale; PR #92 fey.com sweep flipped global
 * typography to Hanken Grotesk — let it inherit).
 */

import TenantPortalModule from '../StrataDashboard/modules/TenantPortalModule';

export default function TenantPortalMgmt() {
    return (
        <div className="widget-app strata-dashboard" style={{
            height: '100%', overflow: 'auto', padding: 16,
            background: 'transparent',
        }}>
            <TenantPortalModule />
        </div>
    );
}
