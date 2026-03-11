import { createContext, useContext, useState, useCallback, useEffect, ReactNode } from 'react';
import { Theme, FontPairing } from '../data/types';

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

export function ThemeProvider({ children }: { children: ReactNode }) {
    const [theme, setThemeState] = useState<Theme>(() => {
        return (
            (localStorage.getItem(THEME_STORAGE_KEY) as Theme) ||
            (localStorage.getItem(LEGACY_THEME_STORAGE_KEY) as Theme) ||
            'dark'
        );
    });

    const [fontPairing, setFontPairingState] = useState<FontPairing>(() => {
        return (localStorage.getItem(FONT_STORAGE_KEY) as FontPairing) || 'default';
    });

    const [accentColor, setAccentColorState] = useState(() => {
        return localStorage.getItem(ACCENT_STORAGE_KEY) ||
            localStorage.getItem(LEGACY_ACCENT_STORAGE_KEY) ||
            '#0088cc';
    });

    const [animationsEnabled, setAnimationsEnabledState] = useState(() => {
        const stored = localStorage.getItem(ANIMATIONS_STORAGE_KEY);
        return stored !== null ? stored === 'true' : true;
    });

    const toggleTheme = useCallback(() => {
        document.body.classList.add('transitioning');
        setThemeState(prev => {
            const next = prev === 'dark' ? 'light' : 'dark';
            localStorage.setItem(THEME_STORAGE_KEY, next);
            return next;
        });
        setTimeout(() => document.body.classList.remove('transitioning'), 500);
    }, []);

    const setTheme = useCallback((newTheme: Theme) => {
        document.body.classList.add('transitioning');
        setThemeState(newTheme);
        localStorage.setItem(THEME_STORAGE_KEY, newTheme);
        setTimeout(() => document.body.classList.remove('transitioning'), 500);
    }, []);

    const setFontPairing = useCallback((fp: FontPairing) => {
        setFontPairingState(fp);
        localStorage.setItem(FONT_STORAGE_KEY, fp);
    }, []);

    const setAccentColor = useCallback((color: string) => {
        setAccentColorState(color);
        localStorage.setItem(ACCENT_STORAGE_KEY, color);
    }, []);

    const setAnimationsEnabled = useCallback((enabled: boolean) => {
        setAnimationsEnabledState(enabled);
        localStorage.setItem(ANIMATIONS_STORAGE_KEY, String(enabled));
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
