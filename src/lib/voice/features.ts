/**
 * Speech features for on-device, speaker-dependent word matching.
 *
 * Audio is turned into MFCCs (mel-frequency cepstral coefficients, the
 * classic representation for speech recognition) plus their deltas, with
 * leading/trailing silence trimmed and per-utterance mean/variance
 * normalization so different microphones and volumes compare fairly.
 */

export const SAMPLE_RATE = 16000
const FRAME = 400 // 25 ms
const HOP = 160 // 10 ms
const NFFT = 512
const MEL_BANDS = 26
const CEPS = 13 // c0..c12; c0 (overall loudness) is dropped from the features
const MIN_SPEECH_FRAMES = 8 // 80 ms

/** A sequence of feature vectors, one per 10 ms frame. */
export type Features = Float32Array[]

const hz2mel = (hz: number) => 2595 * Math.log10(1 + hz / 700)
const mel2hz = (mel: number) => 700 * (10 ** (mel / 2595) - 1)

const hamming = Float32Array.from(
  { length: FRAME },
  (_, n) => 0.54 - 0.46 * Math.cos((2 * Math.PI * n) / (FRAME - 1)),
)

/** Triangular mel filters over the FFT bins, 20 Hz – 7.6 kHz. */
const melFilters: Float32Array[] = (() => {
  const lo = hz2mel(20)
  const hi = hz2mel(7600)
  const points = Array.from({ length: MEL_BANDS + 2 }, (_, i) =>
    Math.floor(((NFFT + 1) * mel2hz(lo + ((hi - lo) * i) / (MEL_BANDS + 1))) / SAMPLE_RATE),
  )
  return Array.from({ length: MEL_BANDS }, (_, m) => {
    const f = new Float32Array(NFFT / 2 + 1)
    const [a, b, c] = [points[m], points[m + 1], points[m + 2]]
    for (let k = a; k < b; k++) f[k] = (k - a) / Math.max(1, b - a)
    for (let k = b; k <= c; k++) f[k] = (c - k) / Math.max(1, c - b)
    return f
  })
})()

/** DCT-II basis for turning log mel energies into cepstra. */
const dct: Float32Array[] = Array.from({ length: CEPS }, (_, i) =>
  Float32Array.from({ length: MEL_BANDS }, (_, j) =>
    Math.cos((Math.PI * i * (j + 0.5)) / MEL_BANDS),
  ),
)

/** In-place iterative radix-2 FFT. */
function fft(re: Float32Array, im: Float32Array) {
  const n = re.length
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1
    for (; j & bit; bit >>= 1) j ^= bit
    j ^= bit
    if (i < j) {
      ;[re[i], re[j]] = [re[j], re[i]]
      ;[im[i], im[j]] = [im[j], im[i]]
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len
    const wr = Math.cos(ang)
    const wi = Math.sin(ang)
    for (let i = 0; i < n; i += len) {
      let cr = 1
      let ci = 0
      for (let k = 0; k < len / 2; k++) {
        const a = i + k
        const b = a + len / 2
        const tr = re[b] * cr - im[b] * ci
        const ti = re[b] * ci + im[b] * cr
        re[b] = re[a] - tr
        im[b] = im[a] - ti
        re[a] += tr
        im[a] += ti
        const ncr = cr * wr - ci * wi
        ci = cr * wi + ci * wr
        cr = ncr
      }
    }
  }
}

/** Raw MFCCs (including c0) for every frame, and each frame's energy in dB. */
export function mfcc(samples: Float32Array): { ceps: Float32Array[]; energyDb: number[] } {
  const ceps: Float32Array[] = []
  const energyDb: number[] = []
  const re = new Float32Array(NFFT)
  const im = new Float32Array(NFFT)
  const logMel = new Float32Array(MEL_BANDS)
  for (let start = 0; start + FRAME <= samples.length; start += HOP) {
    re.fill(0)
    im.fill(0)
    let energy = 0
    for (let n = 0; n < FRAME; n++) {
      // Pre-emphasis boosts high frequencies where consonants live.
      const prev = start + n > 0 ? samples[start + n - 1] : 0
      const s = samples[start + n] - 0.97 * prev
      energy += samples[start + n] ** 2
      re[n] = s * hamming[n]
    }
    energyDb.push(10 * Math.log10(energy / FRAME + 1e-10))
    fft(re, im)
    for (let m = 0; m < MEL_BANDS; m++) {
      const f = melFilters[m]
      let sum = 0
      for (let k = 0; k <= NFFT / 2; k++) if (f[k]) sum += f[k] * (re[k] ** 2 + im[k] ** 2)
      logMel[m] = Math.log(sum + 1e-10)
    }
    const c = new Float32Array(CEPS)
    for (let i = 0; i < CEPS; i++) {
      let sum = 0
      for (let j = 0; j < MEL_BANDS; j++) sum += dct[i][j] * logMel[j]
      c[i] = sum
    }
    ceps.push(c)
  }
  return { ceps, energyDb }
}

/**
 * The [start, end) frame range containing speech, found from frame energy
 * relative to the recording's own background noise and loudest point.
 */
export function speechBounds(energyDb: number[]): [number, number] | null {
  if (energyDb.length === 0) return null
  const sorted = [...energyDb].sort((a, b) => a - b)
  const noise = sorted[Math.floor(sorted.length * 0.1)]
  const peak = sorted[sorted.length - 1]
  // Too quiet overall, or no real difference between speech and background.
  if (peak < -55 || peak - noise < 10) return null
  const threshold = Math.max(noise + 0.3 * (peak - noise), peak - 35)
  let start = energyDb.findIndex((e) => e >= threshold)
  let end = energyDb.length - 1
  while (end > start && energyDb[end] < threshold) end--
  // Keep a little context so soft word edges aren't cut off.
  start = Math.max(0, start - 5)
  end = Math.min(energyDb.length, end + 6)
  return end - start >= MIN_SPEECH_FRAMES ? [start, end] : null
}

function deltas(frames: Float32Array[]): Float32Array[] {
  const n = frames.length
  const at = (i: number) => frames[Math.min(n - 1, Math.max(0, i))]
  return frames.map((_, t) => {
    const d = new Float32Array(frames[0].length)
    for (let k = 0; k < d.length; k++) {
      d[k] = (at(t + 1)[k] - at(t - 1)[k] + 2 * (at(t + 2)[k] - at(t - 2)[k])) / 10
    }
    return d
  })
}

/** Normalize each dimension to zero mean and unit variance over the utterance. */
function cmvn(frames: Float32Array[]): Float32Array[] {
  const dim = frames[0].length
  const mean = new Float32Array(dim)
  const sd = new Float32Array(dim)
  for (const f of frames) for (let k = 0; k < dim; k++) mean[k] += f[k] / frames.length
  for (const f of frames) for (let k = 0; k < dim; k++) sd[k] += (f[k] - mean[k]) ** 2 / frames.length
  for (let k = 0; k < dim; k++) sd[k] = Math.sqrt(sd[k]) || 1
  return frames.map((f) => f.map((v, k) => (v - mean[k]) / sd[k]))
}

/**
 * Features for matching from 16 kHz mono samples, or null when the audio
 * contains no detectable speech.
 */
export function extractFeatures(samples: Float32Array): Features | null {
  const { ceps, energyDb } = mfcc(samples)
  const bounds = speechBounds(energyDb)
  if (!bounds) return null
  const speech = ceps.slice(bounds[0], bounds[1]).map((c) => c.subarray(1)) // drop c0
  const d = deltas(speech)
  const combined = speech.map((c, t) => {
    const v = new Float32Array(c.length * 2)
    v.set(c)
    v.set(d[t], c.length)
    return v
  })
  return cmvn(combined)
}

/** Decode recorded audio (any format the browser supports) to 16 kHz mono. */
export async function decodeToMono16k(blob: Blob): Promise<Float32Array> {
  const bytes = await blob.arrayBuffer()
  const ctx = new AudioContext()
  let decoded: AudioBuffer
  try {
    decoded = await ctx.decodeAudioData(bytes)
  } finally {
    void ctx.close()
  }
  const length = Math.max(1, Math.ceil(decoded.duration * SAMPLE_RATE))
  const offline = new OfflineAudioContext(1, length, SAMPLE_RATE)
  const src = offline.createBufferSource()
  src.buffer = decoded // multi-channel input is mixed down to the mono destination
  src.connect(offline.destination)
  src.start()
  return (await offline.startRendering()).getChannelData(0)
}
