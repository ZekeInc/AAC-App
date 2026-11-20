import { DATA_VERSION, DEFAULT_SETTINGS, createDefaultData } from '../data/defaultBoards'
import type { AppData } from '../types'
import { clipsFromBackup, clipsToBackup, type AudioClip } from './audioClips'

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

/** Backup file: boards and settings, plus voice recordings. */
export async function exportData(data: AppData, clips: AudioClip[]): Promise<Blob> {
  const backup = { ...data, audioClips: await clipsToBackup(clips) }
  return new Blob([JSON.stringify(backup)], { type: 'application/json' })
}

export interface ImportedBackup {
  data: AppData
  /** null when the backup predates voice recordings. */
  clips: AudioClip[] | null
}

export async function importData(file: File): Promise<ImportedBackup> {
  const parsed: unknown = JSON.parse(await file.text())
  const data = normalizeData(parsed)
  if (!data) throw new Error('That file is not a valid AAC board backup.')
  const raw = (parsed as { audioClips?: unknown }).audioClips
  // Don't keep the recordings inside the boards data saved to localStorage.
  delete (data as Partial<{ audioClips: unknown }>).audioClips
  return { data, clips: raw === undefined ? null : clipsFromBackup(raw) }
}
