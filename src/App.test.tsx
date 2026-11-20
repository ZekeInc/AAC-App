import { act, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import App from './App'

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

  it('requires holding the edit button, then lets you add a word', async () => {
    vi.useFakeTimers()
    render(<App />)
    const edit = screen.getByRole('button', { name: /Edit/ })

    // A quick tap does nothing.
    fireEvent.pointerDown(edit)
    fireEvent.pointerUp(edit)
    act(() => vi.advanceTimersByTime(1500))
    expect(screen.queryByRole('button', { name: 'Done' })).not.toBeInTheDocument()

    fireEvent.pointerDown(edit)
    act(() => vi.advanceTimersByTime(1100))
    vi.useRealTimers()
    expect(screen.getByRole('button', { name: 'Done' })).toBeInTheDocument()

    const user = userEvent.setup()
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
})
