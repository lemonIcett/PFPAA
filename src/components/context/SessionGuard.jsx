import { useState, useEffect, useCallback } from 'react'
import { realtime, session } from '@/api/electron'
import { Shield, MousePointer } from 'lucide-react'

export function SessionGuard({ children }) {
  const [locked, setLocked] = useState(false)

  useEffect(() => {
    realtime.on('session:timeout', () => setLocked(true))
    return () => realtime.off('session:timeout')
  }, [])

  const unlock = useCallback(() => {
    setLocked(false)
    session.ping()
  }, [])

  if (!locked) return children

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-background cursor-pointer select-none"
      onClick={unlock}
    >
      <div className="flex flex-col items-center gap-4 text-center">
        <div className="p-5 rounded-full bg-primary/10">
          <Shield className="w-10 h-10 text-primary" />
        </div>
        <div>
          <h2 className="text-lg font-semibold text-foreground">Session locked</h2>
          <p className="text-sm text-muted-foreground mt-1">15 minutes of inactivity. Click anywhere to resume.</p>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground mt-2">
          <MousePointer className="w-3.5 h-3.5" />
          Click anywhere to unlock
        </div>
      </div>
    </div>
  )
}
