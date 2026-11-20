import { useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { SAMPLE_RATE, decodeToMono16k, encodeWav } from '../lib/voice/features'
import { thresholds, type Candidate } from '../lib/voice/matcher'
import { recognize, type SentenceWord } from '../lib/voice/sentence'
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

/** One word of a sentence under review. */
interface Slot {
  word: SentenceWord
  /** Chosen button, or null to leave this word out. */
  chosen: string | null
}

type Phase =
  | { kind: 'listening' }
  | { kind: 'sentence'; slots: Slot[]; details: Omit<Details, 'ranked'> }
  | { kind: 'thinking' }
  | { kind: 'unsure'; candidates: Candidate[]; details: Details }
  | { kind: 'none'; details?: Details }
  | { kind: 'silence' }
  | { kind: 'error'; message: string }

interface Props {
  cellsById: Map<string, Cell>
  sensitivity: number
  showDetails: boolean
  /** Recognize several words said in a row. */
  multiWord: boolean
  /**
   * Called with the chosen button. `confident` is false when the user picked
   * it from "Did you mean…?"; then `utterance` is what they said, for learning.
   */
  onSelect: (cell: Cell, confident: boolean, utterance?: Utterance) => void
  /** Called with the words of a sentence, in order. */
  onSelectWords: (cells: Cell[], confident: boolean) => void
  /** Save what was said as a learned recording for a button the user picked. */
  onLearn: (cell: Cell, utterance: Utterance) => void
  onClose: () => void
}

/**
 * Listens for a word, compares it with the buttons' saved recordings, and
 * either selects the matching button or asks the user to choose.
 * Everything happens on this device.
 */
export function VoicePanel({
  cellsById,
  sensitivity,
  showDetails,
  multiWord,
  onSelect,
  onSelectWords,
  onLearn,
  onClose,
}: Props) {
  const { state: listenState, level, listen, cancel } = useListener(multiWord ? 8000 : 5000)
  const [phase, setPhase] = useState<Phase>({ kind: 'listening' })
  const runId = useRef(0)
  const utterance = useRef<Utterance | null>(null)
  const samplesRef = useRef<Float32Array | null>(null)
  // Latest props for the async matching flow, without restarting it.
  const latest = useRef({ cellsById, sensitivity, multiWord, onSelect, onSelectWords })
  useEffect(() => {
    latest.current = { cellsById, sensitivity, multiWord, onSelect, onSelectWords }
  })

  const run = useCallback(async () => {
    const id = ++runId.current
    const current = () => id === runId.current
    const outcome = await listen()
    if (!current() || outcome.kind === 'cancelled') return
    if (outcome.kind === 'error') return setPhase({ kind: 'error', message: outcome.message })
    if (outcome.kind === 'silence') return setPhase({ kind: 'silence' })

    setPhase({ kind: 'thinking' })
    const { cellsById: cells, sensitivity: sens, multiWord: multi, onSelect: select, onSelectWords: selectWords } =
      latest.current
    try {
      const [samples, { templates, raw, spread }] = await Promise.all([
        decodeToMono16k(outcome.blob),
        loadTemplates(new Set(cells.keys())),
      ])
      if (!current()) return
      samplesRef.current = samples
      utterance.current = {
        blob: outcome.blob,
        mimeType: outcome.blob.type || 'audio/webm',
        durationMs: (samples.length / SAMPLE_RATE) * 1000,
      }
      const rec = recognize(samples, templates, raw, {
        sensitivity: sens,
        spread,
        multiWord: multi,
        isFolder: (cellId) => !!cells.get(cellId)?.linkTo,
      })
      if (rec.kind === 'silence') return setPhase({ kind: 'silence' })
      const t = thresholds(sens, spread)
      const base = { accept: t.accept, margin: t.margin, spread }

      if (rec.kind === 'sentence') {
        const slots: Slot[] = rec.words.map((word) => ({
          word,
          chosen: word.result.kind === 'match' ? word.result.cellId : null,
        }))
        const chosen = slots.map((sl) => (sl.chosen ? cells.get(sl.chosen) : undefined))
        if (chosen.every(Boolean)) return selectWords(chosen as Cell[], true)
        return setPhase({ kind: 'sentence', slots, details: base })
      }

      const { result, ranked } = rec
      const details: Details = { ranked: ranked.slice(0, 3), ...base }
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
                  : multiWord
                    ? 'Listening — say a word or a few'
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

        {phase.kind === 'sentence' && (
          <SentenceReview
            slots={phase.slots}
            cellsById={cellsById}
            showDetails={showDetails}
            details={phase.details}
            onChange={(slots) => setPhase({ ...phase, slots })}
            onAdd={(slots) => {
              const picked = slots.filter((sl) => sl.chosen)
              // Learn the words the user had to pick (not the ones already recognized).
              const samples = samplesRef.current
              for (const sl of picked) {
                if (sl.word.result.kind === 'match' || !samples) continue
                const piece = samples.slice(sl.word.sampleStart, sl.word.sampleEnd)
                const cell = cellsById.get(sl.chosen!)
                if (cell) {
                  onLearn(cell, {
                    blob: encodeWav(piece),
                    mimeType: 'audio/wav',
                    durationMs: (piece.length / SAMPLE_RATE) * 1000,
                  })
                }
              }
              onSelectWords(
                picked.map((sl) => cellsById.get(sl.chosen!)).filter((c): c is Cell => !!c),
                false,
              )
            }}
            tryAgain={tryAgain}
            onCancel={close}
          />
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

interface ReviewProps {
  slots: Slot[]
  cellsById: Map<string, Cell>
  showDetails: boolean
  details: Omit<Details, 'ranked'>
  onChange: (slots: Slot[]) => void
  onAdd: (slots: Slot[]) => void
  tryAgain: ReactNode
  onCancel: () => void
}

/** Review a sentence where some words were unclear: pick or skip each word. */
function SentenceReview({
  slots,
  cellsById,
  showDetails,
  details,
  onChange,
  onAdd,
  tryAgain,
  onCancel,
}: ReviewProps) {
  const set = (i: number, chosen: string | null) =>
    onChange(slots.map((sl, j) => (j === i ? { ...sl, chosen } : sl)))
  const count = slots.filter((sl) => sl.chosen).length
  return (
    <>
      <p className="voice-status" role="status">
        I heard {slots.length} words — check the unclear ones
      </p>
      <ol className="sentence-slots">
        {slots.map((sl, i) => {
          const options =
            sl.word.result.kind === 'none' ? [] : sl.word.result.candidates.map((c) => c.cellId)
          if (sl.word.result.kind === 'match' && !options.includes(sl.word.result.cellId))
            options.unshift(sl.word.result.cellId)
          const sure = sl.word.result.kind === 'match'
          return (
            <li key={i} className={`sentence-slot${sure ? '' : ' is-unclear'}`}>
              <span className="slot-heading">
                Word {i + 1}
                {sure ? '' : ' — which one?'}
              </span>
              <div className="slot-options">
                {(sure ? [sl.word.result.kind === 'match' ? sl.word.result.cellId : ''] : options).map(
                  (id) => {
                    const cell = cellsById.get(id)
                    if (!cell) return null
                    return (
                      <button
                        key={id}
                        type="button"
                        className={`cell slot-cell cat-${cell.category}${sl.chosen === id ? ' is-chosen' : ''}`}
                        aria-pressed={sl.chosen === id}
                        onClick={() => set(i, sl.chosen === id ? null : id)}
                      >
                        <CellSymbol cell={cell} />
                        <span className="cell-label">{cell.label}</span>
                      </button>
                    )
                  },
                )}
                <button
                  type="button"
                  className={`btn slot-skip${sl.chosen === null ? ' is-chosen' : ''}`}
                  aria-pressed={sl.chosen === null}
                  onClick={() => set(i, null)}
                >
                  Skip
                </button>
              </div>
              {showDetails && (
                <MatchDetails details={{ ...details, ranked: sl.word.ranked }} cellsById={cellsById} />
              )}
            </li>
          )
        })}
      </ol>
      <div className="row center">
        <button type="button" className="btn primary" disabled={count === 0} onClick={() => onAdd(slots)}>
          Add {count} word{count === 1 ? '' : 's'}
        </button>
        {tryAgain}
        <button type="button" className="btn" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </>
  )
}
