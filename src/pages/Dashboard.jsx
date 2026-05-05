import { useState, useEffect } from 'react'
import { entities, realtime, location as locationAPI } from '@/api/electron'
import { Brain, Zap, Clock, Activity, TrendingUp, Users } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'

function StatCard({ icon: Icon, label, value, color }) {
  return (
    <div
      role="figure"
      aria-label={`${label}: ${value}`}
      className="rounded-xl border border-border bg-card px-5 py-4 flex items-center gap-4"
    >
      <div className={`p-2.5 rounded-lg ${color}`} aria-hidden="true">
        <Icon className="w-5 h-5" />
      </div>
      <div>
        <p className="text-2xl font-bold text-foreground">{value}</p>
        <p className="text-xs text-muted-foreground">{label}</p>
      </div>
    </div>
  )
}

const SIGNAL_ICONS = {
  calendar_event: '📅',
  email_received: '✉️',
  communication:  '💬',
  file_activity:  '📁',
  browser_tab:    '🌐',
}

export default function Dashboard() {
  const [signals, setSignals] = useState([])
  const [predictions, setPredictions] = useState([])
  const [logs, setLogs] = useState([])
  const [seasonal, setSeasonal] = useState(null)
  const [loc, setLoc] = useState(null)

  const load = async () => {
    const [s, p, l, sea, location] = await Promise.all([
      entities.ContextSignal.list('-created_date', 20),
      entities.Prediction.list('-created_date', 50),
      entities.ActionLog.list('-created_date', 10),
      locationAPI.seasonal(),
      locationAPI.get(),
    ])
    setSignals(s); setPredictions(p); setLogs(l)
    if (sea) setSeasonal(sea)
    if (location) setLoc(location)
  }

  useEffect(() => {
    load()
    realtime.on('signal:new', () => load())
    realtime.on('prediction:new', () => load())
    return () => { realtime.off('signal:new'); realtime.off('prediction:new') }
  }, [])

  const pending = predictions.filter(p => p.status === 'pending').length
  const autoExec = predictions.filter(p => p.status === 'auto_executed').length
  const greenCount = predictions.filter(p => p.confidence_level === 'green').length

  return (
    <main className="space-y-6 max-w-5xl mx-auto" aria-label="PFPA Dashboard">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Dashboard</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Live overview of your proactive AI assistant</p>
      </div>

      {/* Stats */}
      {/* Seasonal + location context bar */}
      {seasonal && (
        <div className="flex flex-wrap items-center gap-2 px-4 py-2.5 rounded-xl bg-card border border-border text-xs text-muted-foreground">
          {loc && <span className="text-foreground font-medium">{loc.city}, {loc.country}</span>}
          {loc && <span>·</span>}
          <span>{seasonal.season}</span>
          <span>·</span>
          <span className={seasonal.isQuarterEnd ? 'text-amber-400 font-medium' : ''}>{seasonal.fiscalQ}{seasonal.isQuarterEnd ? ' — Quarter end!' : ''}</span>
          {seasonal.holiday && <><span>·</span><span className="text-emerald-400">{seasonal.holiday}</span></>}
          {seasonal.isMondayMorning && <><span>·</span><span className="text-blue-400">Monday planning mode</span></>}
          {seasonal.isFridayAfternoon && <><span>·</span><span className="text-purple-400">Friday wrap-up mode</span></>}
          {seasonal.isWeekend && <><span>·</span><span className="text-emerald-400">Weekend</span></>}
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4" role="list" aria-label="Activity statistics">
        <StatCard icon={Activity}    label="Signals today"      value={signals.length}  color="bg-blue-500/10 text-blue-400" />
        <StatCard icon={Brain}       label="Predictions"        value={predictions.length} color="bg-purple-500/10 text-purple-400" />
        <StatCard icon={Clock}       label="Pending approval"   value={pending}         color="bg-amber-500/10 text-amber-400" />
        <StatCard icon={Zap}         label="Auto-executed"      value={autoExec}        color="bg-emerald-500/10 text-emerald-400" />
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Recent signals */}
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="px-5 py-3 border-b border-border">
            <h2 className="text-sm font-semibold">Recent signals</h2>
          </div>
          <div className="divide-y divide-border">
            {signals.slice(0, 8).map(s => (
              <div key={s.id} className="px-5 py-3 flex items-center gap-3">
                <span className="text-base">{SIGNAL_ICONS[s.signal_type] || '📌'}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-foreground truncate">{s.description}</p>
                  <p className="text-xs text-muted-foreground">{s.source}</p>
                </div>
                <span className="text-xs text-muted-foreground flex-shrink-0">
                  {formatDistanceToNow(new Date(s.created_date), { addSuffix: true })}
                </span>
              </div>
            ))}
            {signals.length === 0 && (
              <p className="px-5 py-8 text-xs text-muted-foreground text-center">No signals yet — connect data sources</p>
            )}
          </div>
        </div>

        {/* Pending predictions */}
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="px-5 py-3 border-b border-border flex items-center justify-between">
            <h2 className="text-sm font-semibold">Pending predictions</h2>
            {pending > 0 && (
              <span className="text-xs bg-amber-500/15 text-amber-400 px-2 py-0.5 rounded-full">{pending} need review</span>
            )}
          </div>
          <div className="divide-y divide-border">
            {predictions.filter(p => p.status === 'pending').slice(0, 6).map(p => (
              <div key={p.id} className="px-5 py-3">
                <div className="flex items-center gap-2 mb-1">
                  <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${
                    p.confidence_level === 'green' ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' :
                    p.confidence_level === 'yellow' ? 'bg-amber-500/15 text-amber-400 border-amber-500/30' :
                    'bg-red-500/15 text-red-400 border-red-500/30'
                  }`}>{p.confidence}%</span>
                  <span className="text-xs text-muted-foreground">{p.category}</span>
                </div>
                <p className="text-xs text-foreground leading-snug">{p.description}</p>
              </div>
            ))}
            {pending === 0 && (
              <p className="px-5 py-8 text-xs text-muted-foreground text-center">All caught up! No pending predictions.</p>
            )}
          </div>
        </div>

        {/* Recent actions */}
        <div className="rounded-xl border border-border bg-card overflow-hidden lg:col-span-2">
          <div className="px-5 py-3 border-b border-border">
            <h2 className="text-sm font-semibold">Recent auto-executed actions</h2>
          </div>
          <div className="divide-y divide-border">
            {logs.slice(0, 5).map(l => (
              <div key={l.id} className="px-5 py-3 flex items-center gap-3">
                <Zap className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-foreground">{l.description}</p>
                  <p className="text-xs text-muted-foreground">{l.action_type?.replace(/_/g, ' ')}</p>
                </div>
                <span className="text-xs text-muted-foreground flex-shrink-0">
                  {formatDistanceToNow(new Date(l.created_date), { addSuffix: true })}
                </span>
              </div>
            ))}
            {logs.length === 0 && (
              <p className="px-5 py-6 text-xs text-muted-foreground text-center">No actions logged yet</p>
            )}
          </div>
        </div>
      </div>
    </main>
  )
}
