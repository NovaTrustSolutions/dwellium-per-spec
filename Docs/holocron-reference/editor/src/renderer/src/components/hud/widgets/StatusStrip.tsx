type Status = {
  postgres: boolean
  honcho: boolean
  redis: boolean
  geminiKey: boolean
  anthropicKey: boolean
  spendToday: number
  dailyBudget: number
  hardStop: boolean
}

export function StatusStrip({ status, loading }: { status: Status | null; loading: boolean }): JSX.Element {
  const paused = status?.hardStop && status.spendToday >= status.dailyBudget && status.dailyBudget > 0
  const pct = status && status.dailyBudget > 0
    ? Math.min(100, (status.spendToday / status.dailyBudget) * 100)
    : 0
  const barColor = paused
    ? 'var(--neon-red, #f55)'
    : pct >= 80
      ? 'var(--neon-yellow, #fc3)'
      : 'var(--neon-blue)'

  return (
    <Card>
      <SectionLabel>Status</SectionLabel>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 18, fontSize: 12 }}>
        <ServiceDot label="Postgres" up={status?.postgres ?? false} loading={loading && !status} />
        <ServiceDot label="Honcho"   up={status?.honcho   ?? false} loading={loading && !status} />
        <ServiceDot label="Redis"    up={status?.redis    ?? false} loading={loading && !status} />

        <Separator />

        <span style={{ color: 'var(--text-secondary)' }}>API:</span>
        <KeyIndicator label="Gemini"    present={status?.geminiKey    ?? false} />
        <KeyIndicator label="Anthropic" present={status?.anthropicKey ?? false} />

        <Separator />

        <div style={{ display: 'flex', flexDirection: 'column', minWidth: 160, flex: 1, maxWidth: 280 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text-secondary)', marginBottom: 3 }}>
            <span>Today</span>
            <span style={{ fontFamily: 'monospace' }}>
              {fmtUsd(status?.spendToday ?? 0)} / {fmtUsd(status?.dailyBudget ?? 0)}
            </span>
          </div>
          <div style={{ height: 4, background: 'var(--bg-subtle)', borderRadius: 2, overflow: 'hidden' }}>
            <div style={{ width: `${pct}%`, height: '100%', background: barColor, transition: 'width 200ms ease' }} />
          </div>
        </div>

        {paused && (
          <span
            style={{
              fontSize: 11,
              padding: '2px 8px',
              background: 'var(--neon-red, #f55)',
              color: 'var(--bg-base)',
              borderRadius: 3,
              fontWeight: 600,
            }}
          >
            Cloud calls paused
          </span>
        )}
      </div>
    </Card>
  )
}

function ServiceDot({ label, up, loading }: { label: string; up: boolean; loading: boolean }): JSX.Element {
  const color = loading
    ? 'var(--text-dim)'
    : up
      ? 'var(--neon-green, #4f5)'
      : 'var(--neon-red, #f55)'
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      <span style={{ width: 8, height: 8, borderRadius: '50%', background: color, flexShrink: 0 }} />
      <span style={{ color: 'var(--text-secondary)' }}>{label}</span>
    </span>
  )
}

function KeyIndicator({ label, present }: { label: string; present: boolean }): JSX.Element {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: 'var(--text-secondary)' }}>
      {label}
      <span style={{ color: present ? 'var(--neon-green, #4f5)' : 'var(--neon-red, #f55)', fontWeight: 700 }}>
        {present ? '✓' : '✗'}
      </span>
    </span>
  )
}

function Separator(): JSX.Element {
  return <span style={{ width: 1, alignSelf: 'stretch', background: 'var(--border-subtle)' }} />
}

function fmtUsd(n: number): string {
  return '$' + (n ?? 0).toFixed(2)
}

// ── Shared card primitives (also used by other widgets) ───────────────────

export function Card({ children }: { children: React.ReactNode }): JSX.Element {
  return (
    <div
      style={{
        padding: 16,
        background: 'var(--bg-subtle)',
        border: '1px solid var(--border-subtle)',
        borderRadius: 8,
      }}
    >
      {children}
    </div>
  )
}

export function SectionLabel({ children }: { children: React.ReactNode }): JSX.Element {
  return (
    <div
      style={{
        fontSize: 10,
        textTransform: 'uppercase',
        letterSpacing: 0.6,
        color: 'var(--text-dim)',
        marginBottom: 10,
        fontWeight: 600,
      }}
    >
      {children}
    </div>
  )
}
