/**
 * Interactive Docs — IDocChatPanel (RTL, real timers): send → reply rendered;
 * an action reply becomes a preview with Apply / Discard (nothing applied until
 * Apply → onApply gets a normalized doc); chips; Esc closes in capture phase and
 * never reaches a bubble-phase window listener; text-file drop → context; image → stub.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import IDocChatPanel from '../components/Scribe/idocs/IDocChatPanel';
import { normalizeDoc, type LlmBundle } from '../components/Scribe/idocs/idocsAi';

const LLM_ON = { active: 'openai', openai: { enabled: true, apiKey: 'sk-test', model: 'gpt-x' } } as unknown as LlmBundle;
const LLM_OFF = { active: null } as unknown as LlmBundle;
const reply = (obj: unknown) => ({ text: JSON.stringify(obj), provider: 'openai', model: 'm' });

const base = () => normalizeDoc({
    title: 'Owner report', description: 'Monthly',
    cards: [
        { id: 'c1', title: 'Intro', blocks: [{ id: 'b1', type: 'text', md: 'Hello **world**' }, { id: 'b2', type: 'callout', tone: 'info', md: 'Note' }] },
        { id: 'c2', title: 'Numbers', blocks: [{ id: 'b3', type: 'chart', kind: 'bar', data: [{ label: 'A', value: 1 }, { label: 'B', value: 2 }, { label: 'C', value: 3 }] }] },
    ],
});

afterEach(cleanup);

const typeAndSend = (text: string) => {
    const box = screen.getByLabelText('Message') as HTMLTextAreaElement;
    fireEvent.change(box, { target: { value: text } });
    fireEvent.keyDown(box, { key: 'Enter' });
};

describe('IDocChatPanel', () => {
    it('sends on Enter (Shift+Enter does not), renders the JSON "answer", includes doc context + BLOCK_CONTRACT in the request', async () => {
        const callLlmFn = vi.fn().mockResolvedValue(reply({ answer: 'It has **2** cards.', action: { kind: 'none' } }));
        const onApply = vi.fn();
        render(<IDocChatPanel doc={base()} llm={LLM_ON} onApply={onApply} callLlmFn={callLlmFn} />);
        const box = screen.getByLabelText('Message') as HTMLTextAreaElement;
        fireEvent.change(box, { target: { value: 'How many cards?' } });
        fireEvent.keyDown(box, { key: 'Enter', shiftKey: true });
        expect(callLlmFn).not.toHaveBeenCalled();
        fireEvent.keyDown(box, { key: 'Enter' });
        expect(await screen.findByText('It has **2** cards.')).toBeInTheDocument();
        expect(screen.getByText('How many cards?')).toBeInTheDocument();
        const req = callLlmFn.mock.calls[0][0] as { prompt: string; systemPrompt: string; responseFormat: string };
        expect(req.systemPrompt).toContain("editor's assistant for THIS document");
        expect(req.systemPrompt).toContain('{"type":"heading","level":2');
        expect(req.prompt).toContain('Title: Owner report');
        expect(req.prompt).toContain('id=c2 "Numbers" [chart]');
        expect(req.prompt).toContain('User: How many cards?');
        expect(req.responseFormat).toBe('json');
        expect(onApply).not.toHaveBeenCalled();
        expect(screen.queryByText('Apply')).not.toBeInTheDocument();
    });

    it('replace-card action → preview "Will replace card" with Apply / Discard; Apply calls onApply with a normalized doc, same card id', async () => {
        const doc = base();
        const callLlmFn = vi.fn().mockImplementation(async (req: { systemPrompt: string }) => {
            if (req.systemPrompt.includes("editor's assistant")) return reply({ answer: 'Sure — regenerating Numbers.', action: { kind: 'replace-card', cardId: 'c2', instruction: 'use steps' } });
            return reply({ title: 'Numbers v2', layout: 'split-left', blocks: [{ type: 'steps', items: [{ title: 's1', md: 'm' }] }, { type: 'wat' }] });
        });
        const onApply = vi.fn();
        render(<IDocChatPanel doc={doc} llm={LLM_ON} onApply={onApply} callLlmFn={callLlmFn} />);
        typeAndSend('Rewrite the numbers card as steps');
        expect(await screen.findByText('Will replace card “Numbers”')).toBeInTheDocument();
        expect(screen.getByText('chart → steps, text')).toBeInTheDocument();
        expect(onApply).not.toHaveBeenCalled();
        fireEvent.click(screen.getByText('Apply'));
        expect(onApply).toHaveBeenCalledTimes(1);
        const [next, label] = onApply.mock.calls[0] as [ReturnType<typeof base>, string];
        expect(label).toBe('Will replace card “Numbers”');
        expect(next.id).toBe(doc.id);
        expect(next.cards).toHaveLength(2);
        expect(next.cards[1]).toMatchObject({ id: 'c2', title: 'Numbers v2', layout: 'split-left' });
        expect(next.cards[1].blocks.map((b) => b.type)).toEqual(['steps', 'text']);
        for (const b of next.cards[1].blocks) expect(b.id).toBeTruthy();
        expect(doc.cards[1].title).toBe('Numbers'); // original untouched
        expect(screen.queryByText('Apply')).not.toBeInTheDocument();
        expect(screen.getByText('Applied: Will replace card “Numbers”')).toBeInTheDocument();
    });

    it('edit-block action patches one block directly (normalized, id kept); Discard drops the preview without onApply', async () => {
        const callLlmFn = vi.fn().mockResolvedValue(reply({ answer: 'Fixed the intro.', action: { kind: 'edit-block', cardId: 'c1', blockId: 'b1', block: { type: 'text', md: 'Hello **there**' } } }));
        const onApply = vi.fn();
        render(<IDocChatPanel doc={base()} llm={LLM_ON} onApply={onApply} callLlmFn={callLlmFn} />);
        typeAndSend('change world to there');
        expect(await screen.findByText('Will edit a text block in “Intro”')).toBeInTheDocument();
        expect(screen.getByText('Hello **there**')).toBeInTheDocument();
        fireEvent.click(screen.getByText('Discard'));
        expect(onApply).not.toHaveBeenCalled();
        expect(screen.queryByText('Apply')).not.toBeInTheDocument();
        expect(screen.getByText('Discarded.')).toBeInTheDocument();
        // second time: apply and check the block
        typeAndSend('again');
        fireEvent.click(await screen.findByText('Apply'));
        const next = onApply.mock.calls[0][0] as ReturnType<typeof base>;
        expect(next.cards[0].blocks[0]).toEqual({ id: 'b1', type: 'text', md: 'Hello **there**' });
        expect(next.cards[0].blocks[1]).toMatchObject({ id: 'b2', type: 'callout' });
    });

    it('add-card action inserts via addCardWithAi at atIndex; unknown card id → friendly message, no preview', async () => {
        const callLlmFn = vi.fn().mockImplementation(async (req: { systemPrompt: string; prompt: string }) => {
            if (!req.systemPrompt.includes("editor's assistant")) return reply({ title: 'FAQ', blocks: [{ type: 'accordion', items: [{ title: 'Q', md: 'A' }] }] });
            if (req.prompt.includes('User: bad')) return reply({ answer: 'ok', action: { kind: 'replace-card', cardId: 'nope' } });
            return reply({ answer: 'Adding an FAQ.', action: { kind: 'add-card', instruction: 'an FAQ', atIndex: 1 } });
        });
        const onApply = vi.fn();
        render(<IDocChatPanel doc={base()} llm={LLM_ON} onApply={onApply} callLlmFn={callLlmFn} />);
        typeAndSend('add an faq after intro');
        expect(await screen.findByText('Will add card “FAQ” at position 2')).toBeInTheDocument();
        fireEvent.click(screen.getByText('Apply'));
        expect((onApply.mock.calls[0][0] as ReturnType<typeof base>).cards.map((c) => c.title)).toEqual(['Intro', 'FAQ', 'Numbers']);
        typeAndSend('bad');
        expect(await screen.findByText(/couldn’t prepare that change/)).toBeInTheDocument();
        expect(screen.queryByText('Apply')).not.toBeInTheDocument();
    });

    it('chips: "Fix grammar" runs restyleDoc directly into a preview; "Add card" pre-fills the input; "Summarize" sends a message', async () => {
        const callLlmFn = vi.fn().mockImplementation(async (req: { systemPrompt: string; prompt: string }) => {
            if (req.systemPrompt.includes("editor's assistant")) return reply({ answer: 'Summary: two cards.' });
            const { cards } = JSON.parse(req.prompt) as { cards: { title: string; blocks: { md?: string; type: string }[] }[] };
            return reply({ cards: cards.map((c) => ({ ...c, blocks: c.blocks.map((b) => (typeof b.md === 'string' ? { ...b, md: `${b.md}.` } : b)) })) });
        });
        const onApply = vi.fn();
        render(<IDocChatPanel doc={base()} llm={LLM_ON} onApply={onApply} callLlmFn={callLlmFn} />);
        fireEvent.click(screen.getByText('Fix grammar'));
        expect(await screen.findByText('Will fix grammar and typos in all 2 cards')).toBeInTheDocument();
        expect((callLlmFn.mock.calls[0][0] as { systemPrompt: string }).systemPrompt).toContain('fix grammar and typos only');
        fireEvent.click(screen.getByText('Apply'));
        const next = onApply.mock.calls[0][0] as ReturnType<typeof base>;
        expect(next.cards[0].blocks[0]).toMatchObject({ id: 'b1', md: 'Hello **world**.' });
        fireEvent.click(screen.getByText('Add card'));
        expect((screen.getByLabelText('Message') as HTMLTextAreaElement).value).toBe('Add a card about ');
        fireEvent.click(screen.getByText('Summarize'));
        expect(await screen.findByText('Summary: two cards.')).toBeInTheDocument();
        expect(screen.getByText('Summarize this document in 3-5 bullets.')).toBeInTheDocument();
    });

    it('Esc calls onClose in the capture phase and stops propagation to a bubble-phase window listener; unmount removes it', () => {
        const onClose = vi.fn();
        const bubble = vi.fn();
        window.addEventListener('keydown', bubble);
        const { unmount } = render(<IDocChatPanel doc={base()} llm={LLM_ON} onApply={vi.fn()} onClose={onClose} callLlmFn={vi.fn()} />);
        fireEvent.keyDown(document.body, { key: 'Escape' });
        expect(onClose).toHaveBeenCalledTimes(1);
        expect(bubble).not.toHaveBeenCalled();
        fireEvent.keyDown(document.body, { key: 'a' });
        expect(bubble).toHaveBeenCalledTimes(1);
        fireEvent.click(screen.getByLabelText('Close chat'));
        expect(onClose).toHaveBeenCalledTimes(2);
        unmount();
        fireEvent.keyDown(document.body, { key: 'Escape' });
        expect(onClose).toHaveBeenCalledTimes(2);
        expect(bubble).toHaveBeenCalledTimes(2);
        window.removeEventListener('keydown', bubble);
    });

    it('drop: text file → attached + in the next prompt; image → "vision not wired" stub; no LLM → hint, no calls', async () => {
        const callLlmFn = vi.fn().mockResolvedValue(reply({ answer: 'got it' }));
        const { container, unmount } = render(<IDocChatPanel doc={base()} llm={LLM_ON} onApply={vi.fn()} callLlmFn={callLlmFn} />);
        const panel = container.querySelector('.scribe-idocs-chat')!;
        const txt = new File(['notes about roofs'], 'notes.txt', { type: 'text/plain' });
        const img = new File(['x'], 'photo.png', { type: 'image/png' });
        fireEvent.drop(panel, { dataTransfer: { files: [txt, img] } });
        expect(await screen.findByText(/Attached “notes.txt” \(17 chars\)/)).toBeInTheDocument();
        expect(screen.getByText(/vision not wired/)).toBeInTheDocument();
        typeAndSend('use my notes');
        await screen.findByText('got it');
        expect((callLlmFn.mock.calls[0][0] as { prompt: string }).prompt).toContain('--- notes.txt ---\nnotes about roofs');
        unmount();
        const spy = vi.fn();
        render(<IDocChatPanel doc={base()} llm={LLM_OFF} onApply={vi.fn()} callLlmFn={spy} />);
        expect(screen.getByLabelText('Message')).toHaveAttribute('placeholder', 'No LLM configured');
        fireEvent.click(screen.getByText('Fix grammar'));
        await waitFor(() => expect(screen.getByText(/No LLM configured — add a key/)).toBeInTheDocument());
        expect(spy).not.toHaveBeenCalled();
    });
});
