/**
 * P12-7 — Connections & Memory pane + Agent Context (gap items 8+9).
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
    agentContextStore,
    agentContextUserIdHolder,
    saveAgentContext,
    resetAgentContext,
    buildAgentContextBlock,
} from '../lib/agentContextStore';
import { buildMemoryRows } from '../components/Connections/ConnectionsPanel';
import { WIDGET_REGISTRY } from '../registry/widgetRegistry';
import { recordArtifact, artifactStore } from '../lib/artifactStore';

beforeEach(() => {
    agentContextUserIdHolder.current = 'test-user';
    try { localStorage.clear(); } catch { /* */ }
    agentContextStore.reset();
    artifactStore.reset();
});

describe('agent context (the "amend your agent memory in the UI" gap)', () => {
    it('save → snapshot → bracketed block for ARA', () => {
        saveAgentContext('I manage 12 properties. Keep replies short.');
        expect(agentContextStore.getSnapshot().text).toContain('12 properties');
        const block = buildAgentContextBlock();
        expect(block).toContain('[Standing user context — apply silently');
        expect(block).toContain('Keep replies short.');
    });

    it('empty context → empty block (no message pollution)', () => {
        expect(buildAgentContextBlock()).toBe('');
        saveAgentContext('   ');
        expect(buildAgentContextBlock()).toBe('');
    });

    it('reset clears it', () => {
        saveAgentContext('something');
        resetAgentContext();
        expect(buildAgentContextBlock()).toBe('');
    });

    it('caps oversized context', () => {
        saveAgentContext('x'.repeat(9000));
        expect(agentContextStore.getSnapshot().text.length).toBeLessThanOrEqual(4000);
    });
});

describe('memory stack rows', () => {
    it('reports live counts from the stores', () => {
        recordArtifact({ content: '# Quarterly report\nA sufficiently long body for the artifact gate to accept it as substantial.', source: 'ara' });
        const rows = buildMemoryRows();
        const artifacts = rows.find(r => r.name === 'Artifacts');
        expect(artifacts?.count).toBe(1);
        expect(rows.length).toBeGreaterThanOrEqual(8);
        // Every row points at a real registered widget.
        for (const r of rows) expect(WIDGET_REGISTRY[r.widget], r.widget).toBeTruthy();
    });
});

describe('registry', () => {
    it("'connections' widget registered with the cable icon", () => {
        expect(WIDGET_REGISTRY['connections']).toBeTruthy();
        expect(WIDGET_REGISTRY['connections'].icon).toBe('cable');
    });
});
