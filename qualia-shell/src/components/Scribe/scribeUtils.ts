/**
 * Utilities shared across Scribe keymap + context menu that need
 * access to integrations outside React component context.
 */
import { integrationsStore, integrationsUserIdHolder } from '../../utils/integrationsStore';
import type { IntegrationsBundle } from '../../types/integrations';

export function getIntegrationsSnapshot(): IntegrationsBundle['llm'] | null {
    try {
        const bundle = integrationsStore.getSnapshot();
        return bundle.llm;
    } catch {
        return null;
    }
}
