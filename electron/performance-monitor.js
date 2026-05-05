/**
 * performance-monitor.js — PERF requirements
 *
 * SRS Performance Requirements:
 *   - Context detection latency < 100ms
 *   - Intent prediction latency < 500ms
 *   - Battery drain < 5%/hr on mobile
 *   - 99.9% uptime for core prediction engine
 *
 * Tracks P50/P95/P99 latencies per operation type.
 * Uses Electron powerMonitor to detect battery state and throttle polling.
 */

const { powerMonitor } = require('electron')

class PerformanceMonitor {
  constructor() {
    this.measurements = {}    // operationType -> [latency_ms, ...]
    this.violations   = []    // SLA breaches
    this.sla = {
      context_detection: 100,
      intent_prediction: 500,
      action_execution:  2000,
      cross_device_sync: 2000,
    }
    this.startTime = Date.now()
    this.totalOperations = 0
    this.failedOperations = 0
    this._batteryThrottle = false

    // Listen for battery status changes
    try {
      powerMonitor.on('on-battery',     () => { this._batteryThrottle = true;  console.log('[PERF] Battery mode: reducing poll frequency') })
      powerMonitor.on('on-ac',          () => { this._batteryThrottle = false; console.log('[PERF] AC mode: restoring poll frequency') })
      powerMonitor.on('speed-limit-change', (limit) => { console.log(`[PERF] CPU speed limit: ${limit}%`) })
    } catch (e) {
      // powerMonitor unavailable in test environments
    }
  }

  // ── Measure a single operation ─────────────────────────────────────────

  start(operationType) {
    return { type: operationType, t0: performance.now() }
  }

  end(handle) {
    const latency = performance.now() - handle.t0
    this._record(handle.type, latency)
    return latency
  }

  // Convenience: wrap async function with measurement
  async measure(operationType, fn) {
    const t0 = performance.now()
    this.totalOperations++
    try {
      const result = await fn()
      const latency = performance.now() - t0
      this._record(operationType, latency)
      return result
    } catch (e) {
      this.failedOperations++
      this._record(operationType, performance.now() - t0)
      throw e
    }
  }

  // ── Report ────────────────────────────────────────────────────────────

  getReport() {
    const report = {
      uptimeMs:          Date.now() - this.startTime,
      uptimePct:         this._calculateUptime(),
      totalOperations:   this.totalOperations,
      failedOperations:  this.failedOperations,
      batteryThrottle:   this._batteryThrottle,
      batteryStatus:     this._getBatteryStatus(),
      violations:        this.violations.slice(-20),
      operations:        {}
    }

    for (const [opType, samples] of Object.entries(this.measurements)) {
      if (samples.length === 0) continue
      const sorted = [...samples].sort((a, b) => a - b)
      report.operations[opType] = {
        count:  samples.length,
        p50:    this._percentile(sorted, 50),
        p95:    this._percentile(sorted, 95),
        p99:    this._percentile(sorted, 99),
        min:    sorted[0],
        max:    sorted[sorted.length - 1],
        avg:    sorted.reduce((a, b) => a + b, 0) / sorted.length,
        sla:    this.sla[opType] || null,
        slaOk:  this.sla[opType] ? this._percentile(sorted, 95) < this.sla[opType] : null
      }
    }

    return report
  }

  // ── Battery-adaptive polling interval ────────────────────────────────

  getPollingInterval(baseMs = 5000) {
    if (this._batteryThrottle) {
      return baseMs * 3   // 3x slower on battery to meet <5%/hr drain
    }
    return baseMs
  }

  // ── Internals ─────────────────────────────────────────────────────────

  _record(opType, latencyMs) {
    if (!this.measurements[opType]) this.measurements[opType] = []
    this.measurements[opType].push(latencyMs)

    // Keep only last 200 samples per operation type
    if (this.measurements[opType].length > 200) {
      this.measurements[opType] = this.measurements[opType].slice(-200)
    }

    // Check SLA
    const sla = this.sla[opType]
    if (sla && latencyMs > sla) {
      this.violations.push({
        operationType: opType,
        latencyMs: Math.round(latencyMs),
        slaMs: sla,
        excessMs: Math.round(latencyMs - sla),
        timestamp: new Date().toISOString()
      })
      if (this.violations.length > 100) this.violations = this.violations.slice(-100)
    }
  }

  _percentile(sorted, p) {
    if (sorted.length === 0) return 0
    const idx = Math.ceil((p / 100) * sorted.length) - 1
    return Math.round(sorted[Math.max(0, idx)])
  }

  _calculateUptime() {
    if (this.totalOperations === 0) return 100
    return Math.round((1 - this.failedOperations / this.totalOperations) * 10000) / 100
  }

  _getBatteryStatus() {
    try {
      const sources = powerMonitor.getSystemIdleState ? true : false
      return {
        onBattery: this._batteryThrottle,
        monitoring: sources
      }
    } catch {
      return { onBattery: false, monitoring: false }
    }
  }
}

// Singleton
const perfMonitor = new PerformanceMonitor()
module.exports = { PerformanceMonitor, perfMonitor }
