/**
 * ActivationCenter — Control Panel section that surfaces every
 * activate-any-time capability (assessment sweep 2026-06-12). Each card lets
 * the user enter the key/URL the capability needs and flip it on; a status
 * chip says exactly where it stands (off / configured / ready / blocked on a
 * backend half). Nothing here changes app behavior until the user turns a
 * capability on AND its backend/bridge exists — see activationStore.
 *
 * Drop into the Control Panel alongside LlmIntegrationsSection.
 */
import { useActivation } from '../../hooks/useActivation';
import { capabilityStatuses } from '../../lib/activationStore';
import { secretsPostureLabel } from '../../lib/secretsAdapter';
import './ActivationCenter.css';

const CHIP_LABEL: Record<string, string> = {
    off: 'Off',
    configured: 'Configured',
    ready: 'Ready',
    blocked: 'Backend pending',
};

export default function ActivationCenter() {
    const { config, update } = useActivation();
    const statuses = capabilityStatuses(config);
    const statusFor = (key: string) => statuses.find((s) => s.key === key)!;

    return (
        <div className="activation-center">
            <div className="activation-center__intro">
                <h3>Activation Center</h3>
                <p>
                    Everything below is built and ready to switch on. Add the key or URL a
                    capability needs, flip it on, and it activates the moment its backend
                    half is present. Secrets: {secretsPostureLabel()}.
                </p>
            </div>

            {/* Live AppFolio sync (upgrade #1) */}
            <section className="ac-card">
                <header>
                    <span className="ac-card__title">Live AppFolio sync</span>
                    <Chip status={statusFor('appfolioSync').state} />
                </header>
                <p className="ac-card__detail">{statusFor('appfolioSync').detail}</p>
                <input
                    type="text" placeholder="Base URL (https://yourco.appfolio.com/api/v2)"
                    value={config.appfolioSync.baseUrl}
                    onChange={(e) => update((c) => ({ ...c, appfolioSync: { ...c.appfolioSync, baseUrl: e.target.value } }))}
                />
                <input
                    type="text" placeholder="Client ID"
                    value={config.appfolioSync.clientId}
                    onChange={(e) => update((c) => ({ ...c, appfolioSync: { ...c.appfolioSync, clientId: e.target.value } }))}
                />
                <input
                    type="password" placeholder="Client secret"
                    value={config.appfolioSync.clientSecret}
                    onChange={(e) => update((c) => ({ ...c, appfolioSync: { ...c.appfolioSync, clientSecret: e.target.value } }))}
                />
                <Toggle
                    label="Enable live sync"
                    checked={config.appfolioSync.enabled}
                    onChange={(v) => update((c) => ({ ...c, appfolioSync: { ...c.appfolioSync, enabled: v } }))}
                />
            </section>

            {/* Security: auth-on + server-side LLM (weakness #1) */}
            <section className="ac-card">
                <header>
                    <span className="ac-card__title">Security mode</span>
                    <Chip status={statusFor('authMode').state} />
                </header>
                <p className="ac-card__detail">{statusFor('authMode').detail}</p>
                <Toggle
                    label="Require login (AUTH_ENABLED)"
                    checked={config.authMode.enabled}
                    onChange={(v) => update((c) => ({ ...c, authMode: { ...c.authMode, enabled: v } }))}
                />
                <Toggle
                    label="Proxy LLM calls through the backend (keys never touch the browser)"
                    checked={config.authMode.proxyLlmThroughBackend}
                    onChange={(v) => update((c) => ({ ...c, authMode: { ...c.authMode, proxyLlmThroughBackend: v } }))}
                />
            </section>

            {/* Cloud replication (upgrade #3) */}
            <section className="ac-card">
                <header>
                    <span className="ac-card__title">Cloud replication of One Save</span>
                    <Chip status={statusFor('cloudReplication').state} />
                </header>
                <p className="ac-card__detail">{statusFor('cloudReplication').detail}</p>
                <input
                    type="text" placeholder="Supabase URL"
                    value={config.cloudReplication.supabaseUrl}
                    onChange={(e) => update((c) => ({ ...c, cloudReplication: { ...c.cloudReplication, supabaseUrl: e.target.value } }))}
                />
                <input
                    type="password" placeholder="Supabase anon key"
                    value={config.cloudReplication.supabaseAnonKey}
                    onChange={(e) => update((c) => ({ ...c, cloudReplication: { ...c.cloudReplication, supabaseAnonKey: e.target.value } }))}
                />
                <Toggle
                    label="Enable replication"
                    checked={config.cloudReplication.enabled}
                    onChange={(v) => update((c) => ({ ...c, cloudReplication: { ...c.cloudReplication, enabled: v } }))}
                />
            </section>

            {/* Auto-updater (upgrade #5) */}
            <section className="ac-card">
                <header>
                    <span className="ac-card__title">Auto-updater</span>
                    <Chip status={statusFor('autoUpdater').state} />
                </header>
                <p className="ac-card__detail">{statusFor('autoUpdater').detail}</p>
                <input
                    type="text" placeholder="Release feed URL (GitHub Releases)"
                    value={config.autoUpdater.feedUrl}
                    onChange={(e) => update((c) => ({ ...c, autoUpdater: { ...c.autoUpdater, feedUrl: e.target.value } }))}
                />
                <Toggle
                    label="Enable auto-update"
                    checked={config.autoUpdater.enabled}
                    onChange={(v) => update((c) => ({ ...c, autoUpdater: { ...c.autoUpdater, enabled: v } }))}
                />
            </section>

            {/* Notifications (upgrade #8) */}
            <section className="ac-card">
                <header>
                    <span className="ac-card__title">Desktop notifications</span>
                    <Chip status={statusFor('notifications').state} />
                </header>
                <p className="ac-card__detail">{statusFor('notifications').detail}</p>
                <Toggle
                    label="Enable notifications"
                    checked={config.notifications.enabled}
                    onChange={(v) => update((c) => ({ ...c, notifications: { ...c.notifications, enabled: v } }))}
                />
                <Toggle
                    label="Morning brief as a notification"
                    checked={config.notifications.morningBrief}
                    onChange={(v) => update((c) => ({ ...c, notifications: { ...c.notifications, morningBrief: v } }))}
                />
            </section>

            {/* PWA phone companion (upgrade #4) */}
            <section className="ac-card">
                <header>
                    <span className="ac-card__title">Phone companion (PWA)</span>
                    <Chip status={statusFor('pwa').state} />
                </header>
                <p className="ac-card__detail">{statusFor('pwa').detail}</p>
                <Toggle
                    label="Serve the install-to-phone manifest"
                    checked={config.pwa.enabled}
                    onChange={(v) => update((c) => ({ ...c, pwa: { ...c.pwa, enabled: v } }))}
                />
            </section>
        </div>
    );
}

function Chip({ status }: { status: string }) {
    return <span className={`ac-chip ac-chip--${status}`}>{CHIP_LABEL[status] ?? status}</span>;
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
    return (
        <label className="ac-toggle">
            <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
            <span>{label}</span>
        </label>
    );
}
