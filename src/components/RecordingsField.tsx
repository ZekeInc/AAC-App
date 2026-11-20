import { useEffect, useRef, useState } from 'react'
import { MAX_CLIPS_PER_CELL, MAX_CLIP_MS, type AudioClip } from '../lib/audioClips'
import { recordingSupported, useRecorder } from '../lib/useRecorder'

interface Props {
  clips: AudioClip[]
  loading: boolean
  onAdd: (recording: Omit<AudioClip, 'id' | 'cellId' | 'createdAt'>) => void
  onRemove: (clipId: string) => void
}

/**
 * Record, play back and remove voice recordings for a button. Playback here
 * is only for checking a recording; buttons never play them.
 */
export function RecordingsField({ clips, loading, onAdd, onRemove }: Props) {
  const recorder = useRecorder(MAX_CLIP_MS, (r) => onAdd(r))
  const [playingId, setPlayingId] = useState<string | null>(null)
  const audio = useRef<{ el: HTMLAudioElement; url: string } | null>(null)

  const stopPlayback = () => {
    if (audio.current) {
      audio.current.el.pause()
      URL.revokeObjectURL(audio.current.url)
      audio.current = null
    }
    setPlayingId(null)
  }
  useEffect(() => stopPlayback, [])

  const play = (clip: AudioClip) => {
    stopPlayback()
    const url = URL.createObjectURL(clip.blob)
    const el = new Audio(url)
    audio.current = { el, url }
    el.onended = stopPlayback
    el.onerror = stopPlayback
    setPlayingId(clip.id)
    el.play().catch(stopPlayback)
  }

  const recorded = clips.filter((c) => c.source !== 'learned')
  const learned = clips.filter((c) => c.source === 'learned')
  const full = recorded.length >= MAX_CLIPS_PER_CELL

  const renderList = (list: AudioClip[], name: string) => (
    <ul className="recording-list">
      {list.map((clip, i) => {
        const label = `${name.toLowerCase()} ${i + 1}`
        return (
          <li key={clip.id} className="recording">
            <button
              type="button"
              className="btn"
              onClick={() => (playingId === clip.id ? stopPlayback() : play(clip))}
              aria-label={`${playingId === clip.id ? 'Stop' : 'Play'} ${label}`}
            >
              {playingId === clip.id ? '■ Stop' : '▶ Play'}
            </button>
            <span className="recording-name">
              {name} {i + 1} · {(clip.durationMs / 1000).toFixed(1)} s
            </span>
            <button
              type="button"
              className="btn danger"
              onClick={() => {
                if (playingId === clip.id) stopPlayback()
                onRemove(clip.id)
              }}
              aria-label={`Delete ${label}`}
            >
              Delete
            </button>
          </li>
        )
      })}
    </ul>
  )
  const recording = recorder.state === 'recording'
  const secondsLeft = Math.max(0, Math.ceil((MAX_CLIP_MS - recorder.elapsedMs) / 1000))

  return (
    <div className="field recordings">
      <span>
        Voice recordings{' '}
        <small>
          (up to {MAX_CLIPS_PER_CELL}; for voice matching. Speak uses the computer voice.)
        </small>
      </span>

      {!recordingSupported() ? (
        <p className="hint">This browser can’t record audio.</p>
      ) : (
        <>
          {loading ? (
            <p className="hint">Loading recordings…</p>
          ) : recorded.length === 0 ? (
            <p className="hint">No recordings yet.</p>
          ) : (
            renderList(recorded, 'Recording')
          )}
          <div className="row">
            <button
              type="button"
              className={`btn record${recording ? ' is-recording' : ''}`}
              disabled={loading || (!recording && full) || recorder.state === 'starting'}
              onClick={() => (recording ? recorder.stop() : recorder.start())}
            >
              {recording ? (
                <>
                  <span className="rec-dot" aria-hidden="true" /> Stop ({secondsLeft} s)
                </>
              ) : recorder.state === 'starting' ? (
                'Starting…'
              ) : (
                <>
                  <span aria-hidden="true">🎤</span> Record
                </>
              )}
            </button>
            {full && !recording && (
              <span className="hint">Delete a recording to record another.</span>
            )}
          </div>
          <span className="visually-hidden" role="status">
            {recording ? 'Recording' : ''}
          </span>
          {recorder.error && (
            <p className="error" role="alert">
              {recorder.error}
            </p>
          )}
          {learned.length > 0 && (
            <>
              <span className="subheading">
                Learned from “Did you mean…?” choices{' '}
                <small>(added automatically; delete any that are wrong)</small>
              </span>
              {renderList(learned, 'Learned')}
            </>
          )}
        </>
      )}
    </div>
  )
}
