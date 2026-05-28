interface IconProps {
  size?: number
  style?: React.CSSProperties
  className?: string
}

const Svg = ({
  size = 16,
  style,
  className,
  children,
}: IconProps & { children: React.ReactNode }): JSX.Element => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 16 16"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinecap="round"
    strokeLinejoin="round"
    style={style}
    className={className}
  >
    {children}
  </svg>
)

export const IconFile = (p: IconProps): JSX.Element => (
  <Svg {...p}>
    <path d="M9 2H4a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V6L9 2z" />
    <polyline points="9,2 9,6 13,6" />
  </Svg>
)

export const IconTrash = (p: IconProps): JSX.Element => (
  <Svg {...p}>
    <polyline points="2.5,4 13.5,4" />
    <path d="M6 4V2.5a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1V4" />
    <path d="M3.5 4l.7 9a1 1 0 0 0 1 1h5.6a1 1 0 0 0 1-1l.7-9" />
    <line x1="6.5" y1="7" x2="6.5" y2="12" />
    <line x1="9.5" y1="7" x2="9.5" y2="12" />
  </Svg>
)

export const IconFolder = (p: IconProps): JSX.Element => (
  <Svg {...p}>
    <path d="M2 8V6a1 1 0 0 1 1-1h3l1.5-1.5H13a1 1 0 0 1 1 1v7.5a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V8z" />
  </Svg>
)

export const IconFolderOpen = (p: IconProps): JSX.Element => (
  <Svg {...p}>
    <path d="M2 8V6a1 1 0 0 1 1-1h3l1.5-1.5H13a1 1 0 0 1 1 1v1" />
    <path d="M1.5 9l1.5-3h11l-1.5 6.5H3L1.5 9z" />
  </Svg>
)

export const IconChevronRight = (p: IconProps): JSX.Element => (
  <Svg {...p}>
    <polyline points="6,3 10,8 6,13" />
  </Svg>
)

export const IconChevronDown = (p: IconProps): JSX.Element => (
  <Svg {...p}>
    <polyline points="3,6 8,10 13,6" />
  </Svg>
)

export const IconChevronUp = (p: IconProps): JSX.Element => (
  <Svg {...p}>
    <polyline points="3,10 8,6 13,10" />
  </Svg>
)

export const IconBack = (p: IconProps): JSX.Element => (
  <Svg {...p}>
    <polyline points="9,3 5,8 9,13" />
    <line x1="5" y1="8" x2="13" y2="8" />
  </Svg>
)

export const IconHome = (p: IconProps): JSX.Element => (
  <Svg {...p}>
    <polyline points="2,8 8,3 14,8" />
    <path d="M5 8v5h6V8" />
  </Svg>
)

export const IconCollapse = (p: IconProps): JSX.Element => (
  <Svg {...p}>
    <polyline points="4,4 8,7 12,4" />
    <polyline points="4,12 8,9 12,12" />
  </Svg>
)

export const IconExpand = (p: IconProps): JSX.Element => (
  <Svg {...p}>
    <polyline points="4,7 8,4 12,7" />
    <polyline points="4,9 8,12 12,9" />
  </Svg>
)

export const IconNewFile = (p: IconProps): JSX.Element => (
  <Svg {...p}>
    <path d="M9 2H4a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V6L9 2z" />
    <polyline points="9,2 9,6 13,6" />
    <line x1="6" y1="9" x2="10" y2="9" />
    <line x1="8" y1="7" x2="8" y2="11" />
  </Svg>
)

export const IconNewFolder = (p: IconProps): JSX.Element => (
  <Svg {...p}>
    <path d="M2 8V6a1 1 0 0 1 1-1h3l1.5-1.5H13a1 1 0 0 1 1 1v7.5a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V8z" />
    <line x1="6" y1="9.5" x2="10" y2="9.5" />
    <line x1="8" y1="7.5" x2="8" y2="11.5" />
  </Svg>
)

export const IconClose = (p: IconProps): JSX.Element => (
  <Svg {...p}>
    <line x1="4" y1="4" x2="12" y2="12" />
    <line x1="12" y1="4" x2="4" y2="12" />
  </Svg>
)

export const IconComplete = (p: IconProps): JSX.Element => (
  <Svg {...p}>
    <polyline points="2.5,8 6,11.5 13.5,4.5" />
  </Svg>
)

export const IconSettings = (p: IconProps): JSX.Element => (
  <Svg {...p}>
    <line x1="2" y1="4" x2="14" y2="4" />
    <line x1="2" y1="8" x2="14" y2="8" />
    <line x1="2" y1="12" x2="14" y2="12" />
    <circle cx="5.5" cy="4" r="1.5" fill="var(--bg-panel, #0a0a0a)" />
    <circle cx="10.5" cy="8" r="1.5" fill="var(--bg-panel, #0a0a0a)" />
    <circle cx="6.5" cy="12" r="1.5" fill="var(--bg-panel, #0a0a0a)" />
  </Svg>
)

export const IconDomaines = (p: IconProps): JSX.Element => (
  <Svg {...p}>
    <path d="M2 5.5l6-2.5 6 2.5-6 2.5z" />
    <path d="M2 8.5l6 2.5 6-2.5" />
    <path d="M2 11.5l6 2.5 6-2.5" />
  </Svg>
)

export const IconScribe = (p: IconProps): JSX.Element => (
  <Svg {...p}>
    <path d="M9 2H4a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V6L9 2z" />
    <polyline points="9,2 9,6 13,6" />
    <line x1="5" y1="8.5" x2="11" y2="8.5" />
    <line x1="5" y1="10.5" x2="9" y2="10.5" />
  </Svg>
)

// Library icon — three book spines on a shelf
export const IconCodex = (p: IconProps): JSX.Element => (
  <Svg {...p}>
    <rect x="3" y="2.5" width="2.5" height="11" rx="0.5" />
    <rect x="6.5" y="2.5" width="2.5" height="11" rx="0.5" />
    <path d="M11 3.5l2 0.4-1.6 9.7-2-0.4z" />
  </Svg>
)

// Dashboard icon — 2x2 grid of cells
export const IconHUD = (p: IconProps): JSX.Element => (
  <Svg {...p}>
    <rect x="2.5" y="2.5"  width="5" height="5" rx="0.5" />
    <rect x="8.5" y="2.5"  width="5" height="5" rx="0.5" />
    <rect x="2.5" y="8.5"  width="5" height="5" rx="0.5" />
    <rect x="8.5" y="8.5"  width="5" height="5" rx="0.5" />
  </Svg>
)

// Brain dump icon — stylized lightbulb / thought bubble
export const IconBrain = (p: IconProps): JSX.Element => (
  <Svg {...p}>
    <path d="M5.5 3.5a2.5 2.5 0 0 1 5 0v.5a2 2 0 0 1 1.5 3.5 2 2 0 0 1-1.5 3.5v.5a2.5 2.5 0 0 1-5 0v-.5A2 2 0 0 1 4 7a2 2 0 0 1 1.5-3.5z" />
    <line x1="8" y1="11" x2="8" y2="13.5" />
    <line x1="6" y1="13.5" x2="10" y2="13.5" />
  </Svg>
)

export const IconUpload = (p: IconProps): JSX.Element => (
  <Svg {...p}>
    <polyline points="8,3 8,11" />
    <polyline points="5,6 8,3 11,6" />
    <line x1="3" y1="13" x2="13" y2="13" />
  </Svg>
)

export const IconImport = (p: IconProps): JSX.Element => (
  <Svg {...p}>
    <polyline points="8,2 8,9" />
    <polyline points="5,6 8,9 11,6" />
    <polyline points="2.5,11 2.5,13.5 13.5,13.5 13.5,11" />
  </Svg>
)

export const IconSplit = (p: IconProps): JSX.Element => (
  <Svg {...p}>
    <rect x="2" y="3" width="5" height="10" rx="1" />
    <rect x="9" y="3" width="5" height="10" rx="1" />
  </Svg>
)

export const IconPanelLeft = (p: IconProps): JSX.Element => (
  <Svg {...p}>
    <rect x="2" y="2.5" width="12" height="11" rx="1.5" />
    <rect x="2.75" y="3.25" width="3.25" height="9.5" rx="0.75" fill="currentColor" stroke="none" opacity="0.55" />
    <line x1="6.5" y1="2.5" x2="6.5" y2="13.5" />
  </Svg>
)

export const IconPanelRight = (p: IconProps): JSX.Element => (
  <Svg {...p}>
    <rect x="2" y="2.5" width="12" height="11" rx="1.5" />
    <rect x="10" y="3.25" width="3.25" height="9.5" rx="0.75" fill="currentColor" stroke="none" opacity="0.55" />
    <line x1="9.5" y1="2.5" x2="9.5" y2="13.5" />
  </Svg>
)

export const IconEdit = (p: IconProps): JSX.Element => (
  <Svg {...p}>
    <path d="M11.5 2.5l2 2-7.5 7.5H4v-2z" />
    <line x1="9.5" y1="4.5" x2="11.5" y2="6.5" />
  </Svg>
)

export const IconKebab = (p: IconProps): JSX.Element => (
  <Svg {...p}>
    <circle cx="8" cy="3.5" r="1.1" fill="currentColor" stroke="none" />
    <circle cx="8" cy="8"   r="1.1" fill="currentColor" stroke="none" />
    <circle cx="8" cy="12.5" r="1.1" fill="currentColor" stroke="none" />
  </Svg>
)
