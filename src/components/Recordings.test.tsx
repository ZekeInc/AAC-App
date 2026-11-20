import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from '../App'
import { createDefaultData } from '../data/defaultBoards'
import { getAllClips, getClipsForCell } from '../lib/audioClips'

// A fake microphone + MediaRecorder: stop() delivers one chunk of "audio".
const trackStop = vi.fn()
class FakeMediaRecorder {
  static isTypeSupported = (t: string) => t.startsWith('audio/webm')
  state: 'inactive' | 'recording' = 'inactive'
  mimeType = 'audio/webm'
  ondataavailable: ((e: { data: Blob }) => void) | null = null
  onstop: (() => void) | null = null
  start() {
    this.state = 'recording'
  }
  stop() {
    this.state = 'inactive'
    this.ondataavailable?.({ data: new Blob(['fake-audio'], { type: 'audio/webm' }) })
    this.onstop?.()
  }
}
const audioCtor = vi.fn()

beforeEach(() => {
  vi.stubGlobal('MediaRecorder', FakeMediaRecorder)
  vi.stubGlobal('Audio', audioCtor)
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: { getUserMedia: vi.fn(async () => ({ getTracks: () => [{ stop: trackStop }] })) },
  })
  // Skip the grown-up check to keep these tests focused.
  const data = createDefaultData()
  data.settings.requireEditCheck = false
  localStorage.setItem('aac-app:data', JSON.stringify(data))
})
afterEach(() => {
  vi.unstubAllGlobals()
  trackStop.mockClear()
  audioCtor.mockClear()
})

async function openEditorFor(user: ReturnType<typeof userEvent.setup>, label: string) {
  if (!screen.queryByRole('button', { name: 'Done' })) {
    await user.click(screen.getByRole('button', { name: 'Edit' }))
  }
  await user.click(screen.getByRole('button', { name: new RegExp(`^Edit ${label}`) }))
  return screen.getByRole('dialog', { name: 'Edit button' })
}

describe('voice recordings', () => {
  it('records clips for a button, saves them, and never plays them when used', async () => {
    const user = userEvent.setup()
    render(<App />)
    let dialog = await openEditorFor(user, 'want')
    expect(await within(dialog).findByText('No recordings yet.')).toBeInTheDocument()

    await user.click(within(dialog).getByRole('button', { name: /Record/ }))
    await user.click(within(dialog).getByRole('button', { name: /Stop/ }))
    expect(within(dialog).getByText(/Recording 1/)).toBeInTheDocument()
    expect(trackStop).toHaveBeenCalled() // microphone released

    await user.click(within(dialog).getByRole('button', { name: /Record/ }))
    await user.click(within(dialog).getByRole('button', { name: /Stop/ }))
    await user.click(within(dialog).getByRole('button', { name: 'Save' }))

    await waitFor(async () => expect(await getClipsForCell('default-3')).toHaveLength(2))
    expect(
      await screen.findByRole('button', { name: 'Edit want, 2 voice recordings' }),
    ).toBeInTheDocument()

    // Re-open: recordings load, and deleting one only happens on Save.
    dialog = await openEditorFor(user, 'want')
    await within(dialog).findByText(/Recording 2/)
    await user.click(within(dialog).getByRole('button', { name: 'Delete recording 1' }))
    expect(within(dialog).queryByText(/Recording 2/)).not.toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    expect(await getClipsForCell('default-3')).toHaveLength(2)

    // Using the button speaks with the computer voice; the recording isn't played.
    await user.click(screen.getByRole('button', { name: 'Done' }))
    await user.click(screen.getByRole('button', { name: 'want' }))
    await user.click(screen.getByRole('button', { name: /Speak$/ }))
    expect(window.speechSynthesis.speak).toHaveBeenCalled()
    expect(audioCtor).not.toHaveBeenCalled()
  })

  it('limits recordings per button and discards unsaved recordings on cancel', async () => {
    const user = userEvent.setup()
    render(<App />)
    const dialog = await openEditorFor(user, 'go')
    await within(dialog).findByText('No recordings yet.')
    for (let i = 0; i < 3; i++) {
      await user.click(within(dialog).getByRole('button', { name: /Record/ }))
      await user.click(within(dialog).getByRole('button', { name: /Stop/ }))
    }
    expect(within(dialog).getByRole('button', { name: /Record/ })).toBeDisabled()
    expect(within(dialog).getByText(/Delete a recording to record another/)).toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    expect(await getAllClips()).toHaveLength(0)
  })

  it('deletes a button’s recordings when the button is deleted', async () => {
    const user = userEvent.setup()
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    render(<App />)
    let dialog = await openEditorFor(user, 'go')
    await within(dialog).findByText('No recordings yet.')
    await user.click(within(dialog).getByRole('button', { name: /Record/ }))
    await user.click(within(dialog).getByRole('button', { name: /Stop/ }))
    await user.click(within(dialog).getByRole('button', { name: 'Save' }))
    await waitFor(async () => expect(await getAllClips()).toHaveLength(1))

    dialog = await openEditorFor(user, 'go')
    await user.click(within(dialog).getByRole('button', { name: 'Delete' }))
    await waitFor(async () => expect(await getAllClips()).toHaveLength(0))
  })

  it('explains when microphone access is blocked', async () => {
    vi.mocked(navigator.mediaDevices.getUserMedia).mockRejectedValueOnce(
      new DOMException('denied', 'NotAllowedError'),
    )
    const user = userEvent.setup()
    render(<App />)
    const dialog = await openEditorFor(user, 'go')
    await within(dialog).findByText('No recordings yet.')
    await user.click(within(dialog).getByRole('button', { name: /Record/ }))
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(/Microphone access was blocked/)
  })
})
