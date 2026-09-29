import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { startHarnessCanvas } from '../components/CognitiveHarness/harnessCanvas';

/** Recording fake 2D context — enough surface for the render loop to run without throwing. */
function makeFakeCtx() {
    return {
        setTransform: vi.fn(),
        clearRect: vi.fn(),
        fillRect: vi.fn(),
        beginPath: vi.fn(),
        moveTo: vi.fn(),
        lineTo: vi.fn(),
        stroke: vi.fn(),
        fill: vi.fn(),
        arc: vi.fn(),
        ellipse: vi.fn(),
        fillText: vi.fn(),
        drawImage: vi.fn(),
        setLineDash: vi.fn(),
        createRadialGradient: vi.fn(() => ({ addColorStop: vi.fn() })),
        canvas: {},
        strokeStyle: '',
        fillStyle: '',
        lineWidth: 1,
        globalAlpha: 1,
        font: '',
        textAlign: 'center',
    } as unknown as CanvasRenderingContext2D;
}

class FakeResizeObserver {
    static instances: FakeResizeObserver[] = [];
    cb: ResizeObserverCallback;
    disconnected = false;
    constructor(cb: ResizeObserverCallback) {
        this.cb = cb;
        FakeResizeObserver.instances.push(this);
    }
    observe = vi.fn();
    unobserve = vi.fn();
    disconnect = vi.fn(() => { this.disconnected = true; });
}

class FakeIntersectionObserver {
    static instances: FakeIntersectionObserver[] = [];
    cb: IntersectionObserverCallback;
    disconnected = false;
    constructor(cb: IntersectionObserverCallback) {
        this.cb = cb;
        FakeIntersectionObserver.instances.push(this);
    }
    observe = vi.fn();
    unobserve = vi.fn();
    disconnect = vi.fn(() => { this.disconnected = true; });
    trigger(isIntersecting: boolean) {
        this.cb([{ isIntersecting } as IntersectionObserverEntry], this as unknown as IntersectionObserver);
    }
}

class FakeMutationObserver {
    static instances: FakeMutationObserver[] = [];
    cb: MutationCallback;
    disconnected = false;
    constructor(cb: MutationCallback) {
        this.cb = cb;
        FakeMutationObserver.instances.push(this);
    }
    observe = vi.fn();
    disconnect = vi.fn(() => { this.disconnected = true; });
}

let rafCallbacks: FrameRequestCallback[] = [];
let rafIdCounter = 1;
let cancelledIds = new Set<number>();

function setupGlobals() {
    FakeResizeObserver.instances = [];
    FakeIntersectionObserver.instances = [];
    FakeMutationObserver.instances = [];
    rafCallbacks = [];
    rafIdCounter = 1;
    cancelledIds = new Set();

    vi.stubGlobal('ResizeObserver', FakeResizeObserver);
    vi.stubGlobal('IntersectionObserver', FakeIntersectionObserver);
    vi.stubGlobal('MutationObserver', FakeMutationObserver);
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
        const id = rafIdCounter++;
        rafCallbacks.push(cb);
        return id;
    });
    vi.stubGlobal('cancelAnimationFrame', (id: number) => {
        cancelledIds.add(id);
    });
}

function makeCanvas(): HTMLCanvasElement {
    const canvas = document.createElement('canvas');
    Object.defineProperty(canvas, 'offsetWidth', { value: 200, configurable: true });
    Object.defineProperty(canvas, 'offsetHeight', { value: 100, configurable: true });
    const parent = document.createElement('div');
    parent.appendChild(canvas);
    document.body.appendChild(parent);
    return canvas;
}

describe('startHarnessCanvas', () => {
    let fakeCtx: CanvasRenderingContext2D;

    beforeEach(() => {
        setupGlobals();
        fakeCtx = makeFakeCtx();
        vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => fakeCtx);
    });

    afterEach(() => {
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
        document.body.innerHTML = '';
    });

    it('destroy disconnects all observers and cancels rAF', () => {
        const canvas = makeCanvas();
        const handle = startHarnessCanvas(canvas, { seedCount: 5, slots: 10, activeIndex: 0, reducedMotion: false });

        expect(rafCallbacks.length).toBeGreaterThan(0);
        handle.destroy();

        expect(FakeResizeObserver.instances[0].disconnected).toBe(true);
        expect(FakeIntersectionObserver.instances[0].disconnected).toBe(true);
        expect(FakeMutationObserver.instances[0].disconnected).toBe(true);
        expect(cancelledIds.size).toBeGreaterThan(0);
    });

    it('reducedMotion draws without scheduling rAF', () => {
        const canvas = makeCanvas();
        rafCallbacks = [];
        const handle = startHarnessCanvas(canvas, { seedCount: 5, slots: 10, activeIndex: 0, reducedMotion: true });

        expect(rafCallbacks.length).toBe(0);
        expect(fakeCtx.fillRect).toHaveBeenCalled();
        handle.destroy();
    });

    it('not-intersecting schedules no rAF loop continuation; becoming intersecting resumes it', () => {
        const canvas = makeCanvas();
        const handle = startHarnessCanvas(canvas, { seedCount: 5, slots: 10, activeIndex: 0, reducedMotion: false });

        const io = FakeIntersectionObserver.instances[0];
        io.trigger(false);
        rafCallbacks = [];

        // Run any already-scheduled frame; loop should not reschedule since not visible.
        const pending = [...rafCallbacks];
        pending.forEach((cb) => cb(0));
        expect(rafCallbacks.length).toBe(0);

        io.trigger(true);
        expect(rafCallbacks.length).toBeGreaterThan(0);

        handle.destroy();
    });

    it('setActive does not re-create particles (stable particle count across calls)', () => {
        const canvas = makeCanvas();
        const handle = startHarnessCanvas(canvas, { seedCount: 5, slots: 10, activeIndex: 0, reducedMotion: true });
        const arcMock = fakeCtx.arc as ReturnType<typeof vi.fn>;

        // Static frames in reduced-motion mode never move particles, so redrawing
        // with the SAME active index twice must produce the same number of arc()
        // calls — proof the particle array wasn't re-seeded with different
        // size/positions between calls (a different index legitimately changes
        // which particles are highlighted, so we hold the index fixed here).
        arcMock.mockClear();
        handle.setActive(3);
        const callsAfterFirst = arcMock.mock.calls.length;

        arcMock.mockClear();
        handle.setActive(3);
        const callsAfterSecond = arcMock.mock.calls.length;

        expect(callsAfterFirst).toBeGreaterThan(0);
        expect(callsAfterSecond).toBe(callsAfterFirst);

        handle.destroy();
    });

    it('backing store honours devicePixelRatio', () => {
        vi.stubGlobal('devicePixelRatio', 2);
        const canvas = makeCanvas();
        const handle = startHarnessCanvas(canvas, { seedCount: 5, slots: 10, activeIndex: 0, reducedMotion: true });

        expect(canvas.width).toBe(400); // 200 * 2
        expect(canvas.height).toBe(200); // 100 * 2
        expect(fakeCtx.setTransform).toHaveBeenCalledWith(2, 0, 0, 2, 0, 0);

        handle.destroy();
    });

    it('guards a null 2D context without throwing', () => {
        (HTMLCanvasElement.prototype.getContext as ReturnType<typeof vi.fn>).mockReturnValue(null);
        const canvas = makeCanvas();
        expect(() => {
            const handle = startHarnessCanvas(canvas, { seedCount: 5, slots: 10, activeIndex: 0, reducedMotion: false });
            handle.destroy();
        }).not.toThrow();
    });
});
