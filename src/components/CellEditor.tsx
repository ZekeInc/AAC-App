import { useState, type FormEvent } from 'react'
import { newId } from '../state/appState'
import type { Board, Cell, WordCategory } from '../types'
import { CellSymbol } from './CellButton'
import { Modal } from './Modal'

const CATEGORY_LABELS: Record<WordCategory, string> = {
  pronoun: 'People / pronouns (yellow)',
  verb: 'Actions / verbs (green)',
  descriptor: 'Describing words (blue)',
  noun: 'Things / nouns (orange)',
  social: 'Social phrases (pink)',
  question: 'Questions (purple)',
  negation: 'No / stop (red)',
  misc: 'Little words (white)',
  folder: 'Folder (gray)',
}

const NEW_BOARD = '__new__'

interface Props {
  /** Existing cell to edit, or null to create one. */
  cell: Cell | null
  boards: Record<string, Board>
  currentBoardId: string
  onSave: (cell: Cell, newBoard?: Board) => void
  onDelete?: () => void
  onMove?: (offset: number) => void
  onClose: () => void
}

/** Shrink uploaded photos so they fit comfortably in local storage. */
async function resizeImage(file: File, max = 256): Promise<string> {
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bitmap.width * scale)
  canvas.height = Math.round(bitmap.height * scale)
  canvas.getContext('2d')?.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  return canvas.toDataURL('image/jpeg', 0.85)
}

export function CellEditor({
  cell,
  boards,
  currentBoardId,
  onSave,
  onDelete,
  onMove,
  onClose,
}: Props) {
  const [label, setLabel] = useState(cell?.label ?? '')
  const [vocalization, setVocalization] = useState(cell?.vocalization ?? '')
  const [symbol, setSymbol] = useState(cell?.symbol ?? '')
  const [image, setImage] = useState(cell?.image)
  const [category, setCategory] = useState<WordCategory>(cell?.category ?? 'noun')
  const [linkTo, setLinkTo] = useState(cell?.linkTo ?? '')
  const [error, setError] = useState<string | null>(null)

  const otherBoards = Object.values(boards).filter((b) => b.id !== currentBoardId)

  const handleImage = async (file: File | undefined) => {
    if (!file) return
    try {
      setImage(await resizeImage(file))
    } catch {
      setError('Could not read that image.')
    }
  }

  const submit = (e: FormEvent) => {
    e.preventDefault()
    const trimmed = label.trim()
    if (!trimmed) {
      setError('Please enter a label.')
      return
    }
    let newBoard: Board | undefined
    let target = linkTo || undefined
    if (linkTo === NEW_BOARD) {
      newBoard = { id: newId('board'), name: trimmed, cells: [] }
      target = newBoard.id
    }
    onSave(
      {
        id: cell?.id ?? newId('cell'),
        label: trimmed,
        vocalization: vocalization.trim() || undefined,
        symbol: symbol.trim() || undefined,
        image,
        category: target ? 'folder' : category === 'folder' ? 'noun' : category,
        linkTo: target,
      },
      newBoard,
    )
  }

  const preview: Cell = {
    id: 'preview',
    label: label || 'Label',
    symbol: symbol || undefined,
    image,
    category: linkTo ? 'folder' : category,
  }

  return (
    <Modal
      title={cell ? 'Edit button' : 'Add button'}
      onClose={onClose}
      footer={
        <>
          {onDelete && (
            <button
              type="button"
              className="btn danger"
              onClick={() => {
                if (confirm(`Delete “${cell?.label}”?`)) onDelete()
              }}
            >
              Delete
            </button>
          )}
          {onMove && (
            <>
              <button type="button" className="btn" onClick={() => onMove(-1)} aria-label="Move earlier">
                ◀ Move
              </button>
              <button type="button" className="btn" onClick={() => onMove(1)} aria-label="Move later">
                Move ▶
              </button>
            </>
          )}
          <span className="spacer" />
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" form="cell-editor" className="btn primary">
            Save
          </button>
        </>
      }
    >
      <form id="cell-editor" className="form" onSubmit={submit}>
        <div className={`cell cell-preview cat-${preview.category}`} aria-hidden="true">
          <CellSymbol cell={preview} />
          <span className="cell-label">{preview.label}</span>
        </div>

        <label>
          Label
          <input value={label} onChange={(e) => setLabel(e.target.value)} autoFocus />
        </label>
        <label>
          Spoken text <small>(optional, if different from the label)</small>
          <input value={vocalization} onChange={(e) => setVocalization(e.target.value)} />
        </label>
        <label>
          Symbol <small>(an emoji)</small>
          <input value={symbol} onChange={(e) => setSymbol(e.target.value)} />
        </label>
        <div className="field">
          <span>Picture</span>
          <div className="row">
            <input
              type="file"
              accept="image/*"
              onChange={(e) => handleImage(e.target.files?.[0])}
              aria-label="Upload picture"
            />
            {image && (
              <button type="button" className="btn" onClick={() => setImage(undefined)}>
                Remove picture
              </button>
            )}
          </div>
        </div>
        <label>
          Tapping this button
          <select value={linkTo} onChange={(e) => setLinkTo(e.target.value)}>
            <option value="">adds the word to the message</option>
            {otherBoards.map((b) => (
              <option key={b.id} value={b.id}>
                opens the “{b.name}” board
              </option>
            ))}
            <option value={NEW_BOARD}>opens a new, empty board</option>
          </select>
        </label>
        {!linkTo && (
          <label>
            Color / word type
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value as WordCategory)}
            >
              {Object.entries(CATEGORY_LABELS)
                .filter(([key]) => key !== 'folder')
                .map(([key, text]) => (
                  <option key={key} value={key}>
                    {text}
                  </option>
                ))}
            </select>
          </label>
        )}
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
      </form>
    </Modal>
  )
}
