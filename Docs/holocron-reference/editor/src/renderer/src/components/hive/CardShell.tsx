/**
 * Shared visual shell for all Hive cards. Keeps padding/border/header
 * consistent across cards so the dashboard reads as a unified grid.
 */
interface CardShellProps {
  title: string
  accentColor: string                   // border-left tint + title hue
  status?: 'healthy' | 'warning' | 'error' | 'idle'
  statusMessage?: string                // one-line reason for non-green
  rightSlot?: React.ReactNode           // refresh / kebab / etc.
  children: React.ReactNode
}

const STATUS_COLORS: Record<NonNullable<CardShellProps['status']>, string> = {
  healthy: 'var(--accent-green)',
  warning: 'var(--accent-orange)',
  error:   '#ff2d78',
  idle:    'var(--text-5)',
}

export function CardShell({ title, accentColor, status = 'idle', statusMessage, rightSlot, children }: CardShellProps): JSX.Element {
  return (
    <section
      style={{
        background: 'var(--bg-2)',
        border: '1px solid var(--border-1)',
        borderLeft: `3px solid ${accentColor}`,
        borderRadius: 10,
        padding: 14,
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        minHeight: 200,
      }}
    >
      <header style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span
          style={{
            display: 'inline-block',
            width: 8, height: 8, borderRadius: 999,
            background: STATUS_COLORS[status],
            boxShadow: `0 0 6px ${STATUS_COLORS[status]}66`,
          }}
        />
        <h3 style={{ margin: 0, fontSize: 12, fontWeight: 700, color: accentColor, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
          {title}
        </h3>
        {statusMessage && (
          <span style={{ fontSize: 10, color: 'var(--text-4)', marginLeft: 4 }} title={statusMessage}>
            · {statusMessage}
          </span>
        )}
        <div style={{ marginLeft: 'auto' }}>{rightSlot}</div>
      </header>
      {children}
    </section>
  )
}
