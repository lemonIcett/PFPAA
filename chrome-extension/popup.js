const ws = new WebSocket('ws://localhost:7777')
const statusEl = document.getElementById('status')
const dotEl = document.getElementById('dot')

ws.onopen = () => {
  statusEl.textContent = '✓ Connected to PFPA desktop app'
  statusEl.className = 'status connected'
  dotEl.className = 'dot green'
}

ws.onclose = () => {
  statusEl.textContent = '✗ Not connected — is PFPA running?'
  statusEl.className = 'status disconnected'
  dotEl.className = 'dot'
}

ws.onerror = () => {
  statusEl.textContent = '✗ Cannot reach PFPA app on port 7777'
  statusEl.className = 'status disconnected'
}
