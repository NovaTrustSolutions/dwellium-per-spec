/**
 * workspaceRoot resolver (spec §2.4) — the path shown in the File Explorer header.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { getWorkspaceRoot } from '../components/FileExplorer/workspaceRoot';

afterEach(() => {
    delete (window as unknown as { __dwelliumWorkspaceRoot?: string }).__dwelliumWorkspaceRoot;
});

describe('getWorkspaceRoot', () => {
    it('uses the per-user convention path when given a userId', () => {
        expect(getWorkspaceRoot('andy')).toBe('~/.dwellium/files/andy');
    });

    it('falls back to "default" when no userId', () => {
        expect(getWorkspaceRoot(null)).toBe('~/.dwellium/files/default');
        expect(getWorkspaceRoot()).toBe('~/.dwellium/files/default');
    });

    it('prefers an Electron-injected absolute root when present', () => {
        (window as unknown as { __dwelliumWorkspaceRoot?: string }).__dwelliumWorkspaceRoot = '/Users/ilya/Dwellium';
        expect(getWorkspaceRoot('andy')).toBe('/Users/ilya/Dwellium');
    });

    it('ignores a blank injected root', () => {
        (window as unknown as { __dwelliumWorkspaceRoot?: string }).__dwelliumWorkspaceRoot = '   ';
        expect(getWorkspaceRoot('andy')).toBe('~/.dwellium/files/andy');
    });
});
