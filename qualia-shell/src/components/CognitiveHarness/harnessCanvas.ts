/**
 * Plan 069 W1-B — decorative particle-space canvas renderer, extracted from the
 * old inline effect in CognitiveHarness.tsx. DOM-only, no React.
 *
 * Fixes vs the old inline effect: particles seeded once (not on every
 * activeIndex/entityCount change), backing store honours devicePixelRatio,
 * grid pre-rendered offscreen, rAF paused when not visible/hidden tab, theme
 * colours read from CSS custom properties instead of hard-coded hex, and
 * everything is torn down cleanly in destroy().
 */

export interface HarnessCanvasOptions {
    seedCount: number;
    slots: number;
    activeIndex: number;
    reducedMotion: boolean;
}

export interface HarnessCanvasHandle {
    setActive(index: number): void;
    setReducedMotion(on: boolean): void;
    destroy(): void;
}

interface Particle {
    x: number;
    y: number;
    z: number;
    speed: number;
    warm: boolean;
}

interface Palette {
    bg: string;
    grid: string;
    ringA: string;
    ringB: string;
    particleA: string;
    particleB: string;
    active: string;
    label: string;
}

const FALLBACK_PALETTE: Palette = {
    bg: 'rgba(10, 14, 26, 1)',
    grid: 'rgba(255, 255, 255, 0.02)',
    ringA: 'rgba(0, 136, 204, 0.15)',
    ringB: 'rgba(129, 140, 248, 0.1)',
    particleA: 'rgba(0, 136, 204, 0.8)',
    particleB: 'rgba(129, 140, 248, 0.7)',
    active: '#22c55e',
    label: 'rgba(255, 255, 255, 0.7)',
};

/** Deterministic PRNG (xorshift32) — no engine-native randomness. */
function makePrng(seed: number): () => number {
    let s = (seed >>> 0) || 1;
    return () => {
        s ^= s << 13; s >>>= 0;
        s ^= s >>> 17;
        s ^= s << 5; s >>>= 0;
        return s / 4294967296;
    };
}

function readPalette(canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D): Palette {
    const target = canvas.parentElement ?? canvas;
    const cs = getComputedStyle(target);
    // A token the canvas can't parse (e.g. color-mix() in an older engine) is silently ignored by
    // fillStyle and THROWS in addColorStop — so only accept values the context actually took.
    const canvasAccepts = (v: string): boolean => {
        ctx.fillStyle = '#010203';
        ctx.fillStyle = v;
        return ctx.fillStyle !== '#010203' || v.trim().toLowerCase() === '#010203';
    };
    const get = (name: string, fallback: string) => {
        const v = cs.getPropertyValue(name).trim();
        return v && canvasAccepts(v) ? v : fallback;
    };
    return {
        bg: get('--ch-canvas-bg', FALLBACK_PALETTE.bg),
        grid: get('--ch-canvas-grid', FALLBACK_PALETTE.grid),
        ringA: get('--ch-canvas-ring-a', FALLBACK_PALETTE.ringA),
        ringB: get('--ch-canvas-ring-b', FALLBACK_PALETTE.ringB),
        particleA: get('--ch-canvas-particle-a', FALLBACK_PALETTE.particleA),
        particleB: get('--ch-canvas-particle-b', FALLBACK_PALETTE.particleB),
        active: get('--ch-canvas-active', FALLBACK_PALETTE.active),
        label: get('--ch-canvas-label', FALLBACK_PALETTE.label),
    };
}

export function startHarnessCanvas(canvas: HTMLCanvasElement, opts: HarnessCanvasOptions): HarnessCanvasHandle {
    const ctx = canvas.getContext('2d');
    if (!ctx) {
        // ponytail: no 2D context (unsupported env) — return an inert handle.
        return { setActive() {}, setReducedMotion() {}, destroy() {} };
    }

    let activeIndex = opts.activeIndex;
    let reducedMotion = opts.reducedMotion;
    let width = 0;
    let height = 0;
    let dpr = 1;
    let visible = true;
    let docVisible = typeof document === 'undefined' || document.visibilityState === 'visible';
    let rafId = 0;
    let palette = FALLBACK_PALETTE;

    const gridCanvas = document.createElement('canvas');
    const gridCtx = gridCanvas.getContext('2d');

    const rng = makePrng(opts.seedCount * 7919 + 104729);
    const maxParticles = Math.min(200, 20 + opts.seedCount);
    const particles: Particle[] = [];
    for (let i = 0; i < maxParticles; i++) {
        particles.push({
            x: rng() * 1 - 0.5,
            y: rng() * 1 - 0.5,
            z: rng(),
            speed: 0.5 + rng() * 1.5,
            warm: rng() > 0.6,
        });
    }

    let rotY = 0;

    function renderGrid() {
        gridCanvas.width = Math.max(1, Math.round(width * dpr));
        gridCanvas.height = Math.max(1, Math.round(height * dpr));
        if (!gridCtx) return;
        gridCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
        gridCtx.clearRect(0, 0, width, height);
        gridCtx.strokeStyle = palette.grid;
        gridCtx.lineWidth = 1;
        const spacing = 40;
        for (let x = 0; x < width; x += spacing) {
            gridCtx.beginPath();
            gridCtx.moveTo(x, 0);
            gridCtx.lineTo(x, height);
            gridCtx.stroke();
        }
        for (let y = 0; y < height; y += spacing) {
            gridCtx.beginPath();
            gridCtx.moveTo(0, y);
            gridCtx.lineTo(width, y);
            gridCtx.stroke();
        }
    }

    function resize() {
        const cssW = canvas.offsetWidth || canvas.clientWidth || 1;
        const cssH = canvas.offsetHeight || canvas.clientHeight || 1;
        dpr = window.devicePixelRatio || 1;
        width = cssW;
        height = cssH;
        canvas.width = Math.max(1, Math.round(cssW * dpr));
        canvas.height = Math.max(1, Math.round(cssH * dpr));
        ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
        renderGrid();
        if (reducedMotion) drawFrame(true);
    }

    function refreshPalette() {
        palette = readPalette(canvas, ctx!);
        renderGrid();
        if (reducedMotion) drawFrame(true);
    }

    function drawFrame(staticFrame: boolean) {
        const c = ctx!;
        // Trailing-fade fill: full rect at low alpha in the bg colour, works for any CSS colour.
        c.globalAlpha = staticFrame ? 1 : 0.15;
        c.fillStyle = palette.bg;
        c.fillRect(0, 0, width, height);
        c.globalAlpha = 1;

        c.drawImage(gridCanvas, 0, 0, width, height);

        c.strokeStyle = palette.ringA;
        c.beginPath();
        c.ellipse(width / 2, height / 2, width * 0.35, height * 0.15, 0.2, 0, 2 * Math.PI);
        c.stroke();

        c.strokeStyle = palette.ringB;
        c.beginPath();
        c.ellipse(width / 2, height / 2, width * 0.25, height * 0.22, -0.4, 0, 2 * Math.PI);
        c.stroke();

        const radGlow = c.createRadialGradient(width / 2, height / 2, 5, width / 2, height / 2, 80);
        radGlow.addColorStop(0, palette.ringB);
        radGlow.addColorStop(0.5, palette.ringA);
        radGlow.addColorStop(1, 'transparent');
        c.fillStyle = radGlow;
        c.beginPath();
        c.arc(width / 2, height / 2, 80, 0, 2 * Math.PI);
        c.fill();

        c.fillStyle = palette.label;
        c.font = 'bold 12px Montserrat, Inter, sans-serif';
        c.textAlign = 'center';
        c.fillText('MEMORY NETWORK', width / 2, height / 2 - 4);
        c.fillStyle = palette.particleA;
        c.font = '9px monospace';
        c.fillText('visualization', width / 2, height / 2 + 10);

        if (!staticFrame) {
            rotY += 0.003;
        }

        particles.forEach((p, idx) => {
            const px = p.x * width;
            const pz = p.z * width;
            const cosY = Math.cos(rotY);
            const sinY = Math.sin(rotY);
            const rx = px * cosY - pz * sinY;
            const rz = px * sinY + pz * cosY;

            const fov = 350;
            const scale = fov / (fov + rz);
            const projX = rx * scale + width / 2;
            const projY = p.y * height * scale + height / 2;

            if (!staticFrame) {
                p.z -= p.speed / width;
                if (p.z <= 0) {
                    p.z = 1;
                    p.x = rng() * 1 - 0.5;
                    p.y = rng() * 1 - 0.5;
                }
            }

            if (projX >= 0 && projX <= width && projY >= 0 && projY <= height) {
                const radius = Math.max(0.5, scale * 2.2);
                const isActiveNode = opts.slots > 0 && idx % opts.slots === activeIndex;

                c.fillStyle = isActiveNode ? palette.active : (p.warm ? palette.particleA : palette.particleB);
                c.beginPath();
                c.arc(projX, projY, isActiveNode ? radius * 2.5 : radius, 0, 2 * Math.PI);
                c.fill();

                if (isActiveNode) {
                    c.beginPath();
                    c.arc(projX, projY, radius * 3, 0, 2 * Math.PI);
                    c.strokeStyle = palette.active;
                    c.stroke();

                    c.strokeStyle = palette.active;
                    c.lineWidth = 1;
                    c.beginPath();
                    c.moveTo(projX, projY);
                    c.lineTo(width / 2, height / 2);
                    c.stroke();
                }
            }
        });

        c.strokeStyle = palette.ringA;
        c.lineWidth = 1.5;
        c.setLineDash(staticFrame ? [] : [4, 6]);
        c.beginPath();
        c.arc(width / 2, height / 2, 110 + (staticFrame ? 0 : Math.sin(rotY * 4) * 5), 0, 2 * Math.PI);
        c.stroke();
        c.setLineDash([]);
    }

    function shouldRun(): boolean {
        return visible && docVisible && !reducedMotion;
    }

    function loop() {
        drawFrame(false);
        if (shouldRun()) rafId = requestAnimationFrame(loop);
    }

    function ensureRunning() {
        if (rafId) return;
        if (reducedMotion) {
            drawFrame(true);
            return;
        }
        if (shouldRun()) rafId = requestAnimationFrame(loop);
    }

    function stopRunning() {
        if (rafId) {
            cancelAnimationFrame(rafId);
            rafId = 0;
        }
    }

    // --- Observers ---
    let resizeObserver: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined') {
        resizeObserver = new ResizeObserver(() => resize());
        resizeObserver.observe(canvas);
    }

    let intersectionObserver: IntersectionObserver | null = null;
    if (typeof IntersectionObserver !== 'undefined') {
        intersectionObserver = new IntersectionObserver((entries) => {
            const entry = entries[entries.length - 1];
            visible = entry ? entry.isIntersecting : true;
            if (shouldRun()) ensureRunning();
            else stopRunning();
        });
        intersectionObserver.observe(canvas);
    }

    const handleVisibilityChange = () => {
        docVisible = document.visibilityState === 'visible';
        if (shouldRun()) ensureRunning();
        else stopRunning();
    };
    if (typeof document !== 'undefined') {
        document.addEventListener('visibilitychange', handleVisibilityChange);
    }

    let mutationObserver: MutationObserver | null = null;
    if (typeof MutationObserver !== 'undefined' && typeof document !== 'undefined') {
        mutationObserver = new MutationObserver(() => refreshPalette());
        mutationObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'data-theme'] });
    }

    // Initial setup.
    palette = readPalette(canvas, ctx!);
    resize();
    if (reducedMotion) {
        drawFrame(true);
    } else if (shouldRun()) {
        rafId = requestAnimationFrame(loop);
    }

    return {
        setActive(index: number) {
            activeIndex = index;
            if (reducedMotion) drawFrame(true);
        },
        setReducedMotion(on: boolean) {
            if (reducedMotion === on) return;
            reducedMotion = on;
            if (on) {
                stopRunning();
                drawFrame(true);
            } else {
                ensureRunning();
            }
        },
        destroy() {
            stopRunning();
            resizeObserver?.disconnect();
            intersectionObserver?.disconnect();
            mutationObserver?.disconnect();
            if (typeof document !== 'undefined') {
                document.removeEventListener('visibilitychange', handleVisibilityChange);
            }
        },
    };
}
