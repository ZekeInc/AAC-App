import type { Cell } from '../types'

interface Props {
  cell: Cell
  showLabel: boolean
  editing: boolean
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

export function CellButton({ cell, showLabel, editing, onActivate }: Props) {
  const isFolder = !!cell.linkTo
  return (
    <button
      type="button"
      className={`cell cat-${cell.category}${isFolder ? ' is-folder' : ''}${editing ? ' is-editing' : ''}`}
      onClick={() => onActivate(cell)}
      aria-label={editing ? `Edit ${cell.label}` : isFolder ? `Open ${cell.label}` : cell.label}
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
    </button>
  )
}
