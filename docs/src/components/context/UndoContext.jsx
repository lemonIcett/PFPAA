import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { undo, realtime } from '@/api/electron'
import { useToast } from '@/components/ui/use-toast'

const UndoContext = createContext(null)

export function UndoProvider({ children }) {
  const [undoQueue, setUndoQueue] = useState([])
  const { toast } = useToast()

  useEffect(() => {
    const refresh = async () => {
      const list = await undo.list()
      setUndoQueue(list || [])
    }
    refresh()

    realtime.on('undo:available', (entry) => {
      setUndoQueue(q => [entry, ...q])
      toast({
        title: '✓ Action executed',
        description: `Undo available for 30 seconds`,
        action: (
          <button
            onClick={() => handleUndo(entry.id)}
            className="text-xs px-3 py-1 rounded bg-amber-500/20 text-amber-400 hover:bg-amber-500/30"
          >
            Undo
          </button>
        ),
        duration: 30000,
      })
    })

    realtime.on('undo:expired', ({ id }) => {
      setUndoQueue(q => q.filter(e => e.id !== id))
    })

    return () => {
      realtime.off('undo:available')
      realtime.off('undo:expired')
    }
  }, [])

  const handleUndo = useCallback(async (entryId) => {
    const result = await undo.execute(entryId)
    if (result.success) {
      setUndoQueue(q => q.filter(e => e.id !== entryId))
      toast({ title: '↩ Action undone', description: 'Successfully reversed', duration: 3000 })
    } else {
      toast({ title: 'Undo failed', description: result.error, variant: 'destructive', duration: 4000 })
    }
  }, [])

  return (
    <UndoContext.Provider value={{ undoQueue, handleUndo }}>
      {children}
    </UndoContext.Provider>
  )
}

export const useUndo = () => useContext(UndoContext)
