import {
  FRAME,
  HOP,
  mfcc,
  rawFrames,
  speechBounds,
  utteranceBounds,
  wordFeatures,
  type Features,
} from './features'
import {
  decide,
  rankCandidates,
  thresholds,
  type Candidate,
  type MatchResult,
  type Template,
} from './matcher'

/**
 * Recognizing several words said in a row ("banana bread"), with or without
 * pauses between them.
 *
 * 1. One-pass connected-word DTW finds the sequence of recorded words that
 *    best explains the whole utterance, and where each word starts and ends.
 * 2. Each word found is then checked exactly like a single word (compared
 *    with every button's recordings, with the same confidence rules), so a
 *    sentence is only as trusted as its least certain word.
 */

/** A recording prepared for sentence decoding (not normalized per word). */
export interface RawTemplate {
  cellId: string
  frames: Float32Array[]
}

export interface SentenceWord {
  /** Sample range of this word in the recording, for learning from corrections. */
  sampleStart: number
  sampleEnd: number
  result: MatchResult
  /** Closest buttons with scores (for "matching details"). */
  ranked: Candidate[]
}

export type Recognition =
  | { kind: 'single'; result: MatchResult; ranked: Candidate[] }
  | { kind: 'sentence'; words: SentenceWord[] }
  | { kind: 'silence' }

/**
 * Cost of starting another word, in units of per-frame distance. Higher
 * values prefer fewer, longer words. Tuned on test sentences.
 */
export const sentenceConfig = { wordPenalty: 6, agreement: true, agreeDist: 1.25, agreeMargin: 0.75, agreeMaxLength: 1.15 }

/**
 * A recording prepared for sentence decoding: the word without the bit of
 * silence kept around it for single-word matching (there is no silence
 * between words in a sentence).
 */
export function rawTemplateFrames(samples: Float32Array): Float32Array[] {
  const { ceps, energyDb } = mfcc(samples)
  const b = speechBounds(energyDb)
  if (!b) return []
  const start = Math.min(b[0] + 5, b[1] - 1)
  const end = Math.max(start + 1, b[1] - 6)
  return rawFrames(ceps, start, end)
}

/** Per-dimension mean and spread of all recordings, used to normalize both sides alike. */
function speakerNorm(templates: RawTemplate[]) {
  const dim = templates.find((t) => t.frames.length)?.frames[0].length ?? 0
  const mean = new Float64Array(dim)
  const sd = new Float64Array(dim)
  let n = 0
  for (const t of templates) for (const f of t.frames) {
    n++
    for (let k = 0; k < dim; k++) mean[k] += f[k]
  }
  for (let k = 0; k < dim; k++) mean[k] /= n || 1
  for (const t of templates) for (const f of t.frames) {
    for (let k = 0; k < dim; k++) sd[k] += (f[k] - mean[k]) ** 2
  }
  for (let k = 0; k < dim; k++) sd[k] = Math.sqrt(sd[k] / (n || 1)) || 1
  return (frames: Float32Array[]) => frames.map((f) => f.map((v, k) => (v - mean[k]) / sd[k]))
}

interface Segment {
  template: number
  start: number
  end: number
}

/**
 * One-pass connected-word DTW (Vintsyuk / Ney). Every query frame is used
 * exactly once; within a word the recording may be followed at half to
 * several times its speed; a new word may start after any word ends.
 */
export function decodeSegments(
  query: Float32Array[],
  templates: Float32Array[][],
  penalty = sentenceConfig.wordPenalty,
): Segment[] {
  const n = query.length
  const dim = query[0]?.length ?? 0
  const dist = (a: Float32Array, b: Float32Array) => {
    let s = 0
    for (let k = 0; k < dim; k++) s += (a[k] - b[k]) ** 2
    return Math.sqrt(s)
  }
  let cost = templates.map((t) => new Float64Array(t.length).fill(Infinity))
  let start = templates.map((t) => new Int32Array(t.length))
  // Best word ending at each query frame: which template, where it started.
  const endTpl = new Int32Array(n).fill(-1)
  const endStart = new Int32Array(n)
  const endCost = new Float64Array(n).fill(Infinity)

  for (let i = 0; i < n; i++) {
    const q = query[i]
    const entry = i === 0 ? 0 : endCost[i - 1]
    const nextCost = templates.map((t) => new Float64Array(t.length).fill(Infinity))
    const nextStart = templates.map((t) => new Int32Array(t.length))
    for (let k = 0; k < templates.length; k++) {
      const t = templates[k]
      const prev = cost[k]
      const prevStart = start[k]
      const cur = nextCost[k]
      const curStart = nextStart[k]
      for (let j = 0; j < t.length; j++) {
        // Stay on this frame (slower), advance one (same speed) or two (faster).
        let best = prev[j]
        let from = prevStart[j]
        if (j >= 1 && prev[j - 1] < best) {
          best = prev[j - 1]
          from = prevStart[j - 1]
        }
        if (j >= 2 && prev[j - 2] < best) {
          best = prev[j - 2]
          from = prevStart[j - 2]
        }
        // Or begin this word here, right after the best word ending just before.
        if (j === 0 && entry + penalty < best) {
          best = entry + penalty
          from = i
        }
        if (best === Infinity) continue
        cur[j] = best + dist(q, t[j])
        curStart[j] = from
      }
      const last = t.length - 1
      if (cur[last] < endCost[i]) {
        endCost[i] = cur[last]
        endTpl[i] = k
        endStart[i] = curStart[last]
      }
    }
    cost = nextCost
    start = nextStart
  }

  // Trace back from the end of the utterance.
  const segments: Segment[] = []
  for (let i = n - 1; i >= 0 && endTpl[i] >= 0; ) {
    segments.unshift({ template: endTpl[i], start: endStart[i], end: i + 1 })
    i = endStart[i] - 1
  }
  return segments
}

/**
 * Recognize one word or a sentence. `words` holds the per-word templates
 * used for single-word matching; `raw` the same recordings for decoding.
 */
export function recognize(
  samples: Float32Array,
  words: Template[],
  raw: RawTemplate[],
  opts: { sensitivity: number; spread: number | null; multiWord: boolean; isFolder: (id: string) => boolean },
): Recognition {
  const { ceps, energyDb } = mfcc(samples)
  const bounds = utteranceBounds(energyDb)
  if (!bounds) return { kind: 'silence' }

  const single = (): Recognition => {
    const features = wordFeatures(ceps, bounds[0], bounds[1])
    if (!features) return { kind: 'silence' }
    const ranked = rankCandidates(features, words)
    return { kind: 'single', result: decide(ranked, opts.sensitivity, opts.spread), ranked }
  }

  const usable = raw.filter((t) => t.frames.length && !opts.isFolder(t.cellId))
  if (!opts.multiWord || usable.length === 0) return single()

  const norm = speakerNorm(usable)
  const query = norm(rawFrames(ceps, bounds[0], bounds[1]))
  const segments = decodeSegments(query, usable.map((tpl) => norm(tpl.frames)))
  if (segments.length <= 1) return single()

  // Check each word found like a single word (folders aren't used mid-sentence).
  const wordTemplates = words.filter((t) => !opts.isFolder(t.cellId))
  // Median length of each button's recordings.
  const typicalLength = new Map<string, number>()
  for (const id of new Set(usable.map((u) => u.cellId))) {
    const lengths = usable.filter((u) => u.cellId === id).map((u) => u.frames.length).sort((a, b) => a - b)
    typicalLength.set(id, lengths[Math.floor(lengths.length / 2)])
  }
  const t = thresholds(opts.sensitivity, opts.spread)
  const sentence: SentenceWord[] = []
  for (const seg of segments) {
    const features: Features | null = wordFeatures(ceps, bounds[0] + seg.start, bounds[0] + seg.end)
    if (!features) continue
    const ranked = rankCandidates(features, wordTemplates)
    let result = decide(ranked, opts.sensitivity, opts.spread)
    // Short words said quickly in a sentence sound less like their careful
    // recordings. When the sentence decoder and the word check independently
    // agree, accept with a somewhat looser bar.
    // Words in a flowing sentence are said faster than careful recordings, so
    // a real match is rarely longer than its recordings; a longer stretch is
    // more likely a word that has no button (e.g. "giraffe" vs "bread").
    const decoded = usable[seg.template].cellId
    const plausibleLength =
      seg.end - seg.start <= sentenceConfig.agreeMaxLength * (typicalLength.get(decoded) ?? Infinity)
    if (
      result.kind === 'unsure' &&
      sentenceConfig.agreement &&
      plausibleLength &&
      ranked[0]?.cellId === decoded
    ) {
      const [first, second] = ranked
      const margin = second ? (second.distance - first.distance) / second.distance : 1
      if (
        first.distance <= t.accept * sentenceConfig.agreeDist &&
        margin >= t.margin * sentenceConfig.agreeMargin
      ) {
        result = { kind: 'match', cellId: decoded, candidates: result.candidates }
      }
    }
    sentence.push({
      sampleStart: (bounds[0] + seg.start) * HOP,
      sampleEnd: (bounds[0] + seg.end) * HOP + FRAME,
      result,
      ranked: ranked.slice(0, 3),
    })
  }
  if (sentence.length <= 1) return single()
  return { kind: 'sentence', words: sentence }
}
