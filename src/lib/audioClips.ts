/**
 * Voice recordings attached to buttons, stored on this device in IndexedDB
 * (localStorage is too small for audio). Recordings are never uploaded.
 *
 * They are kept as the original recorded audio so a later voice-matching
 * feature can decode and compare them; they are not used for speech output.
 */

export interface AudioClip {
  id: string
  cellId: string
  blob: Blob
  mimeType: string
  durationMs: number
  createdAt: number
}

/** Serializable form used in backup files. */
export interface AudioClipBackup {
  id: string
  cellId: string
  mimeType: string
  durationMs: number
  createdAt: number
  /** Base64 data URL of the audio. */
  data: string
}

export const MAX_CLIPS_PER_CELL = 3
export const MAX_CLIP_MS = 5000

const DB_NAME = 'aac-app'
const DB_VERSION = 1
const STORE = 'audioClips'

let dbPromise: Promise<IDBDatabase> | null = null

function openDb(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION)
      req.onupgradeneeded = () => {
        const store = req.result.createObjectStore(STORE, { keyPath: 'id' })
        store.createIndex('cellId', 'cellId')
      }
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => {
        dbPromise = null
        reject(req.error)
      }
    })
  }
  return dbPromise
}

function done(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
    tx.onabort = () => reject(tx.error)
  })
}

function result<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

export async function getClipsForCell(cellId: string): Promise<AudioClip[]> {
  const db = await openDb()
  const clips = await result<AudioClip[]>(
    db.transaction(STORE).objectStore(STORE).index('cellId').getAll(cellId),
  )
  return clips.sort((a, b) => a.createdAt - b.createdAt)
}

export async function getAllClips(): Promise<AudioClip[]> {
  const db = await openDb()
  return result<AudioClip[]>(db.transaction(STORE).objectStore(STORE).getAll())
}

/** Number of recordings per button, for showing which buttons have them. */
export async function countClipsByCell(): Promise<Map<string, number>> {
  const counts = new Map<string, number>()
  for (const clip of await getAllClips()) {
    counts.set(clip.cellId, (counts.get(clip.cellId) ?? 0) + 1)
  }
  return counts
}

/** Add and remove recordings in one transaction. */
export async function applyClipChanges(add: AudioClip[], removeIds: string[]): Promise<void> {
  if (add.length === 0 && removeIds.length === 0) return
  const db = await openDb()
  const tx = db.transaction(STORE, 'readwrite')
  const store = tx.objectStore(STORE)
  for (const id of removeIds) store.delete(id)
  for (const clip of add) store.put(clip)
  await done(tx)
}

export async function deleteClipsForCell(cellId: string): Promise<void> {
  const clips = await getClipsForCell(cellId)
  await applyClipChanges([], clips.map((c) => c.id))
}

/** Remove recordings whose button no longer exists. */
export async function pruneClips(validCellIds: Set<string>): Promise<void> {
  const orphans = (await getAllClips()).filter((c) => !validCellIds.has(c.cellId))
  await applyClipChanges([], orphans.map((c) => c.id))
}

export async function replaceAllClips(clips: AudioClip[]): Promise<void> {
  const db = await openDb()
  const tx = db.transaction(STORE, 'readwrite')
  const store = tx.objectStore(STORE)
  store.clear()
  for (const clip of clips) store.put(clip)
  await done(tx)
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(blob)
  })
}

function dataUrlToBlob(dataUrl: string, mimeType: string): Blob {
  const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1)
  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0))
  return new Blob([bytes], { type: mimeType })
}

export async function clipsToBackup(clips: AudioClip[]): Promise<AudioClipBackup[]> {
  return Promise.all(
    clips.map(async ({ blob, ...rest }) => ({ ...rest, data: await blobToDataUrl(blob) })),
  )
}

export function clipsFromBackup(value: unknown): AudioClip[] {
  if (!Array.isArray(value)) return []
  return value
    .filter(
      (c): c is AudioClipBackup =>
        !!c &&
        typeof c.id === 'string' &&
        typeof c.cellId === 'string' &&
        typeof c.mimeType === 'string' &&
        typeof c.data === 'string',
    )
    .map(({ data, ...rest }) => ({
      ...rest,
      durationMs: Number(rest.durationMs) || 0,
      createdAt: Number(rest.createdAt) || 0,
      blob: dataUrlToBlob(data, rest.mimeType),
    }))
}
