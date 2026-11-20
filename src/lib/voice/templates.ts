import { getAllClips, type AudioClip } from '../audioClips'
import { decodeToMono16k, extractFeatures, type Features } from './features'
import type { Template } from './matcher'

/**
 * Features for each saved recording, computed once and cached by clip id
 * (recordings never change after they are saved; edits add or delete clips).
 */
const cache = new Map<string, Features | null>()

async function featuresFor(clip: AudioClip): Promise<Features | null> {
  if (!cache.has(clip.id)) {
    try {
      cache.set(clip.id, extractFeatures(await decodeToMono16k(clip.blob)))
    } catch {
      cache.set(clip.id, null) // undecodable; skip it
    }
  }
  return cache.get(clip.id) ?? null
}

/** Templates for every button with recordings, restricted to buttons that still exist. */
export async function loadTemplates(validCellIds: Set<string>): Promise<Template[]> {
  const clips = (await getAllClips()).filter((c) => validCellIds.has(c.cellId))
  const live = new Set(clips.map((c) => c.id))
  for (const id of cache.keys()) if (!live.has(id)) cache.delete(id)
  const templates: Template[] = []
  for (const clip of clips) {
    const features = await featuresFor(clip)
    if (features) templates.push({ cellId: clip.cellId, features })
  }
  return templates
}
