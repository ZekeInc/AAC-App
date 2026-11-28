import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import App from './App'
import { createDefaultData } from './data/defaultBoards'

const messageBar = () => screen.getByRole('region', { name: 'Message' })

describe('App', () => {
  it('builds and speaks a sentence', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.click(screen.getByRole('button', { name: 'I' }))
    await user.click(screen.getByRole('button', { name: 'want' }))
    await user.click(screen.getByRole('button', { name: 'Open Food' }))
    expect(screen.getByRole('heading', { name: 'Food & Drink' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'pizza' }))

    expect(within(messageBar()).getByText('pizza')).toBeInTheDocument()
    const speak = vi.mocked(window.speechSynthesis.speak)
    speak.mockClear()
    await user.click(screen.getByRole('button', { name: /Speak$/ }))
    const utterance = speak.mock.calls[0][0] as SpeechSynthesisUtterance
    expect(utterance.text).toBe('I want pizza')

    await user.click(screen.getByRole('button', { name: 'Copy message as text' }))
    expect(await navigator.clipboard.readText()).toBe('I want pizza')
    expect(screen.getByRole('status')).toHaveTextContent('Message copied')

    await user.click(screen.getByRole('button', { name: 'Delete last word' }))
    expect(within(messageBar()).queryByText('pizza')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Clear message' }))
    expect(screen.getByText('Tap words to build a message')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /Home/ }))
    expect(screen.getByRole('heading', { name: 'Home' })).toBeInTheDocument()
  })

  it('asks a grown-up question before editing, then lets you add a word', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.click(screen.getByRole('button', { name: /Edit/ }))
    const lock = screen.getByRole('dialog', { name: 'Grown-up check' })
    const question = within(lock).getByText(/\d+ \+ \d+ = \?/).textContent!
    const [a, b] = question.match(/\d+/g)!.map(Number)
    const choices = within(lock)
      .getAllByRole('button')
      .filter((el) => /^\d+$/.test(el.textContent ?? ''))

    // A wrong answer keeps edit mode locked.
    const wrongChoice = choices.find((el) => Number(el.textContent) !== a + b)!
    await user.click(wrongChoice)
    expect(within(lock).getByRole('alert')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Done' })).not.toBeInTheDocument()

    const next = within(lock).getByText(/\d+ \+ \d+ = \?/).textContent!
    const [c, d] = next.match(/\d+/g)!.map(Number)
    await user.click(within(lock).getByRole('button', { name: String(c + d) }))
    expect(screen.getByRole('button', { name: 'Done' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /Add button/ }))
    const dialog = screen.getByRole('dialog', { name: 'Add button' })
    await user.type(within(dialog).getByLabelText('Label'), 'giraffe')
    await user.type(within(dialog).getByLabelText(/Spoken text/), 'a tall giraffe')
    await user.type(within(dialog).getByLabelText(/Symbol/), '🦒')
    await user.click(within(dialog).getByRole('button', { name: 'Save' }))
    await user.click(screen.getByRole('button', { name: 'Done' }))

    await user.click(screen.getByRole('button', { name: 'I' }))
    await user.click(screen.getByRole('button', { name: 'giraffe' }))
    expect(within(messageBar()).getByText('giraffe')).toBeInTheDocument()

    // Speak uses the spoken text; Copy uses the labels shown on screen.
    const speak = vi.mocked(window.speechSynthesis.speak)
    speak.mockClear()
    await user.click(screen.getByRole('button', { name: /Speak$/ }))
    expect((speak.mock.calls[0][0] as SpeechSynthesisUtterance).text).toBe('I a tall giraffe')
    await user.click(screen.getByRole('button', { name: 'Copy message as text' }))
    expect(await navigator.clipboard.readText()).toBe('I giraffe')
    // Edits persist across reloads.
    expect(localStorage.getItem('aac-app:data')).toContain('giraffe')
  })

  it('skips the question when the check is turned off in settings', async () => {
    const user = userEvent.setup()
    const data = createDefaultData()
    data.settings.requireEditCheck = false
    localStorage.setItem('aac-app:data', JSON.stringify(data))
    render(<App />)
    await user.click(screen.getByRole('button', { name: /Edit/ }))
    expect(screen.getByRole('button', { name: 'Done' })).toBeInTheDocument()
  })

  describe('Add button on the Home board', () => {
    const answer = async (user: ReturnType<typeof userEvent.setup>, correct: boolean) => {
      const lock = screen.getByRole('dialog', { name: 'Grown-up check' })
      const [a, b] = within(lock).getByText(/\d+ \+ \d+ = \?/).textContent!.match(/\d+/g)!.map(Number)
      const choice = within(lock)
        .getAllByRole('button')
        .find((el) => /^\d+$/.test(el.textContent ?? '') && (Number(el.textContent) === a + b) === correct)!
      await user.click(choice)
    }

    it('asks the math question first, then adds the button to Home without entering edit mode', async () => {
      const user = userEvent.setup()
      render(<App />)
      await user.click(screen.getByRole('button', { name: 'Add button' }))
      await answer(user, false)
      expect(screen.queryByRole('dialog', { name: 'Add button' })).not.toBeInTheDocument()
      await answer(user, true)

      const dialog = screen.getByRole('dialog', { name: 'Add button' })
      await user.type(within(dialog).getByLabelText('Label'), 'pancakes')
      await user.type(within(dialog).getByLabelText(/Symbol/), '🥞')
      await user.click(within(dialog).getByRole('button', { name: 'Save' }))

      // Added at the end of Home, just before the Add button tile; still in normal mode.
      const grid = screen.getByRole('main', { name: 'Home board' })
      const buttons = within(grid).getAllByRole('button')
      expect(buttons.at(-2)).toHaveAccessibleName('pancakes')
      expect(buttons.at(-1)).toHaveAccessibleName('Add button')
      expect(screen.queryByRole('button', { name: 'Done' })).not.toBeInTheDocument()
      await user.click(screen.getByRole('button', { name: 'pancakes' }))
      expect(within(messageBar()).getByText('pancakes')).toBeInTheDocument()
    })

    it('goes straight to the editor when the math question is turned off', async () => {
      const data = createDefaultData()
      data.settings.requireEditCheck = false
      localStorage.setItem('aac-app:data', JSON.stringify(data))
      const user = userEvent.setup()
      render(<App />)
      await user.click(screen.getByRole('button', { name: 'Add button' }))
      expect(screen.queryByRole('dialog', { name: 'Grown-up check' })).not.toBeInTheDocument()
      expect(screen.getByRole('dialog', { name: 'Add button' })).toBeInTheDocument()
    })

    it('is the same single Add button as in edit mode, and only on Home outside edit mode', async () => {
      const user = userEvent.setup()
      render(<App />)
      expect(screen.getAllByRole('button', { name: 'Add button' })).toHaveLength(1)
      await user.click(screen.getByRole('button', { name: 'Open Food' }))
      expect(screen.queryByRole('button', { name: 'Add button' })).not.toBeInTheDocument()
      await user.click(screen.getByRole('button', { name: /Home/ }))
      await user.click(screen.getByRole('button', { name: 'Edit' }))
      await answer(user, true)
      // In edit mode it's the one tile, and it opens the editor without another question.
      expect(screen.getAllByRole('button', { name: 'Add button' })).toHaveLength(1)
      await user.click(screen.getByRole('button', { name: 'Add button' }))
      expect(screen.queryByRole('dialog', { name: 'Grown-up check' })).not.toBeInTheDocument()
      expect(screen.getByRole('dialog', { name: 'Add button' })).toBeInTheDocument()
    })

    it('can be hidden from Home in Settings, but still shows in edit mode', async () => {
      const user = userEvent.setup()
      render(<App />)
      expect(screen.getByRole('button', { name: 'Add button' })).toBeInTheDocument()
      await user.click(screen.getByRole('button', { name: 'Edit' }))
      await answer(user, true)
      await user.click(screen.getByRole('button', { name: 'Settings' }))
      const settingsDialog = screen.getByRole('dialog', { name: 'Settings' })
      const box = within(settingsDialog).getByLabelText('Show the Add button on the Home board')
      expect(box).toBeChecked()
      await user.click(box)
      await user.click(within(settingsDialog).getByRole('button', { name: 'Close' }))
      expect(screen.getByRole('button', { name: 'Add button' })).toBeInTheDocument()
      await user.click(screen.getByRole('button', { name: 'Done' }))
      expect(screen.queryByRole('button', { name: 'Add button' })).not.toBeInTheDocument()
      expect(JSON.parse(localStorage.getItem('aac-app:data')!).settings.showHomeAddButton).toBe(false)
    })
  })
})
