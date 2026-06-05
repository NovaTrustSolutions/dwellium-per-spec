/**
 * Builder agents prompt composition (spec §8.6/8.7/8.8).
 */
import { describe, it, expect } from 'vitest';
import { composePrompt, canRun, AGENTS } from '../components/BuilderAgents/agentDefs';

describe('composePrompt', () => {
    it('schema embeds format + description', () => {
        const c = composePrompt('schema', { description: 'a work order', format: 'TypeScript interface' });
        expect(c.prompt).toContain('Output format: TypeScript interface');
        expect(c.prompt).toContain('a work order');
        expect(c.systemPrompt).toBe(AGENTS.schema.systemPrompt);
    });

    it('prd embeds the source documents', () => {
        const c = composePrompt('prd', { sources: 'note A\n\nnote B' });
        expect(c.prompt).toContain('note A');
        expect(c.prompt).toContain('note B');
    });

    it('gap embeds spec + implementation under markers', () => {
        const c = composePrompt('gap', { spec: 'must do X', implementation: 'does Y' });
        expect(c.prompt).toContain('=== SPECIFICATION ===');
        expect(c.prompt).toContain('must do X');
        expect(c.prompt).toContain('=== IMPLEMENTATION ===');
        expect(c.prompt).toContain('does Y');
    });
});

describe('canRun', () => {
    it('schema needs a description', () => {
        expect(canRun('schema', {})).toBe(false);
        expect(canRun('schema', { description: 'x' })).toBe(true);
    });
    it('prd needs sources', () => {
        expect(canRun('prd', { sources: '   ' })).toBe(false);
        expect(canRun('prd', { sources: 'x' })).toBe(true);
    });
    it('gap needs both spec and implementation', () => {
        expect(canRun('gap', { spec: 'x' })).toBe(false);
        expect(canRun('gap', { spec: 'x', implementation: 'y' })).toBe(true);
    });
});
