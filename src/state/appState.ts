import type { AppData, Board, Cell, Settings } from '../types'

export interface MessageWord {
  /** Unique per insertion, so the same word can appear twice. */
  key: string
  cell: Cell
}

export interface AppState {
  data: AppData
  /** Stack of board ids; last is the board on screen. */
  boardStack: string[]
  message: MessageWord[]
  editing: boolean
}

export type Action =
  | { type: 'selectWord'; cell: Cell }
  | { type: 'openBoard'; boardId: string }
  | { type: 'back' }
  | { type: 'home' }
  | { type: 'deleteLastWord' }
  | { type: 'clearMessage' }
  | { type: 'setEditing'; editing: boolean }
  | { type: 'upsertCell'; boardId: string; cell: Cell }
  | { type: 'deleteCell'; boardId: string; cellId: string }
  | { type: 'moveCell'; boardId: string; cellId: string; offset: number }
  | { type: 'addBoard'; board: Board }
  | { type: 'updateSettings'; settings: Partial<Settings> }
  | { type: 'replaceData'; data: AppData }

let keySeq = 0
export const newId = (prefix: string) =>
  `${prefix}-${Date.now().toString(36)}-${(keySeq++).toString(36)}`

export function initState(data: AppData): AppState {
  return { data, boardStack: [data.homeBoardId], message: [], editing: false }
}

export function currentBoard(state: AppState): Board {
  const id = state.boardStack[state.boardStack.length - 1]
  return state.data.boards[id] ?? state.data.boards[state.data.homeBoardId]
}

function updateBoard(
  state: AppState,
  boardId: string,
  fn: (board: Board) => Board,
): AppState {
  const board = state.data.boards[boardId]
  if (!board) return state
  return {
    ...state,
    data: {
      ...state.data,
      boards: { ...state.data.boards, [boardId]: fn(board) },
    },
  }
}

export function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'selectWord': {
      const message = [...state.message, { key: newId('w'), cell: action.cell }]
      const goHome =
        state.data.settings.returnHomeAfterSelect && state.boardStack.length > 1
      return {
        ...state,
        message,
        boardStack: goHome ? [state.data.homeBoardId] : state.boardStack,
      }
    }
    case 'openBoard':
      if (!state.data.boards[action.boardId]) return state
      return { ...state, boardStack: [...state.boardStack, action.boardId] }
    case 'back':
      if (state.boardStack.length <= 1) return state
      return { ...state, boardStack: state.boardStack.slice(0, -1) }
    case 'home':
      return { ...state, boardStack: [state.data.homeBoardId] }
    case 'deleteLastWord':
      return { ...state, message: state.message.slice(0, -1) }
    case 'clearMessage':
      return { ...state, message: [] }
    case 'setEditing':
      return { ...state, editing: action.editing }
    case 'upsertCell':
      return updateBoard(state, action.boardId, (board) => {
        const exists = board.cells.some((c) => c.id === action.cell.id)
        return {
          ...board,
          cells: exists
            ? board.cells.map((c) => (c.id === action.cell.id ? action.cell : c))
            : [...board.cells, action.cell],
        }
      })
    case 'deleteCell':
      return updateBoard(state, action.boardId, (board) => ({
        ...board,
        cells: board.cells.filter((c) => c.id !== action.cellId),
      }))
    case 'moveCell':
      return updateBoard(state, action.boardId, (board) => {
        const from = board.cells.findIndex((c) => c.id === action.cellId)
        const to = from + action.offset
        if (from < 0 || to < 0 || to >= board.cells.length) return board
        const cells = [...board.cells]
        const [moved] = cells.splice(from, 1)
        cells.splice(to, 0, moved)
        return { ...board, cells }
      })
    case 'addBoard':
      return {
        ...state,
        data: {
          ...state.data,
          boards: { ...state.data.boards, [action.board.id]: action.board },
        },
      }
    case 'updateSettings':
      return {
        ...state,
        data: {
          ...state.data,
          settings: { ...state.data.settings, ...action.settings },
        },
      }
    case 'replaceData':
      return initState(action.data)
  }
}

/** The text shown on the buttons, used when copying a message. */
export function messageDisplayText(message: MessageWord[]): string {
  return message.map((w) => w.cell.label).join(' ')
}

/** The text to speak for a message. */
export function messageText(message: MessageWord[]): string {
  return message.map((w) => w.cell.vocalization ?? w.cell.label).join(' ')
}
