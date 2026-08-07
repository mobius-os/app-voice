// In-frame speech synthesis.
//
// The shared engine normally runs in the Möbius shell. A document's
// Content-Security-Policy also governs every worker it spawns, and the shell's
// policy has not always permitted WebAssembly — when it does not, no amount of
// model data helps, because the engine can never compile. Mini-app frames are
// granted WebAssembly by their own policy, which is why speech worked from
// inside an app frame before it was centralised.
//
// So Voice runs the engine itself: it streams the model bytes it already owns
// through `device.speech-models`, drives the same shared worker script, and
// plays the audio locally. There is still one engine implementation and one
// downloaded model — only the frame it executes in changes.

const SPEECH_MODELS = 'device.speech-models'
const WORKER_URL = '/speech/pocket-tts-worker.js'
const WASM_URL = '/speech/pocket-tts-xn.wasm'
const LOAD_TIMEOUT_MS = 120_000

function speechError(message) {
  return new Error(message)
}

export function localSpeechSupported() {
  return typeof Worker !== 'undefined' && typeof WebAssembly !== 'undefined'
}

/**
 * Load a model into a frame-owned worker and generate speech for `text`.
 * Calls `onAudio(Float32Array)` per chunk. Returns a handle with `cancel()`.
 */
export function synthesizeLocally({
  capabilities, modelId, engineId, clonedVoiceSamples, text, onAudio, onProgress,
}) {
  // This frame is a sandboxed, opaque origin: it cannot construct a Worker from
  // a URL, because that URL is never same-origin with an opaque document. The
  // script is fetched and wrapped in a Blob instead, which the frame's policy
  // permits. The Wasm binary is then passed as an absolute URL, since a blob:
  // worker has no base to resolve a relative one against.
  const workerUrl = new URL(WORKER_URL, globalThis.location.href).href
  const wasmUrl = new URL(WASM_URL, globalThis.location.href).href
  let worker = null
  let settle
  let fail
  const result = new Promise((resolve, reject) => { settle = resolve; fail = reject })
  let session = null
  let done = false

  let blobUrl = ''
  const stop = () => {
    if (done) return
    done = true
    try { session?.cancel?.() } catch { /* already closed */ }
    try { worker?.terminate() } catch { /* already gone */ }
    if (blobUrl) { URL.revokeObjectURL(blobUrl); blobUrl = '' }
  }

  const rejectWith = (error) => {
    if (done) return
    stop()
    fail(error)
  }

  const timer = setTimeout(
    () => rejectWith(speechError('The speech engine took too long to start.')),
    LOAD_TIMEOUT_MS,
  )

  const attach = () => {
    worker.onerror = (event) => rejectWith(speechError(
      event?.message || `The speech engine could not start: ${WORKER_URL} did not load.`,
    ))
    worker.onmessage = ({ data }) => handleMessage(data)
  }

  function handleMessage(data) {
    if (!data || done) return
    if (data.type === 'load-ready') {
      // The worker has compiled the engine and reserved the model's buffer.
      // Only now may the bytes start arriving.
      session?.control?.('start')
      return
    }
    if (data.type === 'chunk-accepted') {
      // The worker has copied this chunk into its Wasm allocation. Release
      // exactly one more chunk from the shell, keeping the frame queue bounded
      // while cloning has both the language model and its encoder in memory.
      session?.control?.('next')
      return
    }
    if (data.type === 'load-complete') {
      send({ type: 'generate', requestId: 'local-1', text })
      return
    }
    if (data.type === 'audio') {
      onAudio?.(data.samples)
      return
    }
    if (data.type === 'generate-complete') {
      clearTimeout(timer)
      stop()
      settle({ ok: true })
      return
    }
    if (data.type === 'worker-error' || data.type === 'generate-error') {
      clearTimeout(timer)
      rejectWith(speechError(data.error?.message || 'Speech stopped unexpectedly.'))
    }
  }

  const started = (async () => {
    const source = await fetch(workerUrl, { credentials: 'same-origin' })
      .then((response) => {
        if (!response.ok) throw speechError(`The speech engine script returned ${response.status}.`)
        return response.text()
      })
    if (done) return
    blobUrl = URL.createObjectURL(new Blob([source], { type: 'text/javascript' }))
    worker = new Worker(blobUrl)
    attach()
  })()
  started.catch((error) => rejectWith(error instanceof Error ? error : speechError(String(error))))

  // A clone streams the bare engine (by engineId) and brings its own recording;
  // a built-in voice streams its model (by modelId) and uses the manifest's.
  session = engineId
    ? capabilities().open(SPEECH_MODELS, { operation: 'read', engineId, chunkAcknowledgements: true })
    : capabilities().open(SPEECH_MODELS, { operation: 'read', modelId, chunkAcknowledgements: true })
  // The capability starts streaming as soon as it is opened, so every message
  // to the worker is sequenced behind the fetch that creates it.
  let pump = started
  const send = (message, transfer = []) => {
    pump = pump.then(() => { if (!done && worker) worker.postMessage(message, transfer) })
    pump.catch(() => {})
  }
  session.on('manifest', (value) => {
    send({
      type: 'load-start',
      wasmUrl,
      assetBytes: value.assetBytes,
      temperature: value.temperature,
      clonedVoiceSamples: clonedVoiceSamples || value.clonedVoiceSamples || undefined,
    })
  })
  // Chunks arrive in order and are transferred, never copied. Forward each one
  // straight through so the model is only ever resident inside the worker.
  session.on('chunk', (value) => {
    send({
      type: 'asset-chunk',
      chunkId: value.index,
      assetId: value.assetId,
      index: value.index,
      offset: value.offset,
      bytes: value.bytes,
    }, [value.bytes])
  })
  session.on('progress', (value) => onProgress?.(value))
  session.result
    .then(() => send({ type: 'load-finish' }))
    .catch((error) => {
      if (error?.name === 'AbortError') return
      rejectWith(error instanceof Error ? error : speechError(String(error)))
    })

  return {
    result,
    cancel() {
      clearTimeout(timer)
      stop()
      settle({ ok: false, cancelled: true })
    },
  }
}
