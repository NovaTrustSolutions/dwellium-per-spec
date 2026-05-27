import type { ThemeId } from './store/settingsStore'

interface ThemeVars { [key: string]: string }

const themes: Record<ThemeId, ThemeVars> = {
  'holocron-dark': {
    // Semantic
    '--bg-base':         '#000000',
    '--bg-panel':        '#0a0a0a',
    '--bg-card':         '#111111',
    '--bg-card-hover':   '#161616',
    '--bg-selected':     '#1a1a2e',
    '--text-primary':    '#ffffff',
    '--text-secondary':  '#8a8a9a',
    '--text-dim':        '#4a4a5a',
    '--border-subtle':   '#1e1e1e',
    '--border-default':  '#2a2a2a',
    '--border-bright':   '#3a3a3a',
    // Legacy aliases
    '--bg-0': '#000000', '--bg-1': '#0a0a0a', '--bg-2': '#111111', '--bg-3': '#1a1a1a',
    '--bg-4': 'rgba(255,255,255,0.04)',
    '--border-1': '#1e1e1e', '--border-2': '#2a2a2a',
    '--text-1': '#ffffff', '--text-2': 'rgba(235,235,245,0.6)',
    '--text-3': '#8a8a9a', '--text-4': '#636366', '--text-5': '#48484a',
    '--accent': '#0a84ff', '--accent-green': '#30d158', '--accent-orange': '#ff9f0a',
    '--accent-pink': '#ff2d78', '--accent-yellow': '#ffd60a', '--accent-cyan': '#64d2ff',
    '--accent-red': '#ff6b6b', '--scrollbar': '#3a3a3c',
  },
  'tokyo-night': {
    '--bg-base':         '#1a1b26',
    '--bg-panel':        '#16161e',
    '--bg-card':         '#1f2335',
    '--bg-card-hover':   '#24283b',
    '--bg-selected':     '#2a2f4a',
    '--text-primary':    '#c0caf5',
    '--text-secondary':  '#9aa5ce',
    '--text-dim':        '#565f89',
    '--border-subtle':   '#1f2335',
    '--border-default':  '#292e42',
    '--border-bright':   '#414868',
    '--bg-0': '#1a1b26', '--bg-1': '#1a1b26', '--bg-2': '#16161e', '--bg-3': '#24283b',
    '--bg-4': 'rgba(255,255,255,0.04)',
    '--border-1': '#292e42', '--border-2': '#3d4166',
    '--text-1': '#c0caf5', '--text-2': 'rgba(192,202,245,0.65)',
    '--text-3': '#9aa5ce', '--text-4': '#565f89', '--text-5': '#414868',
    '--accent': '#7aa2f7', '--accent-green': '#9ece6a', '--accent-orange': '#ff9e64',
    '--accent-pink': '#f7768e', '--accent-yellow': '#e0af68', '--accent-cyan': '#7dcfff',
    '--accent-red': '#f7768e', '--scrollbar': '#3d4166',
  },
  'dracula': {
    '--bg-base':         '#282a36',
    '--bg-panel':        '#21222c',
    '--bg-card':         '#313341',
    '--bg-card-hover':   '#3a3c4e',
    '--bg-selected':     '#44475a',
    '--text-primary':    '#f8f8f2',
    '--text-secondary':  '#bdbeca',
    '--text-dim':        '#6272a4',
    '--border-subtle':   '#313341',
    '--border-default':  '#44475a',
    '--border-bright':   '#6272a4',
    '--bg-0': '#21222c', '--bg-1': '#282a36', '--bg-2': '#21222c', '--bg-3': '#44475a',
    '--bg-4': 'rgba(255,255,255,0.04)',
    '--border-1': '#44475a', '--border-2': '#6272a4',
    '--text-1': '#f8f8f2', '--text-2': 'rgba(248,248,242,0.65)',
    '--text-3': '#6272a4', '--text-4': '#6272a4', '--text-5': '#44475a',
    '--accent': '#bd93f9', '--accent-green': '#50fa7b', '--accent-orange': '#ffb86c',
    '--accent-pink': '#ff79c6', '--accent-yellow': '#f1fa8c', '--accent-cyan': '#8be9fd',
    '--accent-red': '#ff5555', '--scrollbar': '#44475a',
  },
  'nord': {
    '--bg-base':         '#2e3440',
    '--bg-panel':        '#3b4252',
    '--bg-card':         '#434c5e',
    '--bg-card-hover':   '#4c566a',
    '--bg-selected':     '#5e81ac',
    '--text-primary':    '#eceff4',
    '--text-secondary':  '#d8dee9',
    '--text-dim':        '#616e88',
    '--border-subtle':   '#3b4252',
    '--border-default':  '#434c5e',
    '--border-bright':   '#4c566a',
    '--bg-0': '#2e3440', '--bg-1': '#3b4252', '--bg-2': '#2e3440', '--bg-3': '#4c566a',
    '--bg-4': 'rgba(255,255,255,0.04)',
    '--border-1': '#434c5e', '--border-2': '#4c566a',
    '--text-1': '#eceff4', '--text-2': 'rgba(236,239,244,0.65)',
    '--text-3': '#d8dee9', '--text-4': '#616e88', '--text-5': '#4c566a',
    '--accent': '#88c0d0', '--accent-green': '#a3be8c', '--accent-orange': '#d08770',
    '--accent-pink': '#b48ead', '--accent-yellow': '#ebcb8b', '--accent-cyan': '#81a1c1',
    '--accent-red': '#bf616a', '--scrollbar': '#4c566a',
  },
  'solarized-dark': {
    '--bg-base':         '#002b36',
    '--bg-panel':        '#073642',
    '--bg-card':         '#0d4554',
    '--bg-card-hover':   '#114b5b',
    '--bg-selected':     '#1d5b6b',
    '--text-primary':    '#fdf6e3',
    '--text-secondary':  '#93a1a1',
    '--text-dim':        '#657b83',
    '--border-subtle':   '#073642',
    '--border-default':  '#0d4554',
    '--border-bright':   '#586e75',
    '--bg-0': '#002b36', '--bg-1': '#002b36', '--bg-2': '#073642', '--bg-3': '#0d4554',
    '--bg-4': 'rgba(255,255,255,0.04)',
    '--border-1': '#073642', '--border-2': '#586e75',
    '--text-1': '#fdf6e3', '--text-2': 'rgba(253,246,227,0.65)',
    '--text-3': '#93a1a1', '--text-4': '#657b83', '--text-5': '#586e75',
    '--accent': '#268bd2', '--accent-green': '#859900', '--accent-orange': '#cb4b16',
    '--accent-pink': '#d33682', '--accent-yellow': '#b58900', '--accent-cyan': '#2aa198',
    '--accent-red': '#dc322f', '--scrollbar': '#586e75',
  },
  'light': {
    '--bg-base':         '#f5f5f5',
    '--bg-panel':        '#ffffff',
    '--bg-card':         '#eeeeee',
    '--bg-card-hover':   '#e5e5e5',
    '--bg-selected':     '#dceeff',
    '--text-primary':    '#111111',
    '--text-secondary':  '#555555',
    '--text-dim':        '#999999',
    '--border-subtle':   '#e0e0e0',
    '--border-default':  '#cccccc',
    '--border-bright':   '#aaaaaa',
    '--bg-0': '#f5f5f5', '--bg-1': '#ffffff', '--bg-2': '#eeeeee', '--bg-3': '#e5e5e5',
    '--bg-4': 'rgba(0,0,0,0.04)',
    '--border-1': '#e0e0e0', '--border-2': '#cccccc',
    '--text-1': '#111111', '--text-2': 'rgba(28,28,30,0.65)',
    '--text-3': '#555555', '--text-4': '#999999', '--text-5': '#aaaaaa',
    '--accent': '#007aff', '--accent-green': '#28a745', '--accent-orange': '#ff9500',
    '--accent-pink': '#ff2d55', '--accent-yellow': '#ffcc00', '--accent-cyan': '#32ade6',
    '--accent-red': '#ff3b30', '--scrollbar': '#cccccc',
  },
  'midnight-blue': {
    '--bg-base':         '#0d0f1a',
    '--bg-panel':        '#131528',
    '--bg-card':         '#1b1e35',
    '--bg-card-hover':   '#252840',
    '--bg-selected':     '#2f3456',
    '--text-primary':    '#e2e4f0',
    '--text-secondary':  '#8b90b5',
    '--text-dim':        '#565b7f',
    '--border-subtle':   '#252840',
    '--border-default':  '#2f3456',
    '--border-bright':   '#3b4060',
    '--bg-0': '#0d0f1a', '--bg-1': '#0d0f1a', '--bg-2': '#131528', '--bg-3': '#1b1e35',
    '--bg-4': 'rgba(255,255,255,0.04)',
    '--border-1': '#252840', '--border-2': '#2f3456',
    '--text-1': '#e2e4f0', '--text-2': 'rgba(226,228,240,0.65)',
    '--text-3': '#8b90b5', '--text-4': '#565b7f', '--text-5': '#3b4060',
    '--accent': '#6c8ebf', '--accent-green': '#4ecdc4', '--accent-orange': '#ffa07a',
    '--accent-pink': '#c7a4ff', '--accent-yellow': '#ffd700', '--accent-cyan': '#72efdd',
    '--accent-red': '#ff6b9d', '--scrollbar': '#2f3456',
  },
  'fey': {
    // Surface palette extracted from fey.com (see fey-com-variables.css /
    // fey-com-design-language.md). Holocron's neon accents are intentionally
    // preserved — only background, text, and border tokens are remapped.
    '--bg-base':         '#000000',  // fey's most-used dark surface (1979 uses)
    '--bg-panel':        '#0b0b0b',  // fey's --color-bg-1
    '--bg-card':         '#1a1b1f',  // fey's --color-bg-13 (named card slate)
    '--bg-card-hover':   '#242424',  // fey's --color-bg-10
    '--bg-selected':     '#26272f',  // fey's --color-neutral-700 (slate accent)
    '--text-primary':    '#ffffff',  // fey's --color-text-1
    '--text-secondary':  '#868f97',  // fey's --color-text-4 (signature mid-grey, 5694 uses)
    '--text-dim':        '#52565c',  // fey's dimmer slate
    '--border-subtle':   '#1a1b20',  // fey's --color-bg-13 cousin (15 uses, hairlines)
    '--border-default':  '#26272f',  // fey's --color-neutral-700 (named secondary slate)
    '--border-bright':   '#3e3e3e',  // fey's --color-neutral-600

    // Legacy aliases — preserve Holocron's neon accent identity per spec
    '--bg-0': '#000000', '--bg-1': '#0b0b0b', '--bg-2': '#1a1b1f', '--bg-3': '#242424',
    '--bg-4': 'rgba(255,255,255,0.04)',
    '--border-1': '#1a1b20', '--border-2': '#26272f',
    '--text-1': '#ffffff', '--text-2': 'rgba(235,235,245,0.6)',
    '--text-3': '#868f97', '--text-4': '#52565c', '--text-5': '#3e3e3e',
    '--accent': '#0a84ff', '--accent-green': '#30d158', '--accent-orange': '#ff9f0a',
    '--accent-pink': '#ff2d78', '--accent-yellow': '#ffd60a', '--accent-cyan': '#64d2ff',
    '--accent-red': '#ff6b6b', '--scrollbar': '#26272f',
  },
}

export function applyTheme(themeId: ThemeId): void {
  const vars = themes[themeId] ?? themes['holocron-dark']
  const root = document.documentElement
  for (const [key, value] of Object.entries(vars)) {
    root.style.setProperty(key, value)
  }
}

export const THEME_LABELS: Record<ThemeId, string> = {
  'holocron-dark': 'Holocron Dark',
  'tokyo-night': 'Tokyo Night',
  'dracula': 'Dracula',
  'nord': 'Nord',
  'solarized-dark': 'Solarized Dark',
  'light': 'Light Mode',
  'midnight-blue': 'Midnight Blue',
  'fey': 'Fey',
}

export const THEME_IDS = Object.keys(themes) as ThemeId[]
