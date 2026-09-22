# Drool 3.1.0: verification and next work

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
Native packaged UI relaunch was deferred by an execution approval block during
the local upgrade; installing a matching executable is not recorded as proof that
the running old window has switched versions.

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

1. Character reference sheets and explicit reference-image conditioning per model,
   with reusable pose, wardrobe and voice profiles.
2. A project render queue with reproducible seeds/settings, memory scheduling,
   retries and local-versus-provider cost estimates.
3. Storyboard contact-sheet/PDF export, shot timing, voice tracks and a timeline
   assembling approved panels into video.
4. Full-duplex voice with echo cancellation, automatic interruption and measured
   RTX 3060 latency, after benchmarking one local speech model at a time.
5. Per-model Higgsfield forms and shared provider result import into story panels;
   the initial API form is one documented workflow, not the whole provider catalog.

Keep these as follow-up work until their implementation and live checks exist.

## Optional Windows launcher

`scripts/start-drool-windows.ps1` opens the installed application and invokes an
already-provisioned `%LOCALAPPDATA%\Drool\audio-runtime\Start-Audio.ps1` first when
present. It creates no logon hook, scheduled task or service, and does not change
PowerShell execution policy. `-Check` resolves paths without launching processes.
The initial PC installation has a Drool desktop shortcut using this launcher.
