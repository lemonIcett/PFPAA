import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import { HashRouter as Router, Route, Routes, Navigate, useLocation } from 'react-router-dom'
import { useEffect } from 'react'
import AppLayout from '@/components/layout/AppLayout'
import Dashboard from '@/pages/Dashboard'
import ContextMonitor from '@/pages/ContextMonitor'
import Predictions from '@/pages/Predictions'
import ActionLog from '@/pages/ActionLog'
import Workflows from '@/pages/Workflows'
import Safety from '@/pages/Safety'
import Settings from '@/pages/Settings'
import Compliance from '@/pages/Compliance'
import Privacy from '@/pages/Privacy'
import Integrations from '@/pages/Integrations'
import Relationships from '@/pages/Relationships'
import Performance from '@/pages/Performance'
import Accuracy from '@/pages/Accuracy'
import FormFill from '@/pages/FormFill'
import VoiceGesture from '@/pages/VoiceGesture'
import GhostOverlay from '@/pages/GhostOverlay'
import { UndoProvider } from '@/components/context/UndoContext'
import { SessionGuard } from '@/components/context/SessionGuard'
import { Toaster } from '@/components/ui/toaster'
import { session } from '@/api/electron'

// Ping session timer on any navigation
function SessionPinger() {
  const location = useLocation()
  useEffect(() => { session.ping() }, [location])
  return null
}

function App() {
  return (
    <QueryClientProvider client={queryClientInstance}>
      <UndoProvider>
        <Router>
          <SessionPinger />
          <SessionGuard>
            <Routes>
              {/* Ghost overlay — standalone transparent window */}
              <Route path="/overlay" element={<GhostOverlay />} />

              {/* Main app */}
              <Route element={<AppLayout />}>
                <Route path="/"              element={<Dashboard />} />
                <Route path="/context"       element={<ContextMonitor />} />
                <Route path="/predictions"   element={<Predictions />} />
                <Route path="/relationships" element={<Relationships />} />
                <Route path="/actions"       element={<ActionLog />} />
                <Route path="/workflows"     element={<Workflows />} />
                <Route path="/voice-gesture" element={<VoiceGesture />} />
                <Route path="/safety"        element={<Safety />} />
                <Route path="/performance"   element={<Performance />} />
              <Route path="/accuracy"      element={<Accuracy />} />
              <Route path="/formfill"      element={<FormFill />} />
              <Route path="/integrations"  element={<Integrations />} />
                <Route path="/settings"      element={<Settings />} />
                <Route path="/compliance"   element={<Compliance />} />
                <Route path="/privacy"      element={<Privacy />} />
              </Route>
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </SessionGuard>
        </Router>
        <Toaster />
      </UndoProvider>
    </QueryClientProvider>
  )
}

export default App
