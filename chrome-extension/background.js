// PFPA Chrome Extension - Background Service Worker v2
// Monitors tab activity, sends to PFPA desktop app, handles form-fill requests

const WS_URL = 'ws://localhost:7777'
const RECONNECT_DELAY = 5000
const DEBOUNCE_MS = 2000

let ws = null
let isConnected = false
let reconnectTimer = null
let lastSentUrl = null
let debounceTimer = null

// ── WebSocket ──────────────────────────────────────────────────────────────
function connect() {
  if (ws && ws.readyState === WebSocket.OPEN) return
  ws = new WebSocket(WS_URL)

  ws.onopen = () => {
    isConnected = true
    console.log('[PFPA] Connected to desktop app')
    clearTimeout(reconnectTimer)
    updateBadge(true)
    sendCurrentTab()
  }

  ws.onclose = () => {
    isConnected = false
    updateBadge(false)
    reconnectTimer = setTimeout(connect, RECONNECT_DELAY)
  }

  ws.onerror = () => ws.close()

  // ── Handle messages FROM desktop app ──────────────────────────────────────
  ws.onmessage = (event) => {
    try {
      const msg = JSON.parse(event.data)

      // PAS-2: Form pre-filling
      if (msg.type === 'form_fill') {
        handleFormFill(msg.data)
      }

      // Future: other desktop→extension messages
    } catch (e) {
      console.error('[PFPA] WS message parse error', e)
    }
  }
}

function send(data) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(data))
  }
}

function updateBadge(connected) {
  chrome.action.setBadgeText({ text: connected ? '●' : '' })
  chrome.action.setBadgeBackgroundColor({ color: connected ? '#34d399' : '#f87171' })
}

// ── PAS-2: Form field detection + pre-filling ─────────────────────────────
function handleFormFill(data) {
  // Inject form-fill script into active tab
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (!tabs[0]) return
    const tab = tabs[0]

    // Only fill on matching URL if specified
    if (data.url && !tab.url.includes(data.url.replace(/^https?:\/\//, '').split('/')[0])) {
      console.log('[PFPA] Form fill: URL mismatch, skipping')
      return
    }

    chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: fillFormFields,
      args: [data.fields || []]
    }).then(results => {
      const filled = results?.[0]?.result || 0
      send({ type: 'form_fill_result', data: { filled, url: tab.url, timestamp: Date.now() } })
      console.log(`[PFPA] Form fill: ${filled} fields filled on ${tab.url}`)
    }).catch(err => {
      console.error('[PFPA] Form fill injection failed:', err)
      send({ type: 'form_fill_result', data: { filled: 0, error: err.message } })
    })
  })
}

// Injected into page context — fills form fields intelligently
function fillFormFields(fields) {
  let filled = 0

  // Strategy 1: Fill by field name/id/placeholder matching
  const inputs = document.querySelectorAll('input:not([type="hidden"]):not([type="submit"]):not([type="button"]), textarea, select')

  inputs.forEach(input => {
    const name = (input.name || '').toLowerCase()
    const id = (input.id || '').toLowerCase()
    const placeholder = (input.placeholder || '').toLowerCase()
    const label = document.querySelector(`label[for="${input.id}"]`)?.textContent?.toLowerCase() || ''
    const context = `${name} ${id} ${placeholder} ${label}`

    for (const field of fields) {
      const key = field.key.toLowerCase()
      const value = field.value

      const matches = (
        context.includes(key) ||
        (key === 'name' && (context.includes('name') || context.includes('full'))) ||
        (key === 'email' && context.includes('email')) ||
        (key === 'phone' && (context.includes('phone') || context.includes('mobile') || context.includes('tel'))) ||
        (key === 'address' && context.includes('address')) ||
        (key === 'city' && context.includes('city')) ||
        (key === 'zip' && (context.includes('zip') || context.includes('postal'))) ||
        (key === 'company' && (context.includes('company') || context.includes('organization'))) ||
        (key === 'subject' && context.includes('subject')) ||
        (key === 'message' && (context.includes('message') || context.includes('description') || context.includes('comment')))
      )

      if (matches && !input.value && input.type !== 'password') {
        // Set value and trigger React/Vue/Angular change events
        const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set
        const nativeTextAreaSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set

        if (input.tagName === 'TEXTAREA' && nativeTextAreaSetter) {
          nativeTextAreaSetter.call(input, value)
        } else if (nativeInputValueSetter) {
          nativeInputValueSetter.call(input, value)
        } else {
          input.value = value
        }

        // Fire all necessary events for framework reactivity
        input.dispatchEvent(new Event('input', { bubbles: true }))
        input.dispatchEvent(new Event('change', { bubbles: true }))
        input.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true }))
        filled++
        break
      }
    }
  })

  return filled
}

// ── Tab monitoring ─────────────────────────────────────────────────────────
function sendCurrentTab() {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (!tabs[0]) return
    const tab = tabs[0]
    if (!tab.url || tab.url.startsWith('chrome://') || tab.url === 'about:blank') return
    if (tab.url === lastSentUrl) return
    lastSentUrl = tab.url

    // Detect if this is a form page
    chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => {
        const forms = document.querySelectorAll('form')
        const inputs = document.querySelectorAll('input:not([type="hidden"]):not([type="submit"])')
        return { hasForms: forms.length > 0, inputCount: inputs.length }
      }
    }).then(results => {
      const pageInfo = results?.[0]?.result || {}
      send({
        type: 'browser_activity',
        data: {
          url: tab.url,
          title: tab.title || tab.url,
          favIconUrl: tab.favIconUrl,
          timestamp: Date.now(),
          hasForms: pageInfo.hasForms || false,
          formInputCount: pageInfo.inputCount || 0
        }
      })
    }).catch(() => {
      // Fallback without form detection (e.g. cross-origin restrictions)
      send({
        type: 'browser_activity',
        data: { url: tab.url, title: tab.title || tab.url, timestamp: Date.now() }
      })
    })
  })
}

function debouncedSend() {
  clearTimeout(debounceTimer)
  debounceTimer = setTimeout(sendCurrentTab, DEBOUNCE_MS)
}

// ── Event listeners ────────────────────────────────────────────────────────
chrome.tabs.onActivated.addListener(() => debouncedSend())
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.active) debouncedSend()
})
chrome.windows.onFocusChanged.addListener((windowId) => {
  if (windowId !== chrome.windows.WINDOW_ID_NONE) debouncedSend()
})

// ── Start ──────────────────────────────────────────────────────────────────
connect()

// Keep-alive ping every 30s
setInterval(() => {
  if (isConnected) send({ type: 'ping' })
  else connect()
}, 30000)
