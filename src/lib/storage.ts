import { DATA_VERSION, DEFAULT_SETTINGS, createDefaultData } from '../data/defaultBoards'
import type { AppData } from '../types'

const STORAGE_KEY = 'aac-app:data'

function isAppData(value: unknown): value is AppData {
  if (!value || typeof value !== 'object') return false
  const v = value as Partial<AppData>
  return (
    typeof v.homeBoardId === 'string' &&
    !!v.boards &&
    typeof v.boards === 'object' &&
    !!v.boards[v.homeBoardId]
  )
}

/** Fill in fields added in later versions so old saves keep working. */
export function normalizeData(value: unknown): AppData | null {
  if (!isAppData(value)) return null
  return {
    ...value,
    version: DATA_VERSION,
    settings: { ...DEFAULT_SETTINGS, ...value.settings },
  }
}

export function loadData(): AppData {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const data = normalizeData(JSON.parse(raw))
      if (data) return data
    }
  } catch {
    // Storage unavailable or corrupted: fall back to defaults.
  }
  return createDefaultData()
}

export function saveData(data: AppData): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
  } catch {
    // Quota exceeded or storage blocked; the app keeps working in memory.
  }
}

export function exportData(data: AppData): Blob {
  return new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
}

export async function importData(file: File): Promise<AppData> {
  const data = normalizeData(JSON.parse(await file.text()))
  if (!data) throw new Error('That file is not a valid AAC board backup.')
  return data
}
