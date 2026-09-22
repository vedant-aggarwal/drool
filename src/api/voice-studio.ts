import { localFetch } from './backend'
import { base64ToBlobUrl } from './voice'

export interface AudioModel { id: string; family: string; task: string; mode: string; loaded: boolean }

/** Voice Studio never sends recordings or scripts to a remote host. */
export function localAudioOrigin(value: string): string {
  const url = new URL(value)
  if (url.protocol !== 'http:' || !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
    || url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
    throw new Error('Use a local HTTP address, for example http://127.0.0.1:8080')
  }
  return url.origin
}

async function request(base: string, path: string, body?: unknown, signal?: AbortSignal): Promise<unknown> {
  const response = await localFetch(`${localAudioOrigin(base)}${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    timeoutMs: body === undefined ? 5000 : 180000,
    signal,
  })
  if (!response.ok) throw new Error(`Local audio server returned HTTP ${response.status}. Check its model and runtime logs.`)
  return response.json()
}

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' ? value as Record<string, unknown> : {}
}

export async function discoverAudioModels(base: string, signal?: AbortSignal): Promise<AudioModel[]> {
  const data = record(await request(base, '/v1/models', undefined, signal)).data
  if (!Array.isArray(data)) throw new Error('This server did not return an audio.cpp model catalog.')
  return data.flatMap((item: unknown) => {
    const model = record(item)
    if (typeof model.id !== 'string' || typeof model.family !== 'string' || typeof model.task !== 'string') return []
    return [{ id: model.id, family: model.family, task: model.task, mode: String(model.mode ?? 'offline'), loaded: model.loaded === true }]
  })
}

export async function discoverAudioVoices(base: string, model: string, signal?: AbortSignal): Promise<string[]> {
  const voices = record(await request(base, `/v1/audio/voices?model=${encodeURIComponent(model)}`, undefined, signal)).voices
  return Array.isArray(voices) ? voices.filter((voice): voice is string => typeof voice === 'string') : []
}

export function buildAudioSpeechRequest(model: AudioModel, text: string, options: {
  voice?: string; design?: string; referenceBase64?: string; referenceText?: string
} = {}) {
  if (!text.trim()) throw new Error('Add some text to speak.')
  if (model.task !== 'tts') throw new Error('Choose a text-to-speech model.')
  if ((options.design || options.referenceBase64) && model.family !== 'voxcpm2') {
    throw new Error('Voice design and reference cloning are enabled only for the verified VoxCPM2 adapter.')
  }
  return {
    model: model.id,
    input: options.design?.trim() ? `(${options.design.trim()})${text.trim()}` : text.trim(),
    response_format: 'json',
    ...(options.voice ? { voice: options.voice } : {}),
    ...(options.referenceBase64 ? { voice_ref: { type: 'base64', data: options.referenceBase64 } } : {}),
    ...(options.referenceBase64 && options.referenceText ? { reference_text: options.referenceText } : {}),
  }
}

export async function synthesizeAudioCpp(base: string, model: AudioModel, text: string,
  options: Parameters<typeof buildAudioSpeechRequest>[2], signal?: AbortSignal): Promise<string> {
  const result = record(await request(base, '/v1/audio/speech', buildAudioSpeechRequest(model, text, options), signal))
  if (typeof result.audio !== 'string' || !result.audio) throw new Error('Local audio server returned no WAV audio.')
  return base64ToBlobUrl(result.audio, 'audio/wav')
}

export async function referenceWavBase64(file: File): Promise<string> {
  if (file.size > 5 * 1024 * 1024) throw new Error('Choose a reference WAV smaller than 5 MB.')
  const bytes = new Uint8Array(await file.arrayBuffer())
  const ascii = (start: number, end: number) => String.fromCharCode(...bytes.slice(start, end))
  if (ascii(0, 4) !== 'RIFF' || ascii(8, 12) !== 'WAVE') throw new Error('Choose a valid WAV reference recording.')
  let binary = ''
  for (let offset = 0; offset < bytes.length; offset += 8192) binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192))
  return btoa(binary)
}
