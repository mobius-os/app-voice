# Third-party notices

## Pocket TTS XN Q8 browser reader

Möbius Voice uses the XN Pocket TTS implementation from
[`LaurentMazare/xn-ptts`](https://github.com/LaurentMazare/xn-ptts) at commit
`4398678425e1b3d48d525024257830aec989bc58`. XN is dual licensed under MIT or
Apache-2.0. Möbius's shared speech runtime embeds a browser build from that source with the three
Relaxed-SIMD multiply-adds expanded to baseline SIMD multiply + add. This
keeps the same XN Q8 engine while avoiding a newer experimental WebAssembly
requirement. The shared embedded Wasm SHA-256 is
`83a0cd64fe133a146714ae7a8dd369cb26b19e9a0b0b2732e963a024795b5a79`.
The complete license notices bundled with the locked Rust dependency graph are
in [`licenses/XN-RUNTIME-LICENSES.md`](licenses/XN-RUNTIME-LICENSES.md).

The Q8 model is pinned from `lmz/pocket-tts-without-voice-cloning-q8` at commit
`c2d23606a738c5afb5e24e44f9d2f5d6af1b4528`. It is a community quantization by
Laurent Mazare of Kyutai's Pocket TTS model and is not endorsed by Kyutai. The
tokenizer and eight v2 voice profiles (Alba, Azelma, Cosette, Eponine, Fantine,
Javert, Jean, and Marius) are pinned from Kyutai's
`pocket-tts-without-voice-cloning` repository at commit
`e041936c75475d350b405bc870bcf7c22da4e9e6`.

- Official Pocket TTS: <https://github.com/kyutai-labs/pocket-tts>
- Official model: <https://huggingface.co/kyutai/pocket-tts-without-voice-cloning>
- Q8 model: <https://huggingface.co/lmz/pocket-tts-without-voice-cloning-q8>

The Kyutai model, tokenizer, and voice are licensed under
[Creative Commons Attribution 4.0](https://creativecommons.org/licenses/by/4.0/).
Attribution: **Pocket TTS by Kyutai**. The model card also documents its
intended scope and prohibited uses; read it before deploying the model beyond
Möbius's private local reader.

The short bundled voice-comparison recordings under `static/voice-samples/`
were generated from the named Pocket TTS voices using Kyutai's public demo and
the app's generic, language-matched comparison sentences. They are included so
a voice can be heard before its local profile is downloaded. Attribution:
**Pocket TTS by Kyutai** under CC BY 4.0.

Listening verifies every bounded chunk before keeping the shared engine and
selected 6–8 MB voice profiles in the current browser only. The server relays
cross-origin byte ranges transiently and retains 0 MB. The shared reader opens
and runs the Q8 model in a dedicated baseline-SIMD WebAssembly worker. No
PyTorch or scientific runtime is installed on the server, and no generated
audio is retained.
