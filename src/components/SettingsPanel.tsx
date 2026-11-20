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

        <label className="check">
          <input
            type="checkbox"
            checked={settings.requireEditCheck}
            onChange={(e) => onChange({ requireEditCheck: e.target.checked })}
          />
          Ask a grown-up question before editing
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
