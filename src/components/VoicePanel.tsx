import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react'
import { SAMPLE_RATE, decodeToMono16k, extractFeatures } from '../lib/voice/features'
import { decide, rankCandidates, thresholds, type Candidate } from '../lib/voice/matcher'
import { loadTemplates } from '../lib/voice/templates'
import { useListener } from '../lib/voice/useListener'
import type { Cell } from '../types'
import { CellSymbol } from './CellButton'
import { Modal } from './Modal'

/** Scores behind a decision, shown when "matching details" is on. */
interface Details {
  ranked: Candidate[]
  accept: number
  margin: number
  spread: number | null
}

export interface Utterance {
  blob: Blob
  mimeType: string
  durationMs: number
}

type Phase =
  | { kind: 'listening' }
  | { kind: 'thinking' }
  | { kind: 'unsure'; candidates: Candidate[]; details: Details }
  | { kind: 'none'; details?: Details }
  | { kind: 'silence' }
  | { kind: 'error'; message: string }

interface Props {
  cellsById: Map<string, Cell>
  sensitivity: number
  showDetails: boolean
  /**
   * Called with the chosen button. `confident` is false when the user picked
   * it from "Did you mean…?"; then `utterance` is what they said, for learning.
   */
  onSelect: (cell: Cell, confident: boolean, utterance?: Utterance) => void
  onClose: () => void
}

/**
 * Listens for a word, compares it with the buttons' saved recordings, and
 * either selects the matching button or asks the user to choose.
 * Everything happens on this device.
 */
export function VoicePanel({ cellsById, sensitivity, showDetails, onSelect, onClose }: Props) {
  const { state: listenState, level, listen, cancel } = useListener()
  const [phase, setPhase] = useState<Phase>({ kind: 'listening' })
  const runId = useRef(0)
  const utterance = useRef<Utterance | null>(null)
  // Latest props for the async matching flow, without restarting it.
  const latest = useRef({ cellsById, sensitivity, onSelect })
  useEffect(() => {
    latest.current = { cellsById, sensitivity, onSelect }
  })

  const run = useCallback(async () => {
    const id = ++runId.current
    const current = () => id === runId.current
    const outcome = await listen()
    if (!current() || outcome.kind === 'cancelled') return
    if (outcome.kind === 'error') return setPhase({ kind: 'error', message: outcome.message })
    if (outcome.kind === 'silence') return setPhase({ kind: 'silence' })

    setPhase({ kind: 'thinking' })
    const { cellsById: cells, sensitivity: sens, onSelect: select } = latest.current
    try {
      const [samples, { templates, spread }] = await Promise.all([
        decodeToMono16k(outcome.blob),
        loadTemplates(new Set(cells.keys())),
      ])
      if (!current()) return
      utterance.current = {
        blob: outcome.blob,
        mimeType: outcome.blob.type || 'audio/webm',
        durationMs: (samples.length / SAMPLE_RATE) * 1000,
      }
      const features = extractFeatures(samples)
      if (!features) return setPhase({ kind: 'silence' })
      const ranked = rankCandidates(features, templates)
      const result = decide(ranked, sens, spread)
      const t = thresholds(sens, spread)
      const details: Details = { ranked: ranked.slice(0, 3), accept: t.accept, margin: t.margin, spread }
      if (result.kind === 'match') {
        const cell = cells.get(result.cellId)
        if (cell) return select(cell, true)
      }
      setPhase(result.kind === 'unsure' ? { ...result, details } : { kind: 'none', details })
    } catch {
      if (current()) setPhase({ kind: 'error', message: 'Something went wrong while matching.' })
    }
  }, [listen])

  // Start listening as soon as the panel opens; stop if it closes.
  useEffect(() => {
    // Opening the microphone is the external side effect this effect exists for.
    // oxlint-disable-next-line react/set-state-in-effect
    void run()
    return () => {
      // runId is a counter (not a DOM ref): bumping it ignores the stale run.
      // oxlint-disable-next-line react-hooks/exhaustive-deps
      runId.current++
      cancel()
    }
  }, [run, cancel])

  const retry = () => {
    setPhase({ kind: 'listening' })
    void run()
  }

  const close = () => {
    runId.current++
    cancel()
    onClose()
  }

  const tryAgain = (
    <button type="button" className="btn primary" onClick={retry}>
      <span aria-hidden="true">🎤</span> Try again
    </button>
  )

  return (
    <Modal title="Say a word" onClose={close}>
      <div className="voice-panel">
        {phase.kind === 'listening' && (
          <>
            <div
              className={`voice-orb${listenState === 'hearing' ? ' is-hearing' : ''}`}
              style={{ '--level': level } as CSSProperties}
              aria-hidden="true"
            >
              🎤
            </div>
            <p className="voice-status" role="status">
              {listenState === 'starting'
                ? 'Starting the microphone…'
                : listenState === 'hearing'
                  ? 'Hearing you…'
                  : 'Listening — say a word'}
            </p>
            <button type="button" className="btn" onClick={close}>
              Cancel
            </button>
          </>
        )}

        {phase.kind === 'thinking' && (
          <p className="voice-status" role="status">
            Matching…
          </p>
        )}

        {phase.kind === 'unsure' && (
          <>
            <p className="voice-status" role="status">
              Did you mean…
            </p>
            <div className="voice-choices">
              {phase.candidates.map((c) => {
                const cell = cellsById.get(c.cellId)
                if (!cell) return null
                return (
                  <button
                    key={c.cellId}
                    type="button"
                    className={`cell cat-${cell.category}`}
                    onClick={() => onSelect(cell, false, utterance.current ?? undefined)}
                  >
                    <CellSymbol cell={cell} />
                    <span className="cell-label">{cell.label}</span>
                  </button>
                )
              })}
            </div>
            <div className="row center">
              {tryAgain}
              <button type="button" className="btn" onClick={close}>
                None of these
              </button>
            </div>
            {showDetails && <MatchDetails details={phase.details} cellsById={cellsById} />}
          </>
        )}

        {(phase.kind === 'none' || phase.kind === 'silence' || phase.kind === 'error') && (
          <>
            <p className="voice-status" role="alert">
              {phase.kind === 'none'
                ? 'Sorry, that didn’t match any button.'
                : phase.kind === 'silence'
                  ? 'I didn’t hear anything.'
                  : phase.message}
            </p>
            <div className="row center">
              {tryAgain}
              <button type="button" className="btn" onClick={close}>
                Cancel
              </button>
            </div>
            {showDetails && phase.kind === 'none' && phase.details && (
              <MatchDetails details={phase.details} cellsById={cellsById} />
            )}
          </>
        )}
      </div>
    </Modal>
  )
}

/** Raw scores, to help tune matching. Lower distance = closer match. */
function MatchDetails({ details, cellsById }: { details: Details; cellsById: Map<string, Cell> }) {
  const [first, second] = details.ranked
  const gap = first && second ? (second.distance - first.distance) / second.distance : null
  return (
    <div className="match-details">
      <p>
        {details.ranked
          .map((c) => `${cellsById.get(c.cellId)?.label ?? '?'} ${c.distance.toFixed(2)}`)
          .join(' · ') || 'No candidates'}
      </p>
      <p>
        Gap {gap === null ? '–' : `${Math.round(gap * 100)}%`} (needs ≥{' '}
        {Math.round(details.margin * 100)}%) · Auto-select ≤ {details.accept.toFixed(2)} · Voice
        spread {details.spread === null ? 'not enough recordings' : details.spread.toFixed(2)}
      </p>
    </div>
  )
}
