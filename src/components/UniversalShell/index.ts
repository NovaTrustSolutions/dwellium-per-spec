/**
 * UniversalShell public barrel.
 * Canary: [CT-3E-ARCH-W8K3]
 */

export { default as UniversalShell } from './UniversalShell';
export { AdapterBoundary } from './AdapterBoundary';
export {
    ADAPTER_REGISTRY,
    adaptersForSurface,
    getAdapter,
} from './adapterRegistry';
export {
    SHELL_COLUMN_LABELS,
    SHELL_COLUMN_ORDER,
    type AdapterColumnError,
    type AdapterColumnSpec,
    type AdapterContext,
    type AdapterSurface,
    type ContainerAdapter,
    type ShellColumnId,
} from './types';
