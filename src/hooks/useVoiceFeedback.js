/**
 * useVoiceFeedback.js — MMI-2: Bidirectional voice feedback (SRS requirement)
 *
 * SRS MMI-2: "Optional voice confirmations for hands-free scenarios
 *  e.g. 'I've drafted that email to John. Send it?'"
 *
 * Implements:
 *  - Text-to-speech (speak predictions / confirmations)
 *  - Speech recognition (listen for 'yes', 'no', 'approve', 'dismiss')
 *  - Calls onApprove / onDismiss callbacks based on what is heard
 */

import { useEffect, useRef, useCallback } from 'react'
import { realtime } from '@/api/electron'

// Words that count as approval
const APPROVE_WORDS = ['yes', 'yep', 'yeah', 'ok', 'okay', 'approve', 'confirm', 'do it', 'go', 'accept', 'sure']
// Words that count as dismissal
const DISMISS_WORDS = ['no', 'nope', 'cancel', 'dismiss', 'stop', 'skip', 'reject', 'abort', 'ignore']

function speak(text) {
  if (!window.speechSynthesis) return
  window.speechSynthesis.cancel()
  const utt = new SpeechSynthesisUtterance(text)
  utt.rate  = 1.05
  utt.pitch = 1.0
  utt.volume = 0.85
  // Prefer a higher-quality voice if available
  const voices = window.speechSynthesis.getVoices()
  const preferred = voices.find(v => v.lang.startsWith('en') && v.localService)
  if (preferred) utt.voice = preferred
  window.speechSynthesis.speak(utt)
  return utt
}

function buildPhrase(prediction) {
  const action = prediction.suggested_action || prediction.description || 'take an action'
  const level  = prediction.confidence_level
  if (level === 'green') {
    return `I'll ${action.toLowerCase()}. Say "undo" within 30 seconds to reverse.`
  }
  if (level === 'yellow') {
    return `I suggest: ${action}. Say yes to approve or no to dismiss.`
  }
  return `I need your approval to ${action.toLowerCase()}. Say yes to confirm or no to cancel.`
}

export function useVoiceFeedback(enabled, { onApprove, onDismiss } = {}) {
  const recognitionRef = useRef(null)
  const listeningRef   = useRef(false)
  const pendingRef     = useRef(null)  // prediction awaiting voice response

  // ── Start speech recognition ──────────────────────────────────────────
  const startListening = useCallback((prediction) => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SpeechRecognition) return  // Browser doesn't support it

    if (recognitionRef.current) {
      try { recognitionRef.current.stop() } catch (e) {}
    }

    pendingRef.current = prediction
    const recognition = new SpeechRecognition()
    recognition.lang = 'en-US'
    recognition.continuous = false
    recognition.interimResults = false
    recognition.maxAlternatives = 3

    recognition.onstart  = () => { listeningRef.current = true }
    recognition.onend    = () => { listeningRef.current = false }
    recognition.onerror  = (e) => {
      listeningRef.current = false
      console.warn('[VOICE] Recognition error:', e.error)
    }

    recognition.onresult = (event) => {
      const results = Array.from(event.results[0]).map(r => r.transcript.toLowerCase().trim())
      const heard   = results[0] || ''
      console.log('[VOICE] Heard:', heard)

      // Log to main process for debugging
      window.electronAPI?.logVoice?.({ text: heard, confidence: event.results[0][0].confidence })

      const isApprove = APPROVE_WORDS.some(w => heard.includes(w))
      const isDismiss = DISMISS_WORDS.some(w => heard.includes(w))

      if (isApprove && pendingRef.current) {
        speak('Approving.')
        onApprove?.(pendingRef.current)
        pendingRef.current = null
      } else if (isDismiss && pendingRef.current) {
        speak('Dismissed.')
        onDismiss?.(pendingRef.current)
        pendingRef.current = null
      } else if (heard) {
        // Didn't understand — ask again once
        speak(`Sorry, I didn't catch that. Say yes to approve or no to dismiss.`)
      }
    }

    recognitionRef.current = recognition
    // Small delay so the TTS finishes before mic opens
    setTimeout(() => {
      try { recognition.start() } catch (e) { console.warn('[VOICE] Could not start recognition:', e.message) }
    }, 1200)
  }, [onApprove, onDismiss])

  // ── React to new predictions ──────────────────────────────────────────
  useEffect(() => {
    if (!enabled) return

    const handleNewPrediction = (prediction) => {
      if (!prediction) return
      const phrase = buildPhrase(prediction)
      speak(phrase)

      // For yellow/red: also start listening for response
      if (prediction.confidence_level !== 'green') {
        startListening(prediction)
      }
    }

    const handleAutoExecuted = (prediction) => {
      if (!prediction || prediction.status !== 'auto_executed') return
      speak(`Done: ${prediction.suggested_action || prediction.description}`)
    }

    realtime.on('prediction:new', handleNewPrediction)
    realtime.on('prediction:updated', handleAutoExecuted)

    return () => {
      realtime.off('prediction:new')
      realtime.off('prediction:updated')
      if (recognitionRef.current) {
        try { recognitionRef.current.stop() } catch (e) {}
      }
      window.speechSynthesis?.cancel()
    }
  }, [enabled, startListening])

  // ── Expose manual speak + listen API ──────────────────────────────────
  return {
    speak,
    startListening,
    isListening: () => listeningRef.current,
    supported: !!(window.SpeechRecognition || window.webkitSpeechRecognition),
  }
}
