import { describe, expect, it, vi, beforeEach } from 'vitest'
import { localAudioOrigin, discoverAudioModels, buildAudioSpeechRequest, synthesizeAudioCpp, referenceWavBase64, type AudioModel } from '../voice-studio'
import { localFetch } from '../backend'
vi.mock('../backend', () => ({ localFetch: vi.fn() }))
vi.mock('../voice', () => ({ base64ToBlobUrl: vi.fn(() => 'blob:test-audio') }))
const model: AudioModel = { id: 'narrator', family: 'voxcpm2', task: 'tts', mode: 'offline', loaded: false }

describe('local Voice Studio adapter', () => {
  beforeEach(() => vi.clearAllMocks())
  it('restricts speech and references to explicit loopback origins', () => {
    expect(localAudioOrigin('http://127.0.0.1:8080/')).toBe('http://127.0.0.1:8080')
    expect(localAudioOrigin('http://[::1]:8080')).toBe('http://[::1]:8080')
    for (const address of ['https://example.com', 'http://localhost.evil.com', 'http://127.0.0.1@evil.com', 'http://192.168.1.10', 'http://localhost:8080/v1', 'http://user:pass@localhost']) {
      expect(() => localAudioOrigin(address)).toThrow()
    }
  })
  it('uses reported model families rather than inferring capabilities from names', async () => {
    vi.mocked(localFetch).mockResolvedValue(new Response(JSON.stringify({ data: [model, { id: 'voxcpm2-impostor' }] })))
    expect(await discoverAudioModels('http://localhost:8080')).toEqual([model])
  })
  it('only enables verified VoxCPM2 design and clone fields', () => {
    expect(buildAudioSpeechRequest(model, 'Hello', { design: 'warm', referenceBase64: 'YWJj', referenceText: 'Hi' }))
      .toEqual({ model: 'narrator', input: '(warm)Hello', response_format: 'json', voice_ref: { type: 'base64', data: 'YWJj' }, reference_text: 'Hi' })
    expect(() => buildAudioSpeechRequest({ ...model, family: 'pocket_tts' }, 'Hello', { design: 'warm' })).toThrow('verified VoxCPM2')
    expect(() => buildAudioSpeechRequest({ ...model, task: 'asr' }, 'Hello')).toThrow('text-to-speech')
  })
  it('reads the audio.cpp JSON audio field and reports empty output', async () => {
    vi.mocked(localFetch).mockResolvedValueOnce(new Response(JSON.stringify({ audio: 'YWJj', format: 'wav' })))
    expect(await synthesizeAudioCpp('http://localhost:8080', model, 'Hello', {})).toBe('blob:test-audio')
    vi.mocked(localFetch).mockResolvedValueOnce(new Response('{}'))
    await expect(synthesizeAudioCpp('http://localhost:8080', model, 'Hello', {})).rejects.toThrow('no WAV audio')
  })
  it('never turns backend rejection into a successful audio asset', async () => {
    vi.mocked(localFetch).mockResolvedValue(new Response('bad model', { status: 400 }))
    await expect(synthesizeAudioCpp('http://localhost:8080', model, 'Hello', {})).rejects.toThrow('HTTP 400')
  })
  it('rejects non-WAV reference data before sending it to the backend', async () => {
    const file = { size: 20, arrayBuffer: async () => new TextEncoder().encode('not a wav recording').buffer } as File
    await expect(referenceWavBase64(file)).rejects.toThrow('valid WAV')
  })
})
