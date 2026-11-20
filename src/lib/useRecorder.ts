import { useCallback, useEffect, useRef, useState } from 'react'

export type RecorderState = 'idle' | 'starting' | 'recording'

export interface Recording {
  blob: Blob
  mimeType: string
  durationMs: number
}

// Opus/WebM on Chrome, Edge, Firefox and Android; MP4/AAC on Safari and iOS.
const PREFERRED_TYPES = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg']

export const recordingSupported = () =>
  typeof window !== 'undefined' &&
  typeof window.MediaRecorder !== 'undefined' &&
  !!navigator.mediaDevices?.getUserMedia

function pickMimeType(): string | undefined {
  return PREFERRED_TYPES.find((t) => MediaRecorder.isTypeSupported?.(t))
}

function errorMessage(err: unknown): string {
  const name = err instanceof DOMException ? err.name : ''
  if (name === 'NotAllowedError' || name === 'SecurityError')
    return 'Microphone access was blocked. Allow the microphone for this app in your browser or device settings, then try again.'
  if (name === 'NotFoundError') return 'No microphone was found on this device.'
  return 'Could not start recording.'
}

/**
 * Record a short clip from the microphone. Recording stops on `stop()` or
 * automatically after `maxMs`. The microphone is released as soon as
 * recording ends so the device's "mic in use" indicator turns off.
 */
export function useRecorder(maxMs: number, onRecorded: (r: Recording) => void) {
  const [state, setState] = useState<RecorderState>('idle')
  const [elapsedMs, setElapsedMs] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const recorder = useRef<MediaRecorder | null>(null)
  const stream = useRef<MediaStream | null>(null)
  const timers = useRef<number[]>([])
  const onRecordedRef = useRef(onRecorded)
  useEffect(() => {
    onRecordedRef.current = onRecorded
  })

  const release = useCallback(() => {
    timers.current.forEach((t) => window.clearTimeout(t))
    timers.current.forEach((t) => window.clearInterval(t))
    timers.current = []
    stream.current?.getTracks().forEach((t) => t.stop())
    stream.current = null
  }, [])

  const stop = useCallback(() => {
    if (recorder.current?.state === 'recording') recorder.current.stop()
  }, [])

  const start = useCallback(async () => {
    setError(null)
    setState('starting')
    try {
      const media = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
      })
      stream.current = media
      const mimeType = pickMimeType()
      const rec = new MediaRecorder(media, mimeType ? { mimeType } : undefined)
      recorder.current = rec
      const chunks: Blob[] = []
      const startedAt = performance.now()
      rec.ondataavailable = (e) => e.data.size > 0 && chunks.push(e.data)
      rec.onstop = () => {
        const durationMs = Math.min(maxMs, performance.now() - startedAt)
        release()
        setState('idle')
        setElapsedMs(0)
        const type = rec.mimeType || mimeType || 'audio/webm'
        if (chunks.length) {
          onRecordedRef.current({ blob: new Blob(chunks, { type }), mimeType: type, durationMs })
        }
      }
      rec.start()
      setState('recording')
      timers.current.push(
        window.setInterval(() => setElapsedMs(performance.now() - startedAt), 100),
        window.setTimeout(() => rec.state === 'recording' && rec.stop(), maxMs),
      )
    } catch (err) {
      release()
      setState('idle')
      setError(errorMessage(err))
    }
  }, [maxMs, release])

  // Stop and release the microphone if the editor closes mid-recording.
  useEffect(
    () => () => {
      if (recorder.current?.state === 'recording') {
        recorder.current.onstop = null
        recorder.current.stop()
      }
      release()
    },
    [release],
  )

  return { state, elapsedMs, error, start, stop }
}
