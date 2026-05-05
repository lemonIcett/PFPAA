import { useState, useEffect } from 'react'
import { accuracy, realtime } from '@/api/electron'
import { Target, CheckCircle2, XCircle, AlertTriangle, TrendingUp } from 'lucide-react'

function AccuracyBar({ label, result, target }) {
  if (!result) return (
    <div className="py-3 border-b border-border last:border-0">
      <div className="flex items-center justify-between">
        <p className="text-sm text-foreground">{label}</p>
        <span className="text-xs text-muted-foreground">No data yet</span>
      </div>
    </div>
  )

  const pct = result.pct
  const ok  = pct >= target
  return (
    <div className="py-3 border-b border-border last:border-0">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          {ok
            ? <CheckCircle2 className="w-4 h-4 text-emerald-400"/>
            : <AlertTriangle className="w-4 h-4 text-amber-400"/>}
          <p className="text-sm font-medium text-foreground">{label}</p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-muted-foreground">Target: {target}% · {result.total} rated</span>
          <span className={`text-lg font-bold ${ok ? 'text-emerald-400' : 'text-amber-400'}`}>{pct}%</span>
        </div>
      </div>
      <div className="w-full bg-secondary rounded-full h-2">
        <div className={`h-2 rounded-full transition-all ${ok ? 'bg-emerald-500' : 'bg-amber-500'}`}
             style={{ width: `${Math.min(100, pct)}%` }}/>
      </div>
      <div className="flex justify-between text-xs text-muted-foreground mt-1">
        <span>{result.correct} correct / {result.total - result.correct} wrong</span>
        <span className={ok ? 'text-emerald-400' : 'text-amber-400'}>{ok ? '✓ Meets SRS' : `✗ Need ${target}%`}</span>
      </div>
    </div>
  )
}

export default function AccuracyPage() {
  const [report, setReport] = useState(null)

  const load = async () => setReport(await accuracy.report())
  useEffect(() => {
    load()
    realtime.on('prediction:rated', load)
    return () => realtime.off('prediction:rated')
  }, [])

  const cats = report?.byCategory || {}

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Prediction Accuracy (BIE-2)</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Rate predictions to measure accuracy. SRS targets: micro &gt;85% · session &gt;75% · daily &gt;60%
        </p>
      </div>

      {!report || report.total === 0 ? (
        <div className="rounded-xl border border-border bg-card px-6 py-12 text-center">
          <Target className="w-10 h-10 mx-auto mb-3 text-muted-foreground opacity-30"/>
          <p className="text-sm text-muted-foreground">No predictions rated yet.</p>
          <p className="text-xs text-muted-foreground mt-1">Go to Predictions page and use the thumbs up/down buttons to start building accuracy data.</p>
        </div>
      ) : (
        <>
          <div className="rounded-xl border border-border bg-card px-5">
            <AccuracyBar label="Micro-intent (next 60s)"    result={report.micro}   target={85}/>
            <AccuracyBar label="Session intent (next 30min)" result={report.session} target={75}/>
            <AccuracyBar label="Daily intent (next 24h)"    result={report.daily}   target={60}/>
            <AccuracyBar label="Overall accuracy"           result={report.overall} target={75}/>
          </div>

          {Object.keys(cats).some(k => cats[k]) && (
            <div className="rounded-xl border border-border bg-card p-5 space-y-3">
              <p className="text-sm font-semibold">Accuracy by category</p>
              <div className="grid grid-cols-2 gap-3">
                {Object.entries(cats).filter(([,v]) => v).map(([cat, v]) => (
                  <div key={cat} className="rounded-lg bg-secondary/50 px-3 py-2">
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-xs text-muted-foreground capitalize">{cat.replace(/_/g,' ')}</p>
                      <span className={`text-sm font-bold ${v.pct >= 70 ? 'text-emerald-400' : 'text-amber-400'}`}>{v.pct}%</span>
                    </div>
                    <div className="w-full bg-secondary rounded-full h-1">
                      <div className={`h-1 rounded-full ${v.pct >= 70 ? 'bg-emerald-500' : 'bg-amber-500'}`}
                           style={{ width: `${v.pct}%` }}/>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">{v.correct}/{v.total} correct</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      <div className="rounded-xl border border-border bg-card p-5 space-y-2">
        <p className="text-sm font-semibold flex items-center gap-2"><TrendingUp className="w-4 h-4 text-primary"/>How accuracy improves over time</p>
        <p className="text-xs text-muted-foreground leading-relaxed">
          When you rate predictions, PFPA stores your preference per signal+action type (BIE-3 preference learning).
          This context is sent to Claude with every new prediction, gradually making suggestions more accurate to your
          actual needs. Rate at least 20–30 predictions to see meaningful accuracy figures.
        </p>
      </div>
    </div>
  )
}
