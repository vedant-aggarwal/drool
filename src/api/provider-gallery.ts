import { isTauri } from './backend'
import { useCreateStore, type GalleryItem } from '../stores/createStore'
import { isRecord } from '../types/json-guards'

export interface ProviderMedia { src: string; type: 'image' | 'video'; prompt: string; model: string; localPath?: string; width?: number; height?: number }

export function providerMediaMime(bytes: Uint8Array, type: ProviderMedia['type']): string {
  const ascii = (start: number, end: number) => String.fromCharCode(...bytes.subarray(start, end))
  if (type === 'image') {
    if ([137,80,78,71,13,10,26,10].every((value,index) => bytes[index] === value)) return 'image/png'
    if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return 'image/jpeg'
    if (ascii(0,4) === 'RIFF' && ascii(8,12) === 'WEBP') return 'image/webp'
  } else {
    if (ascii(4,8) === 'ftyp' && bytes.length >= 12) return 'video/mp4'
    if ([26,69,223,163].every((value,index) => bytes[index] === value)) return 'video/webm'
  }
  throw new Error('The provider returned unsupported media bytes. Only PNG, JPEG, WebP, MP4 and WebM previews are supported.')
}

/** Do not use localFetch here: its native transport decodes the response as text. */
export async function downloadProviderMedia(media: ProviderMedia, signal?: AbortSignal): Promise<Blob> {
  const url = new URL(media.src)
  if (url.protocol !== 'https:' || url.username || url.password) throw new Error('The provider returned an unsupported media URL.')
  const maxBytes = media.type === 'image' ? 24_000_000 : 96_000_000
  if (signal?.aborted) throw new DOMException('Cancelled', 'AbortError')
  let bytes: Uint8Array<ArrayBuffer>
  if (isTauri()) {
    const { invoke } = await import('@tauri-apps/api/core')
    const raw: unknown = await invoke('fetch_external_bytes', { url: media.src, maxBytes })
    if (signal?.aborted) throw new DOMException('Cancelled', 'AbortError')
    if (!Array.isArray(raw) || raw.length > maxBytes || !raw.every(value => Number.isInteger(value) && value >= 0 && value <= 255)) throw new Error('The media download returned invalid bytes or exceeded the size limit.')
    bytes = new Uint8Array(raw)
  } else {
    const response = await fetch(`/local-api/proxy-download?url=${encodeURIComponent(media.src)}`, { signal })
    if (!response.ok) throw new Error(`Media download failed: HTTP ${response.status}`)
    if (Number(response.headers.get('content-length')) > maxBytes) { await response.body?.cancel(); throw new Error('Media exceeds the preview size limit.') }
    const reader = response.body?.getReader()
    if (!reader) throw new Error('The provider returned no media.')
    const chunks: Uint8Array<ArrayBuffer>[] = []; let size = 0
    try {
      while (true) { const result = await reader.read(); if (result.done) break; size += result.value.length; if (size > maxBytes) { await reader.cancel(); throw new Error('Media exceeds the preview size limit.') }; chunks.push(new Uint8Array(result.value)) }
    } finally { reader.releaseLock() }
    bytes = new Uint8Array(size); let offset = 0
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length }
  }
  return new Blob([bytes], { type: providerMediaMime(bytes, media.type) })
}

async function blobDataUrl(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer()); let binary = ''
  for (let offset = 0; offset < bytes.length; offset += 8192) binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192))
  return `data:${blob.type};base64,${btoa(binary)}`
}

export async function saveProviderToGallery(media: ProviderMedia, previewBlob?: Blob): Promise<GalleryItem> {
  let dataUrl = media.src.startsWith('data:') ? media.src : undefined
  let localPath = media.localPath
  let width = media.width ?? 0, height = media.height ?? 0
  let filename = `provider-${crypto.randomUUID()}.${media.type === 'video' ? 'mp4' : 'png'}`
  if (!dataUrl && !/^https:\/\//.test(media.src)) throw new Error('The provider returned an unsupported media URL.')
  if (media.type === 'image' && !localPath) {
    if (!isTauri()) throw new Error('Open Drool desktop to save images to the persistent library.')
    if (!dataUrl) {
      const blob = previewBlob ?? await downloadProviderMedia(media)
      if (blob.size > 24_000_000) throw new Error('Image is too large to import.')
      dataUrl = await blobDataUrl(blob)
    }
    const { invoke } = await import('@tauri-apps/api/core')
    const saved: unknown = await invoke('drool_save_provider_image', { dataUrl })
    if (!isRecord(saved) || typeof saved.path !== 'string' || typeof saved.filename !== 'string' || typeof saved.width !== 'number' || typeof saved.height !== 'number') throw new Error('Image could not be verified and saved.')
    localPath = saved.path; filename = saved.filename; width = saved.width; height = saved.height
  }
  const item: GalleryItem = { id: crypto.randomUUID(), type: media.type, filename, subfolder: '', prompt: media.prompt, negativePrompt: '', model: media.model, modelType: 'unknown', seed: -1, steps: 0, cfgScale: 0, sampler: '', scheduler: '', width, height, batchSize: 1, createdAt: Date.now(), dataUrl, localPath, remoteUrl: media.type === 'video' ? media.src : undefined, label: `${media.model} ${media.type}` }
  useCreateStore.getState().addToGallery(item)
  return item
}
