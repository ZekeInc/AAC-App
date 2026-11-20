import { describe, expect, it } from 'vitest'
import { SAMPLE_RATE, extractFeatures, speechBounds } from './features'
import { decide, dtwDistance, rankCandidates, type Template } from './matcher'

/**
 * Synthetic "words": a sequence of vowel-like tones (fundamental + formant-ish
 * harmonics), surrounded by quiet noise. Different words use different tone
 * sequences; `stretch` speaks the same word faster or slower.
 */
function word(tones: number[], { stretch = 1, seed = 1, gain = 0.3 } = {}): Float32Array {
  let s = seed
  const rand = () => ((s = (s * 16807) % 2147483647) / 2147483647) * 2 - 1
  const seg = Math.round(0.12 * stretch * SAMPLE_RATE)
  const pad = Math.round(0.3 * SAMPLE_RATE)
  const out = new Float32Array(pad * 2 + seg * tones.length)
  for (let i = 0; i < out.length; i++) out[i] = 0.002 * rand()
  tones.forEach((f, t) => {
    for (let i = 0; i < seg; i++) {
      const env = Math.sin((Math.PI * i) / seg) ** 0.5
      const x = i / SAMPLE_RATE
      const v =
        Math.sin(2 * Math.PI * f * x) +
        0.6 * Math.sin(2 * Math.PI * 2.7 * f * x) +
        0.3 * Math.sin(2 * Math.PI * 5.3 * f * x)
      out[pad + t * seg + i] += gain * env * v
    }
  })
  return out
}

const VOCAB: Record<string, number[]> = {
  yes: [220, 330, 440],
  no: [440, 330, 220],
  more: [300, 300, 600, 600],
  stop: [700, 250, 700],
}

const templates = (): Template[] =>
  Object.entries(VOCAB).flatMap(([cellId, tones]) =>
    [0.9, 1.1].map((stretch, i) => ({
      cellId,
      features: extractFeatures(word(tones, { stretch, seed: i + 2 }))!,
    })),
  )

describe('feature extraction', () => {
  it('finds no speech in silence or quiet noise', () => {
    expect(extractFeatures(new Float32Array(SAMPLE_RATE))).toBeNull()
    expect(extractFeatures(word([]))).toBeNull()
  })

  it('trims the silence around a word', () => {
    const energy = [...Array(30).fill(-70), ...Array(40).fill(-20), ...Array(30).fill(-70)]
    const [start, end] = speechBounds(energy)!
    expect(start).toBeGreaterThanOrEqual(20)
    expect(start).toBeLessThanOrEqual(30)
    expect(end).toBeGreaterThanOrEqual(70)
    expect(end).toBeLessThanOrEqual(80)
  })

  it('produces normalized 24-dimensional frames', () => {
    const f = extractFeatures(word(VOCAB.yes))!
    expect(f.length).toBeGreaterThan(20)
    expect(f[0]).toHaveLength(24)
  })
})

describe('matching', () => {
  it('scores the same word closer than a different word, regardless of speed', () => {
    const a = extractFeatures(word(VOCAB.yes, { stretch: 0.8 }))!
    const b = extractFeatures(word(VOCAB.yes, { stretch: 1.25, seed: 9 }))!
    const c = extractFeatures(word(VOCAB.no))!
    expect(dtwDistance(a, b)).toBeLessThan(dtwDistance(a, c))
  })

  it('identifies each word, louder or quieter and faster or slower', () => {
    const t = templates()
    for (const [name, tones] of Object.entries(VOCAB)) {
      for (const opts of [{ stretch: 0.85, gain: 0.1 }, { stretch: 1.2, gain: 0.6 }]) {
        const ranked = rankCandidates(extractFeatures(word(tones, { ...opts, seed: 42 }))!, t)
        expect(ranked[0].cellId).toBe(name)
        const result = decide(ranked, 0.5)
        expect(result.kind).toBe('match')
      }
    }
  })

  it('refuses to align utterances of very different length', () => {
    const short = extractFeatures(word([300]))!
    const long = extractFeatures(word([300, 300, 300, 300, 300, 300]))!
    expect(dtwDistance(short, long)).toBe(Infinity)
  })
})

describe('decision', () => {
  it('accepts a close, clear winner', () => {
    expect(
      decide([{ cellId: 'a', distance: 1.0 }, { cellId: 'b', distance: 2.5 }], 0.5),
    ).toMatchObject({ kind: 'match', cellId: 'a' })
  })

  it('asks when the top two are too close to call', () => {
    const r = decide([{ cellId: 'a', distance: 2.0 }, { cellId: 'b', distance: 2.1 }], 0.5)
    expect(r).toMatchObject({ kind: 'unsure' })
    if (r.kind === 'unsure') expect(r.candidates.map((c) => c.cellId)).toEqual(['a', 'b'])
  })

  it('gives up when nothing is close', () => {
    expect(decide([{ cellId: 'a', distance: 9 }], 0.5)).toEqual({ kind: 'none' })
    expect(decide([], 0.5)).toEqual({ kind: 'none' })
  })

  it('is stricter at low sensitivity', () => {
    const ranked = [{ cellId: 'a', distance: 2.2 }, { cellId: 'b', distance: 2.9 }]
    expect(decide(ranked, 1).kind).toBe('match')
    expect(decide(ranked, 0).kind).toBe('unsure')
  })
})
