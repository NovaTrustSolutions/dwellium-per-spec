/**
 * Scribe-specific keyboard shortcuts as a CodeMirror keymap extension.
 * Wired into markdownConfig.ts extensions list.
 *
 * Shortcuts that trigger LLM calls (Cmd+L for redline) extract the
 * shared flow from SelectionToolbar's handleSendToAgent.
 */
import { keymap } from '@codemirror/view';
import { useScribeStore, type Redline } from './scribeStore';
import { callLlm, hasActiveLlm } from '../../lib/llmClient';
import { REDLINE_SYSTEM_PROMPT, parseRedlineResponse } from './redlinePrompt';
import { getIntegrationsSnapshot } from './scribeUtils';

export const scribeKeymap = keymap.of([
    {
        key: 'Mod-s',
        preventDefault: true,
        run: () => {
            const { activeFilepath, saveFile } = useScribeStore.getState();
            if (activeFilepath) void saveFile(activeFilepath);
            return true;
        },
    },
    {
        key: 'Mod-l',
        preventDefault: true,
        run: (view) => {
            const sel = view.state.selection.main;
            if (sel.from === sel.to) return false;
            const text = view.state.doc.sliceString(sel.from, sel.to);
            const filepath = useScribeStore.getState().activeFilepath;
            if (!filepath) return false;
            void triggerRedline(filepath, sel.from, text);
            return true;
        },
    },
    {
        key: 'Mod-Shift-c',
        preventDefault: true,
        run: (view) => {
            const sel = view.state.selection.main;
            if (sel.from === sel.to) return false;
            const filepath = useScribeStore.getState().activeFilepath;
            if (!filepath) return false;
            useScribeStore.getState().addComment(filepath, sel.from, sel.to);
            return true;
        },
    },
    {
        key: 'Mod-]',
        preventDefault: true,
        run: () => {
            navigateRedline(1);
            return true;
        },
    },
    {
        key: 'Mod-[',
        preventDefault: true,
        run: () => {
            navigateRedline(-1);
            return true;
        },
    },
    {
        key: 'Mod-Shift-k',
        preventDefault: true,
        run: () => {
            const s = useScribeStore.getState();
            s.setMinimapVisible(!s.minimapVisible);
            return true;
        },
    },
    {
        key: 'Mod-Shift-t',
        preventDefault: true,
        run: () => {
            const s = useScribeStore.getState();
            s.setTocVisible(!s.tocVisible);
            return true;
        },
    },
]);

async function triggerRedline(filepath: string, selFrom: number, text: string) {
    const llm = getIntegrationsSnapshot();
    if (!llm || !hasActiveLlm(llm)) return;
    useScribeStore.getState().setRedlineLoading(true);
    try {
        const res = await callLlm({
            prompt: text,
            systemPrompt: REDLINE_SYSTEM_PROMPT,
            responseFormat: 'json',
            maxTokens: 2048,
            temperature: 0.3,
        }, llm);
        if (!res) return;
        const parsed = parseRedlineResponse(res.text);
        if (!parsed) return;
        for (const proposal of parsed.redlines) {
            const idx = text.indexOf(proposal.originalText);
            if (idx === -1) continue;
            const redline: Redline = {
                id: crypto.randomUUID(),
                filepath,
                from: selFrom + idx,
                to: selFrom + idx + proposal.originalText.length,
                originalText: proposal.originalText,
                proposedText: proposal.proposedText,
                rationale: proposal.rationale,
                state: 'pending',
            };
            useScribeStore.getState().addRedline(redline);
        }
    } catch { /* LLM failed */ }
    finally { useScribeStore.getState().setRedlineLoading(false); }
}

let redlineCursor = 0;

function navigateRedline(direction: 1 | -1) {
    const { redlines, activeFilepath } = useScribeStore.getState();
    if (!activeFilepath) return;
    const pending = redlines
        .filter((r) => r.filepath === activeFilepath && r.state === 'pending')
        .sort((a, b) => a.from - b.from);
    if (pending.length === 0) return;
    redlineCursor = ((redlineCursor + direction) % pending.length + pending.length) % pending.length;
}
