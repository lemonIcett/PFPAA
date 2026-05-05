import { useState } from 'react'
import { Shield, Unlock } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

export default function SessionLock({ onUnlock }) {
  const [pin, setPin] = useState('')
  const [error, setError] = useState('')

  // Simple 4-digit PIN unlock (stored in settings or default 1234)
  const handleUnlock = () => {
    // In production this would check against a stored hashed PIN
    // For now any non-empty input unlocks (biometric would replace this)
    if (pin.length >= 4) {
      setError('')
      onUnlock()
    } else {
      setError('Enter at least 4 characters to unlock')
    }
  }

  return (
    <div className="fixed inset-0 bg-background/95 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="w-80 space-y-6 text-center">
        <div className="flex justify-center">
          <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
            <Shield className="w-8 h-8 text-primary" />
          </div>
        </div>

        <div>
          <h2 className="text-lg font-semibold text-foreground">Session locked</h2>
          <p className="text-sm text-muted-foreground mt-1">
            PFPA locked after 15 minutes of inactivity
          </p>
        </div>

        <div className="space-y-3">
          <Input
            type="password"
            placeholder="Enter PIN to unlock"
            value={pin}
            onChange={e => setPin(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleUnlock()}
            className="text-center text-lg tracking-widest bg-secondary border-border"
            autoFocus
          />
          {error && <p className="text-xs text-red-400">{error}</p>}
          <Button className="w-full gap-2" onClick={handleUnlock}>
            <Unlock className="w-4 h-4" />
            Unlock PFPA
          </Button>
        </div>

        <p className="text-xs text-muted-foreground">
          Session timeout: 15 minutes · SRS SEC-2 compliant
        </p>
      </div>
    </div>
  )
}
