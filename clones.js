// Cloned voices, stored on this Möbius instance's server rather than only in
// the browser session. Each clone is one file in Voice's own durable storage
// (`clones/<id>.json`), so recordings persist across reloads and devices, a
// named library can hold as many as you like, and a cleared browser cache no
// longer silently loses them. Synthesis stays in-frame: Voice streams the bare
// language engine and hands the worker the recording loaded from here.
//
// The recording never leaves your instance — it is saved to your own backend,
// not to any third party.

const CLONES_PREFIX = 'clones/'
const ACTIVE_PATH = 'clones/active.json'
const CLONE_SAMPLE_RATE = 24_000
const MAX_CLONE_SECONDS = 8
const MIN_CLONE_SECONDS = 3
const MIN_SOURCE_SAMPLE_RATE = 8_000
const MAX_SOURCE_SAMPLE_RATE = 384_000
const MIN_CLONE_SIGNAL_RMS = 0.001
const MIN_CLONE_SIGNAL_RANGE = 0.005

const LANGUAGE_ENGINE = Object.freeze({
  English: 'pocket-tts-xn-q8-english',
  German: 'pocket-tts-xn-q8-german',
  Italian: 'pocket-tts-xn-q8-italian',
  Portuguese: 'pocket-tts-xn-q8-portuguese',
  Spanish: 'pocket-tts-xn-q8-spanish',
})

export function engineIdForLanguage(language) {
  return LANGUAGE_ENGINE[language] || null
}

function clonePath(id) {
  return `${CLONES_PREFIX}${id}.json`
}

function randomId() {
  return globalThis.crypto?.randomUUID?.()
    || `clone-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

function resampleMono(samples, sourceRate, targetRate = CLONE_SAMPLE_RATE) {
  if (sourceRate === targetRate) return new Float32Array(samples)
  const length = Math.max(1, Math.round(samples.length * targetRate / sourceRate))
  const result = new Float32Array(length)
  const ratio = sourceRate / targetRate
  for (let index = 0; index < length; index += 1) {
    const position = index * ratio
    const left = Math.min(samples.length - 1, Math.floor(position))
    const right = Math.min(samples.length - 1, left + 1)
    const mix = position - left
    result[index] = samples[left] * (1 - mix) + samples[right] * mix
  }
  return result
}

function encodePcm16(samples) {
  const pcm = new Int16Array(samples.length)
  for (let index = 0; index < samples.length; index += 1) {
    pcm[index] = Math.max(-32_768, Math.min(32_767, Math.round(samples[index] * 32_767)))
  }
  const bytes = new Uint8Array(pcm.buffer)
  let binary = ''
  for (let offset = 0; offset < bytes.length; offset += 32_768) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 32_768))
  }
  return globalThis.btoa(binary)
}

function decodePcm16(base64) {
  const binary = globalThis.atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index)
  const pcm = new Int16Array(bytes.buffer, bytes.byteOffset, Math.floor(bytes.byteLength / 2))
  const samples = new Float32Array(pcm.length)
  for (let index = 0; index < pcm.length; index += 1) samples[index] = pcm[index] / 32_768
  return samples
}

function invalidCloneAudioError() {
  const error = new Error('That recording contains invalid audio. Record it again.')
  error.code = 'invalid_recording'
  return error
}

function silentCloneError() {
  const error = new Error('We could not hear clear speech in that recording. Check your microphone and record again.')
  error.code = 'silent_recording'
  return error
}

function assertUsableCloneSignal(samples) {
  if (!(samples instanceof Float32Array) || samples.length === 0) throw invalidCloneAudioError()
  let total = 0
  let min = Infinity
  let max = -Infinity
  for (let index = 0; index < samples.length; index += 1) {
    const sample = samples[index]
    if (!Number.isFinite(sample) || Math.abs(sample) > 1) throw invalidCloneAudioError()
    total += sample
    min = Math.min(min, sample)
    max = Math.max(max, sample)
  }
  if (max - min < MIN_CLONE_SIGNAL_RANGE) throw silentCloneError()
  const mean = total / samples.length
  let variance = 0
  for (let index = 0; index < samples.length; index += 1) {
    const difference = samples[index] - mean
    variance += difference * difference
  }
  if (Math.sqrt(variance / samples.length) < MIN_CLONE_SIGNAL_RMS) throw silentCloneError()
}

function storage() {
  const store = globalThis.mobius?.storage
  if (!store) throw new Error('Voice storage is unavailable in this version of Möbius.')
  return store
}

/** The saved clones as light metadata records (no audio), newest first. */
export async function listClones() {
  const entries = await storage().list(CLONES_PREFIX).catch(() => [])
  const records = await Promise.all((entries || []).map(async (entry) => {
    const path = typeof entry === 'string' ? entry : entry?.path
    if (!path || !path.endsWith('.json') || path === ACTIVE_PATH) return null
    const record = await storage().get(path).catch(() => null)
    // The active-voice pointer lives beside the clones but is not one; a real
    // clone always carries its language. Skip anything without one.
    if (!record || !record.id || !record.language) return null
    return {
      id: record.id,
      name: record.name || 'My voice',
      language: record.language,
      createdAt: record.createdAt || 0,
    }
  }))
  return records.filter(Boolean).sort((a, b) => b.createdAt - a.createdAt)
}

/** Which clone is the active reading voice on this instance, or null. */
export async function activeClonePointer() {
  const record = await storage().get(ACTIVE_PATH).catch(() => null)
  return record?.id ? { id: record.id } : null
}

export async function setActiveClone(id) {
  await storage().set(ACTIVE_PATH, { id: String(id), at: Date.now() })
}

export async function clearActiveClone() {
  await storage().remove(ACTIVE_PATH)
}

/** Save a new recording as a named clone. Returns its metadata record. */
export async function saveClone({ name, language, samples, sampleRate }) {
  if (!(samples instanceof Float32Array)
    || !Number.isSafeInteger(sampleRate)
    || sampleRate < MIN_SOURCE_SAMPLE_RATE
    || sampleRate > MAX_SOURCE_SAMPLE_RATE
    || !engineIdForLanguage(language)) {
    throw new Error('That recording could not be saved.')
  }
  const bounded = samples.subarray(0, Math.round(sampleRate * MAX_CLONE_SECONDS))
  const resampled = resampleMono(bounded, sampleRate)
  if (resampled.length < CLONE_SAMPLE_RATE * MIN_CLONE_SECONDS) {
    const error = new Error(`Record at least ${MIN_CLONE_SECONDS} seconds of clear speech.`)
    error.code = 'too_short'
    throw error
  }
  assertUsableCloneSignal(resampled)
  const record = {
    id: randomId(),
    name: String(name || '').trim().slice(0, 40) || 'My voice',
    language,
    sampleRate: CLONE_SAMPLE_RATE,
    pcm16Base64: encodePcm16(resampled),
    createdAt: Date.now(),
  }
  await storage().set(clonePath(record.id), record)
  return { id: record.id, name: record.name, language: record.language, createdAt: record.createdAt }
}

/** Load one clone's recording as 24 kHz mono PCM for synthesis. */
export async function loadCloneSamples(id) {
  const record = await storage().get(clonePath(id)).catch(() => null)
  if (!record?.pcm16Base64) throw new Error('That cloned voice could not be loaded.')
  let samples
  try {
    samples = decodePcm16(record.pcm16Base64)
  } catch {
    throw new Error('That cloned voice could not be loaded.')
  }
  if (samples.length < CLONE_SAMPLE_RATE * MIN_CLONE_SECONDS
    || samples.length > CLONE_SAMPLE_RATE * MAX_CLONE_SECONDS) {
    throw new Error('That cloned voice could not be loaded.')
  }
  assertUsableCloneSignal(samples)
  return samples
}

export async function removeClone(id) {
  await storage().remove(clonePath(id))
}
