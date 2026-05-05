import { useState, useEffect } from 'react'
import { entities, realtime } from '@/api/electron'
import { Activity } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'

const TYPE_COLORS = {
  calendar_event: 'bg-blue-500/15 text-blue-400',
  email_received: 'bg-purple-500/15 text-purple-400',
  communication:  'bg-violet-500/15 text-violet-400',
  file_activity:  'bg-amber-500/15 text-amber-400',
  browser_tab:    'bg-teal-500/15 text-teal-400',
}

const SIGNAL_ICONS = {
  calendar_event: '📅',
  email_received: '✉️',
  communication:  '💬',
  file_activity:  '📁',
  browser_tab:    '🌐',
}

export default function ContextMonitor() {
  const [signals, setSignals] = useState([])
  const [filter, setFilter] = useState('all')

  const load = async () => {
    const data = await entities.ContextSignal.list('-created_date', 150)
    setSignals(data)
  }

  useEffect(() => {
    load()
    realtime.on('signal:new', s => setSignals(prev => [s, ...prev].slice(0, 150)))
    realtime.on('signals:refresh', data => setSignals(data))
    return () => { realtime.off('signal:new'); realtime.off('signals:refresh') }
  }, [])

  const types = ['all', 'calendar_event', 'email_received', 'communication', 'file_activity', 'browser_tab']
  const filtered = filter === 'all' ? signals : signals.filter(s => s.signal_type === filter)

  return (
    <div className="space-y-5 max-w-4xl mx-auto">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Context Monitor</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Live feed of all context signals from your environment</p>
      </div>

      <div className="flex gap-1.5 flex-wrap">
        {types.map(t => (
          <button key={t} onClick={() => setFilter(t)}
            className={`text-xs px-3 py-1.5 rounded-lg transition-colors ${filter === t ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground hover:text-foreground'}`}>
            {t === 'all' ? `All (${signals.length})` : `${SIGNAL_ICONS[t]} ${t.replace('_',' ')}`}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-20 text-muted-foreground">
          <Activity className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p>No signals yet — connect data sources to start monitoring</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(s => (
            <div key={s.id} className="rounded-xl border border-border bg-card px-5 py-3 flex items-start gap-3">
              <span className="text-lg mt-0.5">{SIGNAL_ICONS[s.signal_type] || '📌'}</span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${TYPE_COLORS[s.signal_type] || 'bg-secondary text-muted-foreground'}`}>
                    {s.signal_type?.replace(/_/g,' ')}
                  </span>
                  <span className="text-xs text-muted-foreground">{s.source}</span>
                  <span className={`text-xs px-1.5 py-0.5 rounded ${s.privacy_level === 'private' ? 'bg-red-500/10 text-red-400' : 'bg-secondary text-muted-foreground'}`}>
                    {s.privacy_level}
                  </span>
                </div>
                <p className="text-sm text-foreground leading-snug">{s.description}</p>
              </div>
              <span className="text-xs text-muted-foreground flex-shrink-0">
                {formatDistanceToNow(new Date(s.created_date), { addSuffix: true })}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
