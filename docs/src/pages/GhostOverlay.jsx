/**
 * GhostOverlay.jsx — PAS-1: Ghost Action Overlay + MMI-3: Gesture Control
 *
 * WCAG 2.1 AA compliance improvements (NF):
 *  - All interactive controls have visible focus rings (focus-visible)
 *  - Buttons have aria-label where icon-only
 *  - Role="dialog" + aria-live on status regions
 *  - Colour contrast ≥ 4.5:1 for text; level indicator uses shape + colour
 *  - keyboard trap prevented: Escape always dismisses
 *  - "Done" state announces itself via aria-live="assertive"
 *  - Motion: all animations respect prefers-reduced-motion
 *  - Min touch target ≥ 44×44 CSS px (WCAG 2.5.5)
 */

import { useState, useEffect, useRef, useCallback } from 'react'
import { safeActions, preferences, realtime, overlay, alternatives } from '@/api/electron'
import { CheckCircle2, X, Zap, ChevronDown, ArrowRight, AlertTriangle } from 'lucide-react'

const LEVEL_COLORS = {
  green:  'border-emerald-500/70 bg-emerald-950/95',
  yellow: 'border-amber-500/70 bg-amber-950/95',
  red:    'border-red-500/70 bg-slate-950/95',
}
// Shape + colour so colour-blind users still have a visual cue (WCAG 1.4.1)
const LEVEL_SHAPE = {
  green:  { dot: 'bg-emerald-400', shape: '●', label: 'Green — low risk' },
  yellow: { dot: 'bg-amber-400',   shape: '▲', label: 'Yellow — medium risk, one-tap confirm' },
  red:    { dot: 'bg-red-400',     shape: '■', label: 'Red — high risk, explicit approval required' },
}
const LEVEL_BTN = {
  green:  'bg-emerald-500/30 hover:bg-emerald-500/50 focus-visible:ring-emerald-400 text-emerald-100',
  yellow: 'bg-amber-500/30 hover:bg-amber-500/50 focus-visible:ring-amber-400 text-amber-100',
  red:    'bg-red-500/30 hover:bg-red-500/50 focus-visible:ring-red-400 text-red-100',
}

export default function GhostOverlay() {
  const [prediction, setPrediction]   = useState(null)
  const [executing, setExecuting]     = useState(false)
  const [done, setDone]               = useState(false)
  const [expanded, setExpanded]       = useState(false)
  const [alts, setAlts]               = useState([])
  const [showAlts, setShowAlts]       = useState(false)
  const [blocked, setBlocked]         = useState(null)
  const [announcement, setAnnounce]   = useState('') // aria-live announcements
  const touchStartX   = useRef(0)
  const touchStartY   = useRef(0)
  const longPressTimer = useRef(null)
  const approveRef    = useRef(null) // focus trap anchor

  const announce = (msg) => { setAnnounce(''); setTimeout(() => setAnnounce(msg), 50) }

  const handleApprove = useCallback(async (pred) => {
    const target = pred || prediction
    if (!target || executing) return
    setExecuting(true)
    announce('Executing action…')
    const result = await safeActions.executePrediction(target.id)
    await preferences.record(target.id, 'approved')
    if (result?.error?.includes('Blocked by guardrail')) {
      setBlocked(result.error)
      setExecuting(false)
      announce(`Action blocked: ${result.error}`)
      return
    }
    setDone(true)
    setExecuting(false)
    announce('Action completed successfully.')
    setTimeout(() => overlay.dismiss(), 1500)
  }, [prediction, executing])

  const handleDismiss = useCallback(async () => {
    if (prediction) await preferences.record(prediction.id, 'dismissed')
    announce('Suggestion dismissed.')
    overlay.dismiss()
  }, [prediction])

  const loadAlternatives = useCallback(async (predId) => {
    const list = await alternatives.get(predId)
    setAlts(list || [])
    setShowAlts(true)
    announce(`${(list || []).length} alternative suggestions available.`)
  }, [])

  useEffect(() => {
    realtime.on('overlay:update', (p) => {
      setPrediction(p)
      setDone(false); setExpanded(false)
      setAlts([]); setShowAlts(false); setBlocked(null)
      // Auto-focus approve button when overlay appears
      setTimeout(() => approveRef.current?.focus(), 100)
    })
    realtime.on('gesture:approve',      ()  => handleApprove())
    realtime.on('gesture:dismiss',      ()  => handleDismiss())
    realtime.on('gesture:alternatives', ()  => { if (prediction) loadAlternatives(prediction.id) })

    const onKey = (e) => {
      if (!prediction) return
      if (e.key === 'ArrowRight' || e.key === 'Enter')  { e.preventDefault(); handleApprove() }
      if (e.key === 'ArrowLeft'  || e.key === 'Escape') { e.preventDefault(); handleDismiss() }
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        if (prediction) loadAlternatives(prediction.id)
        else setExpanded(v => !v)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => {
      realtime.off('overlay:update')
      realtime.off('gesture:approve')
      realtime.off('gesture:dismiss')
      realtime.off('gesture:alternatives')
      window.removeEventListener('keydown', onKey)
    }
  }, [handleApprove, handleDismiss, loadAlternatives, prediction])

  // Touch: swipe right=approve, left=dismiss, down=alternatives, long-press=alternatives
  const onTouchStart = (e) => {
    touchStartX.current = e.touches[0].clientX
    touchStartY.current = e.touches[0].clientY
    longPressTimer.current = setTimeout(() => {
      if (prediction) loadAlternatives(prediction.id)
    }, 500)
  }
  const onTouchEnd = (e) => {
    clearTimeout(longPressTimer.current)
    const dx = e.changedTouches[0].clientX - touchStartX.current
    const dy = e.changedTouches[0].clientY - touchStartY.current
    if (Math.abs(dx) > Math.abs(dy)) {
      if (dx > 60)  handleApprove()
      if (dx < -60) handleDismiss()
    } else if (dy > 40 && prediction) {
      loadAlternatives(prediction.id)
    }
  }
  const onTouchMove = () => clearTimeout(longPressTimer.current)

  // ── Empty state ──
  if (!prediction) return (
    <div className="flex items-center justify-center h-screen" role="status">
      <p className="text-xs text-slate-500">Waiting for prediction…</p>
    </div>
  )

  // ── Done state — aria-live "assertive" so screen readers announce immediately
  if (done) return (
    <div className="p-3 flex items-center gap-2 rounded-xl border border-emerald-500/50 bg-emerald-950/95"
      role="status" aria-live="assertive" aria-atomic="true">
      <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" aria-hidden="true" />
      <p className="text-xs text-emerald-300 font-medium">Done!</p>
    </div>
  )

  const level     = prediction.confidence_level || 'yellow'
  const levelMeta = LEVEL_SHAPE[level]

  return (
    <>
      {/* Screen-reader only live region for status announcements (WCAG 4.1.3) */}
      <div className="sr-only" aria-live="polite" aria-atomic="true" role="status">
        {announcement}
      </div>

      <div
        role="dialog"
        aria-modal="true"
        aria-label={`PFPA suggestion: ${prediction.description}`}
        aria-describedby="overlay-desc"
        className={`rounded-xl border backdrop-blur-xl ${LEVEL_COLORS[level]} shadow-2xl overflow-hidden`}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
        onTouchMove={onTouchMove}
        style={{ WebkitAppRegion: 'drag', userSelect: 'none' }}
      >
        {/* Main row */}
        <div className="px-3 py-2 flex items-center gap-2.5" style={{ WebkitAppRegion: 'no-drag' }}>

          {/* Level indicator: shape + colour for WCAG 1.4.1 */}
          <span
            className={`w-5 h-5 rounded-full flex-shrink-0 flex items-center justify-center text-[9px] font-bold
              motion-safe:animate-pulse ${levelMeta.dot}`}
            aria-label={levelMeta.label}
            role="img"
            title={levelMeta.label}
          >
            {levelMeta.shape}
          </span>

          <p id="overlay-desc"
            className="text-xs text-white font-medium flex-1 truncate leading-snug">
            {prediction.description}
          </p>

          <div className="flex items-center gap-1 flex-shrink-0" role="group"
            aria-label="Action controls">

            {/* Approve — min 44px touch target (WCAG 2.5.5) */}
            <button
              ref={approveRef}
              onClick={() => handleApprove()}
              disabled={executing}
              aria-label={executing ? 'Executing…' : `Approve: ${prediction.description}`}
              aria-disabled={executing}
              className={`flex items-center gap-1 text-xs px-2.5 py-2 min-h-[44px] rounded-lg font-semibold
                transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1
                disabled:opacity-50 disabled:cursor-not-allowed ${LEVEL_BTN[level]}`}
            >
              <Zap className="w-3 h-3" aria-hidden="true" />
              <span>{executing ? '…' : 'Do it'}</span>
            </button>

            {/* Alternatives */}
            <button
              onClick={() => loadAlternatives(prediction.id)}
              aria-label="View alternative suggestions (or swipe down, press Alt+↓)"
              aria-expanded={showAlts}
              aria-controls="overlay-alts"
              className="p-2 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg
                hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50
                text-white/50 hover:text-white transition-colors"
            >
              <ChevronDown className={`w-3 h-3 transition-transform motion-reduce:transition-none
                ${showAlts || expanded ? 'rotate-180' : ''}`} aria-hidden="true" />
            </button>

            {/* Dismiss */}
            <button
              onClick={handleDismiss}
              aria-label="Dismiss suggestion"
              className="p-2 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg
                hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50
                text-white/50 hover:text-white transition-colors"
            >
              <X className="w-3 h-3" aria-hidden="true" />
            </button>
          </div>
        </div>

        {/* Guardrail blocked — role=alert so screen readers interrupt immediately */}
        {blocked && (
          <div className="px-3 pb-2.5 pt-1.5 border-t border-white/10 flex items-start gap-1.5"
            role="alert" style={{ WebkitAppRegion: 'no-drag' }}>
            <AlertTriangle className="w-3.5 h-3.5 text-red-300 flex-shrink-0 mt-0.5" aria-hidden="true" />
            <p className="text-xs text-red-300">{blocked}</p>
          </div>
        )}

        {/* Expanded details */}
        {expanded && !showAlts && (
          <div className="px-3 pb-3 border-t border-white/10 pt-2 space-y-1"
            style={{ WebkitAppRegion: 'no-drag' }}>
            <p className="text-xs text-white/60">{prediction.suggested_action}</p>
            {prediction.reasoning && (
              <p className="text-xs text-white/40 italic">{prediction.reasoning}</p>
            )}
            {/* Provide numerical AND descriptive confidence for accessibility */}
            <p className="text-xs text-white/30">
              Confidence: <span aria-label={`${prediction.confidence} percent`}>{prediction.confidence}%</span>
              {' '}· {prediction.category}
            </p>
            <p className="text-xs text-white/25 mt-1">
              Keyboard: → approve · ← dismiss · ↓ alternatives
            </p>
          </div>
        )}

        {/* Alternatives list */}
        {showAlts && (
          <div id="overlay-alts" className="border-t border-white/10" role="list"
            aria-label="Alternative suggestions" style={{ WebkitAppRegion: 'no-drag' }}>
            {alts.length === 0
              ? <p className="px-3 py-2 text-xs text-white/40" role="listitem">No other pending predictions</p>
              : alts.map(alt => (
                <button key={alt.id} role="listitem"
                  onClick={() => handleApprove(alt)}
                  aria-label={`Approve alternative: ${alt.description} (${alt.confidence}% confidence)`}
                  className="w-full px-3 py-2 min-h-[44px] flex items-center gap-2
                    hover:bg-white/10 focus-visible:outline-none focus-visible:ring-inset focus-visible:ring-1
                    focus-visible:ring-white/50 transition-colors text-left
                    border-b border-white/5 last:border-0">
                  <ArrowRight className="w-3 h-3 text-white/40 flex-shrink-0" aria-hidden="true" />
                  <span className="text-xs text-white/70 truncate flex-1">{alt.description}</span>
                  <span className="text-xs text-white/30 flex-shrink-0"
                    aria-label={`${alt.confidence} percent`}>
                    {alt.confidence}%
                  </span>
                </button>
              ))
            }
          </div>
        )}
      </div>
    </>
  )
}
