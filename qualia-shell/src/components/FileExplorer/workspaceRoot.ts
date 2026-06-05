/**
 * workspaceRoot — resolves the path shown in the File Explorer header (spec §2.4:
 * "Workspace root path visible").
 *
 * In the web build the root is the per-user convention `~/.dwellium/files/<userId>`
 * (the same path the File Explorer empty-state already references). The Electron
 * build can inject the real absolute root (the user's chosen folder) at startup
 * via `window.__dwelliumWorkspaceRoot`; when present that takes precedence.
 */

export function getWorkspaceRoot(userId?: string | null): string {
    if (typeof window !== 'undefined') {
        const injected = (window as unknown as { __dwelliumWorkspaceRoot?: string }).__dwelliumWorkspaceRoot;
        if (injected && typeof injected === 'string' && injected.trim()) return injected;
    }
    return `~/.dwellium/files/${userId || 'default'}`;
}
