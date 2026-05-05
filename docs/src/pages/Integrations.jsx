import { useState, useEffect } from 'react'
import { integrations, realtime } from '@/api/electron'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  CheckCircle2, XCircle, RefreshCw, ExternalLink,
  Mail, Calendar, MessageSquare, Globe, FolderOpen, Cpu, Brain, Database
} from 'lucide-react'

function StatusBadge({ connected }) {
  return connected
    ? <span className="flex items-center gap-1.5 text-xs text-emerald-400 font-medium"><CheckCircle2 className="w-3.5 h-3.5" />Connected</span>
    : <span className="flex items-center gap-1.5 text-xs text-muted-foreground"><XCircle className="w-3.5 h-3.5" />Not connected</span>
}

function GoogleCard({ status, onStatusChange }) {
  const [step, setStep] = useState('idle')
  const [creds, setCreds] = useState({ client_id: '', client_secret: '' })
  const [authCode, setAuthCode] = useState('')
  const [authUrl, setAuthUrl] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSaveCreds = async () => {
    if (!creds.client_id || !creds.client_secret) return
    setLoading(true)
    await integrations.setGoogleCredentials(creds)
    const res = await integrations.getGoogleAuthUrl()
    if (res.error) { setError(res.error); setLoading(false); return }
    setAuthUrl(res.url); setStep('auth'); setLoading(false)
  }

  const handleExchangeCode = async () => {
    if (!authCode.trim()) return
    setLoading(true); setError('')
    const res = await integrations.exchangeGoogleCode(authCode.trim())
    if (res.error) { setError(res.error); setLoading(false); return }
    setStep('done'); setLoading(false); onStatusChange()
  }

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b border-border">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-red-500/10 flex gap-0.5">
            <Calendar className="w-4 h-4 text-red-400" />
            <Mail className="w-3 h-3 text-blue-400 -ml-1 mt-1" />
          </div>
          <div>
            <h3 className="text-sm font-semibold">Google Calendar & Gmail</h3>
            <p className="text-xs text-muted-foreground">48h lookahead · real draft creation · relationship tracking</p>
          </div>
        </div>
        <StatusBadge connected={status.google} />
      </div>
      <div className="px-5 py-5 space-y-4">
        {status.google ? (
          <div className="space-y-3">
            <p className="text-sm text-emerald-400">✓ Calendar (48h) and Gmail syncing. Real drafts + event creation enabled.</p>
            <Button variant="outline" size="sm" className="text-destructive border-destructive/30" onClick={async () => { await integrations.disconnectGoogle(); onStatusChange() }}>Disconnect Google</Button>
          </div>
        ) : step === 'idle' ? (
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground leading-relaxed">
              Get credentials from{' '}
              <button onClick={() => integrations.openExternal('https://console.cloud.google.com/apis/credentials')} className="text-primary underline">Google Cloud Console</button>.
              Enable Calendar API + Gmail API. Create an OAuth2 Desktop credential. See <strong>SETUP.md</strong>.
            </p>
            <Button size="sm" onClick={() => setStep('creds')}>Set up Google OAuth</Button>
          </div>
        ) : step === 'creds' ? (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Client ID</Label>
              <Input value={creds.client_id} onChange={e => setCreds(c => ({ ...c, client_id: e.target.value }))} placeholder="xxxxx.apps.googleusercontent.com" className="bg-secondary border-border font-mono text-xs" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Client Secret</Label>
              <Input type="password" value={creds.client_secret} onChange={e => setCreds(c => ({ ...c, client_secret: e.target.value }))} placeholder="GOCSPX-..." className="bg-secondary border-border font-mono text-xs" />
            </div>
            {error && <p className="text-xs text-red-400">{error}</p>}
            <div className="flex gap-2">
              <Button size="sm" onClick={handleSaveCreds} disabled={loading}>{loading ? 'Loading...' : 'Continue →'}</Button>
              <Button size="sm" variant="outline" onClick={() => setStep('idle')}>Cancel</Button>
            </div>
          </div>
        ) : step === 'auth' ? (
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">1. Click below to open Google consent in your browser.</p>
            <Button size="sm" variant="outline" className="gap-2" onClick={() => integrations.openExternal(authUrl)}>
              <ExternalLink className="w-3.5 h-3.5" /> Open Google Sign-In
            </Button>
            <p className="text-xs text-muted-foreground">2. Paste the code Google gives you:</p>
            <Input value={authCode} onChange={e => setAuthCode(e.target.value)} placeholder="4/0AX4XfWj..." className="bg-secondary border-border font-mono text-xs" />
            {error && <p className="text-xs text-red-400">{error}</p>}
            <Button size="sm" onClick={handleExchangeCode} disabled={loading || !authCode}>
              {loading ? 'Connecting...' : 'Connect Google'}
            </Button>
          </div>
        ) : null}
      </div>
    </div>
  )
}

function SlackCard({ status, onStatusChange }) {
  const [token, setToken] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [info, setInfo] = useState(null)

  const handleConnect = async () => {
    if (!token.trim()) return
    setLoading(true); setError('')
    const res = await integrations.connectSlack(token.trim())
    setLoading(false)
    if (res.error) { setError(res.error); return }
    setInfo(res); onStatusChange()
  }

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b border-border">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-violet-500/10"><MessageSquare className="w-4 h-4 text-violet-400" /></div>
          <div>
            <h3 className="text-sm font-semibold">Slack</h3>
            <p className="text-xs text-muted-foreground">Monitor messages · send messages as bot</p>
          </div>
        </div>
        <StatusBadge connected={status.slack} />
      </div>
      <div className="px-5 py-5 space-y-3">
        {status.slack ? (
          <div className="space-y-3">
            <p className="text-sm text-emerald-400">✓ Slack connected{info ? ` as @${info.user}` : ''}. Bot can send messages.</p>
            <Button variant="outline" size="sm" className="text-destructive border-destructive/30" onClick={async () => { await integrations.disconnectSlack(); onStatusChange() }}>Disconnect Slack</Button>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground leading-relaxed">
              Create a Slack app at{' '}
              <button onClick={() => integrations.openExternal('https://api.slack.com/apps')} className="text-primary underline">api.slack.com/apps</button>.
              Add scopes: <code className="bg-secondary px-1 rounded text-[10px]">search:read</code> <code className="bg-secondary px-1 rounded text-[10px]">channels:history</code> <code className="bg-secondary px-1 rounded text-[10px]">chat:write</code>.
              Install to workspace and paste the Bot Token below.
            </p>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Bot User OAuth Token</Label>
              <Input value={token} onChange={e => setToken(e.target.value)} placeholder="xoxb-..." className="bg-secondary border-border font-mono text-xs" />
            </div>
            {error && <p className="text-xs text-red-400">{error}</p>}
            <Button size="sm" onClick={handleConnect} disabled={loading || !token}>
              {loading ? 'Connecting...' : 'Connect Slack'}
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}

function FilesystemCard({ status, onStatusChange }) {
  const [folderInput, setFolderInput] = useState('')
  const [settings, setSettings] = useState(null)

  useEffect(() => {
    window.electronAPI.getSettings().then(s => setSettings(s))
  }, [status])

  const folders = settings?.watched_folders || []

  const addFolder = async () => {
    const f = folderInput.trim()
    if (!f || folders.includes(f)) return
    await window.electronAPI.updateSettings({ watched_folders: [...folders, f] })
    setFolderInput('')
    onStatusChange()
    window.electronAPI.getSettings().then(s => setSettings(s))
  }

  const removeFolder = async (f) => {
    await window.electronAPI.updateSettings({ watched_folders: folders.filter(x => x !== f) })
    onStatusChange()
    window.electronAPI.getSettings().then(s => setSettings(s))
  }

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b border-border">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-amber-500/10"><FolderOpen className="w-4 h-4 text-amber-400" /></div>
          <div>
            <h3 className="text-sm font-semibold">File System Watcher</h3>
            <p className="text-xs text-muted-foreground">Real-time file changes · auto-organize via workflows</p>
          </div>
        </div>
        <StatusBadge connected={status.filesystem} />
      </div>
      <div className="px-5 py-5 space-y-3">
        <p className="text-xs text-muted-foreground">Add absolute paths to watch. Changes detected in real-time.</p>
        <div className="flex gap-2">
          <Input value={folderInput} onChange={e => setFolderInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && addFolder()}
            placeholder="C:\Users\you\Documents" className="bg-secondary border-border text-xs flex-1" />
          <Button size="sm" onClick={addFolder}>Add</Button>
        </div>
        {folders.length > 0 ? (
          <div className="space-y-1.5">
            {folders.map(f => (
              <div key={f} className="flex items-center justify-between px-3 py-2 rounded-lg bg-secondary/50 text-xs">
                <span className="font-mono truncate text-foreground">{f}</span>
                <button onClick={() => removeFolder(f)} className="text-muted-foreground hover:text-red-400 ml-2">✕</button>
              </div>
            ))}
          </div>
        ) : <p className="text-xs text-muted-foreground italic">No folders watched yet.</p>}
      </div>
    </div>
  )
}

function BrowserCard({ status }) {
  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b border-border">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-blue-500/10"><Globe className="w-4 h-4 text-blue-400" /></div>
          <div>
            <h3 className="text-sm font-semibold">Chrome Extension</h3>
            <p className="text-xs text-muted-foreground">Track active browser tabs in real-time</p>
          </div>
        </div>
        <StatusBadge connected={status.browser} />
      </div>
      <div className="px-5 py-5 space-y-3">
        <p className="text-xs text-muted-foreground leading-relaxed">
          Load the <code className="bg-secondary px-1 rounded">chrome-extension/</code> folder in Chrome via{' '}
          <strong>chrome://extensions → Load unpacked</strong>. It auto-connects via WebSocket on port 7777.
        </p>
        {status.browser
          ? <p className="text-sm text-emerald-400">✓ Chrome extension connected and sending tab activity.</p>
          : <p className="text-xs text-amber-400">⚠ Extension not connected. Load it in Chrome and ensure this app is running.</p>
        }
      </div>
    </div>
  )
}

function ClaudeCard({ status, onStatusChange }) {
  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b border-border">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-purple-500/10"><Brain className="w-4 h-4 text-purple-400" /></div>
          <div>
            <h3 className="text-sm font-semibold">Claude AI Engine</h3>
            <p className="text-xs text-muted-foreground">Powers smart predictions from context signals</p>
          </div>
        </div>
        <StatusBadge connected={status.claude} />
      </div>
      <div className="px-5 py-5">
        {status.claude
          ? <p className="text-sm text-emerald-400">✓ Claude AI active. Predictions are context-aware and intelligent.</p>
          : <p className="text-xs text-muted-foreground">Add your Claude API key in <strong>Settings → Claude AI Engine</strong> to enable smart predictions. Falls back to rule-based templates without it.</p>
        }
      </div>
    </div>
  )
}

function SupabaseCard({ status }) {
  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b border-border">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-emerald-500/10"><Database className="w-4 h-4 text-emerald-400" /></div>
          <div>
            <h3 className="text-sm font-semibold">Supabase — Cross-device sync (CAM-4)</h3>
            <p className="text-xs text-muted-foreground">Real-time digital twin sync · &lt;2s latency · free tier</p>
          </div>
        </div>
        <StatusBadge connected={status.supabase} />
      </div>
      <div className="px-5 py-5">
        {status.supabase
          ? <p className="text-sm text-emerald-400">✓ Supabase connected — predictions, signals and settings syncing in real-time across all devices.</p>
          : <p className="text-xs text-muted-foreground">Connect Supabase in <strong>Settings → Supabase</strong>. Free tier: 500MB DB, unlimited real-time connections.</p>
        }
      </div>
    </div>
  )
}

export default function IntegrationsPage() {
  const [status, setStatus] = useState({ google: false, slack: false, filesystem: false, browser: false, claude: false, supabase: false })
  const [syncing, setSyncing] = useState(false)

  const refresh = async () => {
    const s = await integrations.getStatus()
    setStatus(s)
  }

  useEffect(() => {
    refresh()
    const interval = setInterval(refresh, 5000)
    realtime.on('integration:status', setStatus)
    return () => { clearInterval(interval); realtime.off('integration:status') }
  }, [])

  const handleSyncNow = async () => {
    setSyncing(true)
    await integrations.syncNow()
    setTimeout(() => { setSyncing(false); refresh() }, 2000)
  }

  const connectedCount = Object.values(status).filter(Boolean).length

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Integrations</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            <span className={connectedCount > 0 ? 'text-emerald-400' : 'text-muted-foreground'}>{connectedCount} of 6 connected</span>
          </p>
        </div>
        <Button size="sm" variant="outline" className="gap-2" onClick={handleSyncNow} disabled={syncing}>
          <RefreshCw className={`w-3.5 h-3.5 ${syncing ? 'animate-spin' : ''}`} />
          {syncing ? 'Syncing...' : 'Sync Now'}
        </Button>
      </div>

      <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-card border border-border text-xs">
        <Cpu className="w-4 h-4 text-primary flex-shrink-0" />
        <span className="text-muted-foreground">WebSocket on</span>
        <code className="bg-secondary px-1.5 py-0.5 rounded text-primary">ws://localhost:7777</code>
        <span className="text-muted-foreground">· Data encrypted with AES-256 locally</span>
      </div>

      <div className="grid lg:grid-cols-2 gap-5">
        <GoogleCard status={status} onStatusChange={refresh} />
        <SlackCard status={status} onStatusChange={refresh} />
        <FilesystemCard status={status} onStatusChange={refresh} />
        <BrowserCard status={status} />
        <ClaudeCard status={status} onStatusChange={refresh} />
        <SupabaseCard status={status} />
      </div>
    </div>
  )
}
