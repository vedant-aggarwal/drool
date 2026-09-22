import { backendCall, fetchExternal } from './backend'
import type { DiscoverModel, ModelBundle } from './model-bundles'

export type HfCategory = 'text' | 'image' | 'video' | 'audio' | 'lora' | 'all'
export interface HfRepository {
  id: string
  downloads?: number
  pipeline_tag?: string
  tags?: string[]
  gated?: boolean | string
  sha?: string
  gguf?: { architecture?: string }
  cardData?: { license?: string; base_model?: string | string[] }
}
export interface HfFile { type: string; path: string; size?: number; lfs?: { oid?: string; size?: number } }
export interface HfVariant {
  key: string
  quant: string
  files: HfFile[]
  bytes: number
  complete: boolean
  auxiliary: boolean
}
export interface HfDetails { repository: HfRepository; variants: HfVariant[]; treeTruncated: boolean; tokenConfigured?: boolean }

/** Presence only. The token remains in the OS credential store/Rust memory. */
export async function hfLibraryTokenConfigured(): Promise<boolean> {
  try {
    const result = await backendCall<{ present: boolean }>('hf_token_present', { args: {} })
    return result.present === true
  } catch { return false }
}

const TASKS: Partial<Record<HfCategory, string>> = {
  text: 'text-generation', image: 'text-to-image', video: 'text-to-video', audio: 'text-to-speech',
}
export const HF_SUGGESTIONS: Record<HfCategory, { label: string; query: string; source: string }[]> = {
  text: [
    { label: 'Qwen · writing & chat', query: 'Qwen3-8B', source: 'https://huggingface.co/Qwen/Qwen3-8B-GGUF' },
    { label: 'Small coding models', query: 'Qwen2.5-Coder-7B', source: 'https://huggingface.co/Qwen/Qwen2.5-Coder-7B-Instruct-GGUF' },
    { label: 'Community roleplay', query: 'roleplay', source: 'https://huggingface.co/models?pipeline_tag=text-generation&search=roleplay' },
  ],
  image: [
    { label: 'FLUX · fast images', query: 'FLUX.1-schnell', source: 'https://huggingface.co/black-forest-labs/FLUX.1-schnell' },
    { label: 'SDXL · illustration', query: 'stable-diffusion-xl', source: 'https://huggingface.co/stabilityai/stable-diffusion-xl-base-1.0' },
  ],
  video: [{ label: 'Wan · image to video', query: 'Wan2.2', source: 'https://huggingface.co/Wan-AI/Wan2.2-TI2V-5B' }],
  audio: [
    { label: 'VoxCPM · expressive speech', query: 'VoxCPM', source: 'https://github.com/OpenBMB/VoxCPM' },
    { label: 'Qwen · speech', query: 'Qwen3-TTS', source: 'https://github.com/QwenLM/Qwen3-TTS' },
  ],
  lora: [
    { label: 'FLUX LoRAs', query: 'flux', source: 'https://huggingface.co/models?other=lora&search=flux' },
    { label: 'SDXL LoRAs', query: 'sdxl', source: 'https://huggingface.co/models?other=lora&search=sdxl' },
    { label: 'Wan LoRAs', query: 'wan', source: 'https://huggingface.co/models?other=lora&search=wan' },
  ],
  all: [{ label: 'Popular local models', query: '', source: 'https://huggingface.co/models?sort=downloads' }],
}

export function hfSearchUrl(query: string, category: HfCategory, limit = 20): string {
  const params = new URLSearchParams({ search: query.trim(), sort: 'downloads', direction: '-1', limit: String(limit), full: 'true' })
  if (category === 'text') params.set('filter', 'gguf')
  if (category === 'lora') params.set('filter', 'lora')
  if (TASKS[category]) params.set('pipeline_tag', TASKS[category]!)
  return `https://huggingface.co/api/models?${params}`
}

export async function searchHfLibrary(query: string, category: HfCategory, limit = 20): Promise<HfRepository[]> {
  // The optional "video" tag excludes official Wan repositories. Query real
  // pipeline tasks, then merge, so image-to-video and speech recognition are
  // discoverable alongside generation.
  const tasks = category === 'video' ? ['text-to-video', 'image-to-video', 'image-text-to-video', 'video-to-video']
    : category === 'audio' ? ['text-to-speech', 'automatic-speech-recognition', 'text-to-audio']
      : category === 'image' ? ['text-to-image', 'image-to-image'] : [null]
  const pages = await Promise.all(tasks.map(async task => {
    const url = new URL(hfSearchUrl(query, category, limit))
    if (task) url.searchParams.set('pipeline_tag', task)
    const data: unknown = JSON.parse(await fetchExternal(url.toString()))
    if (!Array.isArray(data)) throw new Error('Hugging Face returned an unexpected response. Please retry.')
    return data.filter((item): item is HfRepository => !!item && typeof item.id === 'string' && validRepoId(item.id))
  }))
  return [...new Map(pages.flat().map(repo => [repo.id, repo])).values()]
    .sort((a, b) => (b.downloads || 0) - (a.downloads || 0)).slice(0, limit)
}

export function validRepoId(id: string): boolean {
  return /^[\w.-]+\/[\w.-]+$/.test(id) && !id.split('/').some(p => p === '.' || p === '..')
}

const SHARD = /-(\d{4,5})-of-(\d{4,5})\.gguf$/i
export function hfVariants(entries: HfFile[]): HfVariant[] {
  const groups = new Map<string, HfFile[]>()
  for (const file of entries) {
    if (!file || file.type !== 'file' || !/\.(gguf|safetensors)$/i.test(file.path)) continue
    if (typeof file.path !== 'string' || file.path.split('/').some(p => !p || p === '..' || p === '.') || /[\\<>:"|?*]/.test(file.path) || [...file.path].some(c => c.charCodeAt(0) < 32)) continue
    const key = file.path.replace(SHARD, '.gguf')
    groups.set(key, [...(groups.get(key) || []), file])
  }
  return [...groups].map(([key, parts]) => {
    const files = [...parts].sort((a, b) => a.path.localeCompare(b.path))
    const shards = files.map(f => f.path.match(SHARD))
    const shard = shards[0]
    const count = shard ? Number(shard[2]) : 1
    const complete = !shard || (count === files.length && shards.every((s, i) => s && Number(s[1]) === i + 1 && Number(s[2]) === count))
    const quant = /(?:^|[./_-])((?:UD-)?(?:IQ\d_[A-Z0-9_]+|Q\d_K(?:_XL|_XS|_[MSL])?|Q\d_[01])|BF16|FP16|F16|F32)(?=[./-]|$)/i.exec(key)?.[1]?.toUpperCase()
    return { key, files, complete, bytes: files.reduce((sum, f) => sum + (f.size || f.lfs?.size || 0), 0),
      quant: quant || (/\.gguf$/i.test(key) ? 'GGUF · precision unspecified' : 'Safetensors'),
      auxiliary: /mmproj|projector|text.encoder|vae|adapter_model|lora/i.test(key) }
  }).sort((a, b) => a.bytes - b.bytes)
}

export async function getHfDetails(id: string): Promise<HfDetails> {
  if (!validRepoId(id)) throw new Error('Invalid Hugging Face repository.')
  const repository = JSON.parse(await fetchExternal(`https://huggingface.co/api/models/${id}`)) as HfRepository
  if (repository.id !== id) throw new Error('Repository identity changed. Search again before downloading.')
  // Pin file URLs to the returned revision so a repository update cannot swap
  // the selected weights between review and download.
  if (!repository.sha || !/^[a-f0-9]{40}$/i.test(repository.sha)) throw new Error('Could not resolve a fixed repository revision.')
  const raw: unknown = JSON.parse(await fetchExternal(`https://huggingface.co/api/models/${id}/tree/${repository.sha}?recursive=true&limit=1000`))
  if (!Array.isArray(raw)) throw new Error('Could not read model files.')
  return { repository, variants: hfVariants(raw as HfFile[]), treeTruncated: raw.length >= 1000, tokenConfigured: await hfLibraryTokenConfigured() }
}

// Conservative subset supported by the bundled llama.cpp family. Unknown
// architectures remain browsable; GGUF alone never enables installation.
const TEXT_ARCHITECTURES = new Set(['llama', 'qwen2', 'qwen3', 'qwen3moe', 'gemma', 'gemma2', 'gemma3', 'phi3', 'mistral', 'starcoder2', 'deepseek2'])
export function hfInstallBlock(repository: HfRepository, variant: HfVariant, tokenConfigured = false): string | null {
  if (repository.gated && !tokenConfigured) return 'Accept the model terms on Hugging Face and save a read token in Settings → AI Backends → Hugging Face token, then reload these files.'
  if (!variant.complete) return 'Incomplete split model. Open the repository to inspect all parts.'
  if (!variant.bytes || variant.files.some(f => !(f.size || f.lfs?.size))) return 'File sizes are unavailable. Installation is disabled until they can be verified.'
  if (variant.auxiliary || !variant.key.toLowerCase().endsWith('.gguf')) return 'This file needs a matching base model and workflow. Use a curated bundle or inspect its model card.'
  if (repository.pipeline_tag !== 'text-generation') return 'This is not a verified text-generation model. Use its matching media workflow.'
  if (!TEXT_ARCHITECTURES.has(repository.gguf?.architecture || '')) return 'This architecture has not been mapped to a Drool runtime yet.'
  if (repository.tags?.some(t => /vision|image-text|multimodal/i.test(t))) return 'Multimodal models require a matching vision projector. Use a curated bundle.'
  return null
}

export function hfVariantModel(repository: HfRepository, variant: HfVariant): DiscoverModel {
  const file = variant.files[0]
  const path = file.path.split('/').map(encodeURIComponent).join('/')
  return { name: `${repository.id.split('/').pop()} · ${variant.quant}`, description: repository.id,
    pulls: String(repository.downloads || 0), tags: [variant.quant, 'GGUF'], updated: '',
    filename: file.path.split('/').pop(), downloadUrl: `https://huggingface.co/${repository.id}/resolve/${repository.sha}/${path}`,
    url: `https://huggingface.co/${repository.id}`, sizeGB: variant.bytes / 1_073_741_824 }
}

export function hfMatchingBundles(id: string, bundles: ModelBundle[]): ModelBundle[] {
  return bundles.filter(bundle => bundle.url === `https://huggingface.co/${id}` || bundle.files.some(f => f.downloadUrl?.startsWith(`https://huggingface.co/${id}/resolve/`)))
}
