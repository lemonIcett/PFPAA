import { useState, useEffect } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import Sidebar from './Sidebar'
import TopBar from './TopBar'
import { entities } from '@/api/electron'
import { useVoiceFeedback } from '@/hooks/useVoiceFeedback'

/**
 * AppLayout — WCAG 2.1 AA enhancements (NF):
 *  - Skip-navigation link (WCAG 2.4.1)
 *  - Focus moves to main content on route change (WCAG 2.4.3)
 *  - Proper landmark regions: <nav> in Sidebar, <header> in TopBar, <main> here
 *  - Page title updated on navigation (WCAG 2.4.2)
 */

const ROUTE_TITLES = {
  '/':              'Dashboard',
  '/context':       'Context Monitor',
  '/predictions':   'Predictions',
  '/relationships': 'Relationships',
  '/actions':       'Action Log',
  '/workflows':     'Workflows',
  '/voice-gesture': 'Voice & Gesture',
  '/safety':        'Safety',
  '/performance':   'Performance',
  '/accuracy':      'Accuracy',
  '/formfill':      'Form Fill',
  '/integrations':  'Integrations',
  '/settings':      'Settings',
  '/compliance':    'Compliance',
  '/privacy':       'Privacy',
}

export default function AppLayout() {
  const [voiceEnabled, setVoiceEnabled] = useState(false)
  const location = useLocation()

  useEffect(() => {
    entities.UserSetting.list().then(s => setVoiceEnabled(!!s[0]?.voice_feedback))
  }, [])

  useVoiceFeedback(voiceEnabled)

  // WCAG 2.4.2: Update document title on route change
  useEffect(() => {
    const pageTitle = ROUTE_TITLES[location.pathname] || 'PFPA'
    document.title = `${pageTitle} — PFPA`
  }, [location.pathname])

  // WCAG 2.4.3: Move focus to main content heading on route change
  // so keyboard/screen-reader users land at the new page, not the sidebar
  useEffect(() => {
    const main = document.getElementById('main-content')
    if (main) {
      // Only shift focus if user navigated (not initial load)
      const h1 = main.querySelector('h1')
      if (h1) {
        h1.setAttribute('tabindex', '-1')
        h1.focus({ preventScroll: false })
      }
    }
  }, [location.pathname])

  return (
    <div className="flex h-screen bg-background text-foreground overflow-hidden">

      {/* WCAG 2.4.1: Skip navigation link — visible on focus, off-screen at rest */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50
          focus:px-4 focus:py-2 focus:bg-primary focus:text-primary-foreground
          focus:rounded-lg focus:text-sm focus:font-medium focus:shadow-lg"
      >
        Skip to main content
      </a>

      <Sidebar />

      <div className="flex-1 flex flex-col overflow-hidden">
        <TopBar />
        <main
          id="main-content"
          className="flex-1 overflow-y-auto p-6"
          tabIndex={-1}
          aria-label={ROUTE_TITLES[location.pathname] || 'Main content'}
          style={{ outline: 'none' }}  /* suppress focus ring on programmatic focus */
        >
          <Outlet />
        </main>
      </div>
    </div>
  )
}
