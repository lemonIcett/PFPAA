import { useState, useEffect } from 'react'
import { formFill, realtime } from '@/api/electron'
import { useToast } from '@/components/ui/use-toast'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { FileInput, Plus, Trash2, Send, Globe } from 'lucide-react'

const COMMON_FIELDS = [
  { key: 'name', value: '' }, { key: 'email', value: '' },
  { key: 'phone', value: '' }, { key: 'company', value: '' },
  { key: 'address', value: '' }, { key: 'city', value: '' },
  { key: 'zip', value: '' }, { key: 'subject', value: '' },
  { key: 'message', value: '' },
]

export default function FormFillPage() {
  const [fields, setFields] = useState(COMMON_FIELDS.slice(0, 5))
  const [targetUrl, setTargetUrl] = useState('')
  const [filling, setFilling] = useState(false)
  const [lastResult, setLastResult] = useState(null)
  const { toast } = useToast()

  useEffect(() => {
    // Listen for form fill results from Chrome extension
    realtime.on('signal:new', (s) => {
      if (s.signal_type === 'browser_tab') {
        try {
          const data = JSON.parse(s.data || '{}')
          if (data.hasForms) {
            toast({ title: `📝 Form detected on ${s.source}`, description: `${data.formInputCount} input fields found. Click Fill Form to pre-fill.`, duration: 5000 })
          }
        } catch (e) {}
      }
    })
    return () => realtime.off('signal:new')
  }, [])

  const updateField = (i, key, value) => {
    setFields(prev => prev.map((f, idx) => idx === i ? { ...f, [key]: value } : f))
  }

  const addField = () => setFields(prev => [...prev, { key: '', value: '' }])
  const removeField = (i) => setFields(prev => prev.filter((_, idx) => idx !== i))

  const handleFill = async () => {
    const validFields = fields.filter(f => f.key && f.value)
    if (!validFields.length) { toast({ title: 'Add at least one field with a value', variant: 'destructive' }); return }
    setFilling(true)
    const result = await formFill.fill({ url: targetUrl, fields: validFields })
    setLastResult(result)
    setFilling(false)
    if (result.error) {
      toast({ title: 'Form fill failed', description: result.error, variant: 'destructive' })
    } else {
      toast({ title: `✓ Filled ${result.fieldsFilled} fields`, description: 'Form pre-filled in active Chrome tab', duration: 3000 })
    }
  }

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Form Pre-filling (PAS-2)</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Automatically fills browser form fields. Requires Chrome extension connected.
        </p>
      </div>

      <div className="rounded-xl border border-border bg-card p-5 space-y-4">
        <div className="flex items-center gap-2 text-xs text-muted-foreground px-3 py-2 rounded-lg bg-secondary/50">
          <Globe className="w-3.5 h-3.5"/>
          <span>Navigate to any form in Chrome — PFPA will detect it automatically. Or fill manually below and click Fill Form.</span>
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Target URL (optional — leave blank to fill active tab)</Label>
          <Input value={targetUrl} onChange={e => setTargetUrl(e.target.value)}
            placeholder="https://example.com/contact" className="bg-secondary border-border text-xs"/>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="text-xs text-muted-foreground">Fields to fill</Label>
            <button onClick={addField} className="flex items-center gap-1 text-xs text-primary hover:underline">
              <Plus className="w-3 h-3"/>Add field
            </button>
          </div>
          {fields.map((field, i) => (
            <div key={i} className="flex gap-2 items-center">
              <Input value={field.key} onChange={e => updateField(i, 'key', e.target.value)}
                placeholder="field name (e.g. email)" className="bg-secondary border-border text-xs w-40 flex-shrink-0"/>
              <Input value={field.value} onChange={e => updateField(i, 'value', e.target.value)}
                placeholder="value to fill" className="bg-secondary border-border text-xs flex-1"/>
              <button onClick={() => removeField(i)} className="text-muted-foreground hover:text-red-400 flex-shrink-0">
                <Trash2 className="w-3.5 h-3.5"/>
              </button>
            </div>
          ))}
        </div>

        <Button onClick={handleFill} disabled={filling} className="gap-2 w-full">
          <Send className="w-4 h-4"/>
          {filling ? 'Filling...' : 'Fill Form in Active Chrome Tab'}
        </Button>

        {lastResult && (
          <div className="rounded-lg bg-secondary/50 px-4 py-3 text-xs">
            <p className="font-medium text-foreground mb-1">Last result</p>
            <p className="text-muted-foreground">{lastResult.error || `${lastResult.fieldsFilled} fields filled successfully`}</p>
          </div>
        )}
      </div>

      <div className="rounded-xl border border-border bg-card p-5 space-y-2">
        <p className="text-sm font-semibold">How it works</p>
        <p className="text-xs text-muted-foreground leading-relaxed">
          PFPA sends field data through the WebSocket to the Chrome extension. The extension injects a script into the active tab that matches field keys to form inputs by name, id, placeholder, and label text — then fills them and fires React/Vue/Angular-compatible change events.
        </p>
        <p className="text-xs text-muted-foreground leading-relaxed">
          The Chrome extension also automatically detects when you navigate to a page with forms and notifies PFPA — you'll see a toast notification when a form is detected.
        </p>
      </div>
    </div>
  )
}
