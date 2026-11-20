# AAC App

An **Augmentative and Alternative Communication (AAC)** app: a grid of symbol
buttons that people tap to build sentences, which the device speaks aloud.

It is a Progressive Web App (PWA), so it runs in any modern browser and can be
installed to the home screen on iPad, Android tablets, phones, and desktops. It
works fully offline once installed.

## Features

- **Core-word home board** with high-frequency words (I, want, go, more, stop…)
  plus topic folders: Feelings, Food, People, Places, Activities, Body, Chat,
  Questions.
- **Message bar** — tap words to build a sentence, then tap the bar or
  **Speak** to say it. **Copy** puts the sentence on the clipboard as text (the
  words shown on the buttons) to paste into a text message, email or chat. Backspace and clear buttons.
- **Text-to-speech** using the device's built-in voices, with voice, speed and
  pitch settings and optional speak-on-tap.
- **Fitzgerald Key colors** so word types are easy to find (people yellow,
  actions green, describing blue, things orange, social pink, questions
  purple, negation red).
- **Customizable boards** — add, edit, reorder, and delete buttons; use an
  emoji or your own photo; link a button to another board or create a new one.
- **Voice recordings** — record up to 3 short clips (5 s each) of the user
  saying a button's word, in the button editor. They are stored only on the
  device (IndexedDB), included in backups, and are for upcoming voice matching:
  they are never played by Speak or by tapping a button.
- **Voice matching** — tap **🎤 Listen** and say a word; the app compares it
  with the buttons' recordings (on every board) and selects the matching
  button, just like tapping it. If it isn't sure it asks "Did you mean…?" with
  the closest buttons. Runs entirely on the device: MFCC speech features with
  dynamic time warping, matched against the user's own voice. Thresholds scale
  with how much the user's own recordings of a word vary, and picks from "Did
  you mean…?" are saved as extra "learned" recordings (up to 3 per button), so
  matching adapts to each person. Strictness, learning and a score display for
  troubleshooting are in Settings.
- **Edit lock** — tapping Edit asks a quick math question (a simple sum) so
  users can't change boards by accident. Turn it off in Settings → Edit lock.
- **Backup** — export/import all boards as a JSON file; everything is saved on
  the device automatically.
- Large touch targets, keyboard/switch-friendly focus, light and dark themes,
  reduced-motion support.

## Getting started

Requires Node.js 22+.

```bash
npm install
npm run dev        # start the dev server at http://localhost:5173
```

Other scripts:

| Command             | What it does                              |
| ------------------- | ----------------------------------------- |
| `npm test`          | run the test suite once (Vitest)          |
| `npm run test:watch`| run tests in watch mode                   |
| `npm run lint`      | lint with oxlint                          |
| `npm run build`     | type-check and build to `dist/`           |
| `npm run preview`   | serve the production build locally        |

To try it on a tablet, run `npm run dev -- --host` and open the printed network
URL on the device (on the same Wi-Fi). Installing as an app and offline mode
need the production build served over HTTPS.

## Live app & installing

The app is deployed to GitHub Pages by `.github/workflows/deploy-pages.yml`
on every push. The address is shown under **Settings → Pages** in the
repository (and in each deploy run's summary).

To install it, open that address and:

- **iPad / iPhone (Safari):** Share button → **Add to Home Screen**.
- **Android (Chrome):** menu ⋮ → **Install app** (or **Add to Home screen**).
- **Desktop (Chrome / Edge):** click the install icon in the address bar.

After the first visit it works offline. Updates download automatically the
next time it is opened with an internet connection.

## Project structure

```
src/
  App.tsx                 main screen: message bar, navigation, board grid
  components/             CellButton, MessageBar, CellEditor, SettingsPanel, Modal
  data/defaultBoards.ts   starter vocabulary
  state/appState.ts       reducer: message, navigation, board editing, settings
  lib/speech.ts           Web Speech API wrapper
  lib/storage.ts          localStorage persistence, import/export
  lib/audioClips.ts       voice recordings in IndexedDB, backup encoding
  lib/useRecorder.ts      microphone recording (MediaRecorder)
  lib/voice/              voice matching: features (MFCC), matcher (DTW +
                          decision thresholds), listener (end-of-speech
                          detection), feature cache for saved recordings
  types.ts                Board / Cell / Settings types
```

## Roadmap ideas

- Picture-symbol library (e.g. ARASAAC / Mulberry symbols) instead of emoji
- Word prediction and grammar helpers (plurals, verb tenses)
- Keyboard page for spelling
- Switch scanning and dwell selection for motor access
- Cloud sync between devices and caregiver accounts
- Usage logging for therapists
- Multiple languages
