/**
 * typedBus — assessment sweep 2026-06-12 (weakness #4).
 *
 * The contract under test: ONE shared bus mechanism with last-value replay
 * kills the mount-race bug class (default stack / ⌘K ara-prompt / morning
 * brief) that previously needed three hand-rolled pending-slot copies.
 */
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { busChannel, __resetTypedBusForTests } from '../lib/typedBus';
import { requestAraPrompt, consumePendingAraPrompt } from '../lib/llmRouter';

describe('typedBus', () => {
    beforeEach(() => {
        __resetTypedBusForTests();
    });
    afterEach(() => {
        vi.useRealTimers();
    });

    it('delivers emits to live subscribers (and unsubscribe detaches)', () => {
        const ch = busChannel<{ n: number }>('test:live');
        const seen: number[] = [];
        const off = ch.on(p => seen.push(p.n));
        ch.emit({ n: 1 });
        ch.emit({ n: 2 });
        off();
        ch.emit({ n: 3 });
        expect(seen).toEqual([1, 2]);
    });

    it('replays an UNDELIVERED emit to a late subscriber (mount-race case)', () => {
        const ch = busChannel<{ n: number }>('test:replay');
        ch.emit({ n: 7 }); // nobody listening — the lost-event case
        const seen: number[] = [];
        ch.on(p => seen.push(p.n), { replayWithinMs: 5000 });
        expect(seen).toEqual([7]);
    });

    it('does NOT replay an emit that a live subscriber already received', () => {
        const ch = busChannel<{ n: number }>('test:delivered');
        const first: number[] = [];
        ch.on(p => first.push(p.n));
        ch.emit({ n: 1 }); // delivered live
        const late: number[] = [];
        ch.on(p => late.push(p.n), { replayWithinMs: 5000 });
        expect(first).toEqual([1]);
        expect(late).toEqual([]); // already handled — no double-delivery
    });

    it('does NOT re-replay on re-subscribe (React effect re-run loop guard)', () => {
        const ch = busChannel<{ n: number }>('test:loop');
        ch.emit({ n: 1 }); // undelivered
        const seen: number[] = [];
        const off1 = ch.on(p => seen.push(p.n), { replayWithinMs: 5000 });
        off1(); // effect cleanup (dep change)
        ch.on(p => seen.push(p.n), { replayWithinMs: 5000 }); // re-subscribe
        expect(seen).toEqual([1]); // replayed exactly once, ever
    });

    it('does NOT replay outside the freshness window', () => {
        vi.setSystemTime(new Date('2026-06-12T08:00:00Z'));
        const ch = busChannel<{ n: number }>('test:stale');
        ch.emit({ n: 1 });
        vi.setSystemTime(new Date('2026-06-12T08:00:06Z')); // 6s later
        const seen: number[] = [];
        ch.on(p => seen.push(p.n), { replayWithinMs: 5000 });
        expect(seen).toEqual([]);
    });

    it('consume() is one-shot (generalized pending-slot semantics)', () => {
        const ch = busChannel<{ text: string }>('test:consume');
        expect(ch.consume()).toBeNull();
        ch.emit({ text: 'hello' });
        expect(ch.peek()).toEqual({ text: 'hello' });
        expect(ch.consume()).toEqual({ text: 'hello' });
        expect(ch.consume()).toBeNull(); // consumed
        expect(ch.peek()).toBeNull();
    });

    it('interops with legacy CustomEvent code in BOTH directions', () => {
        const ch = busChannel<{ v: string }>('test:interop');
        // channel.emit → raw addEventListener hears it
        const raw: string[] = [];
        const rawListener = (e: Event) => raw.push((e as CustomEvent<{ v: string }>).detail.v);
        window.addEventListener('test:interop', rawListener);
        ch.emit({ v: 'a' });
        window.removeEventListener('test:interop', rawListener);
        // raw dispatchEvent → channel.on hears it
        const viaBus: string[] = [];
        ch.on(p => viaBus.push(p.v));
        window.dispatchEvent(new CustomEvent('test:interop', { detail: { v: 'b' } }));
        expect(raw).toEqual(['a']);
        expect(viaBus).toEqual(['b']);
    });

    it('channels are singletons per name (shared replay state)', () => {
        busChannel<{ n: number }>('test:singleton').emit({ n: 42 });
        expect(busChannel<{ n: number }>('test:singleton').peek()).toEqual({ n: 42 });
    });
});

describe('migrated pending-slot modules (signatures unchanged)', () => {
    beforeEach(() => {
        __resetTypedBusForTests();
    });

    it('requestAraPrompt → consumePendingAraPrompt round-trips one-shot', () => {
        expect(consumePendingAraPrompt()).toBeNull();
        requestAraPrompt('open the books');
        expect(consumePendingAraPrompt()).toBe('open the books');
        expect(consumePendingAraPrompt()).toBeNull();
    });

    it('requestAraPrompt still fires the legacy live event (ARA-mounted path)', () => {
        const seen: string[] = [];
        const listener = (e: Event) => seen.push((e as CustomEvent<{ text: string }>).detail.text);
        window.addEventListener('dwellium:ara-prompt', listener);
        requestAraPrompt('hello ara');
        window.removeEventListener('dwellium:ara-prompt', listener);
        expect(seen).toEqual(['hello ara']);
    });
});
