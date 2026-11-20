import { useEffect, useState } from 'react'
import type { Settings } from '../types'

export const speechSupported = () =>
  typeof window !== 'undefined' && 'speechSynthesis' in window

export function speak(text: string, settings: Settings): void {
  if (!speechSupported() || !text.trim()) return
  const synth = window.speechSynthesis
  synth.cancel() // Never queue: the newest tap should be heard immediately.
  const utterance = new SpeechSynthesisUtterance(text)
  utterance.rate = settings.rate
  utterance.pitch = settings.pitch
  if (settings.voiceURI) {
    const voice = synth.getVoices().find((v) => v.voiceURI === settings.voiceURI)
    if (voice) {
      utterance.voice = voice
      utterance.lang = voice.lang
    }
  }
  synth.speak(utterance)
}

export function stopSpeaking(): void {
  if (speechSupported()) window.speechSynthesis.cancel()
}

/** Voices load asynchronously in most browsers. */
export function useVoices(): SpeechSynthesisVoice[] {
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>(() =>
    speechSupported() ? window.speechSynthesis.getVoices() : [],
  )
  useEffect(() => {
    if (!speechSupported()) return
    const synth = window.speechSynthesis
    const update = () => setVoices(synth.getVoices())
    synth.addEventListener('voiceschanged', update)
    update()
    return () => synth.removeEventListener('voiceschanged', update)
  }, [])
  return voices
}
