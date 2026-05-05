/**
 * useGestureEngine.js — MMI-3: Global Gesture Control
 *
 * SRS MMI-3: "Touch/gesture shortcuts for mobile:
 *   - Swipe right to approve action
 *   - Swipe left to dismiss suggestion
 *   - Long press to view alternatives"
 *
 * This hook attaches gesture listeners to a ref element.
 * Works with touch events (mobile) and pointer events (desktop simulation).
 * The threshold (pixels) and long-press duration (ms) are configurable.
 */

import { useRef, useCallback, useEffect } from 'react'

const DEFAULT_SWIPE_THRESHOLD = 50   // px
const DEFAULT_LONG_PRESS_MS   = 500  // ms

export function useGestureEngine({
  onSwipeRight,
  onSwipeLeft,
  onLongPress,
  swipeThreshold = DEFAULT_SWIPE_THRESHOLD,
  longPressDuration = DEFAULT_LONG_PRESS_MS,
  enabled = true,
} = {}) {
  const elementRef    = useRef(null)
  const startRef      = useRef(null)
  const longPressRef  = useRef(null)
  const isSwiping     = useRef(false)

  const handleStart = useCallback((x, y) => {
    if (!enabled) return
    startRef.current = { x, y, time: Date.now() }
    isSwiping.current = false

    // Start long-press timer
    longPressRef.current = setTimeout(() => {
      if (!isSwiping.current) {
        onLongPress?.()
      }
    }, longPressDuration)
  }, [enabled, longPressDuration, onLongPress])

  const handleMove = useCallback((x, y) => {
    if (!startRef.current) return
    const dx = x - startRef.current.x
    const dy = y - startRef.current.y
    if (Math.abs(dx) > 10 || Math.abs(dy) > 10) {
      isSwiping.current = true
      clearTimeout(longPressRef.current)
    }
  }, [])

  const handleEnd = useCallback((x) => {
    clearTimeout(longPressRef.current)
    if (!startRef.current || !isSwiping.current) {
      startRef.current = null
      return
    }

    const dx = x - startRef.current.x
    startRef.current = null
    isSwiping.current = false

    if (Math.abs(dx) >= swipeThreshold) {
      if (dx > 0) {
        onSwipeRight?.()
      } else {
        onSwipeLeft?.()
      }
    }
  }, [swipeThreshold, onSwipeRight, onSwipeLeft])

  useEffect(() => {
    const el = elementRef.current
    if (!el || !enabled) return

    // Touch events
    const onTouchStart = (e) => {
      if (e.touches.length === 1) {
        handleStart(e.touches[0].clientX, e.touches[0].clientY)
      }
    }
    const onTouchMove = (e) => {
      if (e.touches.length === 1) {
        handleMove(e.touches[0].clientX, e.touches[0].clientY)
      }
    }
    const onTouchEnd = (e) => {
      if (e.changedTouches.length > 0) {
        handleEnd(e.changedTouches[0].clientX)
      }
    }

    // Pointer events (desktop simulation / stylus)
    let pointerDown = false
    const onPointerDown = (e) => {
      if (e.pointerType === 'touch' || e.pointerType === 'pen') return // handled by touch events
      pointerDown = true
      handleStart(e.clientX, e.clientY)
    }
    const onPointerMove = (e) => {
      if (!pointerDown) return
      handleMove(e.clientX, e.clientY)
    }
    const onPointerUp = (e) => {
      if (!pointerDown) return
      pointerDown = false
      handleEnd(e.clientX)
    }

    // Keyboard shortcuts (desktop accessibility)
    const onKeyDown = (e) => {
      if (!enabled) return
      if (e.key === 'ArrowRight' || e.key === 'Enter') {
        onSwipeRight?.()
      } else if (e.key === 'ArrowLeft' || e.key === 'Escape') {
        onSwipeLeft?.()
      } else if (e.key === 'ArrowDown' || (e.altKey && e.key === 'ArrowDown')) {
        onLongPress?.()
      }
    }

    el.addEventListener('touchstart', onTouchStart, { passive: true })
    el.addEventListener('touchmove',  onTouchMove,  { passive: true })
    el.addEventListener('touchend',   onTouchEnd)
    el.addEventListener('pointerdown',onPointerDown)
    el.addEventListener('pointermove',onPointerMove)
    el.addEventListener('pointerup',  onPointerUp)
    el.addEventListener('keydown',    onKeyDown)

    return () => {
      el.removeEventListener('touchstart', onTouchStart)
      el.removeEventListener('touchmove',  onTouchMove)
      el.removeEventListener('touchend',   onTouchEnd)
      el.removeEventListener('pointerdown',onPointerDown)
      el.removeEventListener('pointermove',onPointerMove)
      el.removeEventListener('pointerup',  onPointerUp)
      el.removeEventListener('keydown',    onKeyDown)
      clearTimeout(longPressRef.current)
    }
  }, [enabled, handleStart, handleMove, handleEnd, onSwipeRight, onSwipeLeft, onLongPress])

  return { elementRef }
}

/**
 * SwipeableCard — wraps any content with gesture support.
 * Used by Predictions.jsx to make prediction cards swipeable.
 *
 * Usage:
 *   <SwipeableCard onApprove={fn} onDismiss={fn} onAlternatives={fn}>
 *     ... card content ...
 *   </SwipeableCard>
 */
import React, { useState } from 'react'

export function SwipeableCard({ children, onApprove, onDismiss, onAlternatives, enabled = true }) {
  const [swipeDir, setSwipeDir] = useState(null)  // 'right' | 'left' | null

  const { elementRef } = useGestureEngine({
    enabled,
    onSwipeRight: () => {
      setSwipeDir('right')
      setTimeout(() => { setSwipeDir(null); onApprove?.() }, 300)
    },
    onSwipeLeft: () => {
      setSwipeDir('left')
      setTimeout(() => { setSwipeDir(null); onDismiss?.() }, 300)
    },
    onLongPress: () => {
      onAlternatives?.()
    },
  })

  return (
    <div
      ref={elementRef}
      tabIndex={enabled ? 0 : -1}
      aria-label="Swipe right to approve, left to dismiss, long press for alternatives"
      style={{
        transform: swipeDir === 'right' ? 'translateX(30px)'
                 : swipeDir === 'left'  ? 'translateX(-30px)'
                 : undefined,
        transition: 'transform 0.2s ease, opacity 0.2s ease',
        opacity: swipeDir ? 0.5 : 1,
        outline: 'none',
      }}
    >
      {children}
    </div>
  )
}
