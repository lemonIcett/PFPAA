# TCCAM003 — Cross-Device Context Sync Integration Test

**SRS Reference:** CAM-4 — "The system shall synchronize context across devices with
less than 2-second latency, maintaining a unified digital twin state."

**Test ID:** TCCAM003  
**Priority:** High  
**Type:** Integration

---

## Test Objective

Verify that a preference change made on Device A is reflected on Device B within the
2-second SLA, using the Supabase real-time channel as the transport layer.

---

## Prerequisites

1. Two machines (or two OS user accounts on the same machine) each running PFPA v2.2-M.
2. Both devices configured with the **same Supabase project** (same URL + anon key).
3. Both devices online and showing `Synced` in the TopBar.
4. Note the **Device ID** of each machine from Settings → Cross-device sync status.

---

## Test Steps

### Manual Test Procedure

| Step | Action | Device |
|------|--------|--------|
| 1 | Note current `confidence_threshold` on Device B | B |
| 2 | Open **Settings → Confidence Tuner** on Device A | A |
| 3 | Change the slider from its current value to a new value (e.g. 3 → 5) | A |
| 4 | Click Save | A |
| 5 | Start a stopwatch | A |
| 6 | Watch the TopBar on Device B for **"Synced just now"** | B |
| 7 | Stop the stopwatch when the TopBar updates | B |
| 8 | Open Settings on Device B and verify the `confidence_threshold` now shows 5 | B |

**Pass criteria:**
- Elapsed time in step 7 ≤ 2,000 ms
- Device B slider shows the value set in step 3
- TopBar on Device B shows `Synced just now`

---

## Automated Test Script

Run this against a real Supabase project (requires `SUPABASE_URL` and `SUPABASE_ANON_KEY`
env vars). The script simulates Device A writing a preference and Device B observing it.

```js
// test/tccam003-cross-device-sync.js
// Run: node test/tccam003-cross-device-sync.js

const { createClient } = require('@supabase/supabase-js')
const crypto = require('crypto')

const SUPABASE_URL  = process.env.SUPABASE_URL
const SUPABASE_KEY  = process.env.SUPABASE_ANON_KEY
const SLA_MS        = 2000

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Set SUPABASE_URL and SUPABASE_ANON_KEY env vars')
  process.exit(1)
}

const deviceA = createClient(SUPABASE_URL, SUPABASE_KEY)
const deviceB = createClient(SUPABASE_URL, SUPABASE_KEY)

const testId     = crypto.randomUUID()
const testValue  = Math.floor(Math.random() * 5) + 1
let   writeTime  = null
let   passed     = false

;(async () => {
  console.log('TCCAM003 — Cross-Device Sync Test')
  console.log('Test record ID:', testId)
  console.log('Writing confidence_threshold =', testValue, 'from Device A…')

  // Device B subscribes BEFORE Device A writes
  const ch = deviceB
    .channel('pfpa-settings')
    .on('postgres_changes',
      { event: '*', schema: 'public', table: 'pfpa_settings' },
      (payload) => {
        const elapsed = Date.now() - writeTime
        const v = payload.new?.confidence_threshold
        if (payload.new?.id === testId && v === testValue) {
          passed = elapsed <= SLA_MS
          console.log(`\nDevice B received update in ${elapsed}ms`)
          console.log(`SLA target: ${SLA_MS}ms`)
          console.log(passed ? '✓ PASS — within SLA' : `✗ FAIL — exceeded SLA by ${elapsed - SLA_MS}ms`)
          ch.unsubscribe()
          process.exit(passed ? 0 : 1)
        }
      }
    )
    .subscribe()

  // Wait for subscription to be ready
  await new Promise(r => setTimeout(r, 500))

  // Device A writes
  writeTime = Date.now()
  const { error } = await deviceA
    .from('pfpa_settings')
    .upsert({
      id:                   testId,
      confidence_threshold: testValue,
      device_id:            'device-A-test',
      synced_at:            new Date().toISOString(),
    }, { onConflict: 'id' })

  if (error) {
    console.error('Write failed:', error.message)
    process.exit(1)
  }
  console.log('Device A wrote at', new Date().toISOString())

  // Timeout guard
  setTimeout(() => {
    console.error(`\n✗ FAIL — Device B did not receive update within ${SLA_MS * 2}ms`)
    ch.unsubscribe()
    process.exit(1)
  }, SLA_MS * 2)
})()
```

### Running the test

```bash
SUPABASE_URL=https://xxxx.supabase.co \
SUPABASE_ANON_KEY=eyJ... \
node test/tccam003-cross-device-sync.js
```

Expected output:
```
TCCAM003 — Cross-Device Sync Test
Test record ID: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
Writing confidence_threshold = 4 from Device A…
Device A wrote at 2026-04-25T12:00:00.123Z

Device B received update in 847ms
SLA target: 2000ms
✓ PASS — within SLA
```

---

## Conflict Resolution Verification

To verify the new field-level last-write-wins merge (Gap Analysis fix):

1. Simultaneously update `confidence_threshold` on both devices to **different values**.
2. The device that wrote **later** (higher `updated_at` timestamp) should win.
3. Both devices should eventually converge to the same value within 2 seconds.

---

## Related SRS Requirements

| ID | Requirement |
|----|-------------|
| CAM-4 | Cross-device sync latency < 2 seconds |
| SEC-1 | Data encrypted in transit (TLS 1.3) |
| SEC-1 | Data encrypted at rest (AES-256) |
| SGL-3 | Audit trail synced across devices |
