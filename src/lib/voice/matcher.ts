import type { Features } from './features'

/**
 * Dynamic time warping distance between two utterances: the average
 * frame-to-frame distance along the best alignment, so the same word said
 * faster or slower still matches. A band around the diagonal keeps it fast
 * and stops absurd alignments.
 */
export function dtwDistance(a: Features, b: Features): number {
  const n = a.length
  const m = b.length
  if (n === 0 || m === 0) return Infinity
  // Utterances of wildly different length are not the same word.
  if (Math.max(n, m) / Math.min(n, m) > 2.5) return Infinity
  const band = Math.max(Math.abs(n - m) + 4, Math.ceil(0.25 * Math.max(n, m)))
  const dim = a[0].length
  let prev = new Float64Array(m + 1).fill(Infinity)
  let cur = new Float64Array(m + 1).fill(Infinity)
  prev[0] = 0
  for (let i = 1; i <= n; i++) {
    cur.fill(Infinity)
    // Center the band on the (scaled) diagonal.
    const center = Math.round((i * m) / n)
    const lo = Math.max(1, center - band)
    const hi = Math.min(m, center + band)
    const ai = a[i - 1]
    for (let j = lo; j <= hi; j++) {
      const bj = b[j - 1]
      let d = 0
      for (let k = 0; k < dim; k++) d += (ai[k] - bj[k]) ** 2
      d = Math.sqrt(d)
      cur[j] = d + Math.min(prev[j], cur[j - 1], prev[j - 1])
    }
    ;[prev, cur] = [cur, prev]
  }
  return prev[m] / (n + m)
}

export interface Template {
  cellId: string
  features: Features
}

export interface Candidate {
  cellId: string
  distance: number
}

/** Rank buttons by their closest recording to the spoken utterance. */
export function rankCandidates(query: Features, templates: Template[]): Candidate[] {
  const best = new Map<string, number>()
  for (const t of templates) {
    const d = dtwDistance(query, t.features)
    if (d < (best.get(t.cellId) ?? Infinity)) best.set(t.cellId, d)
  }
  return [...best]
    .filter(([, d]) => Number.isFinite(d))
    .map(([cellId, distance]) => ({ cellId, distance }))
    .sort((x, y) => x.distance - y.distance)
}

export type MatchResult =
  | { kind: 'match'; cellId: string; candidates: Candidate[] }
  | { kind: 'unsure'; candidates: Candidate[] }
  | { kind: 'none' }

/**
 * Thresholds for a sensitivity from 0 (strict: only act on very close,
 * unambiguous matches) to 1 (lenient). Distances are on normalized features,
 * so they are comparable between users and devices. Tuned on test speech.
 */
export function thresholds(sensitivity: number) {
  const s = Math.min(1, Math.max(0, sensitivity))
  return {
    /** Distance under which a button is confidently matched. */
    accept: 2.0 + 0.6 * s,
    /** Required relative gap to the runner-up for a confident match. */
    margin: 0.22 - 0.1 * s,
    /** Distance under which a button is offered as a "did you mean" choice. */
    suggest: 2.6 + 0.4 * s,
  }
}

export function decide(ranked: Candidate[], sensitivity: number, maxSuggestions = 3): MatchResult {
  const t = thresholds(sensitivity)
  const suggestions = ranked.filter((c) => c.distance <= t.suggest).slice(0, maxSuggestions)
  if (suggestions.length === 0) return { kind: 'none' }
  const [first, second] = ranked
  const margin = second ? (second.distance - first.distance) / second.distance : 1
  if (first.distance <= t.accept && margin >= t.margin) {
    return { kind: 'match', cellId: first.cellId, candidates: suggestions }
  }
  return { kind: 'unsure', candidates: suggestions }
}
