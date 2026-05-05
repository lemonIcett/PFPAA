import { useState, useEffect } from 'react'
import { intelligence, realtime } from '@/api/electron'
import { Users, Mail, MessageSquare, Calendar, TrendingUp, RefreshCw, Activity } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'

const STRENGTH_COLOR = s => s >= 70 ? 'text-emerald-400' : s >= 40 ? 'text-amber-400' : 'text-muted-foreground'
const STRENGTH_BG    = s => s >= 70 ? 'bg-emerald-500' : s >= 40 ? 'bg-amber-500' : 'bg-secondary'
const STRENGTH_LABEL = s => s >= 70 ? 'Strong' : s >= 40 ? 'Regular' : 'Occasional'

const TYPE_ICONS = {
  email:   { icon: Mail,          label: 'emails',   color: 'text-blue-400' },
  meeting: { icon: Calendar,      label: 'meetings', color: 'text-purple-400' },
  slack:   { icon: MessageSquare, label: 'messages', color: 'text-amber-400' },
}

function RelationshipCard({ node }) {
  const topTypes = Object.entries(node.types || {})
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)

  return (
    <article
      aria-label={`Contact: ${node.name}, relationship strength ${node.strength}`}
      className="rounded-xl border border-border bg-card px-5 py-4 space-y-3 hover:border-primary/30 transition-colors"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div
            aria-hidden="true"
            className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center text-sm font-semibold text-primary flex-shrink-0"
          >
            {node.name?.[0]?.toUpperCase() || '?'}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium text-foreground truncate">{node.name}</p>
            <p className="text-xs text-muted-foreground truncate">{node.email || node.id}</p>
          </div>
        </div>
        <div className="text-right flex-shrink-0">
          <p className={`text-lg font-bold ${STRENGTH_COLOR(node.strength_score ?? node.strength ?? 0)}`}>
            {node.strength_score ?? node.strength ?? 0}
          </p>
          <p className="text-xs text-muted-foreground">
            {STRENGTH_LABEL(node.strength_score ?? node.strength ?? 0)}
          </p>
        </div>
      </div>

      {/* Strength bar */}
      <div
        role="progressbar"
        aria-valuenow={node.strength_score ?? node.strength ?? 0}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`Relationship strength: ${node.strength_score ?? node.strength ?? 0} out of 100`}
        className="w-full bg-secondary rounded-full h-1.5"
      >
        <div
          className={`h-1.5 rounded-full transition-all ${STRENGTH_BG(node.strength_score ?? node.strength ?? 0)}`}
          style={{ width: `${node.strength_score ?? node.strength ?? 0}%` }}
        />
      </div>

      {/* Interaction breakdown */}
      <div className="flex gap-3 flex-wrap text-xs text-muted-foreground">
        {topTypes.map(([type, count]) => {
          const cfg = TYPE_ICONS[type]
          if (!cfg || count === 0) return null
          const Icon = cfg.icon
          return (
            <span key={type} className={`flex items-center gap-1 ${cfg.color}`} aria-label={`${count} ${cfg.label}`}>
              <Icon className="w-3 h-3" aria-hidden="true" />
              {count} {cfg.label}
            </span>
          )
        })}
        <span className="ml-auto">
          {node.interaction_count ?? node.interactions ?? 0} total
        </span>
      </div>

      {/* Last interaction */}
      {(node.last_interaction || node.lastSeen) && (
        <p className="text-xs text-muted-foreground">
          Last seen {formatDistanceToNow(new Date(node.last_interaction || node.lastSeen), { addSuffix: true })}
        </p>
      )}

      {/* Recent contexts */}
      {node.contexts?.length > 0 && (
        <div>
          <p className="text-xs text-muted-foreground mb-1">Recent context</p>
          <div className="flex flex-wrap gap-1">
            {node.contexts.slice(0, 3).map((c, i) => (
              <span key={i} className="text-xs bg-secondary px-2 py-0.5 rounded truncate max-w-[200px]">{c}</span>
            ))}
          </div>
        </div>
      )}
    </article>
  )
}

function SocialStats({ nodes }) {
  const strong   = nodes.filter(n => (n.strength_score ?? n.strength ?? 0) >= 70).length
  const regular  = nodes.filter(n => { const s = n.strength_score ?? n.strength ?? 0; return s >= 40 && s < 70 }).length
  const total    = nodes.length
  const totalInteractions = nodes.reduce((sum, n) => sum + (n.interaction_count ?? n.interactions ?? 0), 0)

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3" role="list" aria-label="Social context statistics">
      {[
        { label: 'Total contacts', value: total, color: 'text-foreground' },
        { label: 'Strong ties',    value: strong, color: 'text-emerald-400' },
        { label: 'Regular ties',   value: regular, color: 'text-amber-400' },
        { label: 'Interactions',   value: totalInteractions, color: 'text-blue-400' },
      ].map(({ label, value, color }) => (
        <div key={label} role="listitem" className="rounded-xl border border-border bg-card px-4 py-3">
          <p className={`text-2xl font-bold ${color}`}>{value}</p>
          <p className="text-xs text-muted-foreground">{label}</p>
        </div>
      ))}
    </div>
  )
}

export default function RelationshipsPage() {
  const [nodes, setNodes]         = useState([])
  const [sortBy, setSortBy]       = useState('strength')
  const [filterType, setFilterType] = useState('all')
  const [loading, setLoading]     = useState(false)
  const [source, setSource]       = useState('graph') // 'graph' | 'cam3'

  const load = async () => {
    setLoading(true)
    try {
      // Try CAM-3 social context first (richer data with decay scoring)
      const cam3Data = await window.electronAPI?.getTopContacts?.()
      if (cam3Data && cam3Data.length > 0) {
        setNodes(cam3Data)
        setSource('cam3')
      } else {
        // Fall back to relationship graph from main.js
        const graph = await intelligence.getRelationships()
        const graphNodes = Object.values(graph || {})
        setNodes(graphNodes)
        setSource('graph')
      }
    } catch (e) {
      const graph = await intelligence.getRelationships()
      setNodes(Object.values(graph || {}))
      setSource('graph')
    }
    setLoading(false)
  }

  useEffect(() => {
    load()
    realtime.on('relationship:updated', load)
    return () => realtime.off('relationship:updated')
  }, [])

  const getStrength = n => n.strength_score ?? n.strength ?? 0
  const getInteractions = n => n.interaction_count ?? n.interactions ?? 0

  const filtered = nodes
    .filter(n => {
      if (filterType === 'all') return true
      return (n.types?.[filterType] ?? 0) > 0 || (n.interactions?.some?.(i => i.type === filterType))
    })
    .sort((a, b) => {
      if (sortBy === 'strength') return getStrength(b) - getStrength(a)
      if (sortBy === 'interactions') return getInteractions(b) - getInteractions(a)
      const da = new Date(b.last_interaction || b.lastSeen || 0)
      const db = new Date(a.last_interaction || a.lastSeen || 0)
      return da - db
    })

  return (
    <main className="space-y-6 max-w-4xl mx-auto" aria-label="Relationship graph">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-semibold text-foreground">
            Relationship Graph
            {source === 'cam3' && (
              <span className="ml-2 text-xs bg-blue-500/15 text-blue-400 px-2 py-0.5 rounded-full font-normal">CAM-3</span>
            )}
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {nodes.length} contacts · built automatically from emails, meetings &amp; Slack
          </p>
        </div>
        <button
          onClick={load}
          aria-label="Refresh relationship graph"
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground bg-secondary px-3 py-1.5 rounded-lg transition-colors"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} aria-hidden="true" />
          Refresh
        </button>
      </div>

      {/* Stats row */}
      {nodes.length > 0 && <SocialStats nodes={nodes} />}

      {/* Sort + filter controls */}
      <div className="flex flex-wrap gap-3 items-center">
        {/* Sort */}
        <div className="flex gap-1" role="group" aria-label="Sort contacts by">
          {[
            { key: 'strength',     label: 'Strength' },
            { key: 'interactions', label: 'Interactions' },
            { key: 'recent',       label: 'Recent' },
          ].map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setSortBy(key)}
              aria-pressed={sortBy === key}
              className={`text-xs px-3 py-1.5 rounded-lg transition-colors ${
                sortBy === key
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-secondary text-muted-foreground hover:text-foreground'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Filter by type */}
        <div className="flex gap-1" role="group" aria-label="Filter by interaction type">
          {[
            { key: 'all',     label: 'All' },
            { key: 'email',   label: '✉️ Email' },
            { key: 'meeting', label: '📅 Meetings' },
            { key: 'slack',   label: '💬 Slack' },
          ].map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setFilterType(key)}
              aria-pressed={filterType === key}
              className={`text-xs px-3 py-1.5 rounded-lg transition-colors ${
                filterType === key
                  ? 'bg-primary/20 text-primary border border-primary/30'
                  : 'bg-secondary text-muted-foreground hover:text-foreground'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Empty state */}
      {filtered.length === 0 && (
        <div className="text-center py-20 text-muted-foreground" role="status">
          <Users className="w-10 h-10 mx-auto mb-3 opacity-30" aria-hidden="true" />
          <p className="text-sm">No relationships tracked yet</p>
          <p className="text-xs mt-1">Connect Gmail, Google Calendar, and Slack to build your social graph automatically</p>
        </div>
      )}

      {/* Cards grid */}
      {filtered.length > 0 && (
        <div
          className="grid sm:grid-cols-2 gap-4"
          role="list"
          aria-label={`${filtered.length} contacts`}
        >
          {filtered.map(node => (
            <div key={node.email || node.id} role="listitem">
              <RelationshipCard node={node} />
            </div>
          ))}
        </div>
      )}

      {/* CAM-3 info banner */}
      <div role="note" className="rounded-xl border border-border bg-card/50 px-5 py-4 flex items-start gap-3">
        <Activity className="w-4 h-4 text-blue-400 mt-0.5 flex-shrink-0" aria-hidden="true" />
        <div className="text-xs text-muted-foreground space-y-1">
          <p className="font-medium text-foreground">How your relationship graph is built (CAM-3)</p>
          <p>PFPA automatically scores relationship strength from Gmail contacts, Google Calendar attendees, and Slack messages. Strength decays for interactions older than 30 days. Meetings count 3×, emails 2×, messages 1×.</p>
        </div>
      </div>
    </main>
  )
}
