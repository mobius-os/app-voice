# Voice — on-device text-to-speech for Möbius

Give your agent a voice in chat or any compatible app. Voice runs
[Kyutai Pocket TTS](https://kyutai.org/) entirely on-device (WebAssembly),
downloads and manages the voice models, lets you clone your own voice, and
exposes a shared speech engine that other Möbius apps (like News) can read
through.

A [Möbius](https://github.com/mobius-os) mini-app. Install it from the in-app
App Store, or by pasting this repo's `mobius.json` manifest URL.

## Requirements

Voice depends on the Möbius platform's on-device speech capabilities
(`device.speech-models`, `media.speech`, `media.microphone.capture`) and the
WebAssembly Pocket TTS engine. It only runs on a Möbius instance whose platform
provides those. The ~780 MB voice models are hosted as a Release on this repo
and verified by SHA-256 before caching.

## Features

- On-device English, German, Italian, Portuguese, and Spanish voices — nothing
  is sent off your device to synthesize.
- **Voice cloning** — record a short sample; your cloned voice is saved to your
  own Möbius instance, so it follows you across devices, and can be the voice
  News and your agent read in.

## License

App source: MIT. The Pocket TTS models are licensed
[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) by Kyutai; see
`THIRD_PARTY_NOTICES.md` and `licenses/`.
