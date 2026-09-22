# Drool local voice

Voice Studio adds a local-only asset workflow: Whisper dictation into a script, Piper speech, and an audio.cpp model/voice connector. It never selects a cloud voice engine. Its server address must be an HTTP loopback origin. Existing Chat voice settings remain separate.

## What is implemented

- Explicit health checks for existing Whisper and Piper installations.
- Local microphone recording, stop-to-transcribe, editable scripts, WAV preview/export.
- audio.cpp model discovery (`GET /v1/models`), saved voices (`GET /v1/audio/voices`), synthesis (`POST /v1/audio/speech`, `response_format: json`). Uses the existing Tauri localhost proxy.
- VoxCPM2 voice design through the documented parenthesized text instruction, plus a WAV reference and optional transcript. Advanced controls are exposed only when the server reports family `voxcpm2`; a model name alone cannot enable them.
- Reference recordings are limited to 5 MiB and checked for WAV headers. They are not persisted in browser storage. Engine preferences persist; generated audio is session-local until explicitly saved.
- Cancellation discards late outputs and stops local recording/playback. The upstream Piper command does not support cancellation: an already running Piper job may finish in the background.

No audio.cpp model or runtime downloads start automatically. The explicit Whisper/Piper setup provisions speech dependencies and weights; the existing Whisper server can download its base model on first start if it is not cached. The conversation panel adds hands-free, turn-based local voice: explicit microphone start, energy/silence turn detection, Whisper transcription, the selected loopback chat provider, and Piper/audio.cpp spoken replies. It uses the existing local GPU queue and pauses recording during reply playback to avoid speaker echo. Interrupt cancels a reply and opens a new listening turn; End stops the session. Leaving/hiding the app stops the session. Session transcripts are ephemeral. Existing Whisper/Piper setup controls are available inline in Local mode.

This does not implement full-duplex automatic barge-in, an audio.cpp STT adapter, voice character assignment, or background listening. A turn ends after sustained voice energy followed by about 1.1 seconds of silence, or after 30 seconds. Quiet voices/noisy rooms may require tuning in a future version.

## audio.cpp setup

For Windows Whisper/Piper, run `powershell -File scripts/setup-drool-voice.ps1` explicitly. It needs Python 3.12 and provisions `%LOCALAPPDATA%\Drool\voice-runtime`, then downloads Whisper base and the Piper lessac voice (about 215 MB total model data, plus Python dependencies). `-SkipModels` installs dependencies only. Native speech probes, installers and inference prefer this isolated environment, leaving ComfyUI packages untouched. `DROOL_VOICE_PYTHON` can override the interpreter path. Without either, the original app resolver is retained.

Use the upstream [Windows release and build instructions](https://github.com/0xShug0/audio.cpp). Windows x64 CUDA distributions include a separate CUDA-runtime archive; both packages are required. Follow the exact release instructions and select a model supported by that release. The runtime is Apache-2.0; individual model licenses remain separate.

Start the server bound to `127.0.0.1` using its [server configuration](https://github.com/0xShug0/audio.cpp/blob/main/app/server/README.md). Example configuration to adapt to an already downloaded model:

```json
{
  "host": "127.0.0.1",
  "port": 8080,
  "backend": "cuda",
  "lazy_load": true,
  "max_loaded_models": 1,
  "idle_unload_ms": 60000,
  "models": [{
    "id": "voxcpm2",
    "family": "voxcpm2",
    "path": "D:/Models/VoxCPM2",
    "task": "tts",
    "mode": "offline"
  }]
}
```

Run `audiocpp_server --config server.json`, choose audio.cpp in Voice Studio, and check engines. Model paths must point to actual compatible weights. Native Tauri uses a backend proxy; browser development additionally needs the server's documented CORS configuration. Do not expose the server publicly.

## Upstream research, checked 2026-09-22

| Project | License | Practical role |
| --- | --- | --- |
| [OpenBMB/VoxCPM](https://github.com/OpenBMB/VoxCPM) | Apache-2.0, code and weights | VoxCPM2 TTS: 30 languages including Hindi, design, cloning, 48kHz output. Python 3.10–3.12 / PyTorch ≥2.5 / CUDA ≥12 reference route. Reference VRAM around 8GB. |
| [0xShug0/audio.cpp](https://github.com/0xShug0/audio.cpp) | Apache-2.0 runtime | Native C++/GGML runtime; Windows CUDA builds, model management, TTS, ASR, VAD and other audio families. Per-family support and licenses differ. |
| [jamiepine/voicebox](https://github.com/jamiepine/voicebox) | MIT application | Local voice studio, multiple TTS engines, dictation and agent voice tools. Useful architecture/UI reference; not bundled with Drool. |
| [QwenAudio/qwen-audio-agent](https://github.com/QwenAudio/qwen-audio-agent) | Apache-2.0 | Conversation runtime separating realtime voice frontend from ACP agent tasks. Defaults to cloud DashScope; local speech-to-speech and MiniCPM providers are documented separately. Not bundled or configured here. |

VoxCPM2's published ~0.3 real-time factor is measured on an RTX 4090, not this PC's RTX 3060. The reference VRAM estimate suggests standalone inference is plausible on 12GB, but simultaneous image/video/LLM residency is not proven. Keep audio.cpp to one resident model, unload idle models, and benchmark on the actual PC before promising latency.

## Next integration boundary

For full-duplex conversation: local microphone → streaming STT → selected local chat/agent backend → sentence-buffered TTS → audio playback. Add automatic interruption, echo suppression, device switching, and explicit tool permissions. TTS streaming by itself does not provide any of these. audio.cpp's live HTTP input/output routes require a native bridge; its documentation explicitly says browser fetch cannot drive the full-duplex live route. A WebSocket bridge or Qwen Audio Agent local provider is a separate implementation and testing task.

## Validation

The 12 adapter/conversation tests exercise loopback restrictions, verified family gating, backend errors, catalog parsing, response shape, silence turn detection, a complete mocked speech/chat/reply loop, and cancellation before a late transcription can trigger chat. TypeScript and scoped ESLint pass.

On this Windows PC, isolated Python 3.12 with faster-whisper 1.2.1, Piper 1.8.0 and ONNX Runtime 1.30.0 was installed on 2026-09-22. Existing Whisper base weights loaded with `HF_HUB_OFFLINE=1`. The default lessac medium Piper voice was downloaded (63,201,294-byte ONNX plus its configuration). `verify-drool-voice.py` exercised the same Piper CLI and bundled Whisper stdio server used by native Drool, with HF networking disabled:

- Piper generated a valid 3.11-second WAV in 11.32 seconds including cold process/model startup.
- Whisper cold start plus transcription took 15.05 seconds and recovered “Hello, this is Drul, your local voice system is ready.”
- The small name-spelling error is preserved here; this is a functioning speech round trip, not a claim of perfect transcription or low latency. The desktop build was under development during this test.

This validates real native speech subprocesses and cached Whisper inference, not the packaged desktop UI, physical microphone, complete LLM conversation, audio.cpp GPU inference, cloning quality, or full-duplex speech. Those checks remain separate. A catalog response proves configuration discovery, not successful model loading or speech generation.
