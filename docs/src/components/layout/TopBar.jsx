import { useState, useEffect } from 'react'
import { integrations, entities, realtime } from '@/api/electron'
import { RefreshCw, Brain, ShieldOff, Shield, Database, AlertTriangle, Wifi, WifiOff, CheckCheck } from 'lucide-react'

/**
 * TopBar — persistent toolbar across all pages
 * UI-3 (SRS): Always-visible panic button + undo last action
 * Also shows sync status, Claude AI status, and integration dots
 */
export default function TopBar() {
  const [status, setStatus]   = useState({})
  const [syncing, setSyncing] = useState(false)
  const [paused, setPaused]   = useState(false)
  const [toggling, setToggling] = useState(false)
  const [lastUndo, setLastUndo] = useState(null)
  const [syncDetail, setSyncDetail] = useState(null) // { state: 'syncing'|'synced'|'offline', ago: string }

  const refresh = async () => {
    const s = await integrations.getStatus()
    setStatus(s)
    const settings = await entities.UserSetting.list()
    setPaused(!!settings[0]?.automation_paused)
  }

  useEffect(() => {
    refresh()
    const iv = setInterval(refresh, 5000)
    realtime.on('integration:status', s => setStatus(s))
    realtime.on('undo:available',     e => setLastUndo(e))
    realtime.on('sync:latency',       d => {
      setSyncDetail({ state: 'synced', ago: 'just now', ms: d.ms })
      setTimeout(() => setSyncDetail(p => p?.state === 'synced' ? { ...p, ago: 'recently' } : p), 5000)
    })
    realtime.on('sync:offline',       () => setSyncDetail({ state: 'offline' }))
    realtime.on('sync:connecting',    () => setSyncDetail({ state: 'syncing' }))
    realtime.on('undo:expired',       () => setLastUndo(null))
    return () => {
      clearInterval(iv)
      realtime.off('integration:status')
      realtime.off('undo:available')
      realtime.off('undo:expired')
    }
  }, [])

  const handleSync = async () => {
    setSyncing(true)
    await integrations.syncNow()
    await refresh()
    setTimeout(() => setSyncing(false), 2000)
  }

  // UI-3: Panic button — toggle automation pause globally from any page
  const handlePanic = async () => {
    setToggling(true)
    const newPaused = !paused
    await entities.UserSetting.update('settings-1', { automation_paused: newPaused })
    setPaused(newPaused)
    setToggling(false)
  }

  const handleUndo = async () => {
    if (!lastUndo) return
    const { undo } = await import('@/api/electron')
    await undo.execute(lastUndo.id)
    setLastUndo(null)
  }

  const integrationDots = [
    { key: 'google',     label: 'Google Calendar & Gmail' },
    { key: 'slack',      label: 'Slack' },
    { key: 'filesystem', label: 'File system watcher' },
    { key: 'browser',    label: 'Chrome extension' },
  ]

  return (
    <header
      role="banner"
      aria-label="PFPA toolbar"
      className="h-12 border-b border-border px-4 flex items-center justify-between flex-shrink-0 gap-3"
    >
      {/* Left: AI + sync status */}
      <div className="flex items-center gap-3 min-w-0">
        {status.claude
          ? <span className="flex items-center gap-1.5 text-xs text-purple-400" aria-label="Claude AI active">
              <Brain className="w-3.5 h-3.5" aria-hidden="true" />
              <span className="hidden sm:inline">Claude AI</span>
            </span>
          : <span className="flex items-center gap-1.5 text-xs text-muted-foreground" aria-label="Claude AI not configured">
              <Brain className="w-3.5 h-3.5" aria-hidden="true" />
              <span className="hidden sm:inline">No Claude key</span>
            </span>
        }

        {/* Supabase sync-status indicator — Gap Analysis fix: show Syncing/Synced/Offline */}
        {status.supabase ? (
          <span
            className={`flex items-center gap-1 text-xs transition-colors ${
              syncDetail?.state === 'offline'  ? 'text-red-400' :
              syncDetail?.state === 'syncing'  ? 'text-amber-400' :
              'text-emerald-400'
            }`}
            aria-label={
              syncDetail?.state === 'offline'  ? 'Sync offline — changes queued locally' :
              syncDetail?.state === 'syncing'  ? 'Syncing…' :
              syncDetail?.state === 'synced'   ? `Synced ${syncDetail.ago}` :
              'Real-time sync active'
            }
            aria-live="polite"
          >
            {syncDetail?.state === 'offline'  ? <WifiOff className="w-3 h-3" aria-hidden="true" /> :
             syncDetail?.state === 'syncing'  ? <RefreshCw className="w-3 h-3 animate-spin" aria-hidden="true" /> :
             <CheckCheck className="w-3 h-3" aria-hidden="true" />}
            <span className="hidden sm:inline">
              {syncDetail?.state === 'offline'  ? 'Offline' :
               syncDetail?.state === 'syncing'  ? 'Syncing…' :
               syncDetail?.ago ? `Synced ${syncDetail.ago}` : 'Synced'}
            </span>
          </span>
        ) : (
          <span className="flex items-center gap-1 text-xs text-muted-foreground" aria-label="Local only — Supabase not connected">
            <Database className="w-3 h-3" aria-hidden="true" />
            <span className="hidden sm:inline">Local</span>
          </span>
        )}

        {/* Integration dots */}
        <div className="flex items-center gap-1.5" role="list" aria-label="Integration status">
          {integrationDots.map(({ key, label }) => (
            <span
              key={key}
              role="listitem"
              aria-label={`${label}: ${status[key] ? 'connected' : 'disconnected'}`}
              className={`w-2 h-2 rounded-full transition-colors ${status[key] ? 'bg-emerald-400' : 'bg-muted'}`}
            />
          ))}
        </div>
      </div>

      {/* Right: undo + sync + UI-3 panic button */}
      <div className="flex items-center gap-2 flex-shrink-0">

        {/* 30-second undo — shows when a reversible action was just executed */}
        {lastUndo && (
          <button
            onClick={handleUndo}
            aria-label={`Undo last action: ${lastUndo.actionType?.replace(/_/g,' ')}`}
            className="flex items-center gap-1.5 text-xs text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2.5 py-1 rounded-lg hover:bg-amber-500/20 transition-colors animate-pulse"
          >
            <RefreshCw className="w-3 h-3" aria-hidden="true" />
            Undo
          </button>
        )}

        {/* Sync button */}
        <button
          onClick={handleSync}
          aria-label={syncing ? 'Syncing integrations…' : 'Sync integrations now'}
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors px-2 py-1 rounded-lg hover:bg-secondary"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${syncing ? 'animate-spin' : ''}`} aria-hidden="true" />
          <span className="hidden sm:inline">Sync</span>
        </button>

        {/* UI-3: Panic button — always visible on every page (SRS requirement) */}
        <button
          onClick={handlePanic}
          disabled={toggling}
          aria-pressed={paused}
          aria-label={paused ? 'Resume automation — click to re-enable PFPA' : 'Panic button — click to pause all automation immediately'}
          className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg font-medium transition-all ${
            paused
              ? 'bg-red-500/20 text-red-400 border border-red-500/40 hover:bg-red-500/30'
              : 'bg-secondary text-muted-foreground border border-border hover:border-red-500/40 hover:text-red-400 hover:bg-red-500/10'
          }`}
        >
          {paused
            ? <><ShieldOff className="w-3.5 h-3.5" aria-hidden="true" /><span>Paused</span></>
            : <><Shield className="w-3.5 h-3.5" aria-hidden="true" /><span className="hidden sm:inline">Pause</span></>
          }
        </button>
      </div>
    </header>
  )
}
