import { useState, useEffect } from 'react'
import { entities, undo, realtime } from '@/api/electron'
import { useToast } from '@/components/ui/use-toast'
import { useUndo } from '@/components/context/UndoContext'
import { Button } from '@/components/ui/button'
import { Shield, ShieldOff, RotateCcw, AlertTriangle, Clock, CheckCircle2 } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'

export default function SafetyPage() {
  const [settings, setSettings] = useState(null)
  const [pausing, setPausing]   = useState(false)
  const { undoQueue, handleUndo } = useUndo()
  const { toast } = useToast()

  const load = async () => {
    const s = await entities.UserSetting.list()
    setSettings(s[0] || null)
  }

  useEffect(() => { load() }, [])

  const togglePause = async () => {
    setPausing(true)
    const updated = await entities.UserSetting.update('settings-1', {
      automation_paused: !settings.automation_paused
    })
    setSettings(updated)
    toast({
      title: updated.automation_paused ? '⏸ Automation paused' : '▶ Automation resumed',
      description: updated.automation_paused
        ? 'No actions will be auto-executed'
        : 'PFPA is active again',
    })
    setPausing(false)
  }

  const timeLeft = (entry) => {
    const ms = entry.expires - Date.now()
    return ms > 0 ? `${Math.ceil(ms / 1000)}s` : 'Expired'
  }

  return (
    <main className="space-y-8 max-w-3xl mx-auto" aria-label="Safety and Governance">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Safety &amp; Governance</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Control automation, undo actions, review guardrails</p>
      </div>

      {/* UI-3: Panic Button — also in TopBar, shown here with full context */}
      <section aria-labelledby="panic-heading" className="rounded-xl border border-border bg-card p-6 space-y-4">
        <div className="flex items-center gap-3">
          {settings?.automation_paused
            ? <ShieldOff className="w-5 h-5 text-red-400" aria-hidden="true" />
            : <Shield className="w-5 h-5 text-emerald-400" aria-hidden="true" />}
          <div>
            <h2 id="panic-heading" className="text-sm font-semibold">Automation control (UI-3)</h2>
            <p className="text-xs text-muted-foreground">
              {settings?.automation_paused
                ? 'All automation is currently PAUSED — no actions will execute'
                : 'Automation is active — PFPA is working in the background'}
            </p>
          </div>
          <div className="ml-auto">
            <span
              role="status"
              aria-live="polite"
              className={`text-xs px-2.5 py-1 rounded-full font-medium ${
                settings?.automation_paused
                  ? 'bg-red-500/15 text-red-400'
                  : 'bg-emerald-500/15 text-emerald-400'
              }`}
            >
              {settings?.automation_paused ? 'Paused' : 'Active'}
            </span>
          </div>
        </div>
        <Button
          variant={settings?.automation_paused ? 'default' : 'destructive'}
          className="w-full gap-2"
          onClick={togglePause}
          disabled={pausing}
          aria-pressed={!!settings?.automation_paused}
          aria-label={settings?.automation_paused ? 'Resume automation' : 'Pause all automation — panic button'}
          size="lg"
        >
          {settings?.automation_paused
            ? <><CheckCircle2 className="w-4 h-4" aria-hidden="true" /> Resume automation</>
            : <><ShieldOff className="w-4 h-4" aria-hidden="true" /> Pause all automation (Panic button)</>}
        </Button>
        <p className="text-xs text-muted-foreground">
          The panic button is also always available in the top toolbar on every page.
        </p>
      </section>

      {/* Undo Buffer */}
      <section aria-labelledby="undo-heading" className="rounded-xl border border-border bg-card p-6 space-y-4">
        <div className="flex items-center gap-3">
          <RotateCcw className="w-5 h-5 text-amber-400" aria-hidden="true" />
          <div>
            <h2 id="undo-heading" className="text-sm font-semibold">30-second undo buffer (SGL-4)</h2>
            <p className="text-xs text-muted-foreground">Recent actions you can still reverse</p>
          </div>
          <span
            aria-live="polite"
            className="ml-auto text-xs bg-amber-500/15 text-amber-400 px-2.5 py-1 rounded-full"
          >
            {undoQueue.length} available
          </span>
        </div>

        {undoQueue.length === 0 ? (
          <p className="text-xs text-muted-foreground italic" role="status">
            No reversible actions in the buffer right now.
          </p>
        ) : (
          <ul aria-label="Reversible actions" className="space-y-2">
            {undoQueue.map(entry => (
              <li
                key={entry.id}
                className="flex items-center justify-between px-4 py-3 rounded-lg bg-secondary/50"
              >
                <div>
                  <p className="text-xs font-medium text-foreground">{entry.actionType.replace(/_/g, ' ')}</p>
                  <p className="text-xs text-muted-foreground font-mono">
                    {JSON.stringify(entry.meta).slice(0, 60)}…
                  </p>
                </div>
                <div className="flex items-center gap-3 flex-shrink-0">
                  <span className="text-xs text-amber-400 flex items-center gap-1" aria-label={`Expires in ${timeLeft(entry)}`}>
                    <Clock className="w-3 h-3" aria-hidden="true" />
                    {timeLeft(entry)}
                  </span>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleUndo(entry.id)}
                    aria-label={`Undo ${entry.actionType.replace(/_/g, ' ')}`}
                  >
                    Undo
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Guardrails */}
      <section aria-labelledby="guardrails-heading" className="rounded-xl border border-border bg-card p-6 space-y-4">
        <div className="flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-400" aria-hidden="true" />
          <h2 id="guardrails-heading" className="text-sm font-semibold">Active guardrails (SGL-1)</h2>
        </div>
        <ul aria-label="Active safety guardrails" className="space-y-0">
          {[
            { label: 'Financial transactions > $100',      status: 'Blocked — requires manual approval' },
            { label: 'Emails to external recipients',      status: 'Draft only — never auto-sent' },
            { label: 'File deletion',                      status: 'Blocked — move only, never delete' },
            { label: 'Security setting changes',           status: 'Blocked — manual only' },
            { label: 'Password manager form fills (SEC-3)', status: 'Sandboxed — sensitive fields blocked' },
            { label: 'Sensitive contexts (banking, incognito)', status: 'Privacy vault — excluded from processing' },
          ].map((g, i) => (
            <li key={i} className="flex items-center justify-between py-2.5 border-b border-border last:border-0">
              <p className="text-sm text-foreground">{g.label}</p>
              <span className="text-xs text-emerald-400 flex items-center gap-1 ml-4 flex-shrink-0">
                <CheckCircle2 className="w-3 h-3" aria-hidden="true" />
                {g.status}
              </span>
            </li>
          ))}
        </ul>
      </section>
    </main>
  )
}
