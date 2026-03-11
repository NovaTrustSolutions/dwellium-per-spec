import { createContext, useContext, useState, useCallback, useEffect, useRef, ReactNode } from 'react';
import { LayoutSettings, SnapGuide, WindowState, RegionLayout, RegionRect } from '../data/types';

const STORAGE_KEY = 'dwellium-layout-settings';

const FONT_PRESETS: Record<string, string> = {
    'Inter': "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    'JetBrains Mono': "'JetBrains Mono', 'Fira Code', monospace",
    'Roboto': "'Roboto', -apple-system, sans-serif",
    'Outfit': "'Outfit', sans-serif",
    'System': "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
};

const DEFAULT_SETTINGS: LayoutSettings = {
    fontFamily: 'Inter',
    fontScale: 1.0,
    uiScale: 1.0,
    gridSize: 32,
    margins: { top: 8, right: 8, bottom: 60, left: 8 },
    snapEnabled: true,
    snapThreshold: 16,
    snapToGrid: false,
    snapToEdges: true,
    snapToWindows: true,
    showSnapGuides: true,
    regionsEnabled: true,
    regionLayout: 'halves-h',
};

/** Compute region rectangles for a given layout and desktop dimensions */
export function getRegionRects(layout: RegionLayout, dw: number, dh: number, gap = 4): RegionRect[] {
    if (layout === 'none') return [];
    switch (layout) {
        case 'halves-h': return [
            { id: 'left', label: 'Left', x: 0, y: 0, w: Math.floor(dw / 2) - gap / 2, h: dh },
            { id: 'right', label: 'Right', x: Math.floor(dw / 2) + gap / 2, y: 0, w: dw - Math.floor(dw / 2) - gap / 2, h: dh },
        ];
        case 'halves-v': return [
            { id: 'top', label: 'Top', x: 0, y: 0, w: dw, h: Math.floor(dh / 2) - gap / 2 },
            { id: 'bottom', label: 'Bottom', x: 0, y: Math.floor(dh / 2) + gap / 2, w: dw, h: dh - Math.floor(dh / 2) - gap / 2 },
        ];
        case 'fourths-h': {
            const w4 = Math.floor((dw - 3 * gap) / 4);
            return [
                { id: 'r-q1', label: 'Q1', x: 0, y: 0, w: w4, h: dh },
                { id: 'r-q2', label: 'Q2', x: w4 + gap, y: 0, w: w4, h: dh },
                { id: 'r-q3', label: 'Q3', x: 2 * (w4 + gap), y: 0, w: w4, h: dh },
                { id: 'r-q4', label: 'Q4', x: 3 * (w4 + gap), y: 0, w: w4, h: dh },
            ];
        }
        case 'thirds-h': {
            const w3 = Math.floor(dw / 3);
            return [
                { id: 'left', label: 'Left', x: 0, y: 0, w: w3 - gap, h: dh },
                { id: 'center', label: 'Center', x: w3 + gap / 2, y: 0, w: w3 - gap, h: dh },
                { id: 'right', label: 'Right', x: 2 * w3 + gap / 2, y: 0, w: dw - 2 * w3 - gap / 2, h: dh },
            ];
        }
        case 'quadrants': {
            const hw = Math.floor(dw / 2);
            const hh = Math.floor(dh / 2);
            return [
                { id: 'tl', label: 'Top Left', x: 0, y: 0, w: hw - gap / 2, h: hh - gap / 2 },
                { id: 'tr', label: 'Top Right', x: hw + gap / 2, y: 0, w: dw - hw - gap / 2, h: hh - gap / 2 },
                { id: 'bl', label: 'Bottom Left', x: 0, y: hh + gap / 2, w: hw - gap / 2, h: dh - hh - gap / 2 },
                { id: 'br', label: 'Bottom Right', x: hw + gap / 2, y: hh + gap / 2, w: dw - hw - gap / 2, h: dh - hh - gap / 2 },
            ];
        }
        default: return [];
    }
}

interface LayoutContextValue {
    settings: LayoutSettings;
    updateSettings: (partial: Partial<LayoutSettings>) => void;
    resetSettings: () => void;
    activeGuides: SnapGuide[];
    setActiveGuides: (guides: SnapGuide[]) => void;
    computeSnap: (
        x: number, y: number, w: number, h: number,
        allWindows: WindowState[], currentId: string,
        desktopW: number, desktopH: number
    ) => { x: number; y: number; guides: SnapGuide[] };
    fontPresets: Record<string, string>;
    // Region system
    regionAssignments: Record<string, string[]>; // regionId → windowId[]
    hoveredRegionId: string | null;
    setHoveredRegionId: (id: string | null) => void;
    assignWindowToRegion: (windowId: string, regionId: string, allWindows: WindowState[]) => void;
    clearWindowRegion: (windowId: string) => void;
    setActiveRegionTab: (regionId: string, windowId: string) => void;
}

const LayoutContext = createContext<LayoutContextValue | null>(null);

export function LayoutProvider({ children }: { children: ReactNode }) {
    const [settings, setSettings] = useState<LayoutSettings>(() => {
        try {
            const saved = localStorage.getItem(STORAGE_KEY);
            if (saved) {
                return { ...DEFAULT_SETTINGS, ...JSON.parse(saved) };
            }
        } catch { /* ignore */ }
        return DEFAULT_SETTINGS;
    });

    const [activeGuides, setActiveGuides] = useState<SnapGuide[]>([]);
    const [regionAssignments, setRegionAssignments] = useState<Record<string, string[]>>({});
    const [hoveredRegionId, setHoveredRegionId] = useState<string | null>(null);
    const settingsRef = useRef(settings);
    settingsRef.current = settings;

    // Persist on change
    useEffect(() => {
        const timer = setTimeout(() => {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
        }, 300);
        return () => clearTimeout(timer);
    }, [settings]);

    // Apply CSS custom properties
    useEffect(() => {
        const root = document.documentElement;
        const fontStack = FONT_PRESETS[settings.fontFamily] || FONT_PRESETS['Inter'];
        root.style.setProperty('--font-primary', fontStack);
        root.style.setProperty('--fs-scale', String(settings.fontScale));
        root.style.setProperty('--ui-scale', String(settings.uiScale));
    }, [settings.fontFamily, settings.fontScale, settings.uiScale]);

    const updateSettings = useCallback((partial: Partial<LayoutSettings>) => {
        setSettings(prev => ({ ...prev, ...partial }));
    }, []);

    const resetSettings = useCallback(() => {
        setSettings(DEFAULT_SETTINGS);
        setRegionAssignments({});
        localStorage.removeItem(STORAGE_KEY);
    }, []);

    // --- Region assignment with tabbed grouping ---
    const assignWindowToRegion = useCallback((windowId: string, regionId: string, _allWindows: WindowState[]) => {
        setRegionAssignments(prev => {
            const next = { ...prev };

            // Remove windowId from any existing region
            for (const rId of Object.keys(next)) {
                const arr = next[rId];
                if (arr) {
                    const idx = arr.indexOf(windowId);
                    if (idx >= 0) {
                        next[rId] = [...arr.slice(0, idx), ...arr.slice(idx + 1)];
                        if (next[rId].length === 0) delete next[rId];
                    }
                }
            }

            // Add windowId to target region (make it the active tab → index 0)
            const existing = next[regionId] || [];
            next[regionId] = [windowId, ...existing];
            return next;
        });
    }, []);

    const clearWindowRegion = useCallback((windowId: string) => {
        setRegionAssignments(prev => {
            const next = { ...prev };
            for (const key of Object.keys(next)) {
                const arr = next[key];
                if (arr) {
                    const idx = arr.indexOf(windowId);
                    if (idx >= 0) {
                        next[key] = [...arr.slice(0, idx), ...arr.slice(idx + 1)];
                        if (next[key].length === 0) delete next[key];
                    }
                }
            }
            return next;
        });
    }, []);

    const setActiveRegionTab = useCallback((regionId: string, windowId: string) => {
        setRegionAssignments(prev => {
            const arr = prev[regionId];
            if (!arr || !arr.includes(windowId)) return prev;
            // Move windowId to index 0 (active tab)
            return { ...prev, [regionId]: [windowId, ...arr.filter(id => id !== windowId)] };
        });
    }, []);

    // Clear assignments when regions are disabled
    useEffect(() => {
        if (!settings.regionsEnabled) {
            setRegionAssignments({});
        }
    }, [settings.regionsEnabled]);

    const computeSnap = useCallback((
        x: number, y: number, w: number, h: number,
        allWindows: WindowState[], currentId: string,
        desktopW: number, desktopH: number
    ): { x: number; y: number; guides: SnapGuide[] } => {
        const s = settingsRef.current;
        if (!s.snapEnabled) return { x, y, guides: [] };

        const threshold = s.snapThreshold;
        const guides: SnapGuide[] = [];
        let snappedX = x;
        let snappedY = y;
        let closestDx = threshold + 1;
        let closestDy = threshold + 1;

        // Build candidate snap lines
        const xCandidates: { pos: number; type: SnapGuide['type'] }[] = [];
        const yCandidates: { pos: number; type: SnapGuide['type'] }[] = [];

        // Desktop edges + margin edges
        if (s.snapToEdges) {
            xCandidates.push(
                { pos: 0, type: 'edge' },
                { pos: desktopW, type: 'edge' },
                { pos: s.margins.left, type: 'margin' },
                { pos: desktopW - s.margins.right, type: 'margin' },
            );
            yCandidates.push(
                { pos: 0, type: 'edge' },
                { pos: desktopH, type: 'edge' },
                { pos: s.margins.top, type: 'margin' },
                { pos: desktopH - s.margins.bottom, type: 'margin' },
            );
        }

        // Other window edges
        if (s.snapToWindows) {
            for (const win of allWindows) {
                if (win.id === currentId || win.minimized || win.maximized) continue;
                xCandidates.push(
                    { pos: win.x, type: 'window' },
                    { pos: win.x + win.width, type: 'window' },
                );
                yCandidates.push(
                    { pos: win.y, type: 'window' },
                    { pos: win.y + win.height, type: 'window' },
                );
            }
        }

        // Grid lines
        if (s.snapToGrid && s.gridSize > 0) {
            const gx = s.gridSize;
            for (let gp = 0; gp <= desktopW; gp += gx) {
                xCandidates.push({ pos: gp, type: 'grid' });
            }
            for (let gp = 0; gp <= desktopH; gp += gx) {
                yCandidates.push({ pos: gp, type: 'grid' });
            }
        }

        // Window edges to test: left, right for X; top, bottom for Y
        const windowLeftEdge = x;
        const windowRightEdge = x + w;
        const windowCenterX = x + w / 2;
        const windowTopEdge = y;
        const windowBottomEdge = y + h;
        const windowCenterY = y + h / 2;

        // Snap X
        for (const cand of xCandidates) {
            // Snap left edge
            const dLeft = Math.abs(windowLeftEdge - cand.pos);
            if (dLeft < closestDx) {
                closestDx = dLeft;
                snappedX = cand.pos;
            }
            // Snap right edge
            const dRight = Math.abs(windowRightEdge - cand.pos);
            if (dRight < closestDx) {
                closestDx = dRight;
                snappedX = cand.pos - w;
            }
            // Snap center X
            const dCenter = Math.abs(windowCenterX - cand.pos);
            if (dCenter < closestDx) {
                closestDx = dCenter;
                snappedX = cand.pos - w / 2;
            }
        }

        // Snap Y
        for (const cand of yCandidates) {
            const dTop = Math.abs(windowTopEdge - cand.pos);
            if (dTop < closestDy) {
                closestDy = dTop;
                snappedY = cand.pos;
            }
            const dBottom = Math.abs(windowBottomEdge - cand.pos);
            if (dBottom < closestDy) {
                closestDy = dBottom;
                snappedY = cand.pos - h;
            }
            const dCenter = Math.abs(windowCenterY - cand.pos);
            if (dCenter < closestDy) {
                closestDy = dCenter;
                snappedY = cand.pos - h / 2;
            }
        }

        // Determine which guides to show
        if (s.showSnapGuides) {
            if (closestDx <= threshold) {
                // Find matching snap x lines
                const snappedLeftEdge = snappedX;
                const snappedRightEdge = snappedX + w;
                for (const cand of xCandidates) {
                    if (Math.abs(cand.pos - snappedLeftEdge) < 1 || Math.abs(cand.pos - snappedRightEdge) < 1) {
                        guides.push({ axis: 'x', position: cand.pos, type: cand.type });
                    }
                }
            } else {
                snappedX = x; // no snap
            }

            if (closestDy <= threshold) {
                const snappedTopEdge = snappedY;
                const snappedBottomEdge = snappedY + h;
                for (const cand of yCandidates) {
                    if (Math.abs(cand.pos - snappedTopEdge) < 1 || Math.abs(cand.pos - snappedBottomEdge) < 1) {
                        guides.push({ axis: 'y', position: cand.pos, type: cand.type });
                    }
                }
            } else {
                snappedY = y; // no snap
            }
        } else {
            if (closestDx > threshold) snappedX = x;
            if (closestDy > threshold) snappedY = y;
        }

        return { x: snappedX, y: snappedY, guides };
    }, []);

    return (
        <LayoutContext.Provider value={{
            settings, updateSettings, resetSettings,
            activeGuides, setActiveGuides,
            computeSnap, fontPresets: FONT_PRESETS,
            regionAssignments, hoveredRegionId, setHoveredRegionId,
            assignWindowToRegion, clearWindowRegion, setActiveRegionTab,
        }}>
            {children}
        </LayoutContext.Provider>
    );
}

export function useLayout() {
    const ctx = useContext(LayoutContext);
    if (!ctx) throw new Error('useLayout must be used within LayoutProvider');
    return ctx;
}
