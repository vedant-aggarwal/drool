import { useEffect, useRef, useState } from 'react'
import { Mic, Square } from 'lucide-react'
import { Button } from '../create/ui/Button'
import { SpeechSettings } from '../settings/SpeechSettings'
import { useModelStore } from '../../stores/modelStore'
import { useSettingsStore } from '../../stores/settingsStore'
import { checkWhisperAvailable, checkTtsAvailable, synthesizeNeural } from '../../api/voice'
import { synthesizeAudioCpp, type AudioModel } from '../../api/voice-studio'
import { assertLocalConversationModel, createLocalVoiceConversation, type ConversationPhase } from '../../api/voice-conversation'
import { isTauri } from '../../api/backend'
import { displayModelName } from '../../api/providers/model-name'

export function VoiceConversation({ engine, endpoint, model, voice, design, piperVoice, disabled, onActive }: {
  engine: 'piper' | 'audio.cpp'; endpoint: string; model?: AudioModel; voice: string; design: string; piperVoice: string; disabled: boolean
  onActive: (active: boolean) => void
}) {
  const activeModel = useModelStore((state) => state.activeModel)
  const appMode = useSettingsStore((state) => state.settings.appMode)
  const [phase, setPhase] = useState<ConversationPhase>('idle')
  const [error, setError] = useState('')
  const [starting, setStarting] = useState(false)
  const [messages, setMessages] = useState<Array<{ role: string; text: string }>>([])
  const [setup, setSetup] = useState(false)
  const session = useRef<ReturnType<typeof createLocalVoiceConversation> | null>(null)
  const run = useRef(0)
  const engaged = starting || ['listening', 'thinking', 'transcribing', 'speaking'].includes(phase)
  useEffect(() => { onActive(engaged) }, [engaged, onActive])
  useEffect(() => () => { run.current++; session.current?.stop() }, [])
  useEffect(() => {
    let disposed = false
    let unlisten: (() => void) | undefined
    const halt = () => { run.current++; session.current?.stop(); setStarting(false) }
    const visibility = () => { if (document.hidden) halt() }
    document.addEventListener('visibilitychange', visibility)
    if (isTauri()) void import('@tauri-apps/api/event').then(async ({ listen }) => {
      const off = await listen('app:hidden', halt)
      if (disposed) off(); else unlisten = off
    })
    return () => { disposed = true; unlisten?.(); document.removeEventListener('visibilitychange', visibility) }
  }, [])
  // Stop if settings change while a session is using a captured engine/model.
  useEffect(() => () => { run.current++; session.current?.stop(); setStarting(false) }, [engine, endpoint, model?.id, activeModel, voice, design, piperVoice])

  async function start() {
    const generation = ++run.current
    setStarting(true); setError('')
    try {
      assertLocalConversationModel(activeModel ?? '')
      const stt = await checkWhisperAvailable()
      if (!stt.available) throw new Error('Install local Whisper below before starting a conversation.')
      if (engine === 'piper' && !(await checkTtsAvailable(piperVoice)).available) throw new Error('Install Piper and a voice below before starting a conversation.')
      if (engine === 'audio.cpp' && !model) throw new Error('Check engines and select an audio.cpp speech model first.')
      if (generation !== run.current) return
      setMessages([])
      session.current = createLocalVoiceConversation({
        model: activeModel!, onPhase: setPhase, onError: setError,
        onMessage: (role, text) => setMessages((current) => [...current, { role, text }].slice(-24)),
        synthesize: (text, signal) => engine === 'piper'
          ? synthesizeNeural(text, piperVoice)
          : synthesizeAudioCpp(endpoint, model!, text, { voice, design: model?.family === 'voxcpm2' ? design : undefined }, signal),
      })
      await session.current.start()
    } catch (err) { if (generation === run.current) { setError(err instanceof Error ? err.message : String(err)); setPhase('error') } }
    finally { if (generation === run.current) setStarting(false) }
  }
  function stop() { run.current++; session.current?.stop(); setStarting(false) }

  return <section className="rounded-2xl border border-white/10 bg-white/[0.025] p-5 space-y-4" aria-label="Local voice conversation">
    <h2 className="t-section-title">Talk to your local model</h2>
    <p className="text-gray-400">Start a conversation, speak, then pause to send your turn. The microphone pauses while the model replies and opens again afterwards. Use Interrupt to speak again.</p>
    <p>Chat model: <span className="text-gray-400">{activeModel ? displayModelName(activeModel) : 'Choose an installed model in Chat'}</span></p>
    <div className="flex flex-wrap gap-2">
      <Button icon={Mic} variant="primary" disabled={disabled || engaged} onClick={() => void start()}>Start local conversation</Button>
      <Button disabled={!engaged || starting || phase === 'listening'} onClick={() => void session.current?.interrupt()}>Interrupt & listen</Button>
      <Button icon={Square} disabled={!engaged} onClick={stop}>End conversation</Button>
      <Button variant="ghost" disabled={engaged} onClick={() => setSetup(!setup)}>{setup ? 'Hide voice setup' : 'Set up Whisper & Piper'}</Button>
    </div>
    <p role="status" className="text-gray-400">{starting ? 'Checking local engines…' : `Conversation: ${phase}`}. Voice turns stay in this session and are not saved to Chat.</p>
    {error && <p role="alert" className="text-red-300">{error}</p>}
    {messages.length > 0 && <ol className="max-h-64 space-y-3 overflow-y-auto rounded-xl bg-white/5 p-4" aria-label="Voice transcript">{messages.map((item, index) => <li key={index}><span className="font-semibold">{item.role === 'user' ? 'You' : 'Drool'}: </span>{item.text}</li>)}</ol>}
    {setup && (appMode === 'local' ? <SpeechSettings /> : <p className="text-gray-400">Switch the app to Local mode to use the existing local Whisper/Piper installer controls in Settings → Voice & Remote.</p>)}
    <p className="text-gray-500">Turn-based local voice, with a 30-second maximum per recording. Full-duplex automatic interruption is not enabled. No tools are executed from this conversation.</p>
  </section>
}
