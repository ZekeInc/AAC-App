import { describe, expect, it } from 'vitest'
import { createDefaultData } from '../data/defaultBoards'
import type { Cell } from '../types'
import {
  currentBoard,
  initState,
  messageDisplayText,
  messageText,
  reducer,
} from './appState'

const word = (label: string, extra: Partial<Cell> = {}): Cell => ({
  id: label,
  label,
  category: 'noun',
  ...extra,
})

describe('appState reducer', () => {
  it('builds a message and speaks vocalization when provided', () => {
    let s = initState(createDefaultData())
    s = reducer(s, { type: 'selectWord', cell: word('I') })
    s = reducer(s, { type: 'selectWord', cell: word('want') })
    s = reducer(s, { type: 'selectWord', cell: word('🍕', { vocalization: 'pizza' }) })
    expect(messageText(s.message)).toBe('I want pizza')
    // Copying uses the labels shown on screen, not the spoken text.
    expect(messageDisplayText(s.message)).toBe('I want 🍕')
    s = reducer(s, { type: 'deleteLastWord' })
    expect(messageText(s.message)).toBe('I want')
    s = reducer(s, { type: 'clearMessage' })
    expect(s.message).toHaveLength(0)
  })

  it('navigates between boards with back and home', () => {
    let s = initState(createDefaultData())
    s = reducer(s, { type: 'openBoard', boardId: 'food' })
    s = reducer(s, { type: 'openBoard', boardId: 'people' })
    expect(currentBoard(s).id).toBe('people')
    s = reducer(s, { type: 'back' })
    expect(currentBoard(s).id).toBe('food')
    s = reducer(s, { type: 'home' })
    expect(currentBoard(s).id).toBe('home')
    s = reducer(s, { type: 'back' })
    expect(s.boardStack).toEqual(['home'])
  })

  it('ignores links to missing boards', () => {
    const s = initState(createDefaultData())
    expect(reducer(s, { type: 'openBoard', boardId: 'nope' })).toBe(s)
  })

  it('returns home after a selection when that setting is on', () => {
    let s = initState(createDefaultData())
    s = reducer(s, { type: 'updateSettings', settings: { returnHomeAfterSelect: true } })
    s = reducer(s, { type: 'openBoard', boardId: 'food' })
    s = reducer(s, { type: 'selectWord', cell: word('apple') })
    expect(currentBoard(s).id).toBe('home')
  })

  it('adds, edits, moves and deletes cells', () => {
    let s = initState(createDefaultData())
    s = reducer(s, { type: 'addBoard', board: { id: 'b', name: 'B', cells: [] } })
    s = reducer(s, { type: 'upsertCell', boardId: 'b', cell: word('one') })
    s = reducer(s, { type: 'upsertCell', boardId: 'b', cell: word('two') })
    s = reducer(s, { type: 'upsertCell', boardId: 'b', cell: word('one', { label: 'uno' }) })
    expect(s.data.boards.b.cells.map((c) => c.label)).toEqual(['uno', 'two'])
    s = reducer(s, { type: 'moveCell', boardId: 'b', cellId: 'two', offset: -1 })
    expect(s.data.boards.b.cells.map((c) => c.id)).toEqual(['two', 'one'])
    // Moving past the edge is a no-op.
    s = reducer(s, { type: 'moveCell', boardId: 'b', cellId: 'two', offset: -1 })
    expect(s.data.boards.b.cells.map((c) => c.id)).toEqual(['two', 'one'])
    s = reducer(s, { type: 'deleteCell', boardId: 'b', cellId: 'two' })
    expect(s.data.boards.b.cells.map((c) => c.id)).toEqual(['one'])
  })
})

describe('default boards', () => {
  it('only link to boards that exist and have unique cell ids', () => {
    const data = createDefaultData()
    const ids = new Set<string>()
    for (const board of Object.values(data.boards)) {
      for (const cell of board.cells) {
        expect(ids.has(cell.id)).toBe(false)
        ids.add(cell.id)
        if (cell.linkTo) expect(data.boards[cell.linkTo]).toBeDefined()
      }
    }
  })
})
