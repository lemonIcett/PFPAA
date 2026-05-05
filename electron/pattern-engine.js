/**
 * pattern-engine.js — BIE-1: User Behavior Graph (UBG)
 *
 * SRS BIE-1: "The system shall identify recurring workflows including:
 *   - Morning routine patterns (apps opened in sequence)
 *   - Weekly recurring tasks (report generation, expense submission)
 *   - Communication templates (common email responses)"
 *
 * Implements a proper graph with three edge types as specified in SRS §6.1.1:
 *   - SEQUENCE: Actions in temporal order
 *   - CAUSAL:   Context leading to Action
 *   - SIMILAR:  Actions with similar context
 */

class UserBehaviorGraph {
  constructor(store) {
    this.store = store
    // Load persisted graph
    const saved = store.get('ubg', { nodes: {}, edges: [], sequences: {} })
    this.nodes = saved.nodes || {}
    this.edges = saved.edges || []
    this.sequences = saved.sequences || {}  // sequence_key -> { count, lastSeen, actions }
  }

  // ── Node management ──────────────────────────────────────────────────────

  addNode(id, type, data = {}) {
    if (!this.nodes[id]) {
      this.nodes[id] = { id, type, data, count: 0, firstSeen: Date.now(), lastSeen: Date.now() }
    } else {
      this.nodes[id].count++
      this.nodes[id].lastSeen = Date.now()
      Object.assign(this.nodes[id].data, data)
    }
    return this.nodes[id]
  }

  // ── Edge management ──────────────────────────────────────────────────────

  addEdge(fromId, toId, edgeType, weight = 1.0) {
    const existing = this.edges.find(e =>
      e.from === fromId && e.to === toId && e.type === edgeType
    )
    if (existing) {
      existing.weight += weight
      existing.count++
      existing.lastSeen = Date.now()
    } else {
      this.edges.push({
        from: fromId, to: toId, type: edgeType,
        weight, count: 1, firstSeen: Date.now(), lastSeen: Date.now()
      })
    }
  }

  // ── BIE-1: Record a signal-to-action sequence ────────────────────────────

  recordSignal(signal) {
    try {
      const contextId = `ctx:${signal.signal_type}:${this._normalizeContext(signal)}`
      this.addNode(contextId, 'context', {
        signal_type: signal.signal_type,
        source: signal.source,
        description: signal.description
      })

      // Time-based node
      const hour = new Date().getHours()
      const timeSlot = hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening'
      const timeId = `time:${timeSlot}:${new Date().getDay()}`
      this.addNode(timeId, 'time', { slot: timeSlot, day: new Date().getDay() })

      // CAUSAL edge: time context -> signal
      this.addEdge(timeId, contextId, 'CAUSAL', 0.5)

      this._persist()
    } catch (e) {
      console.error('[UBG] recordSignal error:', e.message)
    }
  }

  recordAction(prediction, outcome) {
    try {
      const actionId = `action:${prediction.action_type}:${this._normalizeAction(prediction)}`
      this.addNode(actionId, 'action', {
        action_type: prediction.action_type,
        category: prediction.category,
        description: prediction.description,
        outcome
      })

      // CAUSAL: context -> action
      if (prediction.trigger_context) {
        const ctxId = `ctx:${prediction.category}:${prediction.trigger_context.slice(0, 40)}`
        if (this.nodes[ctxId]) {
          this.addEdge(ctxId, actionId, 'CAUSAL', 1.0)
        }
      }

      // SEQUENCE: find recent actions and link
      const recentActions = this.edges
        .filter(e => e.type === 'SEQUENCE' && Date.now() - e.lastSeen < 30 * 60 * 1000)
        .sort((a, b) => b.lastSeen - a.lastSeen)
        .slice(0, 3)

      for (const recent of recentActions) {
        if (this.nodes[recent.to]) {
          this.addEdge(recent.to, actionId, 'SEQUENCE', 1.0)
        }
      }

      // Record in sequence registry
      this._updateSequence(prediction)
      this._persist()
    } catch (e) {
      console.error('[UBG] recordAction error:', e.message)
    }
  }

  // ── BIE-1: Predict next likely actions based on graph ───────────────────

  predictNextActions(currentSignal, limit = 5) {
    try {
      const contextId = `ctx:${currentSignal.signal_type}:${this._normalizeContext(currentSignal)}`

      // Find all CAUSAL outgoing edges from this context
      const causalEdges = this.edges
        .filter(e => e.from === contextId && e.type === 'CAUSAL')
        .sort((a, b) => b.weight - a.weight)
        .slice(0, 10)

      // Find SEQUENCE patterns that start from similar contexts
      const sequenceEdges = this.edges
        .filter(e => {
          const fromNode = this.nodes[e.from]
          return e.type === 'SEQUENCE' && fromNode?.type === 'action'
        })
        .sort((a, b) => b.weight - a.weight)
        .slice(0, 10)

      const candidates = []

      for (const edge of [...causalEdges, ...sequenceEdges]) {
        const targetNode = this.nodes[edge.to]
        if (targetNode?.type === 'action') {
          const freq = targetNode.count || 1
          const recency = Math.max(0, 1 - (Date.now() - targetNode.lastSeen) / (7 * 24 * 3600 * 1000))
          const score = edge.weight * 0.6 + freq * 0.3 + recency * 0.1
          candidates.push({
            nodeId: edge.to,
            action_type: targetNode.data.action_type,
            description: targetNode.data.description,
            category: targetNode.data.category,
            score,
            confidence: Math.min(95, Math.round(50 + score * 10))
          })
        }
      }

      // Deduplicate by action_type
      const seen = new Set()
      return candidates
        .filter(c => {
          if (seen.has(c.action_type)) return false
          seen.add(c.action_type)
          return true
        })
        .sort((a, b) => b.score - a.score)
        .slice(0, limit)
    } catch (e) {
      console.error('[UBG] predictNextActions error:', e.message)
      return []
    }
  }

  // ── BIE-1: Get recurring workflow patterns ────────────────────────────────

  getRecurringPatterns() {
    const patterns = []

    // Sequences that appear >2 times
    for (const [key, seq] of Object.entries(this.sequences)) {
      if (seq.count >= 2) {
        patterns.push({
          key,
          label: seq.label,
          count: seq.count,
          actions: seq.actions,
          lastSeen: seq.lastSeen,
          timeSlot: seq.timeSlot,
          confidence: Math.min(95, 40 + seq.count * 10)
        })
      }
    }

    return patterns.sort((a, b) => b.count - a.count).slice(0, 10)
  }

  // ── BIE-2: Get graph statistics ─────────────────────────────────────────

  getStats() {
    const nodesByType = {}
    for (const node of Object.values(this.nodes)) {
      nodesByType[node.type] = (nodesByType[node.type] || 0) + 1
    }
    const edgesByType = {}
    for (const edge of this.edges) {
      edgesByType[edge.type] = (edgesByType[edge.type] || 0) + 1
    }
    return {
      totalNodes: Object.keys(this.nodes).length,
      totalEdges: this.edges.length,
      nodesByType,
      edgesByType,
      sequenceCount: Object.keys(this.sequences).length,
      patternCount: Object.values(this.sequences).filter(s => s.count >= 2).length
    }
  }

  // ── SIMILAR edges: find actions similar to a given prediction ───────────

  findSimilarActions(prediction, limit = 3) {
    const candidates = Object.values(this.nodes)
      .filter(n => n.type === 'action' && n.data.action_type === prediction.action_type && n.id !== prediction.id)
      .sort((a, b) => b.count - a.count)
      .slice(0, limit)

    // Mark SIMILAR edges
    for (const candidate of candidates) {
      const actionId = `action:${prediction.action_type}:${this._normalizeAction(prediction)}`
      this.addEdge(actionId, candidate.id, 'SIMILAR', 0.3)
    }

    return candidates.map(n => ({
      description: n.data.description,
      count: n.count,
      lastSeen: n.lastSeen
    }))
  }

  // ── Internals ─────────────────────────────────────────────────────────────

  _normalizeContext(signal) {
    return (signal.description || signal.source || '').slice(0, 40).toLowerCase().replace(/\s+/g, '_')
  }

  _normalizeAction(prediction) {
    return (prediction.description || prediction.category || '').slice(0, 40).toLowerCase().replace(/\s+/g, '_')
  }

  _updateSequence(prediction) {
    const hour = new Date().getHours()
    const timeSlot = hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening'
    const dayKey = new Date().getDay()
    const seqKey = `${timeSlot}_${dayKey}_${prediction.action_type}`

    if (!this.sequences[seqKey]) {
      this.sequences[seqKey] = {
        key: seqKey,
        label: `${timeSlot} ${prediction.action_type.replace(/_/g, ' ')}`,
        count: 0,
        actions: [prediction.action_type],
        timeSlot,
        lastSeen: Date.now()
      }
    }
    this.sequences[seqKey].count++
    this.sequences[seqKey].lastSeen = Date.now()
  }

  _persist() {
    try {
      // Prune old low-weight edges to keep store size manageable
      if (this.edges.length > 500) {
        this.edges = this.edges
          .sort((a, b) => b.weight - a.weight)
          .slice(0, 400)
      }
      this.store.set('ubg', {
        nodes: this.nodes,
        edges: this.edges,
        sequences: this.sequences
      })
    } catch (e) {
      console.error('[UBG] persist error:', e.message)
    }
  }
}

module.exports = { UserBehaviorGraph }
