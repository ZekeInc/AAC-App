import { useEffect, useState } from 'react'
import { copyText } from '../lib/clipboard'
import { messageDisplayText, type MessageWord } from '../state/appState'
import { CellSymbol } from './CellButton'

interface Props {
  message: MessageWord[]
  onSpeak: () => void
  onBackspace: () => void
  onClear: () => void
}

type CopyStatus = 'copied' | 'failed' | null

export function MessageBar({ message, onSpeak, onBackspace, onClear }: Props) {
  const empty = message.length === 0
  // Feedback belongs to the message it was for, so it disappears as soon as
  // the message changes, and otherwise after a couple of seconds.
  const [copied, setCopied] = useState<{ status: CopyStatus; for: MessageWord[] }>({
    status: null,
    for: message,
  })
  const copyStatus = copied.for === message ? copied.status : null

  useEffect(() => {
    if (!copied.status) return
    const t = window.setTimeout(() => setCopied((c) => ({ ...c, status: null })), 2000)
    return () => window.clearTimeout(t)
  }, [copied])

  const copy = async () => {
    const ok = await copyText(messageDisplayText(message))
    setCopied({ status: ok ? 'copied' : 'failed', for: message })
  }
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
          className={`action copy${copyStatus ? ` is-${copyStatus}` : ''}`}
          onClick={copy}
          disabled={empty}
          aria-label="Copy message as text"
        >
          {copyStatus === 'copied' ? (
            <>
              <span aria-hidden="true">✓</span> Copied
            </>
          ) : copyStatus === 'failed' ? (
            'Copy failed'
          ) : (
            <>
              <span aria-hidden="true">📋</span> Copy
            </>
          )}
        </button>
        <span className="visually-hidden" role="status">
          {copyStatus === 'copied'
            ? 'Message copied'
            : copyStatus === 'failed'
              ? 'Could not copy the message'
              : ''}
        </span>
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
