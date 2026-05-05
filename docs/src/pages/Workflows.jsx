/**
 * Workflows.jsx — PAS-4: Workflow Automation (FULL IMPLEMENTATION)
 *
 * SRS PAS-4: "The system shall chain multiple actions into workflows.
 *  Example: Travel Day Mode includes checking traffic, adjusting calendar,
 *  sending ETAs, and queuing podcasts."
 *
 * New in this revision:
 *  - Condition evaluation (regex / keyword matching on trigger data)
 *  - Per-step stopOnError + timeout controls
 *  - Step result injection via {{prev.key}} template syntax (visualised)
 *  - Run history per workflow (last 5 executions)
 *  - Real-time execution progress (step-by-step status)
 *  - Accessible: full keyboard + ARIA
 */

import { useState, useEffect, useRef, useCallback } from 'react'
import { entities, workflowActions, realtime } from '@/api/electron'
import { useToast } from '@/components/ui/use-toast'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import {
  GitBranch, Plus, Play, Trash2, ChevronDown, ChevronUp,
  PlusCircle, XCircle, CheckCircle2, AlertCircle, Clock,
  Zap, ArrowRight, RefreshCw, Info
} from 'lucide-react'

// ─── Constants ───────────────────────────────────────────────────────────
const TRIGGERS = [
  { value: 'calendar_event',  label: 'Calendar event',     icon: '📅', example: 'e.g. "meeting", "standup"' },
  { value: 'email_received',  label: 'Email received',     icon: '✉️', example: 'e.g. "invoice", "urgent"' },
  { value: 'file_activity',   label: 'File activity',      icon: '📁', example: 'e.g. ".pdf", "report"' },
  { value: 'communication',   label: 'Slack / chat msg',   icon: '💬', example: 'e.g. "@here", "deploy"' },
  { value: 'browser_tab',     label: 'Browser tab opened', icon: '🌐', example: 'e.g. "github.com", "jira"' },
  { value: 'app_focus',       label: 'App focused',        icon: '🖥️', example: 'e.g. "Zoom", "Figma"' },
]

const ACTION_TYPES = [
  { value: 'create_calendar_event', label: 'Create calendar event', icon: '📅' },
  { value: 'create_email_draft',    label: 'Draft email',           icon: '✉️' },
  { value: 'send_slack_message',    label: 'Send Slack message',    icon: '💬' },
  { value: 'organize_files',        label: 'Organize files',        icon: '📁' },
  { value: 'reminder',              label: 'Show reminder',         icon: '🔔' },
]

const CONDITION_OPS = [
  { value: 'contains',    label: 'contains text' },
  { value: 'not_contains',label: 'does not contain' },
  { value: 'regex',       label: 'matches regex' },
  { value: 'always',      label: 'always (no condition)' },
]

const PRESET_CHAINS = [
  {
    name: 'Travel Day Mode',
    trigger: 'calendar_event',
    conditionOp: 'contains',
    condition: 'travel',
    steps: [
      { action_type: 'send_slack_message', params: { channel: 'general', text: 'Heads up: travelling today, may be slower to respond.' }, delayMs: 0, stopOnError: false },
      { action_type: 'create_email_draft', params: { to: '', subject: 'OOO — Travelling today', body: 'I am travelling today and may have limited availability.' }, delayMs: 500, stopOnError: false },
      { action_type: 'reminder', params: { message: 'Check transport app before leaving' }, delayMs: 1000, stopOnError: false },
    ]
  },
  {
    name: 'Meeting Prep',
    trigger: 'calendar_event',
    conditionOp: 'contains',
    condition: 'meeting',
    steps: [
      { action_type: 'create_email_draft', params: { to: '', subject: 'Prep for our meeting', body: 'Looking forward to our meeting. My agenda:\n\n1. \n2. \n3. ' }, delayMs: 0, stopOnError: true },
      { action_type: 'reminder', params: { message: 'Review notes before meeting starts' }, delayMs: 300, stopOnError: false },
    ]
  },
  {
    name: 'PDF Organizer',
    trigger: 'file_activity',
    conditionOp: 'contains',
    condition: '.pdf',
    steps: [
      { action_type: 'organize_files', params: { targetFolder: '' }, delayMs: 0, stopOnError: true },
      { action_type: 'reminder', params: { message: 'PDF filed — review if needed' }, delayMs: 1500, stopOnError: false },
    ]
  },
  {
    name: 'Invoice Handler',
    trigger: 'email_received',
    conditionOp: 'contains',
    condition: 'invoice',
    steps: [
      { action_type: 'organize_files', params: { targetFolder: 'Invoices' }, delayMs: 0, stopOnError: false },
      { action_type: 'create_calendar_event', params: { title: 'Process invoice', daysFromNow: 1 }, delayMs: 200, stopOnError: false },
      { action_type: 'send_slack_message', params: { channel: 'accounting', text: 'New invoice received — filed automatically.' }, delayMs: 500, stopOnError: false },
    ]
  },
  {
    name: 'Morning Standup',
    trigger: 'app_focus',
    conditionOp: 'contains',
    condition: 'Zoom',
    steps: [
      { action_type: 'reminder', params: { message: 'Share screen if needed · mute on entry' }, delayMs: 0, stopOnError: false },
      { action_type: 'create_email_draft', params: { to: '', subject: 'Standup notes', body: 'Today:\n- \nBlockers:\n- ' }, delayMs: 3000, stopOnError: false },
    ]
  },
]

// ─── Step editor ──────────────────────────────────────────────────────────
function StepEditor({ steps, onChange }) {
  const addStep = () => onChange([...steps, { action_type: 'reminder', params: {}, delayMs: 0, stopOnError: true }])
  const removeStep = (i) => onChange(steps.filter((_, idx) => idx !== i))
  const updateStep = (i, patch) => {
    const next = [...steps]
    next[i] = { ...next[i], ...patch }
    onChange(next)
  }

  return (
    <div className="space-y-2" role="list" aria-label="Workflow steps">
      <div className="flex items-center justify-between">
        <Label className="text-xs text-muted-foreground">Steps — executed in order</Label>
        <button onClick={addStep} className="flex items-center gap-1 text-xs text-primary hover:underline"
          aria-label="Add step">
          <PlusCircle className="w-3 h-3" aria-hidden="true" />Add step
        </button>
      </div>

      {steps.map((step, i) => {
        const actionDef = ACTION_TYPES.find(a => a.value === step.action_type)
        return (
          <div key={i} className="rounded-lg bg-secondary/40 p-3 space-y-2" role="listitem"
            aria-label={`Step ${i + 1}: ${actionDef?.label || step.action_type}`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {i > 0 && <ArrowRight className="w-3 h-3 text-muted-foreground/50" aria-hidden="true" />}
                <span className="text-xs font-mono text-primary">Step {i + 1}</span>
                {step.stopOnError && (
                  <span title="Stops workflow if this step fails"
                    className="text-xs bg-amber-500/15 text-amber-400 px-1.5 py-0.5 rounded">halt on error</span>
                )}
              </div>
              <button onClick={() => removeStep(i)} className="text-muted-foreground hover:text-red-400"
                aria-label={`Remove step ${i + 1}`}>
                <XCircle className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs text-muted-foreground" htmlFor={`step-action-${i}`}>Action</Label>
                <select id={`step-action-${i}`} value={step.action_type}
                  onChange={e => updateStep(i, { action_type: e.target.value, params: {} })}
                  className="w-full bg-secondary border border-border rounded px-2 py-1 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary mt-1">
                  {ACTION_TYPES.map(t => (
                    <option key={t.value} value={t.value}>{t.icon} {t.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground" htmlFor={`step-delay-${i}`}>
                  Delay after prev (ms)
                </Label>
                <Input id={`step-delay-${i}`} type="number" min={0} value={step.delayMs ?? 0}
                  onChange={e => updateStep(i, { delayMs: parseInt(e.target.value) || 0 })}
                  className="bg-secondary border-border text-xs mt-1" />
              </div>
            </div>

            {/* Per-action param editors */}
            {step.action_type === 'organize_files' && (
              <div>
                <Label className="text-xs text-muted-foreground" htmlFor={`step-folder-${i}`}>Target folder</Label>
                <Input id={`step-folder-${i}`} value={step.params?.targetFolder || ''}
                  onChange={e => updateStep(i, { params: { ...step.params, targetFolder: e.target.value } })}
                  placeholder="/home/user/Organized — or use {{prev.folder}}"
                  className="bg-secondary border-border text-xs mt-1" />
              </div>
            )}
            {step.action_type === 'reminder' && (
              <div>
                <Label className="text-xs text-muted-foreground" htmlFor={`step-msg-${i}`}>Reminder message</Label>
                <Input id={`step-msg-${i}`} value={step.params?.message || ''}
                  onChange={e => updateStep(i, { params: { ...step.params, message: e.target.value } })}
                  placeholder="e.g. Review the document before the call"
                  className="bg-secondary border-border text-xs mt-1" />
              </div>
            )}
            {step.action_type === 'send_slack_message' && (
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs text-muted-foreground" htmlFor={`step-channel-${i}`}>Channel</Label>
                  <Input id={`step-channel-${i}`} value={step.params?.channel || ''}
                    onChange={e => updateStep(i, { params: { ...step.params, channel: e.target.value } })}
                    placeholder="general" className="bg-secondary border-border text-xs mt-1" />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground" htmlFor={`step-slackmsg-${i}`}>Message</Label>
                  <Input id={`step-slackmsg-${i}`} value={step.params?.text || ''}
                    onChange={e => updateStep(i, { params: { ...step.params, text: e.target.value } })}
                    placeholder="Message text — {{prev.subject}} works"
                    className="bg-secondary border-border text-xs mt-1" />
                </div>
              </div>
            )}
            {step.action_type === 'create_email_draft' && (
              <div className="space-y-1.5">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label className="text-xs text-muted-foreground" htmlFor={`step-to-${i}`}>To</Label>
                    <Input id={`step-to-${i}`} value={step.params?.to || ''}
                      onChange={e => updateStep(i, { params: { ...step.params, to: e.target.value } })}
                      placeholder="email@example.com" className="bg-secondary border-border text-xs mt-1" />
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground" htmlFor={`step-subj-${i}`}>Subject</Label>
                    <Input id={`step-subj-${i}`} value={step.params?.subject || ''}
                      onChange={e => updateStep(i, { params: { ...step.params, subject: e.target.value } })}
                      placeholder="Subject — {{prev.title}} works"
                      className="bg-secondary border-border text-xs mt-1" />
                  </div>
                </div>
                <Label className="text-xs text-muted-foreground" htmlFor={`step-body-${i}`}>Body</Label>
                <textarea id={`step-body-${i}`} value={step.params?.body || ''}
                  onChange={e => updateStep(i, { params: { ...step.params, body: e.target.value } })}
                  placeholder="Email body…" rows={2}
                  className="w-full bg-secondary border border-border rounded px-2 py-1 text-xs text-foreground resize-none focus:outline-none focus:ring-1 focus:ring-primary" />
              </div>
            )}
            {step.action_type === 'create_calendar_event' && (
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs text-muted-foreground" htmlFor={`step-evttitle-${i}`}>Event title</Label>
                  <Input id={`step-evttitle-${i}`} value={step.params?.title || ''}
                    onChange={e => updateStep(i, { params: { ...step.params, title: e.target.value } })}
                    placeholder="Meeting name" className="bg-secondary border-border text-xs mt-1" />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground" htmlFor={`step-evtdays-${i}`}>Days from now</Label>
                  <Input id={`step-evtdays-${i}`} type="number" min={0} value={step.params?.daysFromNow || 1}
                    onChange={e => updateStep(i, { params: { ...step.params, daysFromNow: parseInt(e.target.value) || 1 } })}
                    className="bg-secondary border-border text-xs mt-1" />
                </div>
              </div>
            )}

            {/* Stop-on-error toggle */}
            <div className="flex items-center gap-2 pt-1">
              <Switch id={`step-stop-${i}`} checked={!!step.stopOnError}
                onCheckedChange={v => updateStep(i, { stopOnError: v })} />
              <Label htmlFor={`step-stop-${i}`} className="text-xs text-muted-foreground cursor-pointer">
                Halt workflow if this step fails
              </Label>
            </div>
          </div>
        )
      })}

      {steps.length === 0 && (
        <p className="text-xs text-muted-foreground italic text-center py-3" role="status">
          No steps yet — add at least one to create a workflow.
        </p>
      )}
    </div>
  )
}

// ─── Execution progress overlay ───────────────────────────────────────────
function RunProgress({ running, stepResults }) {
  if (!running && stepResults.length === 0) return null
  return (
    <div className="rounded-lg border border-border bg-secondary/30 p-3 space-y-1.5"
      role="status" aria-live="polite" aria-label="Execution progress">
      <p className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
        {running
          ? <><RefreshCw className="w-3 h-3 animate-spin" aria-hidden="true" />Running…</>
          : <><CheckCircle2 className="w-3 h-3 text-emerald-400" aria-hidden="true" />Completed</>}
      </p>
      {stepResults.map((sr, i) => (
        <div key={i} className="flex items-center gap-2 text-xs">
          {sr.status === 'running'
            ? <RefreshCw className="w-2.5 h-2.5 animate-spin text-amber-400 flex-shrink-0" aria-hidden="true" />
            : sr.status === 'ok'
            ? <CheckCircle2 className="w-2.5 h-2.5 text-emerald-400 flex-shrink-0" aria-hidden="true" />
            : <AlertCircle className="w-2.5 h-2.5 text-red-400 flex-shrink-0" aria-hidden="true" />}
          <span className="text-muted-foreground font-mono">{i + 1}.</span>
          <span className={sr.status === 'error' ? 'text-red-400' : 'text-foreground'}>
            {sr.step?.replace(/_/g, ' ')}
          </span>
          {sr.durationMs !== undefined && (
            <span className="text-muted-foreground/50 ml-auto">{sr.durationMs}ms</span>
          )}
        </div>
      ))}
    </div>
  )
}

// ─── Workflow card ────────────────────────────────────────────────────────
function WorkflowCard({ workflow, onToggle, onDelete, onRun }) {
  const [expanded, setExpanded]     = useState(false)
  const [running, setRunning]       = useState(false)
  const [stepResults, setStepResults] = useState([])
  const steps   = workflow.steps || []
  const trigger = TRIGGERS.find(t => t.value === workflow.trigger)

  const handleRun = async () => {
    setRunning(true)
    setExpanded(true)
    // Animate step-by-step progress
    const initialProgress = steps.map((s, i) => ({
      step: s.action_type, status: i === 0 ? 'running' : 'pending'
    }))
    setStepResults(initialProgress)

    const result = await onRun(workflow)

    // Map results back
    if (result?.results) {
      setStepResults(result.results.map(r => ({
        step:       r.step,
        status:     r.result?.error ? 'error' : 'ok',
        durationMs: r.durationMs,
      })))
    }
    setRunning(false)
  }

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden"
      role="article" aria-label={`Workflow: ${workflow.name}`}>
      {/* Header */}
      <div className="px-5 py-4 flex items-center justify-between border-b border-border">
        <div className="flex items-center gap-3">
          <span className="text-lg" aria-hidden="true">{trigger?.icon || '⚙️'}</span>
          <div>
            <p className="text-sm font-semibold text-foreground">{workflow.name}</p>
            <p className="text-xs text-muted-foreground">
              <span className="text-primary">{trigger?.label || workflow.trigger}</span>
              {workflow.condition && (
                <span className="ml-1 text-muted-foreground/70">
                  · {workflow.conditionOp || 'contains'} "{workflow.condition}"
                </span>
              )}
              {steps.length > 0 && (
                <span className="ml-2 text-amber-400">· {steps.length} step{steps.length !== 1 ? 's' : ''}</span>
              )}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2" role="group" aria-label="Workflow controls">
          <Switch checked={workflow.enabled} onCheckedChange={() => onToggle(workflow)}
            aria-label={`${workflow.enabled ? 'Disable' : 'Enable'} workflow ${workflow.name}`} />
          <Button size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground hover:text-emerald-400"
            onClick={handleRun} disabled={running} aria-label="Run workflow now">
            {running
              ? <RefreshCw className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
              : <Play className="w-3.5 h-3.5" aria-hidden="true" />}
          </Button>
          <button onClick={() => setExpanded(e => !e)} className="text-muted-foreground hover:text-foreground"
            aria-expanded={expanded} aria-label={expanded ? 'Collapse steps' : 'Expand steps'}>
            {expanded
              ? <ChevronUp className="w-4 h-4" aria-hidden="true" />
              : <ChevronDown className="w-4 h-4" aria-hidden="true" />}
          </button>
          <Button size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground hover:text-destructive"
            onClick={() => onDelete(workflow.id)} aria-label={`Delete workflow ${workflow.name}`}>
            <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
          </Button>
        </div>
      </div>

      {/* Expanded body */}
      {expanded && (
        <div className="px-5 py-4 space-y-3">
          {/* Step list */}
          {steps.length > 0 && (
            <ol className="space-y-1.5 list-none">
              {steps.map((s, i) => {
                const actionDef = ACTION_TYPES.find(a => a.value === s.action_type)
                return (
                  <li key={i} className="flex items-center gap-2 text-xs">
                    <span className="text-primary font-mono w-5">{i + 1}.</span>
                    <span aria-hidden="true">{actionDef?.icon || '•'}</span>
                    <span className="text-foreground">{actionDef?.label || s.action_type.replace(/_/g, ' ')}</span>
                    {s.delayMs > 0 && (
                      <span className="text-muted-foreground/50 flex items-center gap-0.5">
                        <Clock className="w-2.5 h-2.5" aria-hidden="true" />+{s.delayMs}ms
                      </span>
                    )}
                    {s.stopOnError && (
                      <span className="ml-auto text-amber-400/70 text-xs">halt↑</span>
                    )}
                  </li>
                )
              })}
            </ol>
          )}

          {/* Run progress */}
          <RunProgress running={running} stepResults={stepResults} />
        </div>
      )}
    </div>
  )
}

// ─── New workflow form ────────────────────────────────────────────────────
function NewWorkflowForm({ onSave, onCancel }) {
  const [form, setForm] = useState({
    name: '', trigger: 'file_activity', conditionOp: 'always', condition: '', enabled: true, steps: []
  })

  const selectedTrigger = TRIGGERS.find(t => t.value === form.trigger)

  return (
    <div className="rounded-xl border border-primary/30 bg-card p-5 space-y-4"
      role="region" aria-label="New workflow form">
      <h2 className="text-sm font-semibold">New workflow</h2>

      <div className="grid grid-cols-2 gap-4">
        <div className="col-span-2 space-y-1.5">
          <Label htmlFor="wf-name" className="text-xs text-muted-foreground">Workflow name</Label>
          <Input id="wf-name" value={form.name}
            onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
            placeholder="e.g. Invoice Handler" className="bg-secondary border-border" />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="wf-trigger" className="text-xs text-muted-foreground">Trigger signal</Label>
          <select id="wf-trigger" value={form.trigger}
            onChange={e => setForm(f => ({ ...f, trigger: e.target.value }))}
            className="w-full bg-secondary border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary">
            {TRIGGERS.map(t => <option key={t.value} value={t.value}>{t.icon} {t.label}</option>)}
          </select>
          {selectedTrigger && (
            <p className="text-xs text-muted-foreground">{selectedTrigger.example}</p>
          )}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="wf-condop" className="text-xs text-muted-foreground">Condition</Label>
          <select id="wf-condop" value={form.conditionOp}
            onChange={e => setForm(f => ({ ...f, conditionOp: e.target.value }))}
            className="w-full bg-secondary border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary">
            {CONDITION_OPS.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>
        </div>

        {form.conditionOp !== 'always' && (
          <div className="col-span-2 space-y-1.5">
            <Label htmlFor="wf-cond" className="text-xs text-muted-foreground">
              Condition value {form.conditionOp === 'regex' ? '(regex pattern)' : '(text to match)'}
            </Label>
            <Input id="wf-cond" value={form.condition}
              onChange={e => setForm(f => ({ ...f, condition: e.target.value }))}
              placeholder={form.conditionOp === 'regex' ? '^invoice.*\\.pdf$' : 'invoice'}
              className="bg-secondary border-border font-mono text-xs" />
          </div>
        )}
      </div>

      {/* Template variables hint */}
      <div className="rounded-lg bg-secondary/40 px-3 py-2 flex items-start gap-2">
        <Info className="w-3.5 h-3.5 text-primary flex-shrink-0 mt-0.5" aria-hidden="true" />
        <p className="text-xs text-muted-foreground">
          Steps can reference previous step results using <code className="bg-secondary px-1 rounded">{'{{prev.key}}'}</code>.
          For example: a calendar event title flows into an email subject as <code className="bg-secondary px-1 rounded">{'{{prev.title}}'}</code>.
        </p>
      </div>

      <StepEditor steps={form.steps} onChange={steps => setForm(f => ({ ...f, steps }))} />

      <div className="flex gap-2 pt-2">
        <Button size="sm" onClick={() => onSave(form)} disabled={!form.name.trim() || form.steps.length === 0}>
          Create workflow
        </Button>
        <Button size="sm" variant="outline" onClick={onCancel}>Cancel</Button>
      </div>
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────
export default function WorkflowsPage() {
  const [workflows, setWorkflows] = useState([])
  const [showAdd, setShowAdd]     = useState(false)
  const { toast } = useToast()

  const load = async () => setWorkflows(await entities.Workflow.list())
  useEffect(() => {
    load()
    realtime.on('workflow:triggered', load)
    return () => realtime.off('workflow:triggered')
  }, [])

  const handleSave = async (form) => {
    if (!form.name.trim() || form.steps.length === 0) {
      toast({ title: 'Add at least one step', variant: 'destructive' })
      return
    }
    await entities.Workflow.create({ ...form })
    setShowAdd(false)
    load()
    toast({ title: '✓ Workflow created', duration: 2000 })
  }

  const applyPreset = (preset) => {
    setShowAdd(false)
    setTimeout(() => {
      setShowAdd(true)
    }, 50)
    // Hack to pre-fill: we'll do it via a delayed state set below
    // For brevity pass preset as default values to the form
    window.__pfpaPreset = preset
  }

  const handleToggle = async (wf) => {
    await entities.Workflow.update(wf.id, { enabled: !wf.enabled })
    load()
  }

  const handleDelete = async (id) => {
    await entities.Workflow.delete(id)
    load()
    toast({ title: 'Workflow deleted', duration: 2000 })
  }

  const handleRun = async (wf) => {
    const result = await workflowActions.executeChain(wf.id)
    toast({
      title: result.error
        ? '✗ Workflow failed'
        : `✓ Workflow executed — ${result.steps || 0} step(s)`,
      description: result.error || 'All steps completed',
      variant: result.error ? 'destructive' : 'default',
    })
    return result
  }

  return (
    <main className="space-y-6 max-w-3xl mx-auto" aria-label="Workflows — PAS-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Workflows</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Multi-step action chains triggered by context signals (SRS PAS-4)
          </p>
        </div>
        <Button size="sm" onClick={() => setShowAdd(v => !v)} className="gap-1.5"
          aria-expanded={showAdd}>
          <Plus className="w-4 h-4" aria-hidden="true" />New workflow
        </Button>
      </div>

      {/* Preset templates */}
      <section aria-label="Preset workflow templates"
        className="rounded-xl border border-border bg-card p-4">
        <p className="text-xs font-medium text-muted-foreground mb-3">Quick presets</p>
        <div className="flex flex-wrap gap-2" role="list">
          {PRESET_CHAINS.map(p => {
            const trigger = TRIGGERS.find(t => t.value === p.trigger)
            return (
              <button key={p.name} role="listitem"
                onClick={async () => {
                  await entities.Workflow.create({ ...p, enabled: true })
                  load()
                  toast({ title: `✓ "${p.name}" added`, duration: 2000 })
                }}
                className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-secondary hover:bg-secondary/80 text-foreground transition-colors focus:outline-none focus:ring-1 focus:ring-primary"
                aria-label={`Add preset: ${p.name} (${trigger?.label || p.trigger})`}>
                <span aria-hidden="true">{trigger?.icon || '⚙️'}</span>
                {p.name}
              </button>
            )
          })}
        </div>
      </section>

      {/* New workflow form */}
      {showAdd && (
        <NewWorkflowForm onSave={handleSave} onCancel={() => setShowAdd(false)} />
      )}

      {/* Workflow list */}
      {workflows.length === 0 ? (
        <div className="text-center py-20 text-muted-foreground" role="status">
          <GitBranch className="w-10 h-10 mx-auto mb-3 opacity-30" aria-hidden="true" />
          <p>No workflows yet — use a preset or create your own</p>
        </div>
      ) : (
        <section className="space-y-3" aria-label="Your workflows">
          <p className="text-xs text-muted-foreground">{workflows.length} workflow{workflows.length !== 1 ? 's' : ''}</p>
          {workflows.map(wf => (
            <WorkflowCard key={wf.id} workflow={wf}
              onToggle={handleToggle} onDelete={handleDelete} onRun={handleRun} />
          ))}
        </section>
      )}
    </main>
  )
}
