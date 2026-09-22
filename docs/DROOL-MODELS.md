# Drool model discovery

Models → Get new now includes an expanded Hugging Face browser. The curated
catalog, complete dependency bundles, Unfiltered section and hardware filters
remain available. The LoRA rail includes suggested CivitAI searches and the same
Hugging Face browser; suggestions appear before entering a query.

## Available

- Search public repositories or browse popular models in text, image, video,
  audio, LoRA and unrestricted categories. Image, video and audio searches merge
  related pipeline tasks, rather than assuming every repository has an optional
  category tag. Search expands from 20 to 100 results, then links to the Hub.
- Inspect a repository's declared architecture, license, base model and real
  GGUF/Safetensors file variants. Exact byte counts come from the Hub file tree.
  GGUF does not necessarily mean quantized: F16/BF16 are labeled separately.
- Choose a text GGUF variant, including complete split sets. Revision-pinned
  URLs, byte counts and LFS SHA256 values are passed to the existing downloader.
  Split sets retain the existing review dialog. No weights download on search.
- Filter reviewed files using a weights-plus-2-GiB memory estimate. This is not
  a load benchmark or a guarantee: KV cache, context, resolution, other apps,
  companion weights and runtime allocations all affect real memory use.
- Open media files' source cards and install a matching curated bundle with
  its existing companion models and custom nodes. Unknown media architectures,
  arbitrary adapters and incomplete split files are never installed as a
  standalone chat model merely because the extension is GGUF.

## Compatibility boundaries

The architecture allowlist is deliberately conservative and is checked against
Hub metadata, not guessed from repository names. The installed llama.cpp build
still determines actual runtime support. Vision models needing a projector are
directed to curated bundles. LoRAs must match their base model/workflow; generic
Hub LoRAs are inspectable but are not automatically mapped to a ComfyUI folder.

Exact file installation uses the built-in engine or LM Studio. Ollama's
quantization-tag pull can pick a different file/revision, so this browser asks
the user to switch provider for exact selection. The existing curated Ollama
pull path is unchanged.

Public search requires no API key. Gated/private repository search and downloads
use the Hugging Face read token saved under Settings → AI Backends → Hugging Face
token. The desktop stores it in the OS credential store, loads it into Rust
memory, and the library reads only a presence flag. Hugging Face still enforces
account permissions and acceptance of model terms. A configured token is not a
claim that access has been approved.

The credential is attached only to the exact `https://huggingface.co:443`
origin, with no URL userinfo. Metadata, binary fetches, model downloads and size
probes re-evaluate credentials on every redirect. Aliases, CDN/subdomain hosts,
HTTP downgrades and nonstandard ports receive no Hub bearer. Redirect hops also
retain the existing public-IP validation and DNS pinning. Downloads preserve
range/resume headers and use connect/read stall limits rather than a whole-file
deadline. The browser development proxy does not receive or persist this token.

The file listing is capped at 1,000 entries. If that boundary is reached,
installation is disabled and the complete repository is linked. Search errors
are shown distinctly from an empty result, and stale search responses cannot
replace a newly selected category.

## Suggested starting points and sources

These are task-based starting points, not claims of benchmark superiority.
For a 12-GiB GPU, begin with a modest text quant and review the actual variant
size before installing. Media may require CPU offloading or reduced resolution.

| Task | Starting point | Primary source |
| --- | --- | --- |
| Chat, creative writing, roleplay | Qwen3 8B GGUF | https://huggingface.co/Qwen/Qwen3-8B-GGUF |
| Code assistance | Qwen2.5 Coder 7B GGUF | https://huggingface.co/Qwen/Qwen2.5-Coder-7B-Instruct-GGUF |
| Fast image generation | FLUX.1 schnell; inspect a compatible quant/bundle | https://huggingface.co/black-forest-labs/FLUX.1-schnell |
| Illustration and LoRA ecosystem | SDXL | https://huggingface.co/stabilityai/stable-diffusion-xl-base-1.0 |
| Image/text to video | Wan2.2 TI2V 5B; inspect quantization and dependencies | https://huggingface.co/Wan-AI/Wan2.2-TI2V-5B |
| Expressive speech | VoxCPM family | https://github.com/OpenBMB/VoxCPM |
| Speech generation | Qwen3-TTS family | https://github.com/QwenLM/Qwen3-TTS |

Hub API reference: https://huggingface.co/docs/hub/api

GGUF container and quantization reference: https://huggingface.co/docs/hub/gguf

## Validation

Unit/component coverage checks query preservation, broad category merging,
network errors, pinned revisions, unsafe paths, precision labels, shard
completeness, architecture/vision/gating blocks, bundle identity matching,
suggestion visibility, stale-response handling and exact download handoff.
Existing GGUF resolver and LoRA-rail regression tests are included. No model
weights were downloaded during validation; this does not claim an inference
benchmark on the target GPU.

Rust request-builder tests cover exact-origin bearer routing, CDN/alias and
scheme/port/userinfo rejection, CivitAI credential separation and range headers.
Actual gated-account access requires the user's token and accepted repository
license; no credential or license acceptance was fabricated during validation.
