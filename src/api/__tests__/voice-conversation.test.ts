import { describe, expect, it, vi, afterEach } from 'vitest'
const mocks = vi.hoisted(() => ({ providers: { openai: { enabled: true, isLocal: true, baseUrl: 'http://127.0.0.1:8127/v1' }, ollama: { enabled: true, isLocal: true } } }))
vi.mock('../backend', () => ({ getOllamaBase: () => 'http://localhost:11434' }))
vi.mock('../providers', () => ({ getProviderForModel: vi.fn(), getProviderIdFromModel: (model: string) => model.includes('::') ? model.split('::')[0] : 'ollama' }))
vi.mock('../../stores/providerStore', () => ({ useProviderStore: { getState: () => ({ providers: mocks.providers }) } }))
vi.mock('../../stores/generationStore', () => ({ useGenerationStore: { getState: () => ({ abortConversation: vi.fn() }) } }))
vi.mock('../../lib/run-slot', () => ({ runInLane: vi.fn() }))
vi.mock('../voice', () => ({ createAudioRecorder: vi.fn(), parseWavPcm: vi.fn(), transcribeAudio: vi.fn(), playNeuralAudio: vi.fn(), stopNeuralAudio: vi.fn() }))
import { assertLocalConversationModel, SilenceTurnDetector, createLocalVoiceConversation } from '../voice-conversation'
import { createAudioRecorder, parseWavPcm, transcribeAudio, playNeuralAudio } from '../voice'
import { getProviderForModel, type ProviderClient } from '../providers'
import { runInLane } from '../../lib/run-slot'

describe('local voice conversation', () => {
  afterEach(() => { vi.useRealTimers(); vi.clearAllMocks() })
  it('allows only configured local chat providers on loopback', () => {
    expect(() => assertLocalConversationModel('openai::model')).not.toThrow()
    expect(() => assertLocalConversationModel('local-ollama-model')).not.toThrow()
    expect(() => assertLocalConversationModel('lu-cloud::model')).toThrow('local chat')
    expect(() => assertLocalConversationModel('')).toThrow('Select')
    const original = mocks.providers.openai.baseUrl
    mocks.providers.openai.baseUrl = 'https://api.openai.com/v1'
    expect(() => assertLocalConversationModel('openai::model')).toThrow('this PC')
    mocks.providers.openai.baseUrl = original
  })
  it('never submits sustained silence to the recognizer', () => {
    const detector = new SilenceTurnDetector(0)
    expect(detector.observe(new Float32Array(100), 10000)).toBe('continue')
    expect(detector.observe(new Float32Array(100), 31000)).toBe('idle')
  })
  it('requires sustained voice energy and a pause before ending the turn', () => {
    const detector = new SilenceTurnDetector(0)
    const speech = new Float32Array(100).fill(0.1)
    expect(detector.observe(speech, 200)).toBe('continue')
    expect(detector.observe(speech, 400)).toBe('continue')
    expect(detector.observe(speech, 600)).toBe('continue')
    expect(detector.observe(new Float32Array(100), 1400)).toBe('continue')
    expect(detector.observe(new Float32Array(100), 1800)).toBe('submit')
  })
  it('does not treat one click as a spoken turn', () => {
    const detector = new SilenceTurnDetector(0)
    detector.observe(new Float32Array(100).fill(0.3), 200)
    expect(detector.observe(new Float32Array(100), 31000)).toBe('idle')
  })
  it('runs a detected speech turn through local STT, chat and TTS, then listens again', async () => {
    vi.useFakeTimers()
    const recorder = { start: vi.fn(async () => {}), stop: vi.fn(async () => new Blob()), isRecording: vi.fn(() => true), snapshot: vi.fn(() => ({ arrayBuffer: async () => new ArrayBuffer(0) } as Blob)) }
    vi.mocked(createAudioRecorder).mockReturnValue(recorder)
    vi.mocked(parseWavPcm).mockReturnValue({ sampleRate: 16000, channels: [new Float32Array(3200).fill(0.1)] })
    vi.mocked(transcribeAudio).mockResolvedValue('Tell me a story')
    vi.mocked(runInLane).mockImplementation(async (_options, body) => { await body(null); return 'ran' })
    const chatStream = vi.fn(async function* () { yield { content: 'Once upon a time.', done: true } })
    vi.mocked(getProviderForModel).mockReturnValue({ provider: { chatStream } as unknown as ProviderClient, modelId: 'model' })
    vi.mocked(playNeuralAudio).mockResolvedValue()
    const onMessage = vi.fn()
    const synthesize = vi.fn(async () => 'blob:reply')
    const conversation = createLocalVoiceConversation({ model: 'openai::model', synthesize, onMessage, onPhase: vi.fn(), onError: vi.fn() })
    await conversation.start()
    await vi.advanceTimersByTimeAsync(600)
    vi.mocked(parseWavPcm).mockReturnValue({ sampleRate: 16000, channels: [new Float32Array(3200)] })
    await vi.advanceTimersByTimeAsync(1400)
    expect(transcribeAudio).toHaveBeenCalledOnce()
    expect(onMessage.mock.calls).toEqual([['user', 'Tell me a story'], ['assistant', 'Once upon a time.']])
    expect(synthesize).toHaveBeenCalledWith('Once upon a time.', expect.any(AbortSignal))
    expect(playNeuralAudio).toHaveBeenCalledWith('blob:reply')
    expect(recorder.start).toHaveBeenCalledTimes(2)
    conversation.stop()
    expect(vi.getTimerCount()).toBe(0)
  })
  it('ending a session prevents late transcription from starting chat or speech', async () => {
    vi.useFakeTimers()
    const recorder = { start: vi.fn(async () => {}), stop: vi.fn(async () => new Blob()), isRecording: vi.fn(() => true), snapshot: vi.fn(() => ({ arrayBuffer: async () => new ArrayBuffer(0) } as Blob)) }
    vi.mocked(createAudioRecorder).mockReturnValue(recorder)
    vi.mocked(parseWavPcm).mockReturnValue({ sampleRate: 16000, channels: [new Float32Array(3200).fill(0.1)] })
    let finishTranscription: (text: string) => void = () => {}
    vi.mocked(transcribeAudio).mockImplementation(() => new Promise((resolve) => { finishTranscription = resolve }))
    vi.mocked(runInLane).mockImplementation(async (_options, body) => { await body(null); return 'ran' })
    const synthesize = vi.fn(async () => 'blob:late')
    const conversation = createLocalVoiceConversation({ model: 'openai::model', synthesize, onMessage: vi.fn(), onPhase: vi.fn(), onError: vi.fn() })
    await conversation.start()
    await vi.advanceTimersByTimeAsync(600)
    vi.mocked(parseWavPcm).mockReturnValue({ sampleRate: 16000, channels: [new Float32Array(3200)] })
    await vi.advanceTimersByTimeAsync(1400)
    expect(transcribeAudio).toHaveBeenCalledOnce()
    conversation.stop()
    finishTranscription('Late text')
    await vi.advanceTimersByTimeAsync(1000)
    expect(getProviderForModel).not.toHaveBeenCalled()
    expect(synthesize).not.toHaveBeenCalled()
    expect(recorder.start).toHaveBeenCalledOnce()
    expect(vi.getTimerCount()).toBe(0)
  })
})
