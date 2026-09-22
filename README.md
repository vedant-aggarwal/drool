# Drool

A local-first creative AI studio for Windows. Public AGPL-3.0 fork of
[Locally Uncensored](https://github.com/PurpleDoubleD/locally-uncensored), maintained by Vedant Aggarwal.

## What this fork adds

- **Stories:** discuss ideas with an installed chat model or a connected Codex account, save character descriptions and LoRAs, draft/edit/review panels, keep captions separate, and render panels locally.
- **Local Enhance and Erase:** ComfyUI image upscaling (installed learned upscaler, or explicitly labeled bicubic resize); masked erasing with SDXL/SD 1.5. Local Windows/Linux, not an entitlement bypass of upstream cloud services.
- **Hugging Face discovery:** category searches, suggested queries, exact quantization/file sizes, dependency-aware curated bundles, revision-pinned text downloads and optional gated access with your own token.
- **Voice Studio:** isolated Whisper/Piper runtime, speech preview/export and hands-free turn-based conversation. Optional audio.cpp connector exposes installed voice models, presets and supported VoxCPM2 voice design/cloning.
- **Connections:** optional Codex account login/chat/images through the official app-server, OpenRouter models/text/images, and Higgsfield API/MCP connections. Cloud services retain their own billing and limits.

Existing model folders, GGUF support, ComfyUI workflows, hardware filters, local agents, and the upstream license are retained. This first fork version keeps the original desktop data identifier to preserve existing installations. Do not run upstream and Drool simultaneously against that profile.

## Build

Node 22+ and a Rust/MSVC toolchain are required on Windows.

```powershell
npm ci
npm run typecheck
npm test
npm run build
# Stage the matching llama.cpp sidecar and DLLs using the upstream scripts first.
npm run tauri:build -- --bundles nsis
```

The optional isolated Windows speech runtime can be provisioned with
`scripts/setup-drool-voice.ps1`. It does not modify ComfyUI Python.

## Status and limitations

This is an early fork release. Local runtime availability is probed, not inferred from a model name. A file fitting VRAM is an estimate, not a benchmark. Arbitrary Hugging Face architectures are browsable but do not become compatible automatically. Character identity is not guaranteed by a text description alone. Voice conversation is turn-based with explicit interruption, not full-duplex speech-to-speech. VoxCPM2 requires a separately installed compatible audio.cpp backend; no large voice weights are bundled.

Codex requires the official CLI and its managed account login. Provider keys are optional and never included in this repository. Model licenses and gated-model terms still apply. The Windows updater uses Drool's own signing key and repository.

See [model discovery](docs/DROOL-MODELS.md), [providers](docs/DROOL-PROVIDERS.md),
[voice evidence](docs/DROOL-VOICE.md), and [verification and roadmap](docs/DROOL-RELEASE.md).

## License and attribution

AGPL-3.0-only. Original copyright and third-party notices remain intact.
Source changes to this fork must be distributed under the same license.
The upstream README is preserved in [docs/UPSTREAM-README.md](docs/UPSTREAM-README.md).
