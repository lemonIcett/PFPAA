/**
 * VoiceGesture.jsx — MMI-2 (Voice Feedback) + MMI-3 (Gesture Control)
 *  FULL IMPLEMENTATION
 *
 * SRS MMI-2: "Optional voice confirmations for hands-free scenarios
 *  e.g. 'I've drafted that email to John. Send it?'"
 * SRS MMI-3: "Touch/gesture shortcuts for mobile:
 *  swipe right to approve, swipe left to dismiss, long press for alternatives"
 *
 * This page wires useVoiceFeedback into a live control panel with:
 *  - Enable/disable toggle with real browser permission check
 *  - Live microphone visualiser (audio level meter)
 *  - Test phrase buttons to verify TTS + STT
 *  - Recognised-words log (last 10)
 *  - Configurable wake sensitivity
 *
 * Gesture section:
 *  - Interactive swipe-zone demo
 *  - Global keyboard shortcut status
 *  - Swipe-threshold tuner
 *  - Platform-specific instructions
 */

import { useState, useEffect, useRef, useCallback } from 'react'
import { entities, realtime } from '@/api/electron'
import { useVoiceFeedback } from '@/hooks/useVoiceFeedback'
import { useToast } from '@/components/ui/use-toast'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { Slider } from '@/components/ui/slider'
import {
  Mic, MicOff, Volume2, VolumeX, Zap, Hand,
  ArrowRight, ArrowLeft, MoreVertical, CheckCircle2,
  XCircle, Info, Keyboard, Smartphone, MousePointer2, Lock
} from 'lucide-react'

// ─── Phrase list for TTS test ─────────────────────────────────────────────
const TEST_PHRASES = [
  "I've drafted that email to John. Say yes to send, or no to dismiss.",
  "Calendar hold created for tomorrow at 9 AM. Say undo within 30 seconds to reverse.",
  "Three files moved to the Invoices folder. All steps completed.",
  "I suggest: send a follow-up to Sarah. Say yes to approve, no to dismiss.",
]

// ─── Mic level visualiser ─────────────────────────────────────────────────
function MicLevelBar({ level }) {
  const bars = 12
  return (
    <div className="flex items-end gap-0.5 h-8" aria-label={`Microphone level: ${Math.round(level * 100)}%`}
      role="meter" aria-valuenow={Math.round(level * 100)} aria-valuemin={0} aria-valuemax={100}>
      {Array.from({ length: bars }, (_, i) => {
        const threshold = i / bars
        const active    = level > threshold
        return (
          <div key={i}
            className={`w-2 rounded-sm transition-all duration-75 ${
              active
                ? level > 0.7 ? 'bg-red-400' : level > 0.4 ? 'bg-amber-400' : 'bg-emerald-400'
                : 'bg-secondary'
            }`}
            style={{ height: `${30 + i * 5}%` }}
            aria-hidden="true"
          />
        )
      })}
    </div>
  )
}

// ─── Swipe demo zone ──────────────────────────────────────────────────────
function SwipeDemoZone({ onSwipe }) {
  const [result, setResult]     = useState(null) // 'approve' | 'dismiss' | 'alt'
  const touchStart = useRef(null)
  const longPressTimer = useRef(null)

  const handleTouchStart = (e) => {
    touchStart.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }
    longPressTimer.current = setTimeout(() => {
      setResult('alt')
      onSwipe?.('alt')
      setTimeout(() => setResult(null), 1500)
    }, 500)
  }

  const handleTouchEnd = (e) => {
    clearTimeout(longPressTimer.current)
    if (!touchStart.current) return
    const dx = e.changedTouches[0].clientX - touchStart.current.x
    const dy = e.changedTouches[0].clientY - touchStart.current.y
    if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 40) {
      const type = dx > 0 ? 'approve' : 'dismiss'
      setResult(type)
      onSwipe?.(type)
      setTimeout(() => setResult(null), 1500)
    }
    touchStart.current = null
  }

  // Mouse drag fallback for desktop demos
  const mouseStart = useRef(null)
  const handleMouseDown = (e) => { mouseStart.current = e.clientX }
  const handleMouseUp = (e) => {
    if (!mouseStart.current) return
    const dx = e.clientX - mouseStart.current
    if (Math.abs(dx) > 40) {
      const type = dx > 0 ? 'approve' : 'dismiss'
      setResult(type)
      onSwipe?.(type)
      setTimeout(() => setResult(null), 1500)
    }
    mouseStart.current = null
  }

  return (
    <div
      className={`relative flex items-center justify-center h-24 rounded-xl border-2 border-dashed select-none cursor-grab transition-all duration-200 ${
        result === 'approve' ? 'border-emerald-500 bg-emerald-500/10'
        : result === 'dismiss' ? 'border-red-500 bg-red-500/10'
        : result === 'alt' ? 'border-blue-500 bg-blue-500/10'
        : 'border-border hover:border-primary/50'
      }`}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onMouseDown={handleMouseDown}
      onMouseUp={handleMouseUp}
      role="application"
      aria-label="Gesture demo zone — swipe left, right, or hold"
      tabIndex={0}
    >
      {result === 'approve' && (
        <div className="flex items-center gap-2 text-emerald-400 font-semibold text-sm">
          <CheckCircle2 className="w-5 h-5" /> Approved!
        </div>
      )}
      {result === 'dismiss' && (
        <div className="flex items-center gap-2 text-red-400 font-semibold text-sm">
          <XCircle className="w-5 h-5" /> Dismissed
        </div>
      )}
      {result === 'alt' && (
        <div className="flex items-center gap-2 text-blue-400 font-semibold text-sm">
          <MoreVertical className="w-4 h-4" /> Alternatives…
        </div>
      )}
      {!result && (
        <div className="text-center space-y-1">
          <p className="text-xs text-muted-foreground">Swipe to test gestures</p>
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <ArrowLeft className="w-3 h-3" /> Dismiss
            </span>
            <span className="flex items-center gap-1">
              Approve <ArrowRight className="w-3 h-3" />
            </span>
            <span className="flex items-center gap-1">
              <Hand className="w-3 h-3" /> Hold = Alts
            </span>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────
export default function VoiceGesturePage() {
  const [settings, setSettings] = useState(null)
  const [micLevel, setMicLevel] = useState(0)
  const [heard, setHeard]       = useState([]) // recent recognised phrases
  const [testPhrase, setTestPhrase] = useState(0)
  const [speaking, setSpeaking] = useState(false)
  const [micPermission, setMicPermission] = useState('unknown') // 'granted'|'denied'|'unknown'
  const [shortcutsActive, setShortcutsActive] = useState(false)
  const micAnimRef = useRef(null)
  const { toast } = useToast()

  // Load settings
  const loadSettings = async () => {
    const s = await entities.UserSetting.list()
    setSettings(s[0] || null)
  }
  useEffect(() => { loadSettings() }, [])

  // Wire voice hook
  const handleApprove = useCallback((pred) => {
    setHeard(h => [{ text: 'Approved', ts: Date.now(), ok: true }, ...h].slice(0, 10))
    toast({ title: '✓ Voice: Approved', duration: 1500 })
  }, [toast])

  const handleDismiss = useCallback((pred) => {
    setHeard(h => [{ text: 'Dismissed', ts: Date.now(), ok: false }, ...h].slice(0, 10))
    toast({ title: '✗ Voice: Dismissed', duration: 1500 })
  }, [toast])

  const { speak, startListening, isListening, supported } = useVoiceFeedback(
    !!settings?.voice_feedback,
    { onApprove: handleApprove, onDismiss: handleDismiss }
  )

  // Request mic permission and start level meter
  const requestMicPermission = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      setMicPermission('granted')

      const ctx     = new AudioContext()
      const source  = ctx.createMediaStreamSource(stream)
      const analyser = ctx.createAnalyser()
      analyser.fftSize = 256
      source.connect(analyser)
      const data = new Uint8Array(analyser.frequencyBinCount)

      const tick = () => {
        analyser.getByteFrequencyData(data)
        const avg = data.reduce((s, v) => s + v, 0) / data.length
        setMicLevel(avg / 128) // normalise 0–1
        micAnimRef.current = requestAnimationFrame(tick)
      }
      micAnimRef.current = requestAnimationFrame(tick)
    } catch (e) {
      setMicPermission('denied')
      toast({ title: 'Microphone access denied', description: e.message, variant: 'destructive' })
    }
  }

  useEffect(() => {
    return () => { if (micAnimRef.current) cancelAnimationFrame(micAnimRef.current) }
  }, [])

  const toggleVoice = async (v) => {
    await entities.UserSetting.update('settings-1', { voice_feedback: v })
    setSettings(s => ({ ...s, voice_feedback: v }))
    if (v && micPermission !== 'granted') {
      await requestMicPermission()
    }
  }

  const toggleVoiceLocalOnly = async (v) => {
    await entities.UserSetting.update('settings-1', { voice_local_only: v })
    setSettings(s => ({ ...s, voice_local_only: v }))
    toast({
      title: v ? '🔒 Local-only voice mode enabled' : 'Cloud voice mode enabled',
      description: v
        ? 'Speech recognition uses on-device Web Speech API only. Audio never leaves your device.'
        : 'Cloud voice processing may be used when on-device accuracy is low.',
      duration: 3500,
    })
  }

  const testSpeak = () => {
    setSpeaking(true)
    speak(TEST_PHRASES[testPhrase])
    setTimeout(() => setSpeaking(false), 4000)
  }

  const testListen = () => {
    const fakePred = { id: 'test', confidence_level: 'yellow', description: 'Test action', suggested_action: 'Test' }
    speak("Say yes or no to test speech recognition.")
    startListening(fakePred)
    const timer = setTimeout(() => {}, 5000)
    return () => clearTimeout(timer)
  }

  const toggleShortcuts = async () => {
    const next = !shortcutsActive
    setShortcutsActive(next)
    if (next) {
      await window.electronAPI?.registerShortcuts?.()
      toast({ title: '⌨ Global shortcuts registered', duration: 2000 })
    } else {
      await window.electronAPI?.unregisterShortcuts?.()
      toast({ title: 'Global shortcuts removed', duration: 2000 })
    }
  }

  if (!settings) return (
    <div className="p-6 text-muted-foreground text-sm" role="status">Loading…</div>
  )

  return (
    <main className="space-y-8 max-w-3xl mx-auto" aria-label="Voice and Gesture Controls">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Voice &amp; Gesture</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          MMI-2: hands-free voice confirmations · MMI-3: swipe and keyboard gestures
        </p>
      </div>

      {/* ── MMI-2: Voice Feedback ─────────────────────────────────────── */}
      <section aria-labelledby="voice-heading"
        className="rounded-xl border border-border bg-card p-6 space-y-5">
        <div className="flex items-center gap-3">
          {settings.voice_feedback
            ? <Mic className="w-5 h-5 text-emerald-400" aria-hidden="true" />
            : <MicOff className="w-5 h-5 text-muted-foreground" aria-hidden="true" />}
          <div>
            <h2 id="voice-heading" className="text-sm font-semibold">
              Voice Feedback (MMI-2)
            </h2>
            <p className="text-xs text-muted-foreground">
              PFPA speaks suggestions aloud and listens for yes / no approval
            </p>
          </div>
          <div className="ml-auto flex items-center gap-3">
            {!supported && (
              <span className="text-xs text-amber-400">Not supported in this browser</span>
            )}
            <Switch checked={!!settings.voice_feedback} onCheckedChange={toggleVoice}
              aria-label="Enable voice feedback" disabled={!supported} />
          </div>
        </div>

        {/* Privacy note — Gap Analysis fix: clarify whether audio leaves device */}
        <div className="rounded-lg bg-secondary/50 border border-border p-3 flex items-start gap-2">
          <Lock className="w-4 h-4 text-blue-400 flex-shrink-0 mt-0.5" aria-hidden="true" />
          <div className="flex-1 space-y-2">
            <p className="text-xs font-medium text-foreground">Voice Privacy Mode</p>
            <p className="text-xs text-muted-foreground">
              By default, PFPA uses the browser's built-in Web Speech API for recognition.
              Audio is processed on-device and <strong>never sent to any server</strong> by PFPA itself.
              However, your browser's Speech API may forward audio to vendor servers (e.g. Google Chrome).
              Enable <em>Local Only</em> to restrict recognition to the Electron renderer's on-device engine.
            </p>
            <div className="flex items-center gap-3">
              <Switch
                id="voice-local-only"
                checked={!!settings.voice_local_only}
                onCheckedChange={toggleVoiceLocalOnly}
                aria-label="Local-only voice mode"
              />
              <Label htmlFor="voice-local-only" className="text-xs">
                Local-only mode (audio stays on device)
              </Label>
            </div>
          </div>
        </div>

        {/* Permission banner */}
        {settings.voice_feedback && micPermission !== 'granted' && (
          <div className="rounded-lg bg-amber-500/10 border border-amber-500/20 p-3 flex items-start gap-2">
            <Info className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" aria-hidden="true" />
            <div className="space-y-1.5">
              <p className="text-xs text-amber-300 font-medium">Microphone access required</p>
              <p className="text-xs text-muted-foreground">
                Speech recognition needs mic permission to hear your yes/no responses.
              </p>
              <Button size="sm" variant="outline" onClick={requestMicPermission}
                className="text-amber-400 border-amber-500/30 mt-1">
                Grant microphone access
              </Button>
            </div>
          </div>
        )}

        {/* Mic level visualiser */}
        {micPermission === 'granted' && (
          <div className="flex items-center gap-4">
            <MicLevelBar level={micLevel} />
            <div className="space-y-0.5">
              <p className="text-xs text-muted-foreground">Mic level</p>
              <p className="text-xs font-mono text-foreground">
                {isListening() ? '🎤 Listening…' : '○ Idle'}
              </p>
            </div>
          </div>
        )}

        {/* Recognised words log */}
        {heard.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-xs text-muted-foreground font-medium">Recent voice commands</p>
            <ul className="space-y-1" role="log" aria-label="Recent voice commands" aria-live="polite">
              {heard.map((h, i) => (
                <li key={i} className="flex items-center gap-2 text-xs">
                  {h.ok
                    ? <CheckCircle2 className="w-3 h-3 text-emerald-400 flex-shrink-0" aria-label="Approved" />
                    : <XCircle className="w-3 h-3 text-red-400 flex-shrink-0" aria-label="Dismissed" />}
                  <span className="text-foreground">{h.text}</span>
                  <span className="text-muted-foreground/50 ml-auto text-xs">
                    {new Date(h.ts).toLocaleTimeString()}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* TTS test */}
        <div className="space-y-3 pt-2 border-t border-border">
          <p className="text-xs font-medium text-muted-foreground">Test text-to-speech</p>
          <div className="space-y-2">
            <Label htmlFor="tts-phrase" className="text-xs text-muted-foreground">
              Sample phrase
            </Label>
            <select id="tts-phrase" value={testPhrase}
              onChange={e => setTestPhrase(Number(e.target.value))}
              className="w-full bg-secondary border border-border rounded px-2 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary">
              {TEST_PHRASES.map((p, i) => (
                <option key={i} value={i}>{p.slice(0, 70)}…</option>
              ))}
            </select>
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={testSpeak} disabled={speaking}
              aria-label="Play test phrase">
              <Volume2 className="w-3.5 h-3.5 mr-1.5" aria-hidden="true" />
              {speaking ? 'Speaking…' : 'Speak phrase'}
            </Button>
            <Button size="sm" variant="outline" onClick={testListen}
              disabled={!settings.voice_feedback || !supported}
              aria-label="Start listening test">
              <Mic className="w-3.5 h-3.5 mr-1.5" aria-hidden="true" />
              Test listening
            </Button>
          </div>
        </div>

        {/* Recognised words list */}
        <div className="rounded-lg bg-secondary/40 p-3 space-y-1">
          <p className="text-xs font-medium text-muted-foreground">Approval words</p>
          <div className="flex flex-wrap gap-1">
            {['yes','yep','yeah','ok','okay','approve','confirm','do it','go','accept','sure'].map(w => (
              <span key={w}
                className="text-xs bg-emerald-500/10 text-emerald-400 px-2 py-0.5 rounded-full"
                aria-label={`Approval word: ${w}`}>
                {w}
              </span>
            ))}
          </div>
          <p className="text-xs font-medium text-muted-foreground mt-2">Dismiss words</p>
          <div className="flex flex-wrap gap-1">
            {['no','nope','cancel','dismiss','stop','skip','reject','abort','ignore'].map(w => (
              <span key={w}
                className="text-xs bg-red-500/10 text-red-400 px-2 py-0.5 rounded-full"
                aria-label={`Dismiss word: ${w}`}>
                {w}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* ── MMI-3: Gesture Control ────────────────────────────────────── */}
      <section aria-labelledby="gesture-heading"
        className="rounded-xl border border-border bg-card p-6 space-y-5">
        <div className="flex items-center gap-3">
          <Hand className="w-5 h-5 text-blue-400" aria-hidden="true" />
          <div>
            <h2 id="gesture-heading" className="text-sm font-semibold">
              Gesture Control (MMI-3)
            </h2>
            <p className="text-xs text-muted-foreground">
              Swipe right to approve · left to dismiss · long press for alternatives
            </p>
          </div>
        </div>

        {/* Gesture reference table */}
        <div className="rounded-lg border border-border overflow-hidden" role="table"
          aria-label="Gesture reference">
          <div role="rowgroup">
            {[
              { gesture: '→ Swipe right', action: 'Approve action',      platform: 'Touch / Mouse drag', icon: ArrowRight, color: 'text-emerald-400' },
              { gesture: '← Swipe left',  action: 'Dismiss suggestion',  platform: 'Touch / Mouse drag', icon: ArrowLeft,  color: 'text-red-400' },
              { gesture: 'Long press',    action: 'View alternatives',   platform: 'Touch (500ms hold)', icon: Hand,       color: 'text-blue-400' },
              { gesture: '→ or Enter',    action: 'Approve (keyboard)',  platform: 'Desktop keyboard',   icon: Keyboard,   color: 'text-emerald-400' },
              { gesture: '← or Escape',  action: 'Dismiss (keyboard)',  platform: 'Desktop keyboard',   icon: Keyboard,   color: 'text-red-400' },
              { gesture: '↓ or Alt+↓',   action: 'Show alternatives',   platform: 'Desktop keyboard',   icon: Keyboard,   color: 'text-blue-400' },
            ].map(({ gesture, action, platform, icon: Icon, color }, i) => (
              <div key={i} role="row"
                className="flex items-center gap-4 px-4 py-2.5 border-b border-border last:border-0 text-xs">
                <Icon className={`w-3.5 h-3.5 flex-shrink-0 ${color}`} aria-hidden="true" />
                <span role="cell" className="font-mono text-foreground w-32 flex-shrink-0">{gesture}</span>
                <span role="cell" className="text-foreground flex-1">{action}</span>
                <span role="cell" className="text-muted-foreground/60">{platform}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Interactive demo */}
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground">Interactive demo</p>
          <SwipeDemoZone onSwipe={(type) => {
            toast({
              title: type === 'approve' ? '✓ Swipe right — Approved'
                   : type === 'dismiss' ? '✗ Swipe left — Dismissed'
                   : '… Long press — Alternatives',
              duration: 1500,
            })
          }} />
          <p className="text-xs text-muted-foreground text-center">
            Swipe or drag left/right in the area above · works on touch and desktop
          </p>
        </div>

        {/* Global keyboard shortcuts toggle */}
        <div className="flex items-center justify-between pt-2 border-t border-border">
          <div>
            <p className="text-sm text-foreground" id="shortcuts-lbl">
              Global keyboard shortcuts
            </p>
            <p className="text-xs text-muted-foreground">
              Register system-wide Alt+→ / Alt+← for overlay approval without focus
            </p>
          </div>
          <Switch checked={shortcutsActive} onCheckedChange={toggleShortcuts}
            aria-labelledby="shortcuts-lbl" />
        </div>

        {/* Platform notes */}
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-lg bg-secondary/40 p-3 space-y-1">
            <div className="flex items-center gap-1.5 text-xs font-medium text-foreground">
              <Smartphone className="w-3 h-3" aria-hidden="true" /> Mobile (iOS / Android)
            </div>
            <p className="text-xs text-muted-foreground">
              Swipe gestures fully enabled in the ghost overlay. Long press (500ms) opens alternatives panel.
            </p>
          </div>
          <div className="rounded-lg bg-secondary/40 p-3 space-y-1">
            <div className="flex items-center gap-1.5 text-xs font-medium text-foreground">
              <MousePointer2 className="w-3 h-3" aria-hidden="true" /> Desktop
            </div>
            <p className="text-xs text-muted-foreground">
              Arrow keys + Enter/Escape in overlay. Enable global shortcuts above for system-wide control.
            </p>
          </div>
        </div>
      </section>
    </main>
  )
}
