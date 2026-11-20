import { describe, expect, it } from 'vitest'
import { SAMPLE_RATE, extractFeatures } from './features'
import { estimateSpread, type Template } from './matcher'
import { rawTemplateFrames, recognize, type RawTemplate } from './sentence'

// Synthetic "words" made of tone sequences (see matcher.test.ts).
function tones(seq: number[], stretch = 1, seed = 1): Float32Array {
  let s = seed
  const rand = () => ((s = (s * 16807) % 2147483647) / 2147483647) * 2 - 1
  const seg = Math.round(0.12 * stretch * SAMPLE_RATE)
  const out = new Float32Array(seg * seq.length)
  seq.forEach((f, t) => {
    for (let i = 0; i < seg; i++) {
      const env = Math.sin((Math.PI * i) / seg) ** 0.5
      const x = i / SAMPLE_RATE
      out[t * seg + i] =
        0.3 * env * (Math.sin(2 * Math.PI * f * x) + 0.6 * Math.sin(2 * Math.PI * 2.7 * f * x)) +
        0.002 * rand()
    }
  })
  return out
}
function withSilence(...parts: Float32Array[]): Float32Array {
  const gap = new Float32Array(Math.round(0.3 * SAMPLE_RATE)).map((_, i) => 0.002 * Math.sin(i * 12.9898))
  const all = [gap, ...parts, gap]
  const out = new Float32Array(all.reduce((n, p) => n + p.length, 0))
  let o = 0
  for (const p of all) {
    out.set(p, o)
    o += p.length
  }
  return out
}

const VOCAB: Record<string, number[]> = {
  banana: [220, 330, 220, 330, 220],
  bread: [700, 500],
  test: [400, 900, 400],
}

function setup() {
  const words: Template[] = []
  const raw: RawTemplate[] = []
  for (const [cellId, seq] of Object.entries(VOCAB)) {
    for (const [i, stretch] of [0.9, 1.1, 1].entries()) {
      const audio = withSilence(tones(seq, stretch, i + 2))
      words.push({ cellId, features: extractFeatures(audio)! })
      raw.push({ cellId, frames: rawTemplateFrames(audio) })
    }
  }
  return { words, raw, spread: estimateSpread(words) }
}

const ids = (r: ReturnType<typeof recognize>) =>
  r.kind === 'sentence'
    ? r.words.map((w) => (w.result.kind === 'match' ? w.result.cellId : `${w.result.kind}`))
    : r.kind === 'single' && r.result.kind === 'match'
      ? [r.result.cellId]
      : [r.kind]

describe('sentence recognition', () => {
  const { words, raw, spread } = setup()
  const opts = { sensitivity: 0.5, spread, multiWord: true, isFolder: () => false }

  it('recognizes two words said without a pause', () => {
    const r = recognize(withSilence(tones(VOCAB.banana, 1.05, 9), tones(VOCAB.bread, 0.95, 9)), words, raw, opts)
    expect(r.kind).toBe('sentence')
    expect(ids(r)).toEqual(['banana', 'bread'])
  })

  it('recognizes three words with a short pause', () => {
    const pause = new Float32Array(Math.round(0.15 * SAMPLE_RATE))
    const r = recognize(
      withSilence(tones(VOCAB.test, 1, 4), pause, tones(VOCAB.banana, 1, 4), tones(VOCAB.bread, 1, 4)),
      words,
      raw,
      opts,
    )
    expect(ids(r)).toEqual(['test', 'banana', 'bread'])
  })

  it('keeps a single word as a single word', () => {
    for (const [name, seq] of Object.entries(VOCAB)) {
      const r = recognize(withSilence(tones(seq, 1.05, 11)), words, raw, opts)
      expect(r.kind).toBe('single')
      expect(ids(r)).toEqual([name])
    }
  })

  it('treats speech as one word when multi-word listening is off', () => {
    const r = recognize(withSilence(tones(VOCAB.banana), tones(VOCAB.bread)), words, raw, {
      ...opts,
      multiWord: false,
    })
    expect(r.kind).toBe('single')
  })

  it('reports silence', () => {
    expect(recognize(new Float32Array(SAMPLE_RATE), words, raw, opts).kind).toBe('silence')
  })
})
