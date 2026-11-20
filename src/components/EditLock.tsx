import { useState } from 'react'
import { Modal } from './Modal'

interface Props {
  onUnlock: () => void
  onClose: () => void
}

function makeQuestion() {
  const a = 2 + Math.floor(Math.random() * 7)
  const b = 2 + Math.floor(Math.random() * 7)
  const answer = a + b
  const choices = new Set([answer])
  while (choices.size < 4) {
    const wrong = answer + Math.floor(Math.random() * 9) - 4
    if (wrong > 0) choices.add(wrong)
  }
  return { a, b, answer, choices: [...choices].sort((x, y) => x - y) }
}

/**
 * A simple "grown-up check" before entering edit mode, so a user tapping
 * around can't change their boards by accident. Uses plain taps, which work
 * the same on every touch screen, mouse, keyboard and switch.
 */
export function EditLock({ onUnlock, onClose }: Props) {
  const [q, setQ] = useState(makeQuestion)
  const [wrong, setWrong] = useState(false)

  return (
    <Modal title="Grown-up check" onClose={onClose}>
      <div className="form">
        <p className="lock-question">
          To edit the boards, tap the answer: <strong>{q.a} + {q.b} = ?</strong>
        </p>
        <div className="lock-choices">
          {q.choices.map((n) => (
            <button
              key={n}
              type="button"
              className="btn lock-choice"
              onClick={() => {
                if (n === q.answer) {
                  onUnlock()
                } else {
                  setWrong(true)
                  setQ(makeQuestion())
                }
              }}
            >
              {n}
            </button>
          ))}
        </div>
        {wrong && (
          <p className="error" role="alert">
            Not quite — try this one.
          </p>
        )}
        <p className="hint">You can turn this check off in Settings.</p>
      </div>
    </Modal>
  )
}
