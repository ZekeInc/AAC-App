/**
 * Word categories follow the Modified Fitzgerald Key, a widely used
 * color-coding convention in AAC so users can find parts of speech quickly.
 */
export type WordCategory =
  | 'pronoun' // people & pronouns — yellow
  | 'verb' // actions — green
  | 'descriptor' // adjectives & adverbs — blue
  | 'noun' // things — orange
  | 'social' // greetings, manners — pink
  | 'question' // question words — purple
  | 'negation' // no, not, stop — red
  | 'misc' // prepositions, articles, misc — white
  | 'folder' // navigates to another board — gray

export interface Cell {
  id: string
  /** Text shown on the button. */
  label: string
  /** Text spoken / added to the message. Defaults to `label`. */
  vocalization?: string
  /** Emoji used as the symbol until picture-symbol support lands. */
  symbol?: string
  /** User-provided image (data URL). Takes precedence over `symbol`. */
  image?: string
  category: WordCategory
  /** If set, tapping opens this board instead of adding a word. */
  linkTo?: string
}

export interface Board {
  id: string
  name: string
  cells: Cell[]
}

export interface Settings {
  columns: number
  /** Speak each word as it is tapped. */
  speakOnTap: boolean
  /** Return to the home board after picking a word from a sub-board. */
  returnHomeAfterSelect: boolean
  voiceURI: string | null
  rate: number
  pitch: number
  showLabels: boolean
  /** Ask a simple grown-up question before entering edit mode. */
  requireEditCheck: boolean
  /** Show the Listen button for matching speech to buttons' recordings. */
  voiceMatching: boolean
  /** 0 = strict, 1 = lenient. */
  matchSensitivity: number
  /** Save "Did you mean…?" picks as extra recordings to improve matching. */
  learnFromChoices: boolean
  /** Show match scores in the Listen panel, for tuning. */
  showMatchDetails: boolean
  /** Recognize several words said in a row ("banana bread"). */
  multiWord: boolean
}

export interface AppData {
  version: number
  homeBoardId: string
  boards: Record<string, Board>
  settings: Settings
}
