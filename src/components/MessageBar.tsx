import type { MessageWord } from '../state/appState'
import { CellSymbol } from './CellButton'

interface Props {
  message: MessageWord[]
  onSpeak: () => void
  onBackspace: () => void
  onClear: () => void
}

export function MessageBar({ message, onSpeak, onBackspace, onClear }: Props) {
  const empty = message.length === 0
  return (
    <section className="message-bar" aria-label="Message">
      <button
        type="button"
        className="message-words"
        onClick={onSpeak}
        disabled={empty}
        aria-label={empty ? 'Message is empty' : 'Speak message'}
      >
        {empty ? (
          <span className="message-placeholder">Tap words to build a message</span>
        ) : (
          message.map((w) => (
            <span key={w.key} className={`message-word cat-${w.cell.category}`}>
              <CellSymbol cell={w.cell} />
              <span>{w.cell.label}</span>
            </span>
          ))
        )}
      </button>
      <div className="message-actions">
        <button type="button" className="action speak" onClick={onSpeak} disabled={empty}>
          <span aria-hidden="true">🔊</span> Speak
        </button>
        <button
          type="button"
          className="action"
          onClick={onBackspace}
          disabled={empty}
          aria-label="Delete last word"
        >
          <span aria-hidden="true">⌫</span>
        </button>
        <button
          type="button"
          className="action"
          onClick={onClear}
          disabled={empty}
          aria-label="Clear message"
        >
          <span aria-hidden="true">✕</span>
        </button>
      </div>
    </section>
  )
}
