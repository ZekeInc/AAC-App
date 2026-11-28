import type { AppData, Board, Cell, Settings, WordCategory } from '../types'

let counter = 0
function cell(
  label: string,
  symbol: string,
  category: WordCategory,
  extra: Partial<Cell> = {},
): Cell {
  counter += 1
  return { id: `default-${counter}`, label, symbol, category, ...extra }
}
const folder = (label: string, symbol: string, linkTo: string) =>
  cell(label, symbol, 'folder', { linkTo })

function board(id: string, name: string, cells: Cell[]): Board {
  return { id, name, cells }
}

/**
 * Home board: high-frequency "core" words that make up most of everyday
 * speech, plus folders that open topic ("fringe") vocabulary.
 */
function homeBoard(): Board {
  return board('home', 'Home', [
    cell('I', '🙋', 'pronoun'),
    cell('you', '👉', 'pronoun'),
    cell('want', '🤲', 'verb'),
    cell('like', '👍', 'verb'),
    cell('go', '🚶', 'verb'),
    cell('help', '🆘', 'verb'),
    cell('more', '➕', 'descriptor'),
    cell('stop', '✋', 'negation'),

    cell('it', '📦', 'pronoun'),
    cell('we', '👫', 'pronoun'),
    cell('need', '❗', 'verb'),
    cell('feel', '💭', 'verb'),
    cell('eat', '🍽️', 'verb'),
    cell('drink', '🥤', 'verb'),
    cell('all done', '✅', 'descriptor'),
    cell('not', '🚫', 'negation'),

    cell('yes', '✔️', 'social'),
    cell('no', '❌', 'negation'),
    cell('please', '🙏', 'social'),
    cell('thank you', '💐', 'social'),
    cell('what', '❓', 'question'),
    cell('where', '🗺️', 'question'),
    cell('in', '📥', 'misc'),
    cell('on', '🔛', 'misc'),

    folder('Feelings', '😊', 'feelings'),
    folder('Food', '🍎', 'food'),
    folder('People', '👪', 'people'),
    folder('Places', '🏠', 'places'),
    folder('Activities', '⚽', 'activities'),
    folder('Body', '🩹', 'body'),
    folder('Chat', '💬', 'chat'),
    folder('Questions', '🤔', 'questions'),
  ])
}

export function createDefaultBoards(): Record<string, Board> {
  counter = 0
  const boards: Board[] = [
    homeBoard(),
    board('feelings', 'Feelings', [
      cell('happy', '😊', 'descriptor'),
      cell('sad', '😢', 'descriptor'),
      cell('angry', '😠', 'descriptor'),
      cell('scared', '😨', 'descriptor'),
      cell('tired', '😴', 'descriptor'),
      cell('excited', '🤩', 'descriptor'),
      cell('bored', '😐', 'descriptor'),
      cell('sick', '🤒', 'descriptor'),
      cell('hurt', '🤕', 'descriptor'),
      cell('calm', '😌', 'descriptor'),
      cell('frustrated', '😤', 'descriptor'),
      cell('silly', '🤪', 'descriptor'),
      cell('hot', '🥵', 'descriptor'),
      cell('cold', '🥶', 'descriptor'),
      cell('hungry', '🍽️', 'descriptor'),
      cell('thirsty', '💧', 'descriptor'),
    ]),
    board('food', 'Food & Drink', [
      cell('water', '💧', 'noun'),
      cell('juice', '🧃', 'noun'),
      cell('milk', '🥛', 'noun'),
      cell('coffee', '☕', 'noun'),
      cell('apple', '🍎', 'noun'),
      cell('banana', '🍌', 'noun'),
      cell('bread', '🍞', 'noun'),
      cell('sandwich', '🥪', 'noun'),
      cell('pizza', '🍕', 'noun'),
      cell('pasta', '🍝', 'noun'),
      cell('chicken', '🍗', 'noun'),
      cell('rice', '🍚', 'noun'),
      cell('cereal', '🥣', 'noun'),
      cell('cookie', '🍪', 'noun'),
      cell('snack', '🥨', 'noun'),
      cell('ice cream', '🍦', 'noun'),
    ]),
    board('people', 'People', [
      cell('mom', '👩', 'pronoun'),
      cell('dad', '👨', 'pronoun'),
      cell('brother', '👦', 'pronoun'),
      cell('sister', '👧', 'pronoun'),
      cell('grandma', '👵', 'pronoun'),
      cell('grandpa', '👴', 'pronoun'),
      cell('friend', '🧑‍🤝‍🧑', 'pronoun'),
      cell('teacher', '🧑‍🏫', 'pronoun'),
      cell('doctor', '🧑‍⚕️', 'pronoun'),
      cell('baby', '👶', 'pronoun'),
      cell('he', '👱‍♂️', 'pronoun'),
      cell('she', '👱‍♀️', 'pronoun'),
      cell('they', '👥', 'pronoun'),
      cell('me', '🙋', 'pronoun'),
      cell('my', '🫵', 'pronoun'),
      cell('your', '👉', 'pronoun'),
    ]),
    board('places', 'Places', [
      cell('home', '🏠', 'noun'),
      cell('school', '🏫', 'noun'),
      cell('work', '🏢', 'noun'),
      cell('outside', '🌳', 'noun'),
      cell('park', '🛝', 'noun'),
      cell('store', '🛒', 'noun'),
      cell('bathroom', '🚻', 'noun'),
      cell('bedroom', '🛏️', 'noun'),
      cell('kitchen', '🍳', 'noun'),
      cell('car', '🚗', 'noun'),
      cell('bus', '🚌', 'noun'),
      cell('hospital', '🏥', 'noun'),
      cell('restaurant', '🍴', 'noun'),
      cell('library', '📚', 'noun'),
      cell('pool', '🏊', 'noun'),
      cell('beach', '🏖️', 'noun'),
    ]),
    board('activities', 'Activities', [
      cell('play', '🧸', 'verb'),
      cell('read', '📖', 'verb'),
      cell('watch', '📺', 'verb'),
      cell('listen', '🎧', 'verb'),
      cell('music', '🎵', 'noun'),
      cell('draw', '🖍️', 'verb'),
      cell('walk', '🚶', 'verb'),
      cell('run', '🏃', 'verb'),
      cell('swim', '🏊', 'verb'),
      cell('sleep', '😴', 'verb'),
      cell('game', '🎮', 'noun'),
      cell('ball', '⚽', 'noun'),
      cell('book', '📕', 'noun'),
      cell('tablet', '📱', 'noun'),
      cell('TV', '📺', 'noun'),
      cell('bath', '🛁', 'noun'),
    ]),
    board('body', 'Body & Health', [
      cell('head', '🗣️', 'noun'),
      cell('eyes', '👀', 'noun'),
      cell('ears', '👂', 'noun'),
      cell('mouth', '👄', 'noun'),
      cell('teeth', '🦷', 'noun'),
      cell('tummy', '🫃', 'noun'),
      cell('arm', '💪', 'noun'),
      cell('leg', '🦵', 'noun'),
      cell('hand', '✋', 'noun'),
      cell('foot', '🦶', 'noun'),
      cell('hurts', '🤕', 'verb'),
      cell('itchy', '🦟', 'descriptor'),
      cell('medicine', '💊', 'noun'),
      cell('toilet', '🚽', 'noun'),
      cell('break', '⏸️', 'noun'),
      cell('quiet', '🤫', 'descriptor'),
    ]),
    board('chat', 'Chat', [
      cell('hello', '👋', 'social'),
      cell('goodbye', '🚪', 'social'),
      cell('how are you?', '🙂', 'social'),
      cell("I'm fine", '👌', 'social'),
      cell('nice to meet you', '🤝', 'social'),
      cell('my name is', '📛', 'social'),
      cell('sorry', '😔', 'social'),
      cell('excuse me', '🙋', 'social'),
      cell('wait', '⏳', 'social'),
      cell('I don’t know', '🤷', 'social'),
      cell('I love you', '❤️', 'social'),
      cell('good job', '🌟', 'social'),
      cell('that’s funny', '😂', 'social'),
      cell('again', '🔁', 'social'),
      cell('my turn', '☝️', 'social'),
      cell('your turn', '👉', 'social'),
    ]),
    board('questions', 'Questions', [
      cell('who', '🧑', 'question'),
      cell('what', '❓', 'question'),
      cell('where', '🗺️', 'question'),
      cell('when', '🕒', 'question'),
      cell('why', '🤔', 'question'),
      cell('how', '🔧', 'question'),
      cell('which', '🔀', 'question'),
      cell('can I', '🙋', 'question'),
      cell('can you', '👉', 'question'),
      cell('is it', '❔', 'question'),
      cell('what time is it?', '⏰', 'question'),
      cell('what is that?', '👆', 'question'),
      cell('where are we going?', '🧭', 'question'),
      cell('can I have', '🤲', 'question'),
      cell('what’s next?', '⏭️', 'question'),
      cell('are you okay?', '🫶', 'question'),
    ]),
  ]
  return Object.fromEntries(boards.map((b) => [b.id, b]))
}

export const DEFAULT_SETTINGS: Settings = {
  columns: 8,
  speakOnTap: true,
  returnHomeAfterSelect: false,
  voiceURI: null,
  rate: 1,
  pitch: 1,
  showLabels: true,
  requireEditCheck: true,
  voiceMatching: true,
  matchSensitivity: 0.5,
  learnFromChoices: true,
  showMatchDetails: false,
  multiWord: true,
  showHomeAddButton: true,
}

export const DATA_VERSION = 1

export function createDefaultData(): AppData {
  return {
    version: DATA_VERSION,
    homeBoardId: 'home',
    boards: createDefaultBoards(),
    settings: { ...DEFAULT_SETTINGS },
  }
}
