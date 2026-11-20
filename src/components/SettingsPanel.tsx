import { useRef, useState } from 'react'
import { createDefaultData } from '../data/defaultBoards'
import { getAllClips, type AudioClip } from '../lib/audioClips'
import { exportData, importData } from '../lib/storage'
import { speak, speechSupported, useVoices } from '../lib/speech'
import type { AppData, Settings } from '../types'
import { Modal } from './Modal'

interface Props {
  data: AppData
  onChange: (settings: Partial<Settings>) => void
  /** clips: recordings to restore, [] to delete all, null to keep existing ones. */
  onReplaceData: (data: AppData, clips: AudioClip[] | null) => void
  onClose: () => void
}

function sensitivityLabel(s: number) {
  if (s <= 0.2) return 'Strict'
  if (s < 0.4) return 'Fairly strict'
  if (s <= 0.6) return 'Balanced'
  if (s < 0.8) return 'Fairly lenient'
  return 'Lenient'
}

export function SettingsPanel({ data, onChange, onReplaceData, onClose }: Props) {
  const { settings } = data
  const voices = useVoices()
  const fileInput = useRef<HTMLInputElement>(null)
  const [status, setStatus] = useState<string | null>(null)

  const download = async () => {
    let blob: Blob
    try {
      blob = await exportData(data, await getAllClips())
    } catch {
      setStatus('Export failed.')
      return
    }
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `aac-boards-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  const upload = async (file: File | undefined) => {
    if (!file) return
    try {
      const backup = await importData(file)
      onReplaceData(backup.data, backup.clips)
      setStatus('Boards imported.')
    } catch (e) {
      setStatus(e instanceof Error ? e.message : 'Import failed.')
    }
  }

  return (
    <Modal title="Settings" onClose={onClose}>
      <div className="form">
        <h3>Edit lock</h3>
        <label className="check">
          <input
            type="checkbox"
            checked={settings.requireEditCheck}
            onChange={(e) => onChange({ requireEditCheck: e.target.checked })}
          />
          Ask a math question before editing
        </label>
        <p className="hint">
          Turn this off to go straight into editing when Edit is tapped.
        </p>

        <h3>Layout</h3>
        <label>
          Buttons per row: <strong>{settings.columns}</strong>
          <input
            type="range"
            min={3}
            max={12}
            value={settings.columns}
            onChange={(e) => onChange({ columns: Number(e.target.value) })}
          />
        </label>
        <label className="check">
          <input
            type="checkbox"
            checked={settings.showLabels}
            onChange={(e) => onChange({ showLabels: e.target.checked })}
          />
          Show word labels under symbols
        </label>
        <label className="check">
          <input
            type="checkbox"
            checked={settings.returnHomeAfterSelect}
            onChange={(e) => onChange({ returnHomeAfterSelect: e.target.checked })}
          />
          Go back to Home after choosing a word from a folder
        </label>


        <h3>Voice</h3>
        {!speechSupported() && (
          <p className="error">This browser does not support text-to-speech.</p>
        )}
        <label className="check">
          <input
            type="checkbox"
            checked={settings.speakOnTap}
            onChange={(e) => onChange({ speakOnTap: e.target.checked })}
          />
          Say each word when it is tapped
        </label>
        <label>
          Voice
          <select
            value={settings.voiceURI ?? ''}
            onChange={(e) => onChange({ voiceURI: e.target.value || null })}
          >
            <option value="">System default</option>
            {voices.map((v) => (
              <option key={v.voiceURI} value={v.voiceURI}>
                {v.name} ({v.lang})
              </option>
            ))}
          </select>
        </label>
        <label>
          Speed: <strong>{settings.rate.toFixed(1)}×</strong>
          <input
            type="range"
            min={0.5}
            max={2}
            step={0.1}
            value={settings.rate}
            onChange={(e) => onChange({ rate: Number(e.target.value) })}
          />
        </label>
        <label>
          Pitch: <strong>{settings.pitch.toFixed(1)}</strong>
          <input
            type="range"
            min={0.5}
            max={2}
            step={0.1}
            value={settings.pitch}
            onChange={(e) => onChange({ pitch: Number(e.target.value) })}
          />
        </label>
        <div className="row">
          <button
            type="button"
            className="btn"
            onClick={() => speak('Hello! This is my voice.', settings)}
          >
            🔊 Test voice
          </button>
        </div>

        <h3>Voice matching</h3>
        <p className="hint">
          Say a word and the app picks the button whose voice recordings match. Record your
          voice on buttons in the button editor. Matching happens only on this device.
        </p>
        <label className="check">
          <input
            type="checkbox"
            checked={settings.voiceMatching}
            onChange={(e) => onChange({ voiceMatching: e.target.checked })}
          />
          Show the Listen button
        </label>
        <label>
          Matching: <strong>{sensitivityLabel(settings.matchSensitivity)}</strong>
          <input
            type="range"
            min={0}
            max={1}
            step={0.1}
            value={settings.matchSensitivity}
            onChange={(e) => onChange({ matchSensitivity: Number(e.target.value) })}
            aria-describedby="sensitivity-hint"
          />
          <small id="sensitivity-hint">
            Stricter asks “Did you mean…?” more often; more lenient picks a button more readily
            but makes more mistakes.
          </small>
        </label>
        <label className="check">
          <input
            type="checkbox"
            checked={settings.learnFromChoices}
            onChange={(e) => onChange({ learnFromChoices: e.target.checked })}
          />
          Learn from my “Did you mean…?” choices
        </label>
        <p className="hint">
          When you pick a button there, what you said is saved as an extra recording for it
          (up to 3 per button), so matching improves with use. They appear in the button editor.
        </p>
        <label className="check">
          <input
            type="checkbox"
            checked={settings.showMatchDetails}
            onChange={(e) => onChange({ showMatchDetails: e.target.checked })}
          />
          Show matching details (scores, for troubleshooting)
        </label>

        <h3>Backup</h3>
        <p className="hint">
          Boards and voice recordings are saved only on this device. Export a backup to move them to another device.
        </p>
        <div className="row">
          <button type="button" className="btn" onClick={download}>
            Export boards
          </button>
          <button type="button" className="btn" onClick={() => fileInput.current?.click()}>
            Import boards
          </button>
          <input
            ref={fileInput}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={(e) => upload(e.target.files?.[0])}
          />
          <button
            type="button"
            className="btn danger"
            onClick={() => {
              if (confirm('Reset all boards, settings and voice recordings to the defaults? Your changes will be lost.')) {
                onReplaceData(createDefaultData(), [])
                setStatus('Reset to defaults.')
              }
            }}
          >
            Reset to defaults
          </button>
        </div>
        {status && <p role="status">{status}</p>}
      </div>
    </Modal>
  )
}
