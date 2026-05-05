import { useState, useEffect } from 'react'
import { entities, actions, realtime, intelligence, safeActions, accuracy, preferences } from '@/api/electron'
import { SwipeableCard } from '@/hooks/useGestureEngine'
import { useToast } from '@/components/ui/use-toast'
import { useUndo } from '@/components/context/UndoContext'
import { useVoiceFeedback } from '@/hooks/useVoiceFeedback'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { CheckCircle2, XCircle, Play, Clock, Zap, Brain, ChevronDown, ChevronUp, ThumbsUp, ThumbsDown, Mic, MicOff } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'

const CONFIDENCE_COLORS = {
  green:  'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  yellow: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
  red:    'bg-red-500/15 text-red-400 border-red-500/30',
}

const STATUS_ICONS = {
  pending:       <Clock className="w-4 h-4 text-amber-400" />,
  auto_executed: <Zap className="w-4 h-4 text-emerald-400" />,
  executed:      <CheckCircle2 className="w-4 h-4 text-emerald-400" />,
  dismissed:     <XCircle className="w-4 h-4 text-muted-foreground" />,
  failed:        <XCircle className="w-4 h-4 text-red-400" />,
}

const ACTION_TYPE_LABELS = {
  create_calendar_event: '📅 Create calendar event',
  create_email_draft:    '✉️ Draft email',
  send_slack_message:    '💬 Send Slack message',
  organize_files:        '📁 Organize files',
  reminder:              '🔔 Reminder',
  none:                  '💡 Suggestion',
}

function PredictionCard({ prediction, onExecute, onDismiss, onRate }) {
  const [expanded, setExpanded] = useState(false)
  const [executing, setExecuting] = useState(false)
  const isPending = prediction.status === 'pending'

  const handleExecute = async () => {
    setExecuting(true)
    await onExecute(prediction.id)
    setExecuting(false)
  }

  return (
    <SwipeableCard
      enabled={isPending}
      onApprove={() => isPending && handleExecute()}
      onDismiss={() => isPending && onDismiss(prediction.id)}
      onAlternatives={() => setExpanded(true)}
    >
    <div className={`rounded-xl border bg-card overflow-hidden transition-all ${
      isPending ? 'border-border' : 'border-border/50 opacity-75'
    }`}>
      <div className="px-5 py-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2 flex-1 min-w-0">
            {STATUS_ICONS[prediction.status] || STATUS_ICONS.pending}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-foreground leading-snug">{prediction.description}</p>
              <p className="text-xs text-muted-foreground mt-0.5 truncate">{prediction.trigger_context}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${CONFIDENCE_COLORS[prediction.confidence_level]}`}>
              {prediction.confidence}%
            </span>
            <button onClick={() => setExpanded(e => !e)} className="text-muted-foreground hover:text-foreground">
              {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>
          </div>
        </div>

        <div className="mt-3 flex items-center gap-2 flex-wrap">
          <span className="text-xs bg-secondary px-2 py-0.5 rounded text-muted-foreground">
            {ACTION_TYPE_LABELS[prediction.action_type] || prediction.action_type}
          </span>
          <span className="text-xs text-muted-foreground">
            {formatDistanceToNow(new Date(prediction.created_date), { addSuffix: true })}
          </span>
        </div>

        {expanded && (
          <div className="mt-3 pt-3 border-t border-border space-y-2">
            <div>
              <p className="text-xs text-muted-foreground font-medium mb-1">Suggested action</p>
              <p className="text-sm text-foreground">{prediction.suggested_action}</p>
            </div>
            {prediction.reasoning && (
              <div>
                <p className="text-xs text-muted-foreground font-medium mb-1">Claude's reasoning</p>
                <p className="text-xs text-muted-foreground italic">{prediction.reasoning}</p>
              </div>
            )}
            {prediction.action_params && Object.keys(prediction.action_params).length > 0 && (
              <div>
                <p className="text-xs text-muted-foreground font-medium mb-1">Action parameters</p>
                <pre className="text-xs bg-secondary/50 rounded p-2 overflow-auto max-h-32 text-muted-foreground">
                  {JSON.stringify(prediction.action_params, null, 2)}
                </pre>
              </div>
            )}
            {prediction.execution_result && (
              <div>
                <p className="text-xs text-muted-foreground font-medium mb-1">Execution result</p>
                <pre className="text-xs bg-secondary/50 rounded p-2 text-emerald-400">
                  {JSON.stringify(prediction.execution_result, null, 2)}
                </pre>
              </div>
            )}
          </div>
        )}

        {prediction.status === 'pending' && (
          <div className="mt-3 flex gap-2">
            <Button size="sm" className="gap-1.5" onClick={handleExecute} disabled={executing}>
              <Play className="w-3 h-3" />
              {executing ? 'Executing...' : 'Execute now'}
            </Button>
            <Button size="sm" variant="outline" onClick={() => onDismiss(prediction.id)}>
              Dismiss
            </Button>
          </div>
        )}
        {(prediction.status === 'auto_executed' || prediction.status === 'executed') && prediction.wasCorrect === undefined && (
          <div className="mt-3 flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Was this correct?</span>
            <button onClick={() => onRate(prediction.id, true)}
              className="flex items-center gap-1 text-xs px-2 py-1 rounded bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-400 transition-colors">
              <ThumbsUp className="w-3 h-3"/>Yes
            </button>
            <button onClick={() => onRate(prediction.id, false)}
              className="flex items-center gap-1 text-xs px-2 py-1 rounded bg-red-500/15 hover:bg-red-500/25 text-red-400 transition-colors">
              <ThumbsDown className="w-3 h-3"/>No
            </button>
          </div>
        )}
        {prediction.wasCorrect !== undefined && (
          <p className="mt-2 text-xs text-muted-foreground">
            Rated: {prediction.wasCorrect ? '👍 correct' : '👎 wrong'} — contributes to accuracy tracking
          </p>
        )}
      </div>
    </div>
    </SwipeableCard>
  )
}

export default function PredictionsPage() {
  const [predictions, setPredictions] = useState([])
  const [filter, setFilter]           = useState('all')
  const [voiceEnabled, setVoiceEnabled] = useState(false)
  const { toast }      = useToast()
  const { handleUndo } = useUndo()

  // MMI-2: Bidirectional voice feedback
  const { supported: voiceSupported, isListening } = useVoiceFeedback(voiceEnabled, {
    onApprove: (prediction) => prediction?.id && handleExecute(prediction.id),
    onDismiss: (prediction) => prediction?.id && handleDismiss(prediction.id),
  })

  const load = async () => {
    const data = await entities.Prediction.list('-created_date', 100)
    setPredictions(data)
  }

  useEffect(() => {
    load()
    // Check settings for voice_feedback preference
    entities.UserSetting.list().then(s => setVoiceEnabled(!!s[0]?.voice_feedback))
    realtime.on('prediction:new', (p) => setPredictions(prev => [p, ...prev].slice(0, 100)))
    realtime.on('prediction:updated', (p) => setPredictions(prev => prev.map(x => x.id === p.id ? p : x)))
    return () => { realtime.off('prediction:new'); realtime.off('prediction:updated') }
  }, [])

  const handleExecute = async (id) => {
    const result = await safeActions.executePrediction(id)
    if (result.error) {
      toast({ title: 'Execution failed', description: result.error, variant: 'destructive' })
    } else {
      // BIE-3: Record preference — user approved this type of prediction
      await preferences.record(id, 'approved')
      toast({ title: '✓ Action executed', description: 'Check Action Log for details', duration: 5000 })
      load()
    }
  }

  const handleDismiss = async (id) => {
    await entities.Prediction.update(id, { status: 'dismissed' })
    // BIE-3: Record preference — user dismissed this type of prediction
    await preferences.record(id, 'dismissed')
    setPredictions(prev => prev.map(p => p.id === id ? { ...p, status: 'dismissed' } : p))
  }

  const handleRate = async (id, wasCorrect) => {
    await accuracy.rate(id, wasCorrect)
    setPredictions(prev => prev.map(p => p.id === id ? { ...p, wasCorrect } : p))
    toast({ title: wasCorrect ? '👍 Marked correct' : '👎 Marked wrong', description: 'Helps improve accuracy tracking', duration: 2000 })
  }

  const filtered = filter === 'all' ? predictions : predictions.filter(p => p.status === filter)
  const pendingCount = predictions.filter(p => p.status === 'pending').length

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Predictions</h1>
          <p className="text-sm text-muted-foreground mt-0.5">AI-predicted actions · approve, dismiss, or let PFPA execute automatically</p>
        </div>
        {voiceSupported && (
          <button
            onClick={() => {
              const next = !voiceEnabled
              setVoiceEnabled(next)
              entities.UserSetting.update('settings-1', { voice_feedback: next })
            }}
            aria-pressed={voiceEnabled}
            aria-label={voiceEnabled ? 'Voice feedback active — click to disable' : 'Enable voice feedback (MMI-2)'}
            className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border transition-all ${
              voiceEnabled
                ? 'bg-blue-500/15 text-blue-400 border-blue-500/30 hover:bg-blue-500/25'
                : 'bg-secondary text-muted-foreground border-border hover:text-foreground'
            }`}
          >
            {voiceEnabled && isListening()
              ? <Mic className="w-3.5 h-3.5 animate-pulse" aria-hidden="true" />
              : voiceEnabled
                ? <Mic className="w-3.5 h-3.5" aria-hidden="true" />
                : <MicOff className="w-3.5 h-3.5" aria-hidden="true" />
            }
            {voiceEnabled ? (isListening() ? 'Listening…' : 'Voice on') : 'Voice off'}
          </button>
        )}
      </div>

      <div className="flex gap-1.5">
        {['all','pending','auto_executed','executed','dismissed'].map(f => (
          <button key={f} onClick={() => setFilter(f)}
            className={`text-xs px-3 py-1.5 rounded-lg transition-colors ${filter === f ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground hover:text-foreground'}`}>
            {f === 'all' ? 'All' : f.replace('_',' ')}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-20 text-muted-foreground">
          <Brain className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p>No predictions yet — connect data sources to get started</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(p => (
            <PredictionCard key={p.id} prediction={p} onExecute={handleExecute} onDismiss={handleDismiss} onRate={handleRate} />
          ))}
        </div>
      )}
    </div>
  )
}
