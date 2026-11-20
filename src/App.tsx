import { useCallback, useEffect, useReducer, useState, type CSSProperties } from 'react'
import { CellButton } from './components/CellButton'
import { CellEditor } from './components/CellEditor'
import { EditLock } from './components/EditLock'
import { MessageBar } from './components/MessageBar'
import { SettingsPanel } from './components/SettingsPanel'
import { loadData, saveData } from './lib/storage'
import { speak } from './lib/speech'
import { currentBoard, initState, messageText, reducer } from './state/appState'
import type { Cell } from './types'
import './App.css'

type EditorTarget = { mode: 'edit'; cell: Cell } | { mode: 'add' } | null

export default function App() {
  const [state, dispatch] = useReducer(reducer, undefined, () => initState(loadData()))
  const [editor, setEditor] = useState<EditorTarget>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [lockOpen, setLockOpen] = useState(false)
  const { data, message, editing, boardStack } = state
  const { settings } = data
  const board = currentBoard(state)
  const atHome = boardStack.length <= 1

  useEffect(() => saveData(data), [data])

  const activate = useCallback(
    (cell: Cell) => {
      if (editing) {
        setEditor({ mode: 'edit', cell })
      } else if (cell.linkTo) {
        dispatch({ type: 'openBoard', boardId: cell.linkTo })
      } else {
        if (settings.speakOnTap) speak(cell.vocalization ?? cell.label, settings)
        dispatch({ type: 'selectWord', cell })
      }
    },
    [editing, settings],
  )

  const startEditing = () => dispatch({ type: 'setEditing', editing: true })

  const speakMessage = () => speak(messageText(message), settings)

  return (
    <div className={`app${editing ? ' is-editing' : ''}`}>
      <MessageBar
        message={message}
        onSpeak={speakMessage}
        onBackspace={() => dispatch({ type: 'deleteLastWord' })}
        onClear={() => dispatch({ type: 'clearMessage' })}
      />

      <nav className="board-nav" aria-label="Board navigation">
        <button
          type="button"
          className="nav-btn"
          onClick={() => dispatch({ type: 'back' })}
          disabled={atHome}
        >
          <span aria-hidden="true">◀</span> Back
        </button>
        <button
          type="button"
          className="nav-btn"
          onClick={() => dispatch({ type: 'home' })}
          disabled={atHome}
        >
          <span aria-hidden="true">🏠</span> Home
        </button>
        <h1 className="board-title">{board.name}</h1>
        {editing ? (
          <>
            <button type="button" className="nav-btn" onClick={() => setSettingsOpen(true)}>
              <span aria-hidden="true">⚙️</span> Settings
            </button>
            <button
              type="button"
              className="nav-btn primary"
              onClick={() => dispatch({ type: 'setEditing', editing: false })}
            >
              Done
            </button>
          </>
        ) : (
          <button
            type="button"
            className="nav-btn"
            onClick={() =>
              settings.requireEditCheck ? setLockOpen(true) : startEditing()
            }
          >
            <span aria-hidden="true">✎</span> Edit
          </button>
        )}
      </nav>

      {editing && (
        <p className="edit-banner" role="status">
          Editing “{board.name}”. Tap a button to change it, or add a new one.
        </p>
      )}

      <main
        className="board-grid"
        style={
          {
            '--columns': settings.columns,
            '--columns-small': Math.min(settings.columns, 4),
          } as CSSProperties
        }
        aria-label={`${board.name} board`}
      >
        {board.cells.map((cell) => (
          <CellButton
            key={cell.id}
            cell={cell}
            showLabel={settings.showLabels}
            editing={editing}
            onActivate={activate}
          />
        ))}
        {editing && (
          <button type="button" className="cell cell-add" onClick={() => setEditor({ mode: 'add' })}>
            <span className="cell-symbol" aria-hidden="true">
              ＋
            </span>
            <span className="cell-label">Add button</span>
          </button>
        )}
        {!editing && board.cells.length === 0 && (
          <p className="empty-board">
            This board is empty. Tap <strong>Edit</strong> to add buttons.
          </p>
        )}
      </main>

      {editor && (
        <CellEditor
          cell={editor.mode === 'edit' ? editor.cell : null}
          boards={data.boards}
          currentBoardId={board.id}
          onClose={() => setEditor(null)}
          onSave={(cell, newBoard) => {
            if (newBoard) dispatch({ type: 'addBoard', board: newBoard })
            dispatch({ type: 'upsertCell', boardId: board.id, cell })
            setEditor(null)
          }}
          onDelete={
            editor.mode === 'edit'
              ? () => {
                  dispatch({ type: 'deleteCell', boardId: board.id, cellId: editor.cell.id })
                  setEditor(null)
                }
              : undefined
          }
          onMove={
            editor.mode === 'edit'
              ? (offset) =>
                  dispatch({ type: 'moveCell', boardId: board.id, cellId: editor.cell.id, offset })
              : undefined
          }
        />
      )}

      {lockOpen && (
        <EditLock
          onClose={() => setLockOpen(false)}
          onUnlock={() => {
            setLockOpen(false)
            startEditing()
          }}
        />
      )}

      {settingsOpen && (
        <SettingsPanel
          data={data}
          onChange={(s) => dispatch({ type: 'updateSettings', settings: s })}
          onReplaceData={(d) => dispatch({ type: 'replaceData', data: d })}
          onClose={() => setSettingsOpen(false)}
        />
      )}
    </div>
  )
}
