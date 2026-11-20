import { describe, expect, it } from 'vitest'
import { createDefaultData } from '../data/defaultBoards'
import { loadData, normalizeData, saveData } from './storage'

describe('storage', () => {
  it('returns defaults when nothing is saved', () => {
    expect(loadData().homeBoardId).toBe('home')
  })

  it('round-trips saved data', () => {
    const data = createDefaultData()
    data.settings.columns = 5
    data.boards.home.name = 'My words'
    saveData(data)
    const loaded = loadData()
    expect(loaded.settings.columns).toBe(5)
    expect(loaded.boards.home.name).toBe('My words')
  })

  it('falls back to defaults on corrupted data', () => {
    localStorage.setItem('aac-app:data', '{not json')
    expect(loadData().boards.home).toBeDefined()
  })

  it('fills in missing settings from defaults', () => {
    const data = createDefaultData()
    const partial = { ...data, settings: { columns: 4 } }
    const normalized = normalizeData(partial)
    expect(normalized?.settings.columns).toBe(4)
    expect(normalized?.settings.speakOnTap).toBe(true)
  })

  it('rejects data whose home board is missing', () => {
    expect(normalizeData({ homeBoardId: 'x', boards: {} })).toBeNull()
    expect(normalizeData(null)).toBeNull()
  })
})
