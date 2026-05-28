import { useEffect, useRef, useState } from 'react'
import { useSessionStore } from '../../store/sessionStore'
import { StatusStrip } from './widgets/StatusStrip'
import { RecentInsight } from './widgets/RecentInsight'
import { StatsGrid } from './widgets/StatsGrid'
import { PendingActions } from './widgets/PendingActions'
import { RecentActivity } from './widgets/RecentActivity'

const POLL_INTERVAL_MS = 30_000

type Status = NonNullable<Awaited<ReturnType<Window['electronAPI']['hudStatus']>>['data']>
type Stats = NonNullable<Awaited<ReturnType<Window['electronAPI']['hudStats']>>['data']>
type Activity = NonNullable<Awaited<ReturnType<Window['electronAPI']['hudRecentActivity']>>['data']>

export function HUD(): JSX.Element {
  const activeTab = useSessionStore((s) => s.activeTab)

  const [status, setStatus] = useState<Status | null>(null)
  const [stats, setStats] = useState<Stats | null>(null)
  const [activity, setActivity] = useState<Activity | null>(null)
  const [loading, setLoading] = useState(true)

  const tickingRef = useRef(false)

  useEffect(() => {
    const tick = async (): Promise<void> => {
      if (tickingRef.current) return
      tickingRef.current = true
      try {
        const [s, st, a] = await Promise.all([
          window.electronAPI.hudStatus(),
          window.electronAPI.hudStats(),
          window.electronAPI.hudRecentActivity(10),
        ])
        if (s.ok && s.data) setStatus(s.data)
        if (st.ok && st.data) setStats(st.data)
        if (a.ok && a.data) setActivity(a.data)
      } catch (err) {
        console.error('[HUD] poll failed:', err)
      } finally {
        setLoading(false)
        tickingRef.current = false
      }
    }

    // Always run an initial fetch so first activation has data.
    void tick()

    // Only schedule the interval when this tab is active. The tab name is
    // `'hud'` in AppTab — the legacy `'dashboard'` literal was a holdover
    // from the rename and never matched the active type.
    if (activeTab !== 'hud') return
    const id = setInterval(() => { void tick() }, POLL_INTERVAL_MS)
    return () => clearInterval(id)
  }, [activeTab])

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        padding: '16px 24px 24px',
        height: '100%',
        overflow: 'auto',
        background: 'var(--bg-base)',
      }}
    >
      <StatusStrip status={status} loading={loading} />
      <RecentInsight />
      <StatsGrid stats={stats} loading={loading} />
      <PendingActions />
      <RecentActivity rows={activity} loading={loading} />
    </div>
  )
}
