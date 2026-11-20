import { describe, expect, it } from 'vitest'
import {
  addLearnedClip,
  applyClipChanges,
  clipsFromBackup,
  clipsToBackup,
  countClipsByCell,
  deleteClipsForCell,
  getAllClips,
  getClipsForCell,
  pruneClips,
  type AudioClip,
} from './audioClips'

const clip = (id: string, cellId: string, createdAt = 1): AudioClip => ({
  id,
  cellId,
  blob: new Blob([`audio-${id}`], { type: 'audio/webm' }),
  mimeType: 'audio/webm',
  durationMs: 1200,
  createdAt,
})

describe('audio clip storage', () => {
  it('stores recordings per button in the order they were made', async () => {
    await applyClipChanges([clip('b', 'cell-1', 2), clip('a', 'cell-1', 1), clip('c', 'cell-2')], [])
    expect((await getClipsForCell('cell-1')).map((c) => c.id)).toEqual(['a', 'b'])
    expect(await countClipsByCell()).toEqual(new Map([['cell-1', 2], ['cell-2', 1]]))
  })

  it('adds and removes in one step', async () => {
    await applyClipChanges([clip('a', 'cell-1'), clip('b', 'cell-1')], [])
    await applyClipChanges([clip('c', 'cell-1')], ['a'])
    expect((await getClipsForCell('cell-1')).map((c) => c.id).sort()).toEqual(['b', 'c'])
  })

  it('deletes a button’s recordings and prunes recordings of removed buttons', async () => {
    await applyClipChanges([clip('a', 'cell-1'), clip('b', 'cell-2'), clip('c', 'gone')], [])
    await deleteClipsForCell('cell-1')
    await pruneClips(new Set(['cell-1', 'cell-2']))
    expect((await getAllClips()).map((c) => c.id)).toEqual(['b'])
  })

  it('keeps only the newest learned clips per button, apart from recorded ones', async () => {
    await applyClipChanges([clip('mine', 'cell-1')], [])
    for (let i = 0; i < 5; i++) {
      await addLearnedClip('cell-1', {
        blob: new Blob([`learned-${i}`]),
        mimeType: 'audio/webm',
        durationMs: 900 + i,
      })
      await new Promise((r) => setTimeout(r, 2)) // distinct timestamps
    }
    const clips = await getClipsForCell('cell-1')
    expect(clips.filter((c) => !c.source).map((c) => c.id)).toEqual(['mine'])
    const learned = clips.filter((c) => c.source === 'learned')
    expect(learned.map((c) => c.durationMs)).toEqual([902, 903, 904])
  })

  it('round-trips recordings through a backup', async () => {
    const original = clip('a', 'cell-1')
    const learned: AudioClip = { ...clip('b', 'cell-1'), source: 'learned' }
    const backup = JSON.parse(JSON.stringify(await clipsToBackup([original, learned])))
    const [restored, restoredLearned] = clipsFromBackup(backup)
    expect(restored).toMatchObject({ id: 'a', cellId: 'cell-1', mimeType: 'audio/webm' })
    expect(restored.source).toBeUndefined()
    expect(restoredLearned.source).toBe('learned')
    expect(await restored.blob.text()).toBe('audio-a')
  })

  it('ignores malformed backup entries', () => {
    expect(clipsFromBackup('nope')).toEqual([])
    expect(clipsFromBackup([{ id: 1 }, null])).toEqual([])
  })
})
