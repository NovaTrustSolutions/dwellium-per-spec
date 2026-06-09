import { createContext, useContext, useCallback, useEffect, useSyncExternalStore, ReactNode } from 'react';
import { Theme, FontPairing } from '../data/types';
import { createLocalStorageStore } from '../utils/createLocalStorageStore';

// ============================================
// FONT PAIRING DEFINITIONS
// ============================================

export interface FontPairingDef {
    id: FontPairing;
    name: string;
    personality: string;
    headings: string;
    body: string;
    mono: string;
    weights: string;
    /** CSS value for --font-heading */
    headingStack: string;
    /** CSS value for --font-primary */
    bodyStack: string;
    /** CSS value for --font-mono */
    monoStack: string;
}

export const FONT_PAIRINGS: FontPairingDef[] = [
    {
        id: 'default',
        name: 'System Default',
        personality: 'Clean, scalable, professional',
        headings: 'Inter',
        body: 'Inter',
        mono: 'JetBrains Mono',
        weights: '400 · 500 · 600 · 700',
        headingStack: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
        bodyStack: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
        monoStack: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace",
    },
    {
        id: 'modern',
        name: 'Modern / Tech',
        personality: 'Clean, scalable, professional',
        headings: 'Inter',
        body: 'Roboto',
        mono: 'JetBrains Mono',
        weights: '400 · 600 · 700',
        headingStack: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
        bodyStack: "'Roboto', 'Inter', system-ui, sans-serif",
        monoStack: "'JetBrains Mono', 'Fira Code', monospace",
    },
    {
        id: 'elegant',
        name: 'Elegant / Luxury',
        personality: 'Sophisticated, high-contrast, editorial',
        headings: 'Playfair Display',
        body: 'Montserrat',
        mono: 'Cormorant Garamond',
        weights: '300 · 400 · 700',
        headingStack: "'Playfair Display', 'Georgia', serif",
        bodyStack: "'Montserrat', 'Helvetica Neue', sans-serif",
        monoStack: "'Cormorant Garamond', 'Georgia', serif",
    },
    {
        id: 'friendly',
        name: 'Friendly / Consumer',
        personality: 'Approachable, balanced, warm',
        headings: 'Poppins',
        body: 'Open Sans',
        mono: 'Nunito',
        weights: '400 · 600 · 800',
        headingStack: "'Poppins', 'Nunito', sans-serif",
        bodyStack: "'Open Sans', 'Lato', sans-serif",
        monoStack: "'JetBrains Mono', 'Fira Code', monospace",
    },
    {
        id: 'brutalist',
        name: 'Brutalist / Bold',
        personality: 'Raw, technical, unconventional',
        headings: 'Space Grotesk',
        body: 'IBM Plex Sans',
        mono: 'JetBrains Mono',
        weights: '400 · 700',
        headingStack: "'Space Grotesk', 'Work Sans', sans-serif",
        bodyStack: "'IBM Plex Sans', 'Work Sans', sans-serif",
        monoStack: "'JetBrains Mono', 'IBM Plex Mono', monospace",
    },
    {
        id: 'editorial',
        name: 'Editorial / Content',
        personality: 'Readable, trustworthy, classic',
        headings: 'Merriweather',
        body: 'Source Sans 3',
        mono: 'Lora',
        weights: '300 · 400 · 700 · 900',
        headingStack: "'Merriweather', 'Lora', 'Georgia', serif",
        bodyStack: "'Source Sans 3', 'Raleway', sans-serif",
        monoStack: "'Lora', 'Georgia', serif",
    },
];

// ============================================
// CONTEXT
// ============================================

interface ThemeContextValue {
    theme: Theme;
    fontPairing: FontPairing;
    accentColor: string;
    animationsEnabled: boolean;
    toggleTheme: () => void;
    setTheme: (theme: Theme) => void;
    setFontPairing: (fp: FontPairing) => void;
    setAccentColor: (color: string) => void;
    setAnimationsEnabled: (enabled: boolean) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

const ACCENT_STORAGE_KEY = 'dwellium-accent-color';
const THEME_STORAGE_KEY = 'dwellium-theme';
const FONT_STORAGE_KEY = 'dwellium-font-pairing';
const ANIMATIONS_STORAGE_KEY = 'dwellium-animations';
const LEGACY_ACCENT_STORAGE_KEY = 'qualia-accent-color';
const LEGACY_THEME_STORAGE_KEY = 'qualia-theme';

// ============================================
// SSR-SAFE EXTERNAL STORES (Phase-8+ Task 8.9 PROVIDER-SSR-REMEDIATION)
// ============================================
// Migrated from useState lazy initializers (fired during render and threw
// ReferenceError on SSR) to useSyncExternalStore + getServerSnapshot per
// Cowork Verdict 3 LOCK at Task 8.9 PRE0. getServerSnapshot returns each
// store's default value; the app/root.tsx::Layout FOUC IIFE sets
// <html className="theme-{value}"> BEFORE hydration so server-rendered
// HTML matches IIFE-set className by construction (no hydration mismatch).
// Exported for unit test access at src/test/appfolioParity/.

export const themeStore = createLocalStorageStore<Theme>(
    () => (
        (localStorage.getItem(THEME_STORAGE_KEY) as Theme) ||
        (localStorage.getItem(LEGACY_THEME_STORAGE_KEY) as Theme) ||
        'dark'
    ),
    'dark',
);

export const fontPairingStore = createLocalStorageStore<FontPairing>(
    () => (localStorage.getItem(FONT_STORAGE_KEY) as FontPairing) || 'default',
    'default',
);

export const accentColorStore = createLocalStorageStore<string>(
    () => (
        localStorage.getItem(ACCENT_STORAGE_KEY) ||
        localStorage.getItem(LEGACY_ACCENT_STORAGE_KEY) ||
        '#0088cc'
    ),
    '#0088cc',
);

export const animationsEnabledStore = createLocalStorageStore<boolean>(
    () => {
        const stored = localStorage.getItem(ANIMATIONS_STORAGE_KEY);
        return stored !== null ? stored === 'true' : true;
    },
    true,
);

// ============================================
// THEME REGISTRY — Dwellium built-ins + the v3 "Master Pack" (themes-master.css)
// ============================================

export interface ThemeDef { id: Theme; label: string; group: 'Dwellium' | 'Master Pack'; bg: string; accent: string; }

/** Master-pack ids (theme-{id} classes); used to toggle the ambient cursor-glow. */
export const MASTER_THEME_IDS: Theme[] = ['cosmos', 'deep-dark', 'simple-black', 'cyberpunk', 'synthwave', 'solarized', 'rose-pine', 'mocha', 'dracula', 'obsidian', 'tokyo-night', 'gruvbox', 'apple-dark', 'nord', 'latte', 'corporate'];

export const THEMES: ThemeDef[] = [
    { id: 'dark', label: 'Dwellium Dark', group: 'Dwellium', bg: '#000000', accent: '#D6FE51' },
    { id: 'light', label: 'Dwellium Light', group: 'Dwellium', bg: '#e8ecf1', accent: '#0369a1' },
    { id: 'trust', label: 'Trust', group: 'Dwellium', bg: '#f4f6fb', accent: '#0369a1' },
    { id: 'vibrant', label: 'Vibrant', group: 'Dwellium', bg: '#0f1020', accent: '#6366f1' },
    { id: 'luxury', label: 'Luxury', group: 'Dwellium', bg: '#1a1714', accent: '#ca8a04' },
    { id: 'healthcare', label: 'Healthcare', group: 'Dwellium', bg: '#f0f7f5', accent: '#0ea5a4' },
    { id: 'creative', label: 'Creative', group: 'Dwellium', bg: '#150f1f', accent: '#a855f7' },
    { id: 'dark-excellence', label: 'Dark Excellence', group: 'Dwellium', bg: '#08080c', accent: '#D6FE51' },
    { id: 'cosmos', label: 'Cosmos', group: 'Master Pack', bg: '#08081a', accent: '#4d8aff' },
    { id: 'deep-dark', label: 'Deep Dark', group: 'Master Pack', bg: '#030305', accent: '#4d82ff' },
    { id: 'simple-black', label: 'Simple Black', group: 'Master Pack', bg: '#000000', accent: '#3b82f6' },
    { id: 'cyberpunk', label: 'Cyberpunk', group: 'Master Pack', bg: '#060606', accent: '#f5e642' },
    { id: 'synthwave', label: 'Synthwave', group: 'Master Pack', bg: '#040d1a', accent: '#ff00aa' },
    { id: 'solarized', label: 'Solarized', group: 'Master Pack', bg: '#002b36', accent: '#268bd2' },
    { id: 'rose-pine', label: 'Rosé Pine', group: 'Master Pack', bg: '#191724', accent: '#c4a7e7' },
    { id: 'mocha', label: 'Mocha', group: 'Master Pack', bg: '#1e1e2e', accent: '#89b4fa' },
    { id: 'dracula', label: 'Dracula', group: 'Master Pack', bg: '#1e1f29', accent: '#6272a4' },
    { id: 'obsidian', label: 'Obsidian', group: 'Master Pack', bg: '#0a0a0f', accent: '#479ffa' },
    { id: 'tokyo-night', label: 'Tokyo Night', group: 'Master Pack', bg: '#1a1b2e', accent: '#7aa2f7' },
    { id: 'gruvbox', label: 'Gruvbox', group: 'Master Pack', bg: '#282828', accent: '#83a598' },
    { id: 'apple-dark', label: 'Apple Dark', group: 'Master Pack', bg: '#1c1c1e', accent: '#0a84ff' },
    { id: 'nord', label: 'Nord', group: 'Master Pack', bg: '#2e3440', accent: '#81a1c1' },
    { id: 'latte', label: 'Latte', group: 'Master Pack', bg: '#ede8ff', accent: '#6d28d9' },
    { id: 'corporate', label: 'Corporate', group: 'Master Pack', bg: '#f4f5f7', accent: '#0070c9' },
];

export const CUSTOM_TOKENS_KEY = 'dwellium-custom-tokens';

export function ThemeProvider({ children }: { children: ReactNode }) {
    const theme = useSyncExternalStore(themeStore.subscribe, themeStore.getSnapshot, themeStore.getServerSnapshot);
    const fontPairing = useSyncExternalStore(fontPairingStore.subscribe, fontPairingStore.getSnapshot, fontPairingStore.getServerSnapshot);
    const accentColor = useSyncExternalStore(accentColorStore.subscribe, accentColorStore.getSnapshot, accentColorStore.getServerSnapshot);
    const animationsEnabled = useSyncExternalStore(animationsEnabledStore.subscribe, animationsEnabledStore.getSnapshot, animationsEnabledStore.getServerSnapshot);

    const toggleTheme = useCallback(() => {
        document.body.classList.add('transitioning');
        const next: Theme = themeStore.getSnapshot() === 'dark' ? 'light' : 'dark';
        themeStore.set(next, () => localStorage.setItem(THEME_STORAGE_KEY, next));
        setTimeout(() => document.body.classList.remove('transitioning'), 500);
    }, []);

    const setTheme = useCallback((newTheme: Theme) => {
        document.body.classList.add('transitioning');
        themeStore.set(newTheme, () => localStorage.setItem(THEME_STORAGE_KEY, newTheme));
        setTimeout(() => document.body.classList.remove('transitioning'), 500);
    }, []);

    const setFontPairing = useCallback((fp: FontPairing) => {
        fontPairingStore.set(fp, () => localStorage.setItem(FONT_STORAGE_KEY, fp));
    }, []);

    const setAccentColor = useCallback((color: string) => {
        accentColorStore.set(color, () => localStorage.setItem(ACCENT_STORAGE_KEY, color));
    }, []);

    const setAnimationsEnabled = useCallback((enabled: boolean) => {
        animationsEnabledStore.set(enabled, () => localStorage.setItem(ANIMATIONS_STORAGE_KEY, String(enabled)));
    }, []);

    // Apply theme class + accent color
    useEffect(() => {
        const root = document.documentElement;
        root.className = `theme-${theme}`;
        root.style.setProperty('--accent', accentColor);
    }, [theme, accentColor]);

    // Apply font pairing CSS variables
    useEffect(() => {
        const def = FONT_PAIRINGS.find(f => f.id === fontPairing) || FONT_PAIRINGS[0];
        const root = document.documentElement;
        root.style.setProperty('--font-heading', def.headingStack);
        root.style.setProperty('--font-primary', def.bodyStack);
        root.style.setProperty('--font-mono', def.monoStack);
    }, [fontPairing]);

    // Apply animations toggle
    useEffect(() => {
        document.body.classList.toggle('animations-off', !animationsEnabled);
    }, [animationsEnabled]);

    // Master Pack: ambient cursor-glow (the doc's radial follow) only on master themes
    useEffect(() => {
        const isMaster = MASTER_THEME_IDS.includes(theme);
        document.body.classList.toggle('master-glow', isMaster);
        if (!isMaster) return;
        const onMove = (e: MouseEvent) => {
            const r = document.documentElement;
            r.style.setProperty('--mx', `${(e.clientX / window.innerWidth) * 100}%`);
            r.style.setProperty('--my', `${(e.clientY / window.innerHeight) * 100}%`);
        };
        window.addEventListener('mousemove', onMove);
        return () => window.removeEventListener('mousemove', onMove);
    }, [theme]);

    // Re-apply any persisted custom-token overrides (Settings theme editor) on load + theme change
    useEffect(() => {
        try {
            const raw = localStorage.getItem(CUSTOM_TOKENS_KEY);
            if (!raw) return;
            const tokens = JSON.parse(raw) as Record<string, string>;
            const r = document.documentElement;
            for (const [k, v] of Object.entries(tokens)) r.style.setProperty(k, v);
        } catch { /* ignore */ }
    }, [theme]);

    return (
        <ThemeContext.Provider value={{ theme, fontPairing, accentColor, animationsEnabled, toggleTheme, setTheme, setFontPairing, setAccentColor, setAnimationsEnabled }}>
            {children}
        </ThemeContext.Provider>
    );
}

export function useTheme() {
    const ctx = useContext(ThemeContext);
    if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
    return ctx;
}
