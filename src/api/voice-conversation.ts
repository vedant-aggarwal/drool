import { getOllamaBase } from './backend'
import { getProviderForModel, getProviderIdFromModel, type ChatMessage } from './providers'
import { useProviderStore } from '../stores/providerStore'
import { useGenerationStore } from '../stores/generationStore'
import { runInLane } from '../lib/run-slot'
import { createAudioRecorder, parseWavPcm, transcribeAudio, playNeuralAudio, stopNeuralAudio, type AudioRecorder } from './voice'

export type ConversationPhase = 'idle' | 'listening' | 'transcribing' | 'thinking' | 'speaking' | 'stopped' | 'error'

export function assertLocalConversationModel(model: string) {
  if (!model) throw new Error('Select an installed local chat model in Chat first.')
  const id = getProviderIdFromModel(model)
  if (id !== 'ollama' && id !== 'openai') throw new Error('Voice conversation requires a local chat model.')
  const provider = useProviderStore.getState().providers[id]
  if (!provider?.enabled || !provider.isLocal) throw new Error('Enable a local chat backend first.')
  const url = new URL(id === 'ollama' ? getOllamaBase() : provider.baseUrl)
  if (url.protocol !== 'http:' || !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)) {
    throw new Error('Voice conversation only connects to a chat backend on this PC.')
  }
}

/** Small energy detector, not a speech recognizer. Requires sustained energy
 * before silence can end a turn; all-silence recordings never reach Whisper. */
export class SilenceTurnDetector {
  voicedFrames = 0
  lastVoice = 0
  readonly startedAt: number
  constructor(startedAt: number) { this.startedAt = startedAt }
  observe(samples: Float32Array, now: number): 'continue' | 'submit' | 'idle' {
    const rms = Math.sqrt(samples.reduce((sum, value) => sum + value * value, 0) / Math.max(1, samples.length))
    if (rms > 0.018) { this.voicedFrames++; this.lastVoice = now }
    if (this.voicedFrames >= 3 && now - this.lastVoice > 1100) return 'submit'
    if (now - this.startedAt > 30000) return this.voicedFrames >= 3 ? 'submit' : 'idle'
    return 'continue'
  }
}

export function createLocalVoiceConversation(options: {
  model: string
  synthesize: (text: string, signal: AbortSignal) => Promise<string>
  onPhase: (phase: ConversationPhase) => void
  onMessage: (role: 'user' | 'assistant', text: string) => void
  onError: (message: string) => void
}) {
  const id = `drool-voice-${crypto.randomUUID()}`
  let generation = 0
  let active = false
  let recorder: AudioRecorder | null = null
  let timer: ReturnType<typeof setInterval> | null = null
  let controller: AbortController | null = null
  const messages: ChatMessage[] = [{ role: 'system', content: 'You are a helpful voice companion in Drool. Reply conversationally in one or two concise sentences unless asked for detail. Do not use markdown. You have no tools in this conversation.' }]

  function cleanup() {
    generation++
    controller?.abort()
    useGenerationStore.getState().abortConversation(id)
    if (timer) clearInterval(timer)
    timer = null
    if (recorder?.isRecording()) void recorder.stop().catch(() => {})
    recorder = null
    stopNeuralAudio()
  }

  function fail(error: unknown) {
    active = false; cleanup()
    options.onPhase('error')
    options.onError(error instanceof Error ? error.message : String(error))
  }

  async function listen() {
    if (!active) return
    const run = ++generation
    const current = createAudioRecorder()
    recorder = current
    await current.start()
    if (!active || run !== generation) { await current.stop(); return }
    options.onPhase('listening')
    const detector = new SilenceTurnDetector(Date.now())
    let checking = false
    timer = setInterval(() => {
      if (checking || run !== generation) return
      checking = true
      void (async () => {
        const snapshot = current.snapshot()
        if (!snapshot) return
        const parsed = parseWavPcm(await snapshot.arrayBuffer())
        if (!parsed || run !== generation) return
        const recent = parsed.channels[0].slice(-Math.round(parsed.sampleRate * 0.2))
        const decision = detector.observe(recent, Date.now())
        if (decision === 'continue') return
        if (timer) clearInterval(timer)
        timer = null; recorder = null
        const wav = await current.stop()
        if (run !== generation || !active) return
        if (decision === 'idle') { await listen(); return }
        await turn(wav, run)
      })().catch((error: unknown) => { if (run === generation) fail(error) }).finally(() => { checking = false })
    }, 200)
  }

  async function turn(wav: Blob, run: number) {
    const currentController = new AbortController()
    controller = currentController
    const signal = currentController.signal
    options.onPhase('transcribing')
    await runInLane({ conversationId: id, lane: 'local', abort: () => currentController.abort() }, async () => {
      if (signal.aborted || run !== generation) return
      const text = (await transcribeAudio(wav)).trim()
      if (signal.aborted || run !== generation || !text) return
      options.onMessage('user', text)
      messages.push({ role: 'user', content: text })
      // Revalidate each turn: changing providers must never send an ongoing
      // local voice session to a newly configured cloud endpoint.
      assertLocalConversationModel(options.model)
      options.onPhase('thinking')
      const { provider, modelId } = getProviderForModel(options.model)
      let answer = ''
      for await (const chunk of provider.chatStream(modelId, [messages[0], ...messages.slice(1).slice(-12)], { signal, maxTokens: 320, thinking: false })) {
        if (signal.aborted || run !== generation) return
        answer += chunk.content
      }
      if (!answer.trim()) throw new Error('The local model returned no spoken reply.')
      messages.push({ role: 'assistant', content: answer })
      options.onMessage('assistant', answer)
      options.onPhase('speaking')
      const url = await options.synthesize(answer, signal)
      try {
        if (!signal.aborted && run === generation) await playNeuralAudio(url)
      } finally { URL.revokeObjectURL(url) }
    })
    if (active && run === generation && !signal.aborted) await listen()
  }

  return {
    async start() { assertLocalConversationModel(options.model); active = true; try { await listen() } catch (error) { fail(error) } },
    async interrupt() { cleanup(); if (active) { try { await listen() } catch (error) { fail(error) } } },
    stop() { active = false; cleanup(); options.onPhase('stopped') },
  }
}
