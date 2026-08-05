---
name: voice
description: Give an agent a voice in chat or any compatible Möbius app. Trigger when the partner asks the agent to speak, say or read something aloud, asks for a response they can listen to, or asks to integrate shared Voice/TTS into an app.
---

# Voice

## Spoken chat replies

When the partner explicitly asks for speech:

1. Write the visible answer normally. Do not narrate tool calls, implementation logs, citations, or other visual chrome.
2. Append one inert Speech Document v1 carrier with a concise spoken companion. It may summarize a detailed answer at a higher level; it must not add claims absent from the visible answer. Match the requested language and keep it comfortably listenable (normally under 1,200 characters).
3. The valid carrier adds a compact **Listen** element to that response. Tell the partner to tap **Listen**; do not claim playback started automatically because browsers require a user gesture before local audio can play.
4. If no voice is ready, direct the partner to Voice to download a language and select a voice. Do not substitute a remote or paid speech service without explicit approval.

Use this carrier after the visible answer:

```html
<section data-chat-speech hidden>
  <script type="application/mobius-speech+json">
  {"version":1,"locale":"en-GB","hints":[
    {"written":"Möbius","spoken":"Moh bee us"}
  ],"segments":[
    {"kind":"summary","text":"The concise spoken companion goes here.","pauseAfterMs":0}
  ]}
  </script>
</section>
```

Use exact written-to-spoken hints only when pronunciation differs. Use multiple semantic segments with `pauseAfterMs` when the requested spoken answer genuinely needs structure. The shell removes the carrier from display and copy, and renders it with the active voice selected on this device.

Ordinary replies never receive a speech action. Only emit this carrier when the partner asks the agent to speak, read, or provide something they can listen to. The response's Listen element owns playback, cancellation, and the active device voice. Do not generate an audio attachment or add a second TTS path unless the partner specifically asks for a file.

## Adding Voice to an app

Declare the shared capability in `mobius.json`:

```json
"media.speech": {
  "version": 1,
  "reason": "Read this app's content aloud with the voice selected on this device.",
  "limits": { "max_text_chars": 5000 }
}
```

Use `window.mobius.capabilities.invoke('media.speech', { operation: 'catalog' })` to read `{ activeModel }`, where `activeModel` is either `null` or the ready device voice's `{ id, name, language, sampleRate }`. Voice owns download and selection for the device, so an ordinary app follows that voice instead of storing a second choice. Open synthesis with either plain `text` or Speech Document v1:

```js
const session = window.mobius.capabilities.open('media.speech', {
  operation: 'synthesize',
  document: {
    version: 1,
    locale: 'en-GB',
    hints: [],
    segments: [{ kind: 'paragraph', text, pauseAfterMs: 0 }],
  },
})
const unsubscribe = session.on('audio', ({ samples }) => {
  // Queue Float32Array samples in a user-resumed AudioContext.
})
await session.result
unsubscribe()
```

Resume the `AudioContext` inside the user's tap handler before awaiting catalog or model work. Schedule every audio chunk consecutively rather than playing chunks immediately, honor `boundary` events for document pauses, and cancel the capability session when playback stops. If no active model is ready, direct the owner to Voice. For a sequence of bounded documents, capture the active model once and pass its `id` as `modelId` to every synthesis call so a mid-playback selection change cannot mix voices.

The shared reader currently uses Pocket TTS, a compact model that runs on the device, so text and generated audio are not transmitted. Do not add a parallel browser, cloud, or paid speech path without the partner explicitly choosing that different privacy and cost model.
