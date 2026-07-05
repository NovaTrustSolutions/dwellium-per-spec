/**
 * FluidOS — the "Fluid OS" alternate interface layout for Dwellium (2026-07-04).
 *
 * Third interchangeable layout over the SAME Dwellium features (Classic
 * windowed desktop + Holocron OS launcher shell being the other two). Fluid
 * OS is navigated through fluid, physics-driven motion — full-bleed "swap
 * stream" focus cards, drag-to-swap with inertia, liquid canvas backdrop —
 * inspired by the MOTION LANGUAGE of EverSwap (built by Lusion): no assets,
 * text, or code copied from that site, this is an original implementation.
 *
 * 🔴 ALL WIDGETS ACCESSIBLE: the catalog is driven directly by WIDGET_REGISTRY
 * (same pattern as HalocronOS.tsx:245-260) — every registered widget appears,
 * and `restrictedToEmails` entries (e.g. the Andy-only Audit Log) are hidden
 * from non-matching accounts. Cosmetic filtering only; the widget itself
 * still hard-gates server-side.
 *
 * Navigation model: widgets are grouped into CATEGORY "streams" (core / ai /
 * filing / tools / other). One category is in focus at a time as a full-bleed
 * band. Horizontal drag/wheel/arrow-left-right flows between APPS within the
 * focused category (inertial spring). Vertical drag/arrow-up-down swaps
 * CATEGORIES. Click/Enter opens the focused app via the shared `openWindow`
 * contract and collapses the shell (open=false), exactly like Holocron.
 *
 * A11y: full keyboard nav (arrows + Enter + `/` search + Escape), aria-labels
 * on every card, and `prefers-reduced-motion: reduce` degrades springs to
 * instant snaps + a static canvas gradient (see useReducedMotion + the canvas
 * effect below).
 */
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, useContext } from 'react';
import { WIDGET_REGISTRY } from '../../registry/widgetRegistry';
import { getIcon } from '../Sidebar/iconMap';
import { fluidOsStore } from '../../lib/fluidOsStore';
import { useWindows } from '../../context/WindowContext';
import { UserContext } from '../../context/UserContext';
import './FluidOS.css';

type CategoryId = 'core' | 'ai' | 'filing' | 'tools' | 'other';
const CATEGORY_ORDER: CategoryId[] = ['core', 'ai', 'filing', 'tools', 'other'];
const CATEGORY_LABEL: Record<CategoryId, string> = {
    core: 'Core', ai: 'AI Tools', filing: 'Filing Cabinet', tools: 'Tools & Utilities', other: 'Archive',
};

interface FluidCard {
    id: string;
    label: string;
    icon: string;
    category: CategoryId;
}

/** Critically-damped spring integrator (rAF-driven). No framer-motion — a
 *  tiny, dependency-free physics util tuned for a "liquid" swap feel: fast
 *  settle, minimal overshoot. `stiffness`/`damping` picked empirically for a
 *  ~280ms perceived settle at the drag-release velocities this UI produces. */
class Spring {
    value: number;
    velocity: number;
    target: number;
    stiffness: number;
    damping: number;
    constructor(initial: number, stiffness = 210, damping = 26) {
        this.value = initial;
        this.velocity = 0;
        this.target = initial;
        this.stiffness = stiffness;
        this.damping = damping;
    }
    set(target: number, velocity = 0): void {
        this.target = target;
        this.velocity += velocity;
    }
    /** Snap immediately (reduced-motion path). */
    snap(target: number): void {
        this.value = target;
        this.target = target;
        this.velocity = 0;
    }
    /** Advance by dt seconds. Returns true while still settling. */
    step(dt: number): boolean {
        const dtClamped = Math.min(dt, 1 / 30);
        const force = -this.stiffness * (this.value - this.target);
        const damping = -this.damping * this.velocity;
        const accel = force + damping;
        this.velocity += accel * dtClamped;
        this.value += this.velocity * dtClamped;
        return Math.abs(this.velocity) > 0.02 || Math.abs(this.value - this.target) > 0.02;
    }
}

function useReducedMotion(): boolean {
    const [reduced, setReduced] = useState(() =>
        typeof window !== 'undefined' && typeof window.matchMedia === 'function'
            ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
            : false);
    useEffect(() => {
        if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
        const mql = window.matchMedia('(prefers-reduced-motion: reduce)');
        const onChange = () => setReduced(mql.matches);
        mql.addEventListener?.('change', onChange);
        return () => mql.removeEventListener?.('change', onChange);
    }, []);
    return reduced;
}

/** Lightweight canvas "liquid" backdrop: a handful of soft radial blobs drift
 *  and react to pointer velocity + a "kick" fired on every swap. 2D canvas
 *  only (no WebGL/shader, no new deps). Pauses entirely when `active` is
 *  false (shell closed / tab hidden) — no leaked rAF loop. Reduced-motion
 *  renders one static frame and never starts the loop. */
function useLiquidCanvas(
    canvasRef: React.RefObject<HTMLCanvasElement | null>,
    active: boolean,
    reducedMotion: boolean,
    kickRef: React.MutableRefObject<number>,
) {
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas || !active) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        let raf = 0;
        let alive = true;
        const blobs = Array.from({ length: 5 }, (_, i) => ({
            x: Math.random(),
            y: Math.random(),
            r: 0.18 + Math.random() * 0.16,
            vx: (Math.random() - 0.5) * 0.02,
            vy: (Math.random() - 0.5) * 0.02,
            hue: i % 2 === 0 ? 74 : 210, // acid-lime-ish vs cool accent
        }));
        let pointerVx = 0;
        let pointerVy = 0;
        let lastPX = 0.5;
        let lastPY = 0.5;

        const resize = () => {
            const dpr = Math.min(window.devicePixelRatio || 1, 2);
            canvas.width = canvas.clientWidth * dpr;
            canvas.height = canvas.clientHeight * dpr;
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        };
        resize();
        window.addEventListener('resize', resize);

        const onPointerMove = (e: PointerEvent) => {
            const rect = canvas.getBoundingClientRect();
            if (!rect.width || !rect.height) return;
            const px = (e.clientX - rect.left) / rect.width;
            const py = (e.clientY - rect.top) / rect.height;
            pointerVx = px - lastPX;
            pointerVy = py - lastPY;
            lastPX = px;
            lastPY = py;
        };
        window.addEventListener('pointermove', onPointerMove);

        const draw = (w: number, h: number) => {
            ctx.clearRect(0, 0, w, h);
            ctx.fillStyle = '#000000';
            ctx.fillRect(0, 0, w, h);
            for (const b of blobs) {
                const cx = b.x * w;
                const cy = b.y * h;
                const r = b.r * Math.max(w, h) * (1 + Math.min(kickRef.current, 0.4));
                const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
                const alpha = 0.14 + Math.min(kickRef.current, 0.3);
                grad.addColorStop(0, `hsla(${b.hue}, 90%, 60%, ${alpha})`);
                grad.addColorStop(1, 'hsla(0, 0%, 0%, 0)');
                ctx.fillStyle = grad;
                ctx.beginPath();
                ctx.arc(cx, cy, r, 0, Math.PI * 2);
                ctx.fill();
            }
        };

        if (reducedMotion) {
            // Static single frame — no loop, no pointer reactivity.
            draw(canvas.clientWidth, canvas.clientHeight);
            return () => {
                window.removeEventListener('resize', resize);
                window.removeEventListener('pointermove', onPointerMove);
            };
        }

        let last = performance.now();
        const loop = (now: number) => {
            if (!alive) return;
            const dt = Math.min((now - last) / 1000, 1 / 30);
            last = now;
            kickRef.current = Math.max(0, kickRef.current - dt * 0.6);
            for (const b of blobs) {
                b.x += b.vx * dt + pointerVx * 0.03;
                b.y += b.vy * dt + pointerVy * 0.03;
                if (b.x < -0.2 || b.x > 1.2) b.vx *= -1;
                if (b.y < -0.2 || b.y > 1.2) b.vy *= -1;
                b.x = Math.min(1.2, Math.max(-0.2, b.x));
                b.y = Math.min(1.2, Math.max(-0.2, b.y));
            }
            pointerVx *= 0.9;
            pointerVy *= 0.9;
            draw(canvas.clientWidth, canvas.clientHeight);
            raf = requestAnimationFrame(loop);
        };
        raf = requestAnimationFrame(loop);

        return () => {
            alive = false;
            if (raf) cancelAnimationFrame(raf);
            window.removeEventListener('resize', resize);
            window.removeEventListener('pointermove', onPointerMove);
        };
    }, [canvasRef, active, reducedMotion, kickRef]);
}

/** Drives a single numeric value toward `target` via the Spring integrator on
 *  an rAF loop — this IS the "liquid" swap feel (fast settle, tiny overshoot)
 *  instead of a canned CSS easing curve. The loop only runs while unsettled
 *  and tears itself down completely when either the value has settled or
 *  `active` goes false (shell closed) — no leaked rAF after unmount/close.
 *  Reduced-motion snaps instantly and never starts the loop. */
function useSpringValue(target: number, active: boolean, reducedMotion: boolean): number {
    const springRef = useRef<Spring | null>(null);
    if (!springRef.current) springRef.current = new Spring(target);
    const [value, setValue] = useState(() => springRef.current!.value);

    useEffect(() => {
        const spring = springRef.current!;
        if (reducedMotion || !active) {
            spring.snap(target);
            setValue(spring.value);
            return;
        }
        spring.set(target);
        let raf = 0;
        let last = performance.now();
        const loop = (now: number) => {
            const dt = (now - last) / 1000;
            last = now;
            const stillMoving = spring.step(dt);
            setValue(spring.value);
            if (stillMoving) raf = requestAnimationFrame(loop);
        };
        raf = requestAnimationFrame(loop);
        return () => { if (raf) cancelAnimationFrame(raf); };
    }, [target, active, reducedMotion]);

    return value;
}

export default function FluidOS() {
    const state = useSyncExternalStore(fluidOsStore.subscribe, fluidOsStore.getSnapshot, fluidOsStore.getServerSnapshot);
    const { openWindow } = useWindows();
    const reducedMotion = useReducedMotion();

    // Signed-in email for catalog visibility (restricted widgets — e.g. the
    // Andy-only Audit Log — are hidden from everyone else's stream), same
    // gating pattern as HalocronOS.tsx:245-260.
    const catalogUser = useContext(UserContext)?.user;
    const catalogEmail = catalogUser?.email?.trim().toLowerCase() ?? '';

    const cardsByCategory = useMemo(() => {
        const out: Record<CategoryId, FluidCard[]> = { core: [], ai: [], filing: [], tools: [], other: [] };
        Object.values(WIDGET_REGISTRY).forEach((w) => {
            if (w.restrictedToEmails && !w.restrictedToEmails.includes(catalogEmail)) return;
            const cat: CategoryId = (w.category && (CATEGORY_ORDER as string[]).includes(w.category)) ? (w.category as CategoryId) : 'other';
            out[cat].push({ id: w.id, label: w.label, icon: w.icon, category: cat });
        });
        (Object.keys(out) as CategoryId[]).forEach((cat) => out[cat].sort((a, b) => a.label.localeCompare(b.label)));
        return out;
    }, [catalogEmail]);

    const activeCategories = useMemo(() => CATEGORY_ORDER.filter((c) => cardsByCategory[c].length > 0), [cardsByCategory]);
    const totalWidgets = useMemo(() => activeCategories.reduce((n, c) => n + cardsByCategory[c].length, 0), [activeCategories, cardsByCategory]);

    const [categoryIdx, setCategoryIdx] = useState(0);
    const [appIdx, setAppIdx] = useState(0);
    const [query, setQuery] = useState('');
    const searchRef = useRef<HTMLInputElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const kickRef = useRef(0);

    // Flat filtered view for search mode; otherwise the swap-stream view.
    const q = query.trim().toLowerCase();
    const searching = q.length > 0;
    const flatFiltered = useMemo(() => {
        if (!searching) return [];
        const flat: FluidCard[] = [];
        activeCategories.forEach((c) => flat.push(...cardsByCategory[c]));
        return flat.filter((c) => c.label.toLowerCase().includes(q));
    }, [searching, q, activeCategories, cardsByCategory]);

    const currentCategory = activeCategories[Math.min(categoryIdx, Math.max(activeCategories.length - 1, 0))];
    const currentApps = currentCategory ? cardsByCategory[currentCategory] : [];
    const clampedAppIdx = currentApps.length ? Math.min(appIdx, currentApps.length - 1) : 0;
    const focusedCard = currentApps[clampedAppIdx];

    useLiquidCanvas(canvasRef, state.enabled && state.open, reducedMotion, kickRef);
    // The spring settles toward the discrete focused index — the visible
    // "melt/flow" between cards is this continuous value catching up to the
    // target, not a CSS transition on the index jump.
    const springAppIdx = useSpringValue(clampedAppIdx, state.enabled && state.open, reducedMotion);

    const collapseToWindow = useCallback((id: string, label: string) => {
        const w = WIDGET_REGISTRY[id];
        openWindow(id, label, w?.icon ?? '');
        fluidOsStore.setOpen(false);
    }, [openWindow]);

    const swapApp = useCallback((delta: 1 | -1) => {
        if (!currentApps.length) return;
        kickRef.current = Math.min(1, kickRef.current + 0.5);
        setAppIdx((i) => (i + delta + currentApps.length) % currentApps.length);
    }, [currentApps.length]);

    const swapCategory = useCallback((delta: 1 | -1) => {
        if (!activeCategories.length) return;
        kickRef.current = Math.min(1, kickRef.current + 0.5);
        setCategoryIdx((i) => (i + delta + activeCategories.length) % activeCategories.length);
        setAppIdx(0);
    }, [activeCategories.length]);

    // Drag/pointer inertial swap: horizontal drag = app swap, vertical = category swap.
    const dragRef = useRef<{ startX: number; startY: number; dragging: boolean } | null>(null);
    const onPointerDown = (e: React.PointerEvent) => {
        dragRef.current = { startX: e.clientX, startY: e.clientY, dragging: true };
    };
    const onPointerUp = (e: React.PointerEvent) => {
        const d = dragRef.current;
        dragRef.current = null;
        if (!d || !d.dragging) return;
        const dx = e.clientX - d.startX;
        const dy = e.clientY - d.startY;
        const THRESHOLD = 60;
        if (Math.abs(dx) > Math.abs(dy)) {
            if (dx > THRESHOLD) swapApp(-1);
            else if (dx < -THRESHOLD) swapApp(1);
        } else {
            if (dy > THRESHOLD) swapCategory(-1);
            else if (dy < -THRESHOLD) swapCategory(1);
        }
    };

    const wheelAccumRef = useRef(0);
    const onWheel = (e: React.WheelEvent) => {
        wheelAccumRef.current += e.deltaX !== 0 ? e.deltaX : e.deltaY;
        const WHEEL_THRESHOLD = 80;
        if (wheelAccumRef.current > WHEEL_THRESHOLD) {
            wheelAccumRef.current = 0;
            if (e.deltaX !== 0) swapApp(1); else swapCategory(1);
        } else if (wheelAccumRef.current < -WHEEL_THRESHOLD) {
            wheelAccumRef.current = 0;
            if (e.deltaX !== 0) swapApp(-1); else swapCategory(-1);
        }
    };

    // Keyboard nav: arrows swap, Enter opens the focused card, `/` focuses
    // search, Escape closes the shell (search first, then the whole shell).
    useEffect(() => {
        if (!state.enabled || !state.open) return;
        const onKey = (e: KeyboardEvent) => {
            const isSearchFocused = document.activeElement === searchRef.current;
            if (e.key === '/' && !isSearchFocused) {
                e.preventDefault();
                searchRef.current?.focus();
                return;
            }
            if (e.key === 'Escape') {
                if (isSearchFocused && query) {
                    setQuery('');
                    return;
                }
                if (isSearchFocused) {
                    searchRef.current?.blur();
                    return;
                }
                fluidOsStore.setOpen(false);
                return;
            }
            if (isSearchFocused) return;
            if (e.key === 'ArrowRight') { e.preventDefault(); swapApp(1); }
            else if (e.key === 'ArrowLeft') { e.preventDefault(); swapApp(-1); }
            else if (e.key === 'ArrowDown') { e.preventDefault(); swapCategory(1); }
            else if (e.key === 'ArrowUp') { e.preventDefault(); swapCategory(-1); }
            else if (e.key === 'Enter' && focusedCard) { e.preventDefault(); collapseToWindow(focusedCard.id, focusedCard.label); }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [state.enabled, state.open, query, focusedCard, swapApp, swapCategory, collapseToWindow]);

    if (!state.enabled || !state.open) return null;

    const greeting = (() => {
        const h = new Date().getHours();
        return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
    })();
    const greetingName = (() => {
        const rawName = catalogUser?.name?.trim() ?? '';
        const first = rawName.split(/\s+/).filter(Boolean)[0];
        if (first) return first;
        const emailName = catalogEmail.split('@')[0]?.split(/[._+-]/).filter(Boolean)[0];
        return emailName ? emailName.charAt(0).toUpperCase() + emailName.slice(1) : 'there';
    })();

    return (
        <div
            className={`fos ${reducedMotion ? 'fos--reduced-motion' : ''}`}
            role="dialog"
            aria-label="Fluid OS"
            onPointerDown={onPointerDown}
            onPointerUp={onPointerUp}
            onWheel={onWheel}
        >
            <canvas ref={canvasRef} className="fos-canvas" aria-hidden="true" />

            <header className="fos-head">
                <div className="fos-brand"><span className="fos-brand__drop" aria-hidden="true" /> Fluid OS</div>
                <h1 className="fos-greet">{greeting}, {greetingName}.</h1>
                <p className="fos-sub">{totalWidgets} apps · {activeCategories.length} streams</p>
                <div className="fos-search-wrap">
                    <input
                        ref={searchRef}
                        className="fos-search"
                        placeholder="Search everything… ( / )"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        aria-label="Search widgets"
                    />
                </div>
                <button
                    type="button"
                    className="fos-min"
                    onClick={() => fluidOsStore.setOpen(false)}
                    aria-label="Minimize Fluid OS"
                >
                    Minimize
                </button>
            </header>

            {searching ? (
                <div className="fos-search-results">
                    {flatFiltered.length === 0 && <p className="fos-sub">No matches.</p>}
                    <div className="fos-grid">
                        {flatFiltered.map((w) => {
                            const Icon = getIcon(w.icon);
                            return (
                                <button
                                    key={w.id}
                                    type="button"
                                    className="fos-card fos-card--grid"
                                    onClick={() => collapseToWindow(w.id, w.label)}
                                    aria-label={`Open ${w.label}`}
                                >
                                    <span className="fos-card__icon">{Icon ? <Icon size={22} /> : '◈'}</span>
                                    <span className="fos-card__label">{w.label}</span>
                                    <span className="fos-card__chip">{CATEGORY_LABEL[w.category]}</span>
                                </button>
                            );
                        })}
                    </div>
                </div>
            ) : (
                <div className="fos-stream" data-testid="fluid-stream" data-category={currentCategory ?? ''}>
                    <div className="fos-stream__chip">{currentCategory ? CATEGORY_LABEL[currentCategory] : 'Archive'}</div>
                    <div className="fos-stream__track">
                        {currentApps.map((w, i) => {
                            const Icon = getIcon(w.icon);
                            const offset = i - springAppIdx;
                            const isFocused = i === clampedAppIdx;
                            if (Math.abs(offset) > 2.5) return null;
                            return (
                                <button
                                    key={w.id}
                                    type="button"
                                    className={`fos-card ${isFocused ? 'fos-card--focus' : 'fos-card--side'}`}
                                    style={{ '--fos-offset': offset } as React.CSSProperties}
                                    onClick={() => (isFocused ? collapseToWindow(w.id, w.label) : setAppIdx(i))}
                                    aria-label={isFocused ? `Open ${w.label}` : `Focus ${w.label}`}
                                    aria-current={isFocused}
                                >
                                    <span className="fos-card__icon">{Icon ? <Icon size={28} /> : '◈'}</span>
                                    <span className="fos-card__label">{w.label}</span>
                                </button>
                            );
                        })}
                    </div>
                    <div className="fos-stream__dots" role="tablist" aria-label="Streams">
                        {activeCategories.map((c, i) => (
                            <button
                                key={c}
                                type="button"
                                className={`fos-dot ${i === categoryIdx ? 'on' : ''}`}
                                onClick={() => { setCategoryIdx(i); setAppIdx(0); }}
                                aria-label={`Switch to ${CATEGORY_LABEL[c]} stream`}
                                aria-selected={i === categoryIdx}
                                role="tab"
                            />
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
