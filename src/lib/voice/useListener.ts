import { useCallback, useEffect, useRef, useState } from 'react'

export type ListenerState = 'idle' | 'starting' | 'waiting' | 'hearing'

export type ListenOutcome =
  | { kind: 'audio'; blob: Blob }
  | { kind: 'silence' }
  | { kind: 'cancelled' }
  | { kind: 'error'; message: string }

const MAX_SPEECH_MS = 5000 // longest utterance
const MAX_WAIT_MS = 6000 // give up if nothing is said
const END_SILENCE_MS = 800 // this much quiet after speech ends the utterance
const MIN_SPEECH_MS = 150
const TICK_MS = 50

const PREFERRED_TYPES = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg']

function errorMessage(err: unknown): string {
  const name = err instanceof DOMException ? err.name : ''
  if (name === 'NotAllowedError' || name === 'SecurityError')
    return 'Microphone access was blocked. Allow the microphone for this app in your browser or device settings, then try again.'
  if (name === 'NotFoundError') return 'No microphone was found on this device.'
  return 'Could not start listening.'
}

/**
 * Listen for one spoken word or phrase. Recording starts immediately; the
 * utterance ends automatically after a short pause once speech has been
 * heard. Loudness is compared with the room's own background level, so it
 * works in quiet and noisier places.
 */
export function useListener() {
  const [state, setState] = useState<ListenerState>('idle')
  /** 0–1 input level, for a simple meter. */
  const [level, setLevel] = useState(0)
  const cleanupRef = useRef<(() => void) | null>(null)
  const finishRef = useRef<((o: ListenOutcome) => void) | null>(null)

  const cancel = useCallback(() => finishRef.current?.({ kind: 'cancelled' }), [])
  useEffect(() => () => cancel(), [cancel])

  const listen = useCallback(
    () =>
      new Promise<ListenOutcome>((resolve) => {
        cleanupRef.current?.()
        setState('starting')
        setLevel(0)
        let settled = false
        let stream: MediaStream | null = null
        let ctx: AudioContext | null = null
        let interval = 0
        let recorder: MediaRecorder | null = null

        const cleanup = () => {
          window.clearInterval(interval)
          stream?.getTracks().forEach((t) => t.stop())
          void ctx?.close().catch(() => {})
          cleanupRef.current = null
          finishRef.current = null
          setState('idle')
          setLevel(0)
        }
        const finish = (outcome: ListenOutcome) => {
          if (settled) return
          settled = true
          if (recorder && recorder.state === 'recording' && outcome.kind !== 'audio') {
            recorder.onstop = null
            recorder.stop()
          }
          cleanup()
          resolve(outcome)
        }
        cleanupRef.current = cleanup
        finishRef.current = finish

        navigator.mediaDevices
          .getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } })
          .then((media) => {
            if (settled) {
              media.getTracks().forEach((t) => t.stop())
              return
            }
            stream = media
            ctx = new AudioContext()
            const analyser = ctx.createAnalyser()
            analyser.fftSize = 1024
            ctx.createMediaStreamSource(media).connect(analyser)
            const buf = new Float32Array(analyser.fftSize)

            const mimeType = PREFERRED_TYPES.find((t) => MediaRecorder.isTypeSupported?.(t))
            const rec = new MediaRecorder(media, mimeType ? { mimeType } : undefined)
            recorder = rec
            const chunks: Blob[] = []
            rec.ondataavailable = (e) => e.data.size > 0 && chunks.push(e.data)
            rec.onstop = () => {
              const type = rec.mimeType || mimeType || 'audio/webm'
              finish({ kind: 'audio', blob: new Blob(chunks, { type }) })
            }
            rec.start()
            setState('waiting')

            const startedAt = performance.now()
            let noiseDb = Infinity
            let speechStart = 0
            let lastLoud = 0
            interval = window.setInterval(() => {
              analyser.getFloatTimeDomainData(buf)
              let sum = 0
              for (const v of buf) sum += v * v
              const db = 10 * Math.log10(sum / buf.length + 1e-10)
              const now = performance.now()
              // Track the background level: quickly downward, slowly upward.
              // Start no higher than a typical room so speech right away still counts.
              noiseDb = noiseDb === Infinity ? Math.min(db, -50) : db < noiseDb ? db : noiseDb + 0.05
              setLevel(Math.min(1, Math.max(0, (db + 60) / 50)))

              const loud = db > Math.max(noiseDb + 12, -50)
              if (loud) {
                lastLoud = now
                if (!speechStart) speechStart = now
              } else if (speechStart && now - lastLoud > 300 && lastLoud - speechStart < MIN_SPEECH_MS) {
                speechStart = 0 // a click or bump, not speech
              }
              const speaking = speechStart && lastLoud - speechStart >= MIN_SPEECH_MS
              if (speaking) setState('hearing')

              if (
                (speaking && now - lastLoud > END_SILENCE_MS) ||
                (speechStart && now - speechStart > MAX_SPEECH_MS)
              ) {
                window.clearInterval(interval)
                rec.stop() // → onstop → finish with audio
              } else if (!speaking && now - startedAt > MAX_WAIT_MS) {
                finish({ kind: 'silence' })
              }
            }, TICK_MS)
          })
          .catch((err) => finish({ kind: 'error', message: errorMessage(err) }))
      }),
    [],
  )

  return { state, level, listen, cancel }
}
