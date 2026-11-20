import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react'
import { decodeToMono16k, extractFeatures } from '../lib/voice/features'
import { decide, rankCandidates, type Candidate } from '../lib/voice/matcher'
import { loadTemplates } from '../lib/voice/templates'
import { useListener } from '../lib/voice/useListener'
import type { Cell } from '../types'
import { CellSymbol } from './CellButton'
import { Modal } from './Modal'

type Phase =
  | { kind: 'listening' }
  | { kind: 'thinking' }
  | { kind: 'unsure'; candidates: Candidate[] }
  | { kind: 'none' }
  | { kind: 'silence' }
  | { kind: 'error'; message: string }

interface Props {
  cellsById: Map<string, Cell>
  sensitivity: number
  /** Called with the chosen button; `confident` is false when the user picked it. */
  onSelect: (cell: Cell, confident: boolean) => void
  onClose: () => void
}

/**
 * Listens for a word, compares it with the buttons' saved recordings, and
 * either selects the matching button or asks the user to choose.
 * Everything happens on this device.
 */
export function VoicePanel({ cellsById, sensitivity, onSelect, onClose }: Props) {
  const { state: listenState, level, listen, cancel } = useListener()
  const [phase, setPhase] = useState<Phase>({ kind: 'listening' })
  const runId = useRef(0)
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
      const [samples, templates] = await Promise.all([
        decodeToMono16k(outcome.blob),
        loadTemplates(new Set(cells.keys())),
      ])
      if (!current()) return
      const features = extractFeatures(samples)
      if (!features) return setPhase({ kind: 'silence' })
      const result = decide(rankCandidates(features, templates), sens)
      if (result.kind === 'match') {
        const cell = cells.get(result.cellId)
        if (cell) return select(cell, true)
      }
      setPhase(result.kind === 'unsure' ? result : { kind: 'none' })
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
                    onClick={() => onSelect(cell, false)}
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
          </>
        )}
      </div>
    </Modal>
  )
}
