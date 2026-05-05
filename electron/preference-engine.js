/**
 * preference-engine.js — BIE-3: Preference Learning
 *
 * SRS BIE-3: "The system shall maintain a user preference vector database
 * including communication style (formal vs. casual), time preferences
 * (morning person vs. night owl), and decision history (accepted/rejected suggestions)."
 *
 * Implements cosine-similarity preference vectors per category.
 * Suggestions are ranked by similarity to past accepted actions.
 */

class PreferenceEngine {
  constructor(store) {
    this.store = store
    const saved = store.get('preferenceVectors', {})
    this.vectors = saved  // category -> { features: {}, acceptCount, rejectCount }
  }

  // Record an outcome for a prediction
  record(prediction, outcome) {
    // outcome: 'accepted' | 'rejected' | 'auto_executed'
    const category = prediction.category || prediction.action_type || 'general'

    if (!this.vectors[category]) {
      this.vectors[category] = {
        features: {},
        acceptCount: 0,
        rejectCount: 0,
        lastUpdated: Date.now()
      }
    }

    const vec = this.vectors[category]
    const isAccepted = outcome === 'accepted' || outcome === 'auto_executed'

    // Extract features from the prediction
    const features = this._extractFeatures(prediction)

    // Update feature weights using exponential moving average
    const alpha = 0.2  // learning rate
    for (const [feat, val] of Object.entries(features)) {
      const current = vec.features[feat] || 0
      const signal = isAccepted ? val : -val * 0.5  // rejections count less
      vec.features[feat] = current * (1 - alpha) + signal * alpha
    }

    if (isAccepted) vec.acceptCount++
    else if (outcome === 'rejected') vec.rejectCount++
    vec.lastUpdated = Date.now()

    this._persist()
  }

  // Score a prediction against learned preferences (0-100)
  score(prediction) {
    const category = prediction.category || prediction.action_type || 'general'
    const vec = this.vectors[category]

    if (!vec || vec.acceptCount === 0) {
      return 50  // neutral if no history
    }

    const features = this._extractFeatures(prediction)
    const similarity = this._cosineSimilarity(vec.features, features)

    // Map [-1, 1] cosine similarity to [0, 100] score
    const baseScore = Math.round((similarity + 1) * 50)

    // Adjust for accept/reject ratio
    const total = vec.acceptCount + vec.rejectCount
    const acceptRatio = vec.acceptCount / total
    const adjusted = baseScore * 0.7 + acceptRatio * 100 * 0.3

    return Math.round(Math.max(0, Math.min(100, adjusted)))
  }

  // Get preference summary for the UI
  getSummary() {
    const summary = {}
    for (const [cat, vec] of Object.entries(this.vectors)) {
      const total = vec.acceptCount + vec.rejectCount
      if (total === 0) continue

      // Infer time preference
      const morningWeight = vec.features['time_morning'] || 0
      const eveningWeight = vec.features['time_evening'] || 0
      const timePreference = morningWeight > eveningWeight ? 'morning' : morningWeight < eveningWeight ? 'evening' : 'flexible'

      // Infer style from features
      const formalWeight = vec.features['formal_style'] || 0
      const casualWeight = vec.features['casual_style'] || 0
      const communicationStyle = formalWeight > casualWeight ? 'formal' : formalWeight < casualWeight ? 'casual' : 'balanced'

      summary[cat] = {
        acceptRate: Math.round((vec.acceptCount / total) * 100),
        totalDecisions: total,
        timePreference,
        communicationStyle,
        topFeatures: Object.entries(vec.features)
          .sort(([, a], [, b]) => Math.abs(b) - Math.abs(a))
          .slice(0, 5)
          .map(([feat, weight]) => ({ feature: feat, weight: Math.round(weight * 100) / 100 }))
      }
    }
    return summary
  }

  // ── Feature extraction ──────────────────────────────────────────────────

  _extractFeatures(prediction) {
    const features = {}
    const hour = new Date().getHours()
    const day = new Date().getDay()

    // Time features
    features['time_morning']   = hour >= 6  && hour < 12 ? 1 : 0
    features['time_afternoon'] = hour >= 12 && hour < 17 ? 1 : 0
    features['time_evening']   = hour >= 17 && hour < 22 ? 1 : 0
    features['time_weekend']   = (day === 0 || day === 6) ? 1 : 0
    features['time_weekday']   = day >= 1 && day <= 5 ? 1 : 0

    // Action type features
    features[`action_${prediction.action_type}`] = 1

    // Confidence level
    features['confidence_green']  = prediction.confidence_level === 'green'  ? 1 : 0
    features['confidence_yellow'] = prediction.confidence_level === 'yellow' ? 1 : 0
    features['confidence_red']    = prediction.confidence_level === 'red'    ? 1 : 0

    // Communication style detection from description
    const desc = (prediction.description || '').toLowerCase()
    const formalWords = ['schedule', 'meeting', 'report', 'draft', 'professional', 'agenda']
    const casualWords = ['hey', 'quick', 'grab', 'ping', 'remind']
    features['formal_style']  = formalWords.some(w => desc.includes(w)) ? 1 : 0
    features['casual_style']  = casualWords.some(w => desc.includes(w)) ? 1 : 0

    // Category
    if (prediction.category) {
      features[`cat_${prediction.category}`] = 1
    }

    return features
  }

  _cosineSimilarity(vecA, vecB) {
    const keys = new Set([...Object.keys(vecA), ...Object.keys(vecB)])
    let dot = 0, magA = 0, magB = 0

    for (const key of keys) {
      const a = vecA[key] || 0
      const b = vecB[key] || 0
      dot  += a * b
      magA += a * a
      magB += b * b
    }

    if (magA === 0 || magB === 0) return 0
    return dot / (Math.sqrt(magA) * Math.sqrt(magB))
  }

  _persist() {
    try {
      this.store.set('preferenceVectors', this.vectors)
    } catch (e) {
      console.error('[PreferenceEngine] persist error:', e.message)
    }
  }
}

module.exports = { PreferenceEngine }
