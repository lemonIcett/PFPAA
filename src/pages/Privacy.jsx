/**
 * Privacy.jsx — Gap Analysis remediation
 *
 * User-facing privacy policy page linked from the app.
 * The docs/ folder already has privacy-dashboard.md but there was no
 * routable in-app privacy page. This remediation adds it.
 *
 * Covers:
 *  - What data PFPA collects and why
 *  - Local-first processing commitment
 *  - Data minimisation (auto-purge schedule)
 *  - Third-party integrations transparency
 *  - Links to DSR actions (Compliance page)
 *  - Real-time "what's being accessed right now" indicator
 */

import { useState, useEffect } from 'react'
import { entities, monitors } from '@/api/electron'
import { Link } from 'react-router-dom'
import {
  Shield, Eye, Cpu, Cloud, Calendar, Mail, Hash,
  Lock, Trash2, ExternalLink, ChevronDown, ChevronRight,
  Activity
} from 'lucide-react'

// ─── Data ─────────────────────────────────────────────────────────────────

const PRINCIPLES = [
  {
    icon: Cpu,
    color: 'text-emerald-400',
    bg: 'bg-emerald-500/10',
    title: 'Local-First Processing',
    body: 'At least 80% of AI processing runs on your device. Behavioural models, pattern recognition, and intent prediction all happen locally. Only when cloud inference is explicitly configured does any data leave your device.',
  },
  {
    icon: Hash,
    color: 'text-blue-400',
    bg: 'bg-blue-500/10',
    title: 'Data Minimisation',
    body: 'Raw context logs are automatically purged after 7 days. Processed patterns after 90 days. Preference vectors are kept until you delete your account. No raw content (email bodies, document text) is ever stored — only metadata.',
  },
  {
    icon: Eye,
    color: 'text-purple-400',
    bg: 'bg-purple-500/10',
    title: 'Full Transparency',
    body: 'Every context signal PFPA reads is shown in the Context Monitor in real time. You can see exactly what the system knows, pause monitoring at any time, or revoke individual data-category consents in the Compliance page.',
  },
  {
    icon: Lock,
    color: 'text-amber-400',
    bg: 'bg-amber-500/10',
    title: 'Encryption Everywhere',
    body: 'All data at rest is encrypted with AES-256. Cross-device sync uses client-side AES-256-GCM encryption — your Supabase project never sees plaintext. All network traffic uses TLS 1.3.',
  },
]

const THIRD_PARTIES = [
  {
    name: 'Anthropic Claude API',
    purpose: 'AI intent prediction and action drafting',
    dataShared: 'Anonymised context snippets (no PII) · only when Claude API key is configured',
    privacy: 'https://www.anthropic.com/privacy',
    required: false,
  },
  {
    name: 'Google Calendar & Gmail',
    purpose: '48-hour lookahead, email draft creation, relationship tracking',
    dataShared: 'Calendar metadata · email thread headers (not body) — read via OAuth',
    privacy: 'https://policies.google.com/privacy',
    required: false,
  },
  {
    name: 'Slack',
    purpose: 'Channel activity monitoring and message drafting',
    dataShared: 'Channel names · message metadata — read via Bot token',
    privacy: 'https://slack.com/privacy-policy',
    required: false,
  },
  {
    name: 'Supabase',
    purpose: 'Cross-device context sync (CAM-4)',
    dataShared: 'Encrypted blobs only — Supabase cannot read the plaintext content',
    privacy: 'https://supabase.com/privacy',
    required: false,
  },
]

// ─── Components ───────────────────────────────────────────────────────────

function PrincipleCard({ icon: Icon, color, bg, title, body }) {
  return (
    <div className="flex gap-4 p-4 rounded-xl border border-border bg-card">
      <div className={`p-2.5 rounded-lg ${bg} flex-shrink-0 h-fit`}>
        <Icon className={`w-4 h-4 ${color}`} />
      </div>
      <div>
        <p className="text-sm font-semibold mb-1">{title}</p>
        <p className="text-xs text-muted-foreground leading-relaxed">{body}</p>
      </div>
    </div>
  )
}

function ThirdPartyRow({ tp }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="border-b border-border last:border-0">
      <button
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-secondary/40 transition-colors text-left"
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
      >
        <div className="flex items-center gap-3">
          <Cloud className="w-4 h-4 text-muted-foreground flex-shrink-0" />
          <span className="text-sm font-medium">{tp.name}</span>
          {!tp.required && (
            <span className="text-[10px] bg-secondary text-muted-foreground px-2 py-0.5 rounded-full">Optional</span>
          )}
        </div>
        {open ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
      </button>
      {open && (
        <div className="px-4 pb-4 space-y-2 bg-secondary/20">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60 mb-0.5">Purpose</p>
            <p className="text-xs text-muted-foreground">{tp.purpose}</p>
          </div>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60 mb-0.5">Data Shared</p>
            <p className="text-xs text-muted-foreground">{tp.dataShared}</p>
          </div>
          <a
            href={tp.privacy}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs text-blue-400 hover:underline"
          >
            Privacy policy <ExternalLink className="w-3 h-3" />
          </a>
        </div>
      )}
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────
export default function PrivacyPage() {
  const [activeMonitors, setActiveMonitors] = useState({ window: false, clipboard: false })
  const [signalCount, setSignalCount] = useState(0)

  useEffect(() => {
    monitors.state?.().then(s => setActiveMonitors(s || {}))
    entities.ContextSignal.list('-created_date', 9999).then(s => setSignalCount(s.length))
  }, [])

  return (
    <div className="space-y-8 max-w-3xl mx-auto">

      {/* Header */}
      <div>
        <h1 className="text-xl font-semibold text-foreground">Privacy</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          How PFPA handles your data — last updated March 2026
        </p>
      </div>

      {/* Live indicator */}
      <div className="flex flex-wrap items-center gap-3 px-4 py-3 rounded-xl bg-card border border-border">
        <Activity className="w-4 h-4 text-emerald-400" />
        <span className="text-xs text-muted-foreground">
          Right now: window monitor{' '}
          <span className={activeMonitors.window ? 'text-emerald-400' : 'text-muted-foreground/50'}>
            {activeMonitors.window ? 'active' : 'off'}
          </span>
          {' · '}clipboard monitor{' '}
          <span className={activeMonitors.clipboard ? 'text-emerald-400' : 'text-muted-foreground/50'}>
            {activeMonitors.clipboard ? 'active' : 'off'}
          </span>
          {' · '}{signalCount} signals stored on this device
        </span>
        <Link to="/context" className="ml-auto text-xs text-blue-400 hover:underline flex items-center gap-1">
          View live feed <ExternalLink className="w-3 h-3" />
        </Link>
      </div>

      {/* Core principles */}
      <section aria-labelledby="s-principles">
        <h2 id="s-principles" className="text-sm font-semibold mb-3">Core Privacy Principles</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {PRINCIPLES.map(p => <PrincipleCard key={p.title} {...p} />)}
        </div>
      </section>

      {/* What we collect */}
      <section aria-labelledby="s-collect">
        <h2 id="s-collect" className="text-sm font-semibold mb-3">What PFPA Collects</h2>
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="divide-y divide-border">
            {[
              ['Active application name & window title', 'Intent prediction', '7 days'],
              ['Browser tab URLs (not full page content)', 'Context enrichment', '7 days'],
              ['Clipboard text (opt-in)', 'Form pre-fill, action context', '7 days'],
              ['Calendar event titles & times', '48-hour lookahead', '30 days'],
              ['Email sender, subject, date (not body)', 'Relationship mapping', '30 days'],
              ['City-level location (IP geolocation)', 'Seasonal context', 'Session'],
              ['App usage patterns', 'Behavioural model', '90 days'],
              ['Accepted/rejected suggestions', 'Preference learning', 'Indefinite'],
            ].map(([what, why, ttl]) => (
              <div key={what} className="grid grid-cols-3 px-4 py-3 text-xs gap-4">
                <span className="text-foreground font-medium">{what}</span>
                <span className="text-muted-foreground">{why}</span>
                <span className="text-muted-foreground">{ttl}</span>
              </div>
            ))}
          </div>
          <div className="grid grid-cols-3 px-4 py-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/50 bg-secondary/40 border-t border-border">
            <span>Data element</span><span>Purpose</span><span>Retention</span>
          </div>
        </div>
      </section>

      {/* What we DON'T collect */}
      <section aria-labelledby="s-no-collect">
        <h2 id="s-no-collect" className="text-sm font-semibold mb-3">What PFPA Never Collects</h2>
        <div className="rounded-xl border border-border bg-card p-4">
          <ul className="grid sm:grid-cols-2 gap-2">
            {[
              'Full email or message body content',
              'Passwords or authentication credentials',
              'Content from password managers',
              'Secure enclave / keychain data',
              'Incognito / private browsing sessions',
              'Banking or financial account details',
              'Video or audio recordings',
              'Screen screenshots (only window title)',
            ].map(item => (
              <li key={item} className="flex items-center gap-2 text-xs text-muted-foreground">
                <Shield className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
                {item}
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Third parties */}
      <section aria-labelledby="s-third-party">
        <h2 id="s-third-party" className="text-sm font-semibold mb-3">Third-Party Services (All Optional)</h2>
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          {THIRD_PARTIES.map(tp => <ThirdPartyRow key={tp.name} tp={tp} />)}
        </div>
        <p className="text-xs text-muted-foreground/60 mt-2 flex items-center gap-1.5">
          <Lock className="w-3.5 h-3.5" />
          All third-party integrations are opt-in. PFPA works fully offline without any of them.
        </p>
      </section>

      {/* Your rights */}
      <section aria-labelledby="s-rights">
        <h2 id="s-rights" className="text-sm font-semibold mb-3">Your Rights</h2>
        <div className="rounded-xl border border-border bg-card p-4 space-y-3">
          <p className="text-xs text-muted-foreground leading-relaxed">
            You have the right to access, correct, export, and erase your data at any time.
            These rights are fulfilled immediately on-device — no waiting period, no support ticket required.
          </p>
          <div className="flex flex-wrap gap-2">
            <Link
              to="/compliance"
              className="inline-flex items-center gap-1.5 text-xs bg-blue-500/10 text-blue-400 border border-blue-500/20 px-3 py-1.5 rounded-lg hover:bg-blue-500/20 transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" /> Erase my data
            </Link>
            <Link
              to="/compliance"
              className="inline-flex items-center gap-1.5 text-xs bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-3 py-1.5 rounded-lg hover:bg-emerald-500/20 transition-colors"
            >
              <Calendar className="w-3.5 h-3.5" /> Export my data
            </Link>
            <Link
              to="/compliance"
              className="inline-flex items-center gap-1.5 text-xs bg-purple-500/10 text-purple-400 border border-purple-500/20 px-3 py-1.5 rounded-lg hover:bg-purple-500/20 transition-colors"
            >
              <Eye className="w-3.5 h-3.5" /> Manage consent
            </Link>
          </div>
        </div>
      </section>

      {/* Contact */}
      <section aria-labelledby="s-contact">
        <h2 id="s-contact" className="text-sm font-semibold mb-2">Contact</h2>
        <p className="text-xs text-muted-foreground">
          Privacy questions: <a href="mailto:privacy@pfpa.local" className="text-blue-400 hover:underline">privacy@pfpa.local</a>
          {' · '}Data Protection Officer: <a href="mailto:dpo@pfpa.local" className="text-blue-400 hover:underline">dpo@pfpa.local</a>
          {' · '}PFPA v2.2-M · Built by PFPA Project Team
        </p>
      </section>
    </div>
  )
}
