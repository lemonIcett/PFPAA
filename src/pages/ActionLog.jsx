import { useState, useEffect } from 'react'
import { entities, realtime } from '@/api/electron'
import { useUndo } from '@/components/context/UndoContext'
import { History, Zap, RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { formatDistanceToNow } from 'date-fns'

const LEVEL_STYLES = {
  green:  'bg-emerald-500/15 text-emerald-400',
  yellow: 'bg-amber-500/15 text-amber-400',
  red:    'bg-red-500/15 text-red-400',
}

export default function ActionLog() {
  const [logs, setLogs] = useState([])
  const { undoQueue, handleUndo } = useUndo()

  const load = async () => {
    const data = await entities.ActionLog.list('-created_date', 200)
    setLogs(data)
  }

  useEffect(() => {
    load()
    realtime.on('actionlog:new', l => setLogs(prev => [l, ...prev].slice(0, 200)))
    return () => realtime.off('actionlog:new')
  }, [])

  return (
    <main className="space-y-5 max-w-4xl mx-auto" aria-label="Action Log">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Action Log</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Complete audit trail of all executed actions</p>
        </div>
        <span className="text-xs text-muted-foreground">{logs.length} actions logged</span>
      </div>

      {undoQueue.length > 0 && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 space-y-2">
          <p className="text-xs font-medium text-amber-400 flex items-center gap-2"><RotateCcw className="w-3.5 h-3.5" />Undo available</p>
          {undoQueue.map(e => (
            <div key={e.id} className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">{e.actionType.replace(/_/g,' ')}</span>
              <Button size="sm" variant="outline" onClick={() => handleUndo(e.id)} className="h-6 text-xs">Undo</Button>
            </div>
          ))}
        </div>
      )}

      {logs.length === 0 ? (
        <div className="text-center py-20 text-muted-foreground">
          <History className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p>No actions logged yet</p>
        </div>
      ) : (
        <div className="space-y-2">
          {logs.map(l => (
            <div key={l.id} className="rounded-xl border border-border bg-card px-5 py-3 flex items-center gap-3">
              <Zap className="w-4 h-4 text-emerald-400 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm text-foreground">{l.description}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{l.action_type?.replace(/_/g,' ')}</p>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <span className={`text-xs px-2 py-0.5 rounded-full ${LEVEL_STYLES[l.confidence_level] || 'bg-secondary text-muted-foreground'}`}>
                  {l.confidence}%
                </span>
                {l.was_undone && <span className="text-xs text-amber-400">undone</span>}
                <span className="text-xs text-muted-foreground">
                  {formatDistanceToNow(new Date(l.created_date), { addSuffix: true })}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </main>
  )
}
