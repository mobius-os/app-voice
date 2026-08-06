// Route generated speech through a real HTMLAudioElement so mobile hardware
// volume buttons (and lock-screen controls) govern it. A bare AudioContext ->
// destination graph is not reliably on the OS "media" stream on iOS/Android,
// which leaves the volume buttons controlling the ringer instead of the voice.
// Built-in voice SAMPLES already play via <audio>; this covers synthesized
// playback. Returns null when unsupported (caller falls back to destination).
export function createSpeechMediaBridge({ context, doc = globalThis.document } = {}) {
  if (!context?.createMediaStreamDestination || !doc?.createElement) return null
  const element = doc.createElement('audio')
  if (!('srcObject' in element)) return null

  const destination = context.createMediaStreamDestination()
  element.autoplay = true
  element.playsInline = true
  element.preload = 'none'
  element.setAttribute('aria-hidden', 'true')
  element.style.display = 'none'
  element.srcObject = destination.stream
  ;(doc.body || doc.documentElement)?.appendChild(element)

  try { if (globalThis.navigator?.audioSession) globalThis.navigator.audioSession.type = 'playback' } catch {}

  let disposed = false
  return {
    destination,
    async start() {
      if (disposed) return
      try { await element.play() } catch { /* deferred autoplay; audio still routes */ }
    },
    dispose() {
      if (disposed) return
      disposed = true
      try { element.pause() } catch {}
      element.srcObject = null
      for (const track of destination.stream?.getTracks?.() || []) {
        try { track.stop() } catch {}
      }
      try { element.remove() } catch {}
      try { if (globalThis.navigator?.audioSession) globalThis.navigator.audioSession.type = 'auto' } catch {}
    },
  }
}
