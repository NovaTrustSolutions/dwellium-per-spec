import { describe, it, expect } from 'vitest';
import { runLocalCommand } from '../components/Terminal/localShell';

describe('Terminal offline local shell', () => {
    it('help lists the available local commands', () => {
        const out = runLocalCommand('help').output.toLowerCase();
        expect(out).toContain('echo');
        expect(out).toContain('clear');
        expect(out).toContain('date');
    });

    it('echo prints its arguments', () => {
        expect(runLocalCommand('echo hello world').output).toBe('hello world');
    });

    it('clear signals a screen clear', () => {
        expect(runLocalCommand('clear')).toEqual({ output: '', clear: true });
    });

    it('whoami and pwd honor context with sensible defaults', () => {
        expect(runLocalCommand('whoami', { user: 'andy' }).output).toBe('andy');
        expect(runLocalCommand('whoami').output).toBe('guest');
        expect(runLocalCommand('pwd', { cwd: '/x' }).output).toBe('/x');
        expect(runLocalCommand('pwd').output).toBe('~');
    });

    it('date uses injected now (deterministic)', () => {
        expect(runLocalCommand('date', { now: new Date('2026-01-02T00:00:00Z') }).output).toContain('2026');
    });

    it('real-shell commands honestly say they need the backend', () => {
        expect(runLocalCommand('ls').output.toLowerCase()).toContain('backend');
        expect(runLocalCommand('git status').output.toLowerCase()).toContain('backend');
    });

    it('unknown commands report not-found in offline mode (not silently nothing)', () => {
        expect(runLocalCommand('frobnicate').output.toLowerCase()).toContain('command not found');
    });

    it('empty input is a no-op', () => {
        expect(runLocalCommand('   ')).toEqual({ output: '' });
    });
});
