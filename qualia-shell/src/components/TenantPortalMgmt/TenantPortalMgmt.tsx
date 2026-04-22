/**
 * TenantPortalMgmt — Standalone widget wrapper for Shell
 * Wraps TenantPortalModule for use outside of Strata dashboard
 */

import TenantPortalModule from '../StrataDashboard/modules/TenantPortalModule';

export default function TenantPortalMgmt() {
    return (
        <div className="widget-app" style={{
            height: '100%', overflow: 'auto', padding: 16,
            fontFamily: 'Inter, -apple-system, sans-serif',
            background: 'transparent',
        }}>
            <TenantPortalModule />
        </div>
    );
}
