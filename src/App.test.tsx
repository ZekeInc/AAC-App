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
    await user.type(within(dialog).getByLabelText(/Symbol/), '🦒')
    await user.click(within(dialog).getByRole('button', { name: 'Save' }))
    await user.click(screen.getByRole('button', { name: 'Done' }))

    await user.click(screen.getByRole('button', { name: 'giraffe' }))
    expect(within(messageBar()).getByText('giraffe')).toBeInTheDocument()
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
})
