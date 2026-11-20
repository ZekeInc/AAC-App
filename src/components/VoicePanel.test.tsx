import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from '../App'
import { createDefaultData } from '../data/defaultBoards'
import { applyClipChanges, getClipsForCell } from '../lib/audioClips'
import type { ListenOutcome } from '../lib/voice/useListener'
import type { MatchResult } from '../lib/voice/matcher'

// The microphone, audio decoding and matching are stubbed; the matching
// algorithm itself is covered in lib/voice/matcher.test.ts.
const listenOutcome = vi.fn<() => ListenOutcome>()
const decision = vi.fn<() => MatchResult>()

// Like the real hook, listen/cancel are stable across renders.
const listener = {
  state: 'waiting',
  level: 0,
  listen: async () => listenOutcome(),
  cancel: () => {},
}
vi.mock('../lib/voice/useListener', () => ({ useListener: () => listener }))
vi.mock('../lib/voice/features', () => ({
  SAMPLE_RATE: 16000,
  decodeToMono16k: async () => new Float32Array(16000),
  extractFeatures: () => [new Float32Array(24)],
}))
vi.mock('../lib/voice/templates', () => ({
  loadTemplates: async () => ({ templates: [], spread: 1.8 }),
}))
vi.mock('../lib/voice/matcher', () => ({
  rankCandidates: () => [
    { cellId: 'default-3', distance: 2.1 },
    { cellId: 'default-4', distance: 2.3 },
  ],
  thresholds: () => ({ accept: 3.4, margin: 0.15, suggest: 4.8 }),
  decide: () => decision(),
}))

const messageBar = () => screen.getByRole('region', { name: 'Message' })
const audio: ListenOutcome = { kind: 'audio', blob: new Blob(['x']) }

async function withRecordingsOn(...cellIds: string[]) {
  await applyClipChanges(
    cellIds.map((cellId, i) => ({
      id: `clip-${i}`,
      cellId,
      blob: new Blob(['x']),
      mimeType: 'audio/webm',
      durationMs: 800,
      createdAt: i,
    })),
    [],
  )
}

afterEach(() => vi.unstubAllGlobals())

beforeEach(() => {
  listenOutcome.mockReset()
  decision.mockReset()
})

describe('voice matching', () => {
  it('hides Listen until a button has recordings', async () => {
    render(<App />)
    await new Promise((r) => setTimeout(r, 50))
    expect(screen.queryByRole('button', { name: 'Listen' })).not.toBeInTheDocument()
  })

  it('selects a confidently matched button, like tapping it', async () => {
    await withRecordingsOn('default-3') // "want"
    listenOutcome.mockReturnValue(audio)
    decision.mockReturnValue({ kind: 'match', cellId: 'default-3', candidates: [] })
    const user = userEvent.setup()
    render(<App />)
    await user.click(await screen.findByRole('button', { name: 'Listen' }))
    await waitFor(() => expect(within(messageBar()).getByText('want')).toBeInTheDocument())
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByText('Heard “want”')).toBeInTheDocument()
    const utterance = vi.mocked(window.speechSynthesis.speak).mock.lastCall![0]
    expect(utterance.text).toBe('want')
  })

  it('opens a folder when the matched button is a folder', async () => {
    const food = createDefaultData().boards.home.cells.find((c) => c.label === 'Food')!
    await withRecordingsOn(food.id)
    listenOutcome.mockReturnValue(audio)
    decision.mockReturnValue({ kind: 'match', cellId: food.id, candidates: [] })
    const user = userEvent.setup()
    render(<App />)
    await user.click(await screen.findByRole('button', { name: 'Listen' }))
    expect(await screen.findByRole('heading', { name: 'Food & Drink' })).toBeInTheDocument()
  })

  it('asks "did you mean" when unsure, and uses the chosen button', async () => {
    await withRecordingsOn('default-3', 'default-4')
    listenOutcome.mockReturnValue(audio)
    decision.mockReturnValue({
      kind: 'unsure',
      candidates: [
        { cellId: 'default-3', distance: 2 },
        { cellId: 'default-4', distance: 2.1 },
      ],
    })
    const user = userEvent.setup()
    render(<App />)
    await user.click(await screen.findByRole('button', { name: 'Listen' }))
    const dialog = await screen.findByRole('dialog', { name: 'Say a word' })
    await within(dialog).findByText('Did you mean…')
    await user.click(within(dialog).getByRole('button', { name: /like/ }))
    expect(within(messageBar()).getByText('like')).toBeInTheDocument()
    expect(screen.queryByText(/Heard/)).not.toBeInTheDocument()

    // What was said is kept as a learned recording for the chosen button.
    await waitFor(async () => {
      const clips = await getClipsForCell('default-4')
      expect(clips.filter((c) => c.source === 'learned')).toHaveLength(1)
    })
    // And shows up in the editor (learned recordings don't count toward the limit).
    vi.stubGlobal('MediaRecorder', class {})
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia: async () => ({}) },
    })
    await user.click(screen.getByRole('button', { name: 'Edit' }))
    const lock = screen.getByRole('dialog', { name: 'Grown-up check' })
    const [a, b] = within(lock).getByText(/= \?/).textContent!.match(/\d+/g)!.map(Number)
    await user.click(within(lock).getByRole('button', { name: String(a + b) }))
    await user.click(screen.getByRole('button', { name: /^Edit like/ }))
    const editor = screen.getByRole('dialog', { name: 'Edit button' })
    expect(await within(editor).findByText(/Learned 1/)).toBeInTheDocument()
    expect(within(editor).getByRole('button', { name: /Record/ })).toBeEnabled()
  })

  it('does not learn when learning is turned off, and shows scores when asked', async () => {
    const data = createDefaultData()
    data.settings.learnFromChoices = false
    data.settings.showMatchDetails = true
    localStorage.setItem('aac-app:data', JSON.stringify(data))
    await withRecordingsOn('default-3', 'default-4')
    listenOutcome.mockReturnValue(audio)
    decision.mockReturnValue({
      kind: 'unsure',
      candidates: [{ cellId: 'default-4', distance: 2.3 }],
    })
    const user = userEvent.setup()
    render(<App />)
    await user.click(await screen.findByRole('button', { name: 'Listen' }))
    const dialog = await screen.findByRole('dialog', { name: 'Say a word' })
    expect(await within(dialog).findByText('want 2.10 · like 2.30')).toBeInTheDocument()
    expect(within(dialog).getByText(/Gap 9% \(needs ≥ 15%\).*Auto-select ≤ 3.40.*spread 1.80/)).toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: /like/ }))
    await new Promise((r) => setTimeout(r, 50))
    const clips = await getClipsForCell('default-4')
    expect(clips.filter((c) => c.source === 'learned')).toHaveLength(0)
  })

  it('explains when nothing matched or nothing was heard, and can try again', async () => {
    await withRecordingsOn('default-3')
    listenOutcome.mockReturnValueOnce({ kind: 'silence' }).mockReturnValueOnce(audio)
    decision.mockReturnValue({ kind: 'none' })
    const user = userEvent.setup()
    render(<App />)
    await user.click(await screen.findByRole('button', { name: 'Listen' }))
    const dialog = await screen.findByRole('dialog', { name: 'Say a word' })
    expect(await within(dialog).findByText('I didn’t hear anything.')).toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: /Try again/ }))
    expect(
      await within(dialog).findByText('Sorry, that didn’t match any button.'),
    ).toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByText('Tap words to build a message')).toBeInTheDocument()
  })

  it('shows microphone errors', async () => {
    await withRecordingsOn('default-3')
    listenOutcome.mockReturnValue({ kind: 'error', message: 'Microphone access was blocked.' })
    const user = userEvent.setup()
    render(<App />)
    await user.click(await screen.findByRole('button', { name: 'Listen' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Microphone access was blocked.')
  })
})
