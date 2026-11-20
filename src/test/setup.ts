import '@testing-library/jest-dom/vitest'
import { afterEach, vi } from 'vitest'
import { cleanup } from '@testing-library/react'

afterEach(() => {
  cleanup()
  localStorage.clear()
})

// jsdom has no speech synthesis; provide a minimal mock so speech code runs.
class MockUtterance {
  text: string
  rate = 1
  pitch = 1
  voice: unknown = null
  lang = ''
  constructor(text: string) {
    this.text = text
  }
}
Object.assign(globalThis, { SpeechSynthesisUtterance: MockUtterance })
Object.defineProperty(window, 'speechSynthesis', {
  configurable: true,
  value: {
    speak: vi.fn(),
    cancel: vi.fn(),
    getVoices: () => [],
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  },
})
