import { useCallback, useEffect, useRef, useState } from 'react'
import { Check, Download, Play, Stop, TextToSpeech, Trash } from '@openai/apps-sdk-ui/components/Icon'
import { VOICE_ICON_DATA_URL } from './icon-data.js'
import { synthesizeLocally } from './local-speech.js'
import {
  listClones, saveClone, loadCloneSamples, removeClone, engineIdForLanguage,
  activeClonePointer, setActiveClone, clearActiveClone,
} from './clones.js'

const SPEECH = 'media.speech'
const SPEECH_MODELS = 'device.speech-models'
const MICROPHONE = 'media.microphone.capture'
const PREVIEW_TEXT = Object.freeze({
  English: 'The morning begins quietly. After a brief pause, the city wakes — slowly, then all at once.',
  German: 'Der Morgen beginnt ganz leise. Nach einer kurzen Pause erwacht die Stadt — langsam, dann plötzlich überall.',
  Italian: 'Il mattino comincia in silenzio. Dopo una breve pausa, la città si sveglia — lentamente, poi tutta insieme.',
  Portuguese: 'A manhã começa em silêncio. Depois de uma breve pausa, a cidade acorda — devagar, e depois por inteiro.',
  Spanish: 'La mañana comienza en silencio. Después de una breve pausa, la ciudad despierta — despacio, y luego de golpe.',
})
const CLONE_PROMPTS = Object.freeze({
  English: 'Today I called a good friend, walked home through the green garden, and made warm coffee for us.',
  German: 'Heute rufe ich einen guten Freund an, gehe durch den grünen Garten nach Hause und mache uns warmen Kaffee.',
  Italian: 'Oggi chiamo un buon amico, torno a casa attraverso il giardino verde e preparo un caffè caldo per noi.',
  Portuguese: 'Hoje ligo para um bom amigo, volto para casa pelo jardim verde e preparo um café quente para nós.',
  Spanish: 'Hoy llamo a un buen amigo, vuelvo a casa por el jardín verde y preparo un café caliente para los dos.',
})
const voiceSampleUrl = (appId, model) => (
  `/app-assets/by-id/${encodeURIComponent(String(appId))}/voice-samples/${model.id}.wav`
)

const CSS = `
/* mobius-ui:Root v1 — keep in sync; library candidate. Diverge below the marker only. */
.vc-root {
  position: relative; display: flex; flex-direction: column; height: 100%; width: 100%; max-width: 100%;
  overflow: hidden; background: var(--bg); color: var(--text); font-family: 'Inter Fallback', system-ui, -apple-system, sans-serif;
  -webkit-font-smoothing: antialiased;
}
.vc-scroll {
  flex: 1; min-height: 0; overflow-y: auto; overflow-x: hidden;
  padding: 18px 16px max(30px, env(safe-area-inset-bottom)); word-break: break-word; overflow-wrap: anywhere;
}
/* /mobius-ui:Root */

/* mobius-ui:Header v1 — keep in sync; library candidate. Diverge below the marker only. */
.vc-header {
  flex: 0 0 auto; min-height: 48px; background: var(--bg);
}
.vc-header-inner { width: 100%; max-width: 712px; margin-inline: auto; display: flex; align-items: center;
  justify-content: space-between; gap: 12px; padding: max(12px, env(safe-area-inset-top)) 16px 12px; }
.vc-brand { display: flex; align-items: center; gap: 11px; min-width: 0; }
.vc-mark {
  flex: 0 0 auto; width: 38px; height: 38px; border-radius: 10px;
  display: flex; align-items: center; justify-content: center;
  overflow: hidden; color: var(--accent);
}
.vc-mark img { width: 100%; height: 100%; object-fit: contain; }
.vc-brand-text { min-width: 0; line-height: 1.15; }
.vc-title { margin: 0; font-size: 18px; font-weight: 700; letter-spacing: -0.015em; }
.vc-subtitle {
  display: block; margin-top: 2px; font-size: 12px; font-weight: 500; color: var(--muted);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.vc-header-right { display: flex; align-items: center; gap: 8px; flex: 0 0 auto; }
/* /mobius-ui:Header */

.vc-page { width: 100%; max-width: 680px; margin: 0 auto; display: flex; flex-direction: column; gap: 14px; }
.vc-library-head { display: flex; align-items: end; justify-content: space-between; gap: 16px; padding: 2px 2px 4px; }
.vc-library-head h2 { margin: 2px 0 0; font-size: 24px; line-height: 1.1; letter-spacing: -.025em; }
.vc-count { flex: 0 0 auto; color: var(--muted); font-size: 12px; font-weight: 600; }
.vc-languages { display: flex; gap: 7px; overflow-x: auto; padding: 0 1px 2px; scrollbar-width: none; }
.vc-languages::-webkit-scrollbar { display: none; }
.vc-language {
  flex: 0 0 auto; min-height: 44px; padding: 8px 12px; border: 1px solid var(--border); border-radius: 999px;
  background: var(--surface); color: var(--muted); font: inherit; font-size: 13px; font-weight: 650; cursor: pointer;
}
.vc-language[aria-pressed="true"] { background: var(--accent); border-color: var(--accent); color: var(--accent-fg); }
.vc-language:disabled { cursor: default; opacity: .58; }
.vc-language:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.vc-step { display: flex; flex-direction: column; gap: 8px; }
.vc-step-head { display: flex; align-items: center; gap: 9px; padding: 2px 2px 0; }
.vc-step-number {
  flex: 0 0 auto; width: 23px; height: 23px; display: grid; place-items: center; border-radius: 50%;
  background: color-mix(in srgb, var(--accent) 14%, transparent); color: var(--accent); font-size: 12px; font-weight: 750;
}
.vc-step-copy { min-width: 0; }
.vc-step-title { margin: 0; font-size: 14px; font-weight: 720; line-height: 1.25; }
.vc-step-sub { margin: 1px 0 0; color: var(--muted); font-size: 11px; line-height: 1.4; }
.vc-voice-picker { display: flex; flex-direction: column; gap: 10px; }
.vc-voice-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
.vc-voice-option {
  display: flex; align-items: center; justify-content: space-between; gap: 10px;
  min-height: 60px; padding: 5px; border: 1px solid var(--border); border-radius: 11px;
  background: var(--surface); color: var(--text);
}
.vc-voice-option:hover { border-color: color-mix(in srgb, var(--accent) 42%, var(--border)); }
.vc-voice-option.is-selected {
  border-color: color-mix(in srgb, var(--accent) 62%, var(--border));
  background: color-mix(in srgb, var(--accent) 9%, var(--surface));
}
.vc-voice-choice {
  flex: 1; min-width: 0; align-self: stretch; display: flex; align-items: center; justify-content: space-between; gap: 8px;
  padding: 5px 4px 5px 6px; border: 0; background: transparent; color: inherit; text-align: left; font: inherit; cursor: pointer;
}
.vc-voice-choice:focus-visible, .vc-sample-btn:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }
.vc-voice-choice:disabled, .vc-sample-btn:disabled { cursor: default; opacity: .58; }
.vc-voice-name { display: block; font-size: 14px; font-weight: 720; }
.vc-voice-meta { display: block; margin-top: 3px; color: var(--muted); font-size: 10.5px; }
.vc-voice-action { flex: 0 0 auto; color: var(--accent); font-size: 11px; font-weight: 750; }
.vc-voice-option.is-selected .vc-voice-action { color: var(--green); }
.vc-sample-btn {
  flex: 0 0 44px; width: 44px; height: 44px; display: grid; place-items: center;
  border: 1px solid var(--border); border-radius: 50%; background: var(--bg); color: var(--accent); cursor: pointer;
}
.vc-sample-btn svg { width: 15px; height: 15px; }
.vc-voice-controls { flex: 0 0 auto; display: flex; align-items: center; gap: 4px; }
.vc-remove-btn { color: var(--muted); }
.vc-remove-btn:hover { color: var(--danger); border-color: color-mix(in srgb, var(--danger) 45%, var(--border)); }
.vc-clone-setup { margin-top: 2px; }
.vc-record-status { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-top: 9px; color: var(--muted); font-size: 11px; }
.vc-read-prompt {
  margin-top: 11px; padding: 11px 12px; border-radius: 10px;
  background: var(--bg); border: 1px solid var(--border); color: var(--text);
}
.vc-read-prompt strong { display: block; margin-bottom: 5px; color: var(--accent); font-size: 11px; }
.vc-read-prompt p { margin: 0; font-size: 13px; line-height: 1.5; }

/* mobius-ui:Card v1 — keep in sync; library candidate. Diverge below the marker only. */
.vc-card {
  display: flex; align-items: center; gap: 14px; width: 100%; min-height: 44px; padding: 16px;
  background: var(--surface); color: var(--text); border: 1px solid var(--border); border-radius: 12px;
}
.vc-card.is-selected { background: color-mix(in srgb, var(--accent) 8%, var(--surface)); border-color: color-mix(in srgb, var(--accent) 42%, var(--border)); }
.vc-card-main { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 3px; }
.vc-card-title { font-size: 16px; font-weight: 700; letter-spacing: -0.01em; }
.vc-card-sub { font-size: 12px; font-weight: 500; line-height: 1.45; color: var(--muted); }
.vc-card-chevron { flex: 0 0 auto; font-size: 20px; line-height: 1; color: var(--muted); opacity: 0.7; }
/* /mobius-ui:Card */

.vc-model { align-items: flex-start; }
.vc-model-icon {
  flex: 0 0 auto; width: 42px; height: 42px; display: grid; place-items: center; border-radius: 12px;
  background: color-mix(in srgb, var(--accent) 13%, transparent); color: var(--accent);
}
.vc-model-icon svg { width: 21px; height: 21px; }
.vc-badge {
  display: inline-flex; align-items: center; gap: 5px; align-self: flex-start; margin-top: 7px; padding: 4px 8px;
  border-radius: 999px; background: color-mix(in srgb, var(--green) 13%, transparent); color: var(--green);
  font-size: 11px; font-weight: 700;
}
.vc-badge svg { width: 12px; height: 12px; }
.vc-actions { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 12px; }
.vc-progress { height: 5px; margin-top: 12px; overflow: hidden; border-radius: 99px; background: var(--surface2); }
.vc-progress span { display: block; height: 100%; border-radius: inherit; background: var(--accent); transition: width .2s ease; }
.vc-error { padding: 12px 14px; border: 1px solid color-mix(in srgb, var(--danger) 55%, var(--border)); border-radius: 10px; color: var(--danger); font-size: 13px; line-height: 1.45; cursor: text; user-select: text; -webkit-user-select: text; }
.vc-level { height: 5px; margin-top: 10px; overflow: hidden; border-radius: 99px; background: var(--surface2); }
.vc-level span { display: block; height: 100%; border-radius: inherit; background: var(--danger); transition: width .08s linear; }
.vc-recording { color: var(--danger); }

.vc-preview { align-items: stretch; flex-direction: column; }
.vc-preview-head { display: flex; align-items: center; gap: 10px; }
.vc-preview-copy { flex: 1; }
.vc-preview-copy strong { display: block; font-size: 15px; }
.vc-preview-copy span { display: block; margin-top: 2px; color: var(--muted); font-size: 12px; }

/* mobius-ui:Input v1 — keep in sync; library candidate. Diverge below the marker only. */
.vc-input, .vc-textarea {
  display: block; width: 100%; box-sizing: border-box; min-height: 44px; padding: 11px 12px;
  background: var(--bg); color: var(--text); border: 1px solid var(--border); border-radius: 8px; outline: none;
  font-family: inherit; font-size: 16px; line-height: 1.5; transition: border-color .15s ease, box-shadow .15s ease;
}
.vc-input::placeholder, .vc-textarea::placeholder { color: var(--muted); }
.vc-input:focus, .vc-textarea:focus { border-color: var(--accent); box-shadow: 0 0 0 1px var(--accent); }
.vc-textarea { min-height: 106px; resize: vertical; }
/* /mobius-ui:Input */

/* mobius-ui:Button v1 — keep in sync; library candidate. Diverge below the marker only. */
.vc-btn {
  display: inline-flex; align-items: center; justify-content: center; gap: 6px; min-height: 44px; padding: 10px 16px;
  border-radius: 10px; border: 1px solid var(--border); background: var(--surface); color: var(--text);
  font-family: inherit; font-size: 14px; font-weight: 600; cursor: pointer; white-space: nowrap;
  transition: background .14s ease, border-color .14s ease, transform .1s ease;
}
.vc-btn svg { width: 17px; height: 17px; }
.vc-btn:active { transform: scale(.97); }
.vc-btn:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.vc-btn:disabled { opacity: .5; cursor: default; transform: none; }
.vc-btn-primary { background: var(--accent); border-color: var(--accent); color: var(--accent-fg); }
.vc-btn-primary:hover { filter: brightness(1.06); }
.vc-btn-danger { background: var(--danger); border-color: var(--danger); color: white; }
.vc-btn-danger:hover { filter: brightness(1.06); }
.vc-btn-secondary { background: var(--surface2, var(--surface)); }
.vc-btn-secondary:hover { border-color: color-mix(in srgb, var(--accent) 40%, var(--border)); }
/* /mobius-ui:Button */

.vc-note { display: flex; gap: 10px; padding: 13px 14px; border: 1px solid var(--border); border-radius: 10px; background: var(--surface); color: var(--muted); font-size: 12px; line-height: 1.5; }
.vc-note::before { content: ''; flex: 0 0 auto; width: 7px; height: 7px; margin-top: 5px; border-radius: 50%; background: var(--green); }

/* mobius-ui:ReducedMotion v1 — keep in sync; library candidate. Diverge below the marker only. */
@media (prefers-reduced-motion: reduce) {
  .vc-btn, .vc-progress span, .vc-level span { transition: none; }
  .vc-btn:active { transform: none; }
}
/* /mobius-ui:ReducedMotion */
@media (max-width: 520px) {
  .vc-voice-grid { grid-template-columns: 1fr; }
}
`

function capabilities() {
  return globalThis.window?.mobius?.capabilities || globalThis.mobius?.capabilities
}

function bytesLabel(bytes) {
  return `${Math.round((Number(bytes) || 0) / 1024 / 1024)} MB`
}

function modelStatus(model, activeModelId, engineReady) {
  if (!engineReady && model.profileState === 'ready') return 'Voice saved · language needed'
  if (model.profileState === 'ready' && model.id === activeModelId) return 'Selected'
  if (model.profileState === 'ready') return 'Downloaded'
  if (model.profileState === 'partial') return 'Resume'
  return 'Not downloaded'
}

function engineStatus(engine) {
  if (engine.state === 'ready') return 'Downloaded'
  if (engine.state === 'partial') return 'Resume'
  return 'Not downloaded'
}

export default function VoiceApp({ appId }) {
  const [catalog, setCatalog] = useState({
    activeModelId: '', engines: [], models: [],
  })
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState('')
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState('')
  const [language, setLanguage] = useState('English')
  const [previews, setPreviews] = useState(() => ({ ...PREVIEW_TEXT }))
  const [speaking, setSpeaking] = useState('')
  const [cloneOpen, setCloneOpen] = useState(false)
  const [recording, setRecording] = useState(false)
  const [recordingPending, setRecordingPending] = useState(false)
  const [recordingLevel, setRecordingLevel] = useState(0)
  const [recordingMs, setRecordingMs] = useState(0)
  const [confirmCloneDelete, setConfirmCloneDelete] = useState(false)
  const [serverClones, setServerClones] = useState([])
  const [activeCloneId, setActiveCloneId] = useState('')
  const speechSessionRef = useRef(null)
  const sampleAudioRef = useRef(null)
  const recordingSessionRef = useRef(null)
  const audioContextRef = useRef(null)
  const sourcesRef = useRef(new Set())
  const nextAtRef = useRef(0)

  const refresh = useCallback(async () => {
    try {
      const value = await capabilities().invoke(SPEECH_MODELS, { operation: 'catalog' })
      setCatalog(value)
      setError('')
    } catch (caught) {
      setError(caught?.message || 'Voice is unavailable in this version of Möbius.')
    } finally { setLoading(false) }
  }, [])

  const reloadClones = useCallback(async () => {
    try {
      const [items, active] = await Promise.all([
        listClones(),
        activeClonePointer().catch(() => null),
      ])
      setServerClones(items)
      setActiveCloneId(active?.id || '')
    } catch {
      setServerClones([])
      setActiveCloneId('')
    }
  }, [])

  useEffect(() => { refresh() }, [refresh])
  useEffect(() => { reloadClones() }, [reloadClones])

  // Once per load, bring the active cloned voice onto this device's shared
  // engine so News and the chat agent read in it here too. The recording is
  // pulled from this instance; nothing happens until its language is downloaded.
  const hydratedRef = useRef(false)
  useEffect(() => {
    if (hydratedRef.current || loading || !catalog.engines.length || !activeCloneId) return
    const record = serverClones.find((item) => item.id === activeCloneId)
    if (!record) return
    const engineForLang = catalog.engines.find((item) => item.languages.includes(record.language))
    if (engineForLang?.state !== 'ready') return
    const shellActiveIsClone = catalog.models.some((model) => (
      model.cloned && model.language === record.language && model.id === catalog.activeModelId
    ))
    hydratedRef.current = true
    async function hydrateClone() {
      try {
        // Validate the instance-owned recording even when this device already
        // has its mirror selected, so an old silent clone cannot remain active.
        if (shellActiveIsClone) await loadCloneSamples(record.id)
        else await pushActiveCloneToShell(record)
      } catch (caught) {
        if (caught?.code === 'silent_recording') {
          await clearActiveClone().catch(() => {})
          setActiveCloneId('')
        }
        setError(caught?.message || 'That cloned voice could not be loaded.')
      }
    }
    hydrateClone()
  }, [loading, catalog, serverClones, activeCloneId])

  const stopPreview = useCallback(() => {
    speechSessionRef.current?.cancel()
    speechSessionRef.current = null
    const sample = sampleAudioRef.current
    sampleAudioRef.current = null
    if (sample) {
      sample.pause()
      sample.removeAttribute('src')
      sample.load()
    }
    for (const source of sourcesRef.current) {
      try { source.stop() } catch {}
    }
    sourcesRef.current.clear()
    const context = audioContextRef.current
    audioContextRef.current = null
    if (context && context.state !== 'closed') context.close().catch(() => {})
    try { if (globalThis.navigator?.audioSession) globalThis.navigator.audioSession.type = 'auto' } catch {}
    nextAtRef.current = 0
    setSpeaking('')
  }, [])

  useEffect(() => () => {
    stopPreview()
    recordingSessionRef.current?.cancel()
  }, [stopPreview])

  useEffect(() => {
    if (!recording) {
      setRecordingMs(0)
      return undefined
    }
    const startedAt = performance.now()
    const timer = setInterval(() => setRecordingMs(Math.min(8000, performance.now() - startedAt)), 100)
    return () => clearInterval(timer)
  }, [recording])

  const download = async ({ busyId, input, totalBytes, errorMessage }) => {
    setBusy(busyId)
    setProgress(0)
    setError('')
    const session = capabilities().open(SPEECH_MODELS, input)
    const unsubscribe = session.on('progress', (value) => {
      const downloaded = Number(value?.downloadedBytes) || 0
      const total = Number(value?.totalBytes) || totalBytes
      setProgress(Math.max(1, Math.min(100, Math.round(downloaded / total * 100))))
    })
    try {
      await session.result
      await refresh()
      return true
    } catch (caught) {
      setError(caught?.message || errorMessage)
      return false
    } finally {
      unsubscribe()
      setBusy('')
      setProgress(0)
    }
  }

  const installEngine = (engine) => download({
    busyId: engine.id,
    input: { operation: 'install-engine', engineId: engine.id },
    totalBytes: engine.storedBytes,
    errorMessage: 'The speech model could not be downloaded on this device.',
  })

  const installProfile = async (model, { selectAfter = true } = {}) => {
    const installed = await download({
      busyId: model.id,
      input: { operation: 'install-profile', modelId: model.id },
      totalBytes: model.profileBytes,
      errorMessage: 'The voice could not be downloaded on this device.',
    })
    if (installed && selectAfter) await select(model)
    return installed
  }

  const select = async (model) => {
    setBusy(model.id)
    setError('')
    try {
      await capabilities().invoke(SPEECH_MODELS, { operation: 'select', modelId: model.id })
      // Choosing a built-in voice stands down any active clone.
      if (activeCloneId) {
        await clearActiveClone().catch(() => {})
        setActiveCloneId('')
      }
      await refresh()
    } catch (caught) {
      setError(caught?.message || 'The voice could not be selected.')
    } finally { setBusy('') }
  }

  // Synthesis runs in this frame rather than through the shell: an app frame's
  // policy permits WebAssembly, and the shell's has not always done so. Same
  // worker, same downloaded model — only the frame differs. A built-in voice
  // streams by modelId; a cloned voice streams the bare language engine and
  // brings its own recording (loaded from this instance's storage).
  const runSynthesis = async ({ speakingId, sampleRate = 24_000, makeSession }) => {
    stopPreview()
    const AudioContext = globalThis.AudioContext || globalThis.webkitAudioContext
    if (!AudioContext) {
      setError('This browser cannot play generated speech.')
      return
    }
    const context = new AudioContext()
    audioContextRef.current = context
    try {
      await context.resume()
      if (context.state !== 'running') {
        throw new Error('This browser did not allow audio playback to start.')
      }
    } catch (caught) {
      if (audioContextRef.current === context) stopPreview()
      setError(caught?.message || 'This browser did not allow audio playback to start.')
      return
    }
    // Use the native Web Audio output directly. A detached MediaStream feeding
    // a hidden <audio> element adds a second autoplay gate and can leave a
    // successful synthesis with no audible destination.
    try { if (globalThis.navigator?.audioSession) globalThis.navigator.audioSession.type = 'playback' } catch {}
    const output = context.destination
    nextAtRef.current = context.currentTime + .12
    const queueSamples = (samples) => {
      if (!(samples instanceof Float32Array) || !samples.length || audioContextRef.current !== context) return
      const buffer = context.createBuffer(1, samples.length, sampleRate)
      buffer.copyToChannel(samples, 0)
      const source = context.createBufferSource()
      source.buffer = buffer
      source.connect(output)
      sourcesRef.current.add(source)
      source.onended = () => sourcesRef.current.delete(source)
      const startAt = Math.max(nextAtRef.current, context.currentTime + .08)
      nextAtRef.current = startAt + buffer.duration
      source.start(startAt)
    }
    if (audioContextRef.current !== context) return
    let session
    try {
      // Start the AudioContext from the button gesture before any asynchronous
      // storage read. Clone recordings live on the instance, so loading one
      // first can otherwise make the browser reject the later audio start.
      session = await makeSession(queueSamples)
    } catch (caught) {
      if (audioContextRef.current === context) stopPreview()
      setError(caught?.message || 'The voice preview could not start.')
      return
    }
    if (audioContextRef.current !== context) {
      session?.cancel?.()
      return
    }
    speechSessionRef.current = session
    setSpeaking(speakingId)
    setError('')
    try {
      await session.result
      const remaining = Math.max(0, nextAtRef.current - context.currentTime) * 1000
      await new Promise((resolve) => setTimeout(resolve, remaining + 40))
    } catch (caught) {
      if (caught?.name !== 'AbortError' && caught?.code !== 'aborted') {
        setError(caught?.message || 'The voice preview stopped.')
      }
    } finally {
      if (speechSessionRef.current === session) stopPreview()
    }
  }

  const startPreview = (model, text = preview) => runSynthesis({
    speakingId: model.id,
    sampleRate: model.sampleRate || 24_000,
    makeSession: (onAudio) => synthesizeLocally({ capabilities, modelId: model.id, text, onAudio }),
  })

  const previewClone = (record, text = preview) => runSynthesis({
    speakingId: record.id,
    sampleRate: 24_000,
    makeSession: async (onAudio) => {
      const samples = await loadCloneSamples(record.id)
      return synthesizeLocally({
        capabilities,
        engineId: engineIdForLanguage(record.language),
        clonedVoiceSamples: samples,
        text,
        onAudio,
      })
    },
  })

  const startVoiceSample = async (model) => {
    if (speaking === model.id) {
      stopPreview()
      return
    }
    stopPreview()
    const sample = new Audio(voiceSampleUrl(appId, model))
    sampleAudioRef.current = sample
    sample.onended = () => {
      if (sampleAudioRef.current === sample) stopPreview()
    }
    sample.onerror = () => {
      if (sampleAudioRef.current !== sample) return
      stopPreview()
      setError('This voice sample could not be played.')
    }
    setSpeaking(model.id)
    setError('')
    try {
      await sample.play()
    } catch (caught) {
      if (sampleAudioRef.current === sample) {
        stopPreview()
        setError(caught?.message || 'This browser blocked the voice sample.')
      }
    }
  }

  const chooseModel = async (model) => {
    if (model.profileState === 'ready') await select(model)
    else await installProfile(model)
  }

  const removeModel = async (model) => {
    stopPreview()
    setBusy(model.id)
    setError('')
    try {
      await capabilities().invoke(SPEECH_MODELS, { operation: 'remove', modelId: model.id })
      await refresh()
      setConfirmCloneDelete(false)
    } catch (caught) {
      setError(caught?.message || 'The voice download could not be removed.')
    } finally { setBusy('') }
  }

  const removeEngine = async (item) => {
    stopPreview()
    setCloneOpen(false)
    setBusy(item.id)
    setError('')
    try {
      await capabilities().invoke(SPEECH_MODELS, { operation: 'remove-engine', engineId: item.id })
      await refresh()
    } catch (caught) {
      setError(caught?.message || 'The language download could not be removed.')
    } finally { setBusy('') }
  }

  // Mirror the selected clone into THIS device's shared engine so News and the
  // chat agent read in it. The recording is loaded from this instance, so the
  // same voice is available on any device once Voice has opened there — the
  // durable copy lives on the server; the shell holds a per-device active copy.
  const pushActiveCloneToShell = async (record) => {
    const samples = await loadCloneSamples(record.id)
    const saved = await capabilities().invoke(SPEECH_MODELS, {
      operation: 'save-clone',
      language: record.language,
      name: record.name || 'My voice',
      samples,
      sampleRate: 24_000,
    })
    if (saved?.id) {
      await capabilities().invoke(SPEECH_MODELS, { operation: 'select', modelId: saved.id })
    }
    await refresh()
  }

  const shellCloneForLanguage = (lang) => (
    catalog.models.find((model) => model.cloned && model.language === lang) || null
  )

  // Make a cloned voice the one News and the chat agent read in. The pointer
  // lives on this instance (so every device agrees which one is active) and the
  // recording is mirrored into the shell's shared engine on this device.
  const selectClone = async (record) => {
    setBusy(record.id)
    setError('')
    try {
      await pushActiveCloneToShell(record)
      await setActiveClone(record.id)
      setActiveCloneId(record.id)
    } catch (caught) {
      setError(caught?.message || 'That voice could not be selected.')
    } finally { setBusy('') }
  }

  const deleteCloneRecord = async (record) => {
    stopPreview()
    setBusy(record.id)
    setError('')
    try {
      const shellClone = shellCloneForLanguage(record.language)
      if (shellClone) {
        await capabilities().invoke(SPEECH_MODELS, { operation: 'remove', modelId: shellClone.id }).catch(() => {})
      }
      if (activeCloneId === record.id) {
        await clearActiveClone().catch(() => {})
        setActiveCloneId('')
      }
      await removeClone(record.id)
      await Promise.all([reloadClones(), refresh()])
      setConfirmCloneDelete(false)
    } catch (caught) {
      setError(caught?.message || 'The recording could not be removed.')
    } finally { setBusy('') }
  }

  const startRecording = async () => {
    if (!engineReady) {
      setCloneOpen(false)
      setError(`Download ${language} before cloning a voice.`)
      return
    }
    if (recordingSessionRef.current) return
    stopPreview()
    setError('')
    // The browser asks for microphone permission before the capability's ready
    // promise resolves. Keep the timer stopped while that prompt is open: the
    // recording limit begins only once audio capture has actually started.
    setRecordingPending(true)
    setRecordingLevel(0)
    let session
    let unsubscribe = () => {}
    try {
      session = capabilities().open(MICROPHONE, { maxDurationMs: 8000 })
      recordingSessionRef.current = session
      unsubscribe = session.on('level', (value) => setRecordingLevel(Math.min(1, Number(value) || 0)))
      await session.ready
      setRecordingPending(false)
      setRecording(true)
      const result = await session.result
      // One clone per language: the new recording replaces the old one, and it
      // is saved to this instance so every device sees it.
      const previous = serverClones.filter((item) => item.language === language)
      const saved = await saveClone({
        name: 'My voice',
        language,
        samples: result.samples,
        sampleRate: result.sampleRate,
      })
      await Promise.all(previous.map((item) => removeClone(item.id).catch(() => {})))
      await reloadClones()
      // Recording a voice makes it the one you'll be read in.
      await selectClone(saved)
      setCloneOpen(false)
    } catch (caught) {
      if (caught?.name !== 'AbortError') setError(caught?.message || 'Your voice could not be cloned.')
    } finally {
      unsubscribe()
      if (recordingSessionRef.current === session) recordingSessionRef.current = null
      setRecordingPending(false)
      setRecording(false)
      setRecordingLevel(0)
    }
  }

  const finishRecording = () => recordingSessionRef.current?.finish()

  const active = catalog.models.find((model) => model.id === catalog.activeModelId && model.state === 'ready')
  const engine = catalog.engines.find((item) => item.languages.includes(language)) || null
  const engineReady = engine?.state === 'ready'
  const languageModels = catalog.models.filter((model) => model.language === language)
  const visibleModels = languageModels.filter((model) => !model.cloned)
  const clonedRecord = serverClones.find((item) => item.language === language) || null
  const cloneIsActive = Boolean(clonedRecord) && clonedRecord.id === activeCloneId
  const recordingInFlight = recording || recordingPending
  const downloadedCount = catalog.models.filter((model) => model.profileState === 'ready').length
  const preview = previews[language] || ''
  const clonePrompt = CLONE_PROMPTS[language] || CLONE_PROMPTS.English
  const setPreview = (value) => setPreviews((current) => ({ ...current, [language]: value }))

  const chooseLanguage = (next) => {
    recordingSessionRef.current?.cancel()
    stopPreview()
    setCloneOpen(false)
    setConfirmCloneDelete(false)
    setLanguage(next)
  }

  return (
    <div className="vc-root">
      <style>{CSS}</style>
      <header className="vc-header">
        <div className="vc-header-inner">
          <div className="vc-brand">
            <span className="vc-mark"><img src={VOICE_ICON_DATA_URL} alt="" width="38" height="38" /></span>
            <div className="vc-brand-text">
              <h1 className="vc-title">Voice</h1>
              <span className="vc-subtitle">Give your agent a voice</span>
            </div>
          </div>
          <div className="vc-header-right" />
        </div>
      </header>
      <div className="vc-scroll">
        <main className="vc-page">
          <section className="vc-library-head">
            <h2>Choose your voice</h2>
            <span className="vc-count">{downloadedCount} downloaded</span>
          </section>

          <div className="vc-languages" aria-label="Language">
            {catalog.engines.map((item) => {
              const label = item.languages[0]
              return <button className="vc-language" type="button" aria-pressed={label === language} disabled={recordingInFlight || Boolean(busy)} key={item.id} onClick={() => chooseLanguage(label)}>{label}</button>
            })}
          </div>

          {error && <div className="vc-error" role="alert">{error}</div>}
          {loading ? (
            <div className="vc-card"><div className="vc-card-main"><div className="vc-card-title">Checking this device…</div><div className="vc-card-sub">Looking for downloaded voices.</div></div></div>
          ) : <>
            <section className="vc-step" aria-labelledby="vc-step-language">
              <div className="vc-step-head">
                <span className="vc-step-number" aria-hidden="true">1</span>
                <div className="vc-step-copy"><h3 className="vc-step-title" id="vc-step-language">{engineReady ? language : `Download ${language}`}</h3><p className="vc-step-sub">One language model, shared by all its voices.</p></div>
              </div>
            {engine && (() => {
              const isBusy = busy === engine.id
              return (
                <section className="vc-card vc-model" key={engine.id}>
                  <span className="vc-model-icon" aria-hidden="true"><TextToSpeech /></span>
                  <div className="vc-card-main">
                    <div className="vc-card-title">{engine.name}</div>
                    <div className="vc-card-sub">Q8 · {bytesLabel(engine.storedBytes)} · {engineStatus(engine)}</div>
                    {engineReady && <span className="vc-badge"><Check /> Ready</span>}
                    {engine.state !== 'ready' && (
                      <div className="vc-actions">
                        <button
                          className="vc-btn vc-btn-primary"
                          type="button"
                          aria-label={`${engine.state === 'partial' ? 'Resume' : 'Download'} ${engine.name}, ${bytesLabel(engine.storedBytes)}`}
                          onClick={() => installEngine(engine)}
                          disabled={recordingInFlight || Boolean(busy)}
                        >
                          <Download /> {isBusy ? `Downloading ${progress || 0}%` : engine.state === 'partial' ? 'Resume' : 'Download model'}
                        </button>
                      </div>
                    )}
                    {engineReady && (
                      <div className="vc-actions">
                        <button className="vc-btn vc-btn-secondary" type="button" onClick={() => removeEngine(engine)} disabled={recordingInFlight || Boolean(busy)}>
                          <Trash /> Remove language model
                        </button>
                      </div>
                    )}
                    {isBusy && progress > 0 && <div className="vc-progress" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow={progress}><span style={{ width: `${progress}%` }} /></div>}
                  </div>
                </section>
              )
            })()}
            </section>

            <section className="vc-step" aria-labelledby="vc-step-voice">
                <div className="vc-step-head">
                  <span className="vc-step-number" aria-hidden="true">2</span>
                  <div className="vc-step-copy"><h3 className="vc-step-title" id="vc-step-voice">Choose a voice</h3><p className="vc-step-sub">Preview any voice before downloading.</p></div>
                </div>
                <div className="vc-voice-picker">
                  <div className="vc-voice-grid" role="list" aria-label={`${language} voices`}>
                    {visibleModels.map((model) => {
                      const isActive = model.state === 'ready' && model.id === catalog.activeModelId
                      const isBusy = busy === model.id
                      const action = isBusy
                        ? (model.profileState === 'ready' ? 'Selecting…' : `${progress || 0}%`)
                        : isActive
                          ? 'Selected'
                          : !engineReady ? 'Download language first'
                            : model.profileState === 'ready' ? 'Select' : 'Download'
                      return (
                        <div
                          role="listitem"
                          className={`vc-voice-option${isActive ? ' is-selected' : ''}`}
                          key={model.id}
                        >
                          <button
                            type="button"
                            className="vc-voice-choice"
                            disabled={recordingInFlight || Boolean(busy) || isActive || !engineReady}
                            onClick={() => chooseModel(model)}
                            aria-label={`${action}: ${model.voice}, ${bytesLabel(model.profileBytes)}`}
                          >
                            <span>
                              <span className="vc-voice-name">{model.voice}</span>
                              <span className="vc-voice-meta">{bytesLabel(model.profileBytes)} · {modelStatus(model, catalog.activeModelId, engineReady)}</span>
                            </span>
                            <span className="vc-voice-action">{action}</span>
                          </button>
                          <span className="vc-voice-controls">
                            {model.profileState === 'ready' && <button
                              type="button"
                              className="vc-sample-btn vc-remove-btn"
                              disabled={recordingInFlight || Boolean(busy)}
                              onClick={() => removeModel(model)}
                              aria-label={`Remove ${model.voice} download`}
                              title="Remove download"
                            ><Trash /></button>}
                            <button
                              type="button"
                              className="vc-sample-btn"
                              disabled={recordingInFlight || Boolean(busy)}
                              onClick={() => startVoiceSample(model)}
                              aria-label={speaking === model.id ? `Stop ${model.voice} sample` : `Hear ${model.voice} sample`}
                              title={speaking === model.id ? 'Stop sample' : 'Hear sample'}
                            >
                              {speaking === model.id ? <Stop /> : <Play />}
                            </button>
                          </span>
                        </div>
                      )
                    })}
                    <div
                      role="listitem"
                      className={`vc-voice-option${cloneIsActive ? ' is-selected' : ''}`}
                    >
                      <button
                        type="button"
                        className="vc-voice-choice"
                        onClick={() => clonedRecord ? (cloneIsActive ? undefined : selectClone(clonedRecord)) : setCloneOpen(true)}
                        disabled={recordingInFlight || Boolean(busy) || !engineReady || cloneIsActive}
                        aria-label={clonedRecord ? `Use ${clonedRecord.name} as your voice` : `Set up a cloned ${language} voice`}
                      >
                        <span>
                          <span className="vc-voice-name">{clonedRecord ? clonedRecord.name : 'Clone Voice'}</span>
                          <span className="vc-voice-meta">{!engineReady ? 'Download the language first' : clonedRecord ? (cloneIsActive ? 'Your voice · read everywhere' : 'Saved on your instance') : 'Record your own voice'}</span>
                        </span>
                        <span className="vc-voice-action">{cloneIsActive ? 'Selected' : clonedRecord ? 'Select' : 'Set up'}</span>
                      </button>
                      <span className="vc-voice-controls">
                        {clonedRecord && <button
                          type="button"
                          className="vc-sample-btn"
                          disabled={recordingInFlight || Boolean(busy) || !engineReady}
                          onClick={() => speaking === clonedRecord.id ? stopPreview() : previewClone(clonedRecord)}
                          aria-label={speaking === clonedRecord.id ? 'Stop cloned voice' : 'Hear cloned voice'}
                          title={speaking === clonedRecord.id ? 'Stop' : 'Hear it'}
                        >{speaking === clonedRecord.id ? <Stop /> : <Play />}</button>}
                        {clonedRecord && <button
                          type="button"
                          className="vc-sample-btn vc-remove-btn"
                          disabled={recordingInFlight || Boolean(busy)}
                          onClick={() => setConfirmCloneDelete(true)}
                          aria-label={`Delete recorded ${language} voice`}
                          title="Delete recording"
                        ><Trash /></button>}
                        <button
                          type="button"
                          className="vc-sample-btn"
                          disabled={recordingInFlight || Boolean(busy) || !engineReady}
                          onClick={() => setCloneOpen((current) => !current)}
                          aria-label={cloneOpen ? 'Close clone setup' : clonedRecord ? 'Re-clone voice' : 'Set up cloned voice'}
                          title={clonedRecord ? 'Re-clone' : 'Set up'}
                        >
                          <TextToSpeech />
                        </button>
                      </span>
                    </div>
                  </div>
                  {confirmCloneDelete && clonedRecord && <section className="vc-card vc-model" role="group" aria-labelledby="vc-delete-clone-title">
                    <div className="vc-card-main">
                      <div className="vc-card-title" id="vc-delete-clone-title">Delete your recorded {language} voice?</div>
                      <div className="vc-card-sub">This removes the recording from your instance — from every device — and cannot be undone.</div>
                      <div className="vc-actions">
                        <button className="vc-btn vc-btn-secondary" type="button" onClick={() => setConfirmCloneDelete(false)}>Keep it</button>
                        <button className="vc-btn vc-btn-danger" type="button" onClick={() => deleteCloneRecord(clonedRecord)} disabled={Boolean(busy)}><Trash /> Delete recording</button>
                      </div>
                    </div>
                  </section>}
                  {cloneOpen && engineReady && <section className="vc-card vc-model vc-clone-setup">
                    <span className="vc-model-icon" aria-hidden="true"><TextToSpeech /></span>
                    <div className="vc-card-main">
                      <div className={`vc-card-title${recording ? ' vc-recording' : ''}`}>{recording ? 'Recording…' : recordingPending ? 'Allow microphone access' : clonedRecord ? 'Re-clone Voice' : 'Set up Clone Voice'}</div>
                      <div className="vc-card-sub">Read the short script, naturally and at your usual pace.</div>
                      <div className="vc-read-prompt">
                        <strong>Say this</strong>
                        <p>{clonePrompt}</p>
                      </div>
                      <div className="vc-actions">
                        <button className={`vc-btn ${recording ? 'vc-btn-secondary' : 'vc-btn-primary'}`} type="button" onClick={recording ? finishRecording : startRecording} disabled={recordingPending}>
                          {recording ? <><Stop /> Finish</> : recordingPending ? <><TextToSpeech /> Waiting for permission…</> : <><TextToSpeech /> {clonedRecord ? 'Re-clone' : 'Record'}</>}
                        </button>
                      </div>
                      {recordingPending && <div className="vc-record-status"><span>Allow microphone access to start the 8-second recording.</span></div>}
                      {recording && <>
                        <div className="vc-record-status"><span>{(recordingMs / 1000).toFixed(1)} seconds</span><span>8 seconds max</span></div>
                        <div className="vc-progress" role="progressbar" aria-label="Recording progress" aria-valuemin="0" aria-valuemax="8000" aria-valuenow={Math.round(recordingMs)}><span style={{ width: `${recordingMs / 80}%` }} /></div>
                        <div className="vc-level" role="meter" aria-label="Microphone level" aria-valuemin="0" aria-valuemax="100" aria-valuenow={Math.round(recordingLevel * 100)}><span style={{ width: `${recordingLevel * 100}%` }} /></div>
                      </>}
                    </div>
                  </section>}
                </div>
              </section>
          </>}

          {engineReady && (
            <section className="vc-step" aria-labelledby="vc-step-example">
              <div className="vc-step-head">
                <span className="vc-step-number" aria-hidden="true">3</span>
                <div className="vc-step-copy"><h3 className="vc-step-title" id="vc-step-example">Try {language}</h3><p className="vc-step-sub">Edit the example, then hear it in the selected voice.</p></div>
              </div>
              <section className="vc-card vc-preview">
                <div className="vc-preview-head">
                  <div className="vc-preview-copy"><strong>Example</strong><span>{active?.language === language ? active.voice : 'Select a voice above'}</span></div>
                  <button
                    className={`vc-btn ${speaking === active?.id ? 'vc-btn-secondary' : 'vc-btn-primary'}`}
                    type="button"
                    aria-label={speaking === active?.id ? 'Stop voice example' : `Speak ${language} example`}
                    onClick={() => speaking === active?.id ? stopPreview() : startPreview(active)}
                    disabled={!active || active.language !== language || !preview.trim()}
                  >
                    {speaking === active?.id ? <><Stop /> Stop</> : <><Play /> Speak</>}
                  </button>
                </div>
                <textarea className="vc-textarea" value={preview} maxLength={5000} onChange={(event) => setPreview(event.target.value)} aria-label={`${language} example text`} />
              </section>
            </section>
          )}

          <div className="vc-note">Pocket TTS is a compact model that runs entirely on this device. Your text and audio are not transmitted.</div>
        </main>
      </div>
    </div>
  )
}
