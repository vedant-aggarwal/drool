# Drool: verification and next work

## 3.1.1 update

- Connections now includes Cursor text chat and native image generation, usable
  Higgsfield MCP model forms and job results, and a dedicated Codex image action.
  Cursor and Codex expose the reasoning efforts advertised by their live model
  catalogs, with saved conversation instructions and Cursor persona presets.
- Enhance offers installed upscaler selection, explicit bicubic fallback, and
  slider, side-by-side and result comparison modes.
- Characters have reusable reference-image libraries and per-panel reference
  selection. SDXL/SD1.5 img2img uses the selected original locally. This guides
  composition; it does not guarantee identity consistency or add IP-Adapter.
- Connections, Stories and Voice scroll within the app, including keyboard
  navigation. The desktop icon, installer artwork and app mark use Drool's new
  ruby-droplet identity.

The full frontend suite passed 12,309 tests with 56 skipped (987 passing files,
seven skipped). Cursor CLI 2026.09.18 completed an authenticated Ask-mode text
request and produced a real 1024 x 576 JPEG using its native image tool. Native
unit tests cover CLI parsing, bounds and cancellation-related request handling.
The local Enhance UI completed a 96 x 64 to 2048 x 1365 job with an explicitly
selected 4x-UltraSharpV2 model; slider pointer/keyboard and comparison modes were
checked in the browser. Character-reference upload, preview, download and removal
were exercised. Connections reached its bottom controls using wheel and End key.

Paid Higgsfield generation and authenticated Codex generation have not been
live-verified for this update. Protocol and UI fixtures cover their integration.
Cursor chooses its image backend; Drool does not invent a selectable image model.
Personas are request instructions and remain subject to each provider's rules.
Cursor conversation history currently lives in the open panel; only defaults are
persisted. See [provider details](DROOL-PROVIDERS.md),
[Cursor chat](DROOL-CURSOR-CHAT.md), and
[character references](DROOL-CHARACTERS.md).

## 3.1.0 foundation

This first Windows fork release expands the existing studio. It preserves the
original app-data identifier, model folders and inference engines. Back up the
installed application and settings before an in-place upgrade, and wait for
active renders/downloads to finish. Upstream and Drool must not use the same
profile simultaneously.

## Implemented

- Hugging Face search across text, image, video, audio and LoRA categories;
  suggestions, exact files/quantization, sizes and hardware estimates. Supported
  text GGUFs download at a pinned revision; curated media bundles retain their
  companion models. Browsing a repository does not mean every architecture runs.
- Local ComfyUI Enhance: learned upscale when a compatible upscaler is installed,
  otherwise a visibly labeled bicubic resize. Local masked Erase with SDXL/SD1.5.
- Story projects, character descriptions and installed LoRAs, model discussion,
  reviewed storyboard drafts, separate captions, JSON export and panel rendering.
  Agent tools expose project operations with permissions and revision checks.
- Local Whisper/Piper voice studio and hands-free, turn-based conversation.
  Optional audio.cpp discovery, TTS, supported voice design and reference cloning.
- Official Codex app-server account connection and text/image turns, optional
  storyboard tools, OpenRouter text/images, Higgsfield API and official MCP preset.

## Evidence and limits

Windows validation includes TypeScript, ESLint, frontend tests, native proxy tests,
signed NSIS packaging, and browser inspection at desktop and narrow widths.
The final complete frontend run passed 12,265 tests, with 56 skipped (977 passing
test files and seven skipped files). TypeScript, ESLint and the dependency-cycle
check passed. The optimized Windows build completed and produced the NSIS installer
plus Tauri updater signatures; this is not an Authenticode certificate claim.
Live Hugging Face search returned official Qwen GGUF files with quantization and
byte sizes. Stories discovered existing ComfyUI image models. The offline native
Piper-to-Whisper synthetic speech test passed; timings and its transcription error
are recorded in [voice evidence](DROOL-VOICE.md).

Local Enhance was also exercised through the actual browser UI and ComfyUI: an
original 96 x 64 synthetic PNG was processed with the installed 4x-UltraSharp model,
returned to the gallery, and its loaded output pixels verified at 2048 x 1365.
Local Erase then completed through the UI with a painted mask and an installed
RealVisXL SDXL checkpoint; the resulting 96 x 64 output pixels loaded in the gallery.
These are pipeline checks on synthetic input, not a visual-quality benchmark.
After the owner requested cancellation of the active render, the old process was
stopped and the installed native application was relaunched. The new process
reported version 3.1.0, a responsive Drool window, and an empty ComfyUI queue.

Account login and paid Codex/OpenRouter/Higgsfield generations require the owner's
account and are not claimed as live-verified. audio.cpp/VoxCPM2 weights and runtime
are not bundled in the installer; they were separately provisioned and tested on
the development PC as recorded in the voice evidence. Voice is not full-duplex and physical
microphone conversation requires a separate device test. Character prompts/LoRAs
do not guarantee consistent identity. Mac/Linux behavior was not device-tested.

Large image/video jobs still depend on available VRAM, disk, installed nodes and
model compatibility; this release does not claim to fix every upstream video model.
The initial Windows updater is configured for the fork's own signing key. Future
public releases must upload the matching signed installer and latest.json; private
signing material stays outside source control. Upstream Discord announcement jobs
are restricted to the upstream repository.

## Highest-value next features

1. Stronger character identity conditioning, reusable pose/wardrobe/voice profiles,
   and reference-sheet generation beyond the current local img2img guidance.
2. A project render queue with reproducible seeds/settings, memory scheduling,
   retries and local-versus-provider cost estimates.
3. Storyboard contact-sheet/PDF export, shot timing, voice tracks and a timeline
   assembling approved panels into video.
4. Full-duplex voice with echo cancellation, automatic interruption and measured
   RTX 3060 latency, after benchmarking one local speech model at a time.
5. Shared provider-result import into story panels and a durable cross-provider
   conversation archive; per-model Higgsfield MCP forms are included in 3.1.1.

Keep these as follow-up work until their implementation and live checks exist.

## Optional Windows launcher

`scripts/start-drool-windows.ps1` opens the installed application and invokes an
already-provisioned `%LOCALAPPDATA%\Drool\audio-runtime\Start-Audio.ps1` first when
present. It creates no logon hook, scheduled task or service, and does not change
PowerShell execution policy. `-Check` resolves paths without launching processes.
The initial PC installation has a Drool desktop shortcut using this launcher.
