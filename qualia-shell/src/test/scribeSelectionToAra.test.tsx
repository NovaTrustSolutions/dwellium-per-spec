/**
 * Plan 055 phase 4 — Scribe selection → ARA carries the doc basename.
 *
 * The SelectionToolbar's "Send to ARA" action dispatches `scribe:send-to-ara`
 * with the selected text + a preface naming the active doc's BASENAME only
 * (never the full path — same data boundary as the ARA resume chip). Both the
 * AraMiniPanel and the full ARAConsole listen for this event and compose the
 * message + focus their composer (pre-existing wiring, verified unchanged).
 */
import React from 'react';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('../hooks/useIntegrations', () => ({
    useIntegrations: () => ({ integrations: { llm: null } }),
}));
vi.mock('../lib/llmClient', () => ({
    hasActiveLlm: () => false,
    callLlm: vi.fn(),
}));

import { useScribeStore } from '../components/Scribe/scribeStore';
import { SelectionToolbar } from '../components/Scribe/SelectionToolbar';
import { buildSummarizePreface } from '../components/Scribe/aiActions';

describe('Scribe selection → ARA (055-P4)', () => {
    const received: Array<{ text: string; preface?: string }> = [];
    const listener = (e: Event) => received.push((e as CustomEvent).detail);

    beforeEach(() => {
        received.length = 0;
        window.addEventListener('scribe:send-to-ara', listener);
        useScribeStore.getState().setSelectionToolbar({
            filepath: '/very/private/portfolios/riverwood/WoodlandLease.md',
            x: 200, y: 200, from: 0, to: 12, text: 'Hello clause',
        });
    });
    afterEach(() => {
        window.removeEventListener('scribe:send-to-ara', listener);
        useScribeStore.getState().setSelectionToolbar(null);
        cleanup();
    });

    it('Send to ARA carries the selection + basename-only preface, then closes the toolbar', () => {
        render(<SelectionToolbar />);
        fireEvent.click(screen.getByTitle('Send this selection to ARA in the floating panel'));
        expect(received).toHaveLength(1);
        expect(received[0].text).toBe('Hello clause');
        expect(received[0].preface).toBe('Please review this passage from WoodlandLease.md and tell me what you think:');
        expect(received[0].preface).not.toContain('/very/private');
        expect(useScribeStore.getState().selectionToolbar).toBeNull();
    });

    it('buildSummarizePreface names the doc when given, stays generic otherwise', () => {
        expect(buildSummarizePreface('WoodlandLease.md'))
            .toBe('Summarize this passage from WoodlandLease.md concisely (3–5 sentences or a short bullet list), preserving the key facts:');
        expect(buildSummarizePreface()).not.toContain('from');
    });
});
