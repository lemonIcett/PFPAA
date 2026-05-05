import { useState, useEffect } from 'react'
import { perf, data } from '@/api/electron'
import { useToast } from '@/components/ui/use-toast'
import { Button } from '@/components/ui/button'
import { Activity, CheckCircle2, AlertTriangle, RefreshCw, Trash2, TrendingUp, Clock, Wifi } from 'lucide-react'

function MetricRow({ label, metric, targetMs }) {
  if (!metric) return null
  const avgOk = metric.avg <= targetMs
  const p95Ok = metric.p95 <= targetMs * 1.5
  return (
    <div className="py-4 border-b border-border last:border-0">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          {avgOk && p95Ok
            ? <CheckCircle2 className="w-4 h-4 text-emerald-400"/>
            : <AlertTriangle className="w-4 h-4 text-amber-400"/>}
          <p className="text-sm font-medium text-foreground">{label}</p>
        </div>
        <span className="text-xs text-muted-foreground">Target: &lt;{targetMs}ms · {metric.samples} samples</span>
      </div>
      <div className="grid grid-cols-3 gap-3">
        {[['Avg', metric.avg, avgOk], ['p95', metric.p95, p95Ok], ['Max', metric.max, metric.max <= targetMs * 3]].map(([l, v, ok]) => (
          <div key={l} className="rounded-lg bg-secondary/50 px-3 py-2 text-center">
            <p className={`text-lg font-bold ${ok ? 'text-emerald-400' : 'text-amber-400'}`}>{v}ms</p>
            <p className="text-xs text-muted-foreground">{l}</p>
          </div>
        ))}
      </div>
      <div className="mt-2 w-full bg-secondary rounded-full h-1.5">
        <div className={`h-1.5 rounded-full ${avgOk ? 'bg-emerald-500' : 'bg-amber-500'}`}
             style={{width:`${Math.min(100,(metric.avg/(targetMs*2))*100)}%`}}/>
      </div>
    </div>
  )
}

// ── SLA Uptime helpers ────────────────────────────────────────────────────
const SLA_TARGET = 99.9 // %

function computeUptimeFromPings(pings) {
  if (!pings || pings.length < 2) return { pct: 100, downtimeMs: 0, events: [] }
  const sorted = [...pings].sort((a, b) => a.ts - b.ts)
  const now = Date.now()
  const windowStart = now - 30 * 24 * 60 * 60 * 1000 // 30 days
  const windowPings = sorted.filter(p => p.ts >= windowStart)
  if (windowPings.length < 2) return { pct: 100, downtimeMs: 0, events: [] }

  const GAP_THRESHOLD = 90 * 1000 // >90s gap = outage (pings every 60s)
  let downtimeMs = 0
  const events = []
  for (let i = 1; i < windowPings.length; i++) {
    const gap = windowPings[i].ts - windowPings[i - 1].ts
    if (gap > GAP_THRESHOLD) {
      const outageMs = gap - 60000
      downtimeMs += outageMs
      events.push({ start: windowPings[i - 1].ts, end: windowPings[i].ts, durationMs: outageMs })
    }
  }
  const windowMs = now - windowPings[0].ts
  const pct = Math.max(0, Math.min(100, ((windowMs - downtimeMs) / windowMs) * 100))
  return { pct, downtimeMs, events }
}

function UptimeBar({ pct }) {
  const ok = pct >= SLA_TARGET
  return (
    <div className="space-y-1.5">
      <div className="flex justify-between items-baseline">
        <span className="text-xs text-muted-foreground">30-day uptime</span>
        <span className={`text-lg font-bold ${ok ? 'text-emerald-400' : 'text-amber-400'}`}>{pct.toFixed(3)}%</span>
      </div>
      <div className="w-full bg-secondary rounded-full h-2">
        <div
          className={`h-2 rounded-full ${ok ? 'bg-emerald-500' : 'bg-amber-500'}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="flex justify-between text-[10px] text-muted-foreground/60">
        <span>Target: {SLA_TARGET}% SLA</span>
        <span>{ok ? '✓ SLA Met' : '⚠ Below SLA'}</span>
      </div>
    </div>
  )
}

export default function PerformancePage() {
  const [report, setReport] = useState(null)
  const [loading, setLoading] = useState(false)
  const [sla, setSla] = useState({ pct: 100, downtimeMs: 0, events: [] })
  const { toast } = useToast()

  // Record a ping on mount and every 60 seconds
  useEffect(() => {
    const recordPing = () => {
      try {
        const key = 'pfpa_uptime_pings'
        const raw = localStorage.getItem(key)
        const pings = raw ? JSON.parse(raw) : []
        const now = Date.now()
        // Keep only 30-day pings
        const cutoff = now - 31 * 24 * 60 * 60 * 1000
        const fresh = pings.filter(p => p.ts >= cutoff)
        fresh.push({ ts: now })
        localStorage.setItem(key, JSON.stringify(fresh.slice(-44000))) // ~30 days at 1/min
        setSla(computeUptimeFromPings(fresh))
      } catch {}
    }
    recordPing()
    const iv = setInterval(recordPing, 60000)
    return () => clearInterval(iv)
  }, [])

  const load = async () => { setLoading(true); setReport(await perf.report()); setLoading(false) }
  useEffect(() => { load(); const iv = setInterval(load, 10000); return () => clearInterval(iv) }, [])

  const handlePurge = async () => {
    await data.purge()
    toast({ title: 'Data purged', description: 'Removed records older than retention limits', duration: 3000 })
  }

  const targets = [
    { key: 'contextDetection', label: 'Context detection (SRS: <100ms)', target: 100 },
    { key: 'prediction',       label: 'Intent prediction (SRS: <500ms)', target: 500 },
    { key: 'actionExecution',  label: 'Action execution (SRS: <2000ms)', target: 2000 },
  ]

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Performance</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Live latency vs SRS requirements</p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={load} className="gap-1.5">
            <RefreshCw className={`w-3.5 h-3.5 ${loading?'animate-spin':''}`}/>Refresh
          </Button>
          <Button size="sm" variant="outline" onClick={handlePurge} className="gap-1.5 text-destructive border-destructive/30">
            <Trash2 className="w-3.5 h-3.5"/>Purge old data
          </Button>
        </div>
      </div>

      <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 px-5 py-4 flex items-center gap-3">
        <Activity className="w-5 h-5 text-emerald-400"/>
        <p className="text-xs text-muted-foreground">SRS requirements: context &lt;100ms · prediction &lt;500ms · execution &lt;2s · 90-day data retention · 99.9% uptime</p>
      </div>

      <div className="rounded-xl border border-border bg-card px-5">
        {report
          ? targets.map(({key,label,target}) => <MetricRow key={key} label={label} metric={report[key]} targetMs={target}/>)
          : <div className="py-12 text-center text-muted-foreground"><Activity className="w-8 h-8 mx-auto mb-2 opacity-30"/><p className="text-sm">Metrics accumulate as the app processes data</p></div>
        }
      </div>

      {/* SLA Uptime Panel */}
      <div className="rounded-xl border border-border bg-card px-5 py-5 space-y-4">
        <div className="flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-blue-400" />
          <p className="text-sm font-semibold">SLA Monitoring — 99.9% Uptime Target (SRS §5.4.1)</p>
        </div>
        <UptimeBar pct={sla.pct} />
        {sla.downtimeMs > 0 && (
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-muted-foreground">Downtime events (30 days)</p>
            <div className="space-y-1">
              {sla.events.slice(-5).map((e, i) => (
                <div key={i} className="flex items-center gap-3 text-xs">
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />
                  <span className="text-muted-foreground">
                    {new Date(e.start).toLocaleDateString()} {new Date(e.start).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    {" → "}
                    {new Date(e.end).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </span>
                  <span className="ml-auto text-amber-400 font-mono">{Math.round(e.durationMs / 1000)}s</span>
                </div>
              ))}
            </div>
            <p className="text-xs text-muted-foreground/60">
              Total downtime: {Math.round(sla.downtimeMs / 1000)}s
              ({((sla.downtimeMs / (30 * 24 * 3600 * 1000)) * 100).toFixed(4)}%)
            </p>
          </div>
        )}
        {sla.events.length === 0 && (
          <div className="flex items-center gap-2 text-xs text-emerald-400">
            <CheckCircle2 className="w-4 h-4" />
            No downtime events recorded in the past 30 days
          </div>
        )}
        <p className="text-xs text-muted-foreground/60 flex items-center gap-1.5">
          <Clock className="w-3.5 h-3.5" />
          Uptime measured by 60-second heartbeat pings. Integrate UptimeRobot via Settings → Webhook URL for external alerting.
        </p>
      </div>

      {/* Health endpoint info */}
      <div className="rounded-xl border border-border bg-card px-5 py-4 space-y-2">
        <div className="flex items-center gap-2">
          <Wifi className="w-4 h-4 text-teal-400" />
          <p className="text-sm font-semibold">Health Check Endpoint</p>
        </div>
        <p className="text-xs text-muted-foreground font-mono bg-secondary/50 px-3 py-2 rounded">
          GET http://localhost:38421/health → 200 OK {"{"}"status":"ok","version":"2.2-M"{"}"}
        </p>
        <p className="text-xs text-muted-foreground/70">
          The Electron backend exposes this endpoint on port 38421. Use it with UptimeRobot, Prometheus, or any monitoring tool. It reports engine status, last-prediction timestamp, and memory usage.
        </p>
      </div>

      <div className="rounded-xl border border-border bg-card px-5 py-4">
        <p className="text-sm font-semibold mb-1">Data retention status</p>
        <p className="text-xs text-muted-foreground">Raw signals: 7 days · Predictions & Action logs: 90 days · Preferences: indefinite. Auto-purge runs daily on startup.</p>
      </div>
    </div>
  )
}
