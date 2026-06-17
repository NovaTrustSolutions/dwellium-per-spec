/**
 * HermesAgentsWidget — the "Hermes" launcher.
 *
 * Opens the shared Honcho + Hermes panel straight to the Agents persona-card view
 * (initialTab='agents'). Registered as its own widget ('hermes') so it surfaces in
 * BOTH the sidebar dock and the Holocron OS launcher, landing the user directly on
 * the agent cards instead of the Memory tab.
 */
import HonchoHermesPanel from './HonchoHermesPanel';

export default function HermesAgentsWidget() {
    return <HonchoHermesPanel initialTab="agents" />;
}
