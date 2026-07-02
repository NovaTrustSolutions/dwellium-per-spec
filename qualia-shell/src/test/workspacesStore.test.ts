import { beforeEach, describe, expect, it } from 'vitest';
import { workspacesUserIdHolder } from '../lib/perUserIdentity';
import { newWorkspaceId, saveWorkspaces, workspacesStore } from '../lib/workspacesStore';

beforeEach(() => {
    localStorage.clear();
    workspacesUserIdHolder.current = null;
    workspacesStore.reset();
});

describe('workspacesStore account persistence', () => {
    it('keeps workspace composition isolated by authenticated account id', () => {
        workspacesUserIdHolder.current = 'google-account-a';
        saveWorkspaces([{
            id: newWorkspaceId(),
            name: 'Account A workspace',
            appIds: ['scribe'],
            split: 1,
            layout: 'grid',
            frames: {},
            notes: 'private to A',
            updatedAt: 1,
        }]);

        workspacesUserIdHolder.current = 'google-account-b';
        expect(workspacesStore.getSnapshot()).toEqual([]);

        workspacesUserIdHolder.current = 'google-account-a';
        expect(workspacesStore.getSnapshot()[0]).toMatchObject({
            name: 'Account A workspace',
            notes: 'private to A',
        });
        expect(localStorage.getItem('workspaces:google-account-a')).toContain('private to A');
        expect(localStorage.getItem('workspaces:google-account-b')).toBeNull();
    });

    it('preserves four-up workspace splits for Zen-style multi-pane spaces', () => {
        workspacesUserIdHolder.current = 'google-account-a';
        saveWorkspaces([{
            id: newWorkspaceId(),
            name: 'Four panel workspace',
            appIds: ['scribe', 'ara-console', 'control-panel', 'notepad'],
            split: 4,
            layout: 'grid',
            frames: {},
            notes: '',
            updatedAt: 1,
        }]);

        expect(workspacesStore.getSnapshot()[0].split).toBe(4);
    });
});
