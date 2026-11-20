import type { Cell } from '../types'

interface Props {
  cell: Cell
  showLabel: boolean
  editing: boolean
  /** Number of voice recordings; shown only while editing. */
  recordingCount?: number
  onActivate: (cell: Cell) => void
}

export function CellSymbol({ cell }: { cell: Cell }) {
  if (cell.image) return <img className="cell-image" src={cell.image} alt="" />
  if (cell.symbol)
    return (
      <span className="cell-symbol" aria-hidden="true">
        {cell.symbol}
      </span>
    )
  return null
}

export function CellButton({ cell, showLabel, editing, recordingCount = 0, onActivate }: Props) {
  const isFolder = !!cell.linkTo
  const recordings =
    editing && recordingCount > 0
      ? `, ${recordingCount} voice recording${recordingCount > 1 ? 's' : ''}`
      : ''
  return (
    <button
      type="button"
      className={`cell cat-${cell.category}${isFolder ? ' is-folder' : ''}${editing ? ' is-editing' : ''}`}
      onClick={() => onActivate(cell)}
      aria-label={
        editing ? `Edit ${cell.label}${recordings}` : isFolder ? `Open ${cell.label}` : cell.label
      }
    >
      <CellSymbol cell={cell} />
      {(showLabel || (!cell.symbol && !cell.image)) && (
        <span className="cell-label">{cell.label}</span>
      )}
      {editing && (
        <span className="cell-edit-badge" aria-hidden="true">
          ✎
        </span>
      )}
      {editing && recordingCount > 0 && (
        <span className="cell-rec-badge" aria-hidden="true">
          🎤
        </span>
      )}
    </button>
  )
}
