import { beforeEach, describe, expect, it } from 'vitest';
import { integrationsUserIdHolder } from '../utils/integrationsStore';
import { newWorkspaceId, saveWorkspaces, workspacesStore } from '../lib/workspacesStore';

beforeEach(() => {
    localStorage.clear();
    integrationsUserIdHolder.current = null;
    workspacesStore.reset();
});

describe('workspacesStore account persistence', () => {
    it('keeps workspace composition isolated by authenticated account id', () => {
        integrationsUserIdHolder.current = 'google-account-a';
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

        integrationsUserIdHolder.current = 'google-account-b';
        expect(workspacesStore.getSnapshot()).toEqual([]);

        integrationsUserIdHolder.current = 'google-account-a';
        expect(workspacesStore.getSnapshot()[0]).toMatchObject({
            name: 'Account A workspace',
            notes: 'private to A',
        });
        expect(localStorage.getItem('workspaces:google-account-a')).toContain('private to A');
        expect(localStorage.getItem('workspaces:google-account-b')).toBeNull();
    });
});
