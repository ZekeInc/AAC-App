import { getAllClips, type AudioClip } from '../audioClips'
import { decodeToMono16k, extractFeatures, type Features } from './features'
import { estimateSpread, type Template } from './matcher'
import { rawTemplateFrames, type RawTemplate } from './sentence'

/**
 * Features for each saved recording, computed once and cached by clip id
 * (recordings never change after they are saved; edits add or delete clips).
 */
interface Prepared {
  word: Features
  raw: Float32Array[]
}
const cache = new Map<string, Prepared | null>()

async function prepare(clip: AudioClip): Promise<Prepared | null> {
  if (!cache.has(clip.id)) {
    try {
      const samples = await decodeToMono16k(clip.blob)
      const word = extractFeatures(samples)
      cache.set(clip.id, word ? { word, raw: rawTemplateFrames(samples) } : null)
    } catch {
      cache.set(clip.id, null) // undecodable; skip it
    }
  }
  return cache.get(clip.id) ?? null
}

let spreadCache: { key: string; spread: number | null } | null = null

export interface TemplateSet {
  templates: Template[]
  /** The same recordings prepared for recognizing sentences. */
  raw: RawTemplate[]
  /** This speaker's typical variation between recordings of the same word. */
  spread: number | null
}

/** Templates for every button with recordings, restricted to buttons that still exist. */
export async function loadTemplates(validCellIds: Set<string>): Promise<TemplateSet> {
  const clips = (await getAllClips()).filter((c) => validCellIds.has(c.cellId))
  const live = new Set(clips.map((c) => c.id))
  for (const id of cache.keys()) if (!live.has(id)) cache.delete(id)
  const templates: Template[] = []
  const raw: RawTemplate[] = []
  const ids: string[] = []
  for (const clip of clips) {
    const prepared = await prepare(clip)
    if (prepared) {
      templates.push({ cellId: clip.cellId, features: prepared.word })
      raw.push({ cellId: clip.cellId, frames: prepared.raw })
      ids.push(clip.id)
    }
  }
  const key = ids.sort().join(',')
  if (spreadCache?.key !== key) spreadCache = { key, spread: estimateSpread(templates) }
  return { templates, raw, spread: spreadCache.spread }
}
