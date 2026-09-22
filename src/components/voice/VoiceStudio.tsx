import { useEffect, useRef, useState } from 'react'
import { AudioLines, Mic, RefreshCw, Square, Volume2 } from 'lucide-react'
import { Button } from '../create/ui/Button'
import { VoiceConversation } from './VoiceConversation'
import { isTauri } from '../../api/backend'
import { displayModelName } from '../../api/providers/model-name'
import { useVoiceStore } from '../../stores/voiceStore'
import { useVoiceStudioStore } from '../../stores/voiceStudioStore'
import { checkWhisperAvailable, checkTtsAvailable, createAudioRecorder, transcribeAudio,
  synthesizeNeural, type AudioRecorder } from '../../api/voice'
import { discoverAudioModels, discoverAudioVoices, synthesizeAudioCpp, referenceWavBase64,
  type AudioModel } from '../../api/voice-studio'

const INPUT = 'w-full min-h-10 rounded-[var(--radius-control)] border border-white/10 bg-white/5 px-3 py-2 text-gray-100 outline-none focus-visible:ring-2 focus-visible:ring-white/40 disabled:opacity-50'
const PANEL = 'rounded-2xl border border-white/10 bg-white/[0.025] p-5 space-y-4'
const message = (error: unknown) => error instanceof Error ? error.message : String(error)

export function VoiceStudio() {
  const settings = useVoiceStudioStore()
  const piperVoice = useVoiceStore((state) => state.piperVoice)
  const [text, setText] = useState('Welcome to Drool. Let’s give your next story a voice.')
  const [models, setModels] = useState<AudioModel[]>([])
  const [voices, setVoices] = useState<string[]>([])
  const [health, setHealth] = useState<{ stt: boolean; tts: boolean } | null>(null)
  const [busy, setBusy] = useState('')
  const [recording, setRecording] = useState(false)
  const [conversationActive, setConversationActive] = useState(false)
  const [notice, setNotice] = useState('Check your engines to see what is ready on this PC.')
  const [error, setError] = useState('')
  const [audio, setAudio] = useState('')
  const [reference, setReference] = useState<File | null>(null)
  const [referenceText, setReferenceText] = useState('')
  const recorder = useRef<AudioRecorder | null>(null)
  const player = useRef<HTMLAudioElement | null>(null)
  const abort = useRef<AbortController | null>(null)
  const generation = useRef(0)
  const selected = models.find((model) => model.id === settings.modelId)
  const canDesign = settings.engine === 'audio.cpp' && selected?.family === 'voxcpm2'

  useEffect(() => () => {
    generation.current++
    abort.current?.abort()
    if (recorder.current?.isRecording()) void recorder.current.stop().catch(() => {})
  }, [])
  useEffect(() => () => { if (audio) URL.revokeObjectURL(audio) }, [audio])
  useEffect(() => { if (conversationActive) player.current?.pause() }, [conversationActive])
  useEffect(() => {
    let disposed = false
    let unlisten: (() => void) | undefined
    const halt = () => {
      generation.current++
      abort.current?.abort()
      player.current?.pause()
      if (recorder.current?.isRecording()) void recorder.current.stop().catch(() => {})
      recorder.current = null
      setRecording(false); setBusy('')
    }
    const visibility = () => { if (document.hidden) halt() }
    document.addEventListener('visibilitychange', visibility)
    if (isTauri()) void import('@tauri-apps/api/event').then(async ({ listen }) => {
      const off = await listen('app:hidden', halt)
      if (disposed) off(); else unlisten = off
    })
    return () => { disposed = true; unlisten?.(); document.removeEventListener('visibilitychange', visibility) }
  }, [])

  async function check() {
    const run = ++generation.current
    abort.current?.abort()
    const controller = new AbortController()
    abort.current = controller
    setBusy('Checking engines'); setError('')
    try {
      const [stt, tts] = await Promise.allSettled([checkWhisperAvailable(), checkTtsAvailable(piperVoice)])
      if (run !== generation.current) return
      setHealth({ stt: stt.status === 'fulfilled' && stt.value.available, tts: tts.status === 'fulfilled' && tts.value.available })
      if (settings.engine === 'audio.cpp') {
        const found = await discoverAudioModels(settings.endpoint, controller.signal)
        if (run !== generation.current) return
        const speechModels = found.filter((model) => model.task === 'tts')
        setModels(speechModels)
        const next = speechModels.find((model) => model.id === settings.modelId) ?? speechModels[0]
        settings.update({ modelId: next?.id ?? '', voice: '' })
        setVoices([])
        if (next) {
          const available = await discoverAudioVoices(settings.endpoint, next.id, controller.signal)
          if (run !== generation.current) return
          setVoices(available)
        }
        setNotice(speechModels.length ? `${speechModels.length} speech model(s) found. Models load on the server when needed.` : 'Server connected, but no text-to-speech model is configured.')
      } else setNotice('Engine check finished. Missing engines can be installed from Settings → Voice.')
    } catch (err) {
      if (run === generation.current) { setModels([]); setVoices([]); setError(message(err)) }
    } finally { if (run === generation.current) setBusy('') }
  }

  async function changeModel(id: string) {
    settings.update({ modelId: id, voice: '' }); setVoices([]); setError('')
    const run = ++generation.current
    setBusy('Loading voice presets')
    try {
      const found = await discoverAudioVoices(settings.endpoint, id)
      if (run === generation.current) setVoices(found)
    } catch (err) { if (run === generation.current) setError(message(err)) }
    finally { if (run === generation.current) setBusy('') }
  }

  async function generate() {
    const run = ++generation.current
    const controller = new AbortController()
    abort.current = controller
    setBusy('Generating speech'); setError('')
    try {
      const url = settings.engine === 'piper'
        ? await synthesizeNeural(text.trim(), piperVoice)
        : await synthesizeAudioCpp(settings.endpoint, selected!, text, {
          voice: settings.voice,
          design: canDesign ? settings.design : undefined,
          referenceBase64: canDesign && reference ? await referenceWavBase64(reference) : undefined,
          referenceText: canDesign ? referenceText : undefined,
        }, controller.signal)
      if (run !== generation.current) { URL.revokeObjectURL(url); return }
      setAudio(url); setNotice('Speech is ready. Play it below or save the WAV file.')
    } catch (err) { if (run === generation.current) setError(message(err)) }
    finally { if (run === generation.current) setBusy('') }
  }

  async function toggleRecording() {
    setError('')
    if (recording && recorder.current) {
      const run = ++generation.current
      const current = recorder.current
      recorder.current = null
      setRecording(false); setBusy('Transcribing locally')
      try {
        const transcript = await transcribeAudio(await current.stop())
        if (run !== generation.current) return
        if (transcript.trim()) { setText(transcript); setNotice('Local transcript added to your script.') }
        else setNotice('No speech detected. Try another recording.')
      } catch (err) { if (run === generation.current) setError(message(err)) }
      finally { if (run === generation.current) setBusy('') }
    } else {
      const run = ++generation.current
      const current = createAudioRecorder()
      recorder.current = current
      setBusy('Opening microphone')
      try {
        await current.start()
        if (run !== generation.current) { await current.stop(); return }
        setRecording(true); setNotice('Recording locally. Stop to transcribe into your script.')
      } catch (err) { if (run === generation.current) setError(message(err)) }
      finally { if (run === generation.current) setBusy('') }
    }
  }

  function stop() {
    generation.current++
    abort.current?.abort()
    player.current?.pause()
    if (recorder.current?.isRecording()) void recorder.current.stop().catch(() => {})
    recorder.current = null
    setRecording(false); setBusy(''); setNotice('Stopped. A Piper job already running may finish in the background; its output will be discarded.')
  }

  return <main className="h-full overflow-y-auto text-gray-200">
    <div className="mx-auto max-w-5xl space-y-6 p-4 sm:p-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div><div className="mb-2 flex items-center gap-2 text-gray-400"><AudioLines size={18} /><span className="t-label">LOCAL VOICE STUDIO</span></div>
          <h1 className="t-title text-balance">Give your story a voice</h1>
          <p className="mt-2 max-w-2xl text-gray-400 text-pretty">Dictate a script, create speech, and explore voices. Audio and scripts stay on this PC.</p></div>
        <Button icon={RefreshCw} disabled={!!busy || recording || conversationActive} onClick={() => void check()}>Check engines</Button>
      </header>
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        <section className={PANEL} aria-label="Voice engine">
          <h2 className="t-section-title">Your engine</h2>
          <label className="block space-y-2"><span>Speech engine</span><select className={INPUT} value={settings.engine} disabled={!!busy || recording}
            onChange={(event) => { settings.update({ engine: event.target.value as 'piper' | 'audio.cpp' }); setModels([]); setVoices([]) }}>
            <option value="piper">Piper · built-in local speech</option><option value="audio.cpp">audio.cpp · local model server</option>
          </select></label>
          <div className="rounded-xl bg-white/5 p-3 text-gray-400" role="status">
            <p>Whisper dictation: {health ? health.stt ? 'Ready' : 'Not available' : 'Not checked'}</p>
            <p>Piper speech: {health ? health.tts ? 'Ready' : 'Not available' : 'Not checked'}</p>
          </div>
          {settings.engine === 'piper' ? <p className="text-gray-400">Uses your selected Piper voice: <span className="text-gray-200">{piperVoice}</span>. Choose or install voices in Settings → Voice.</p> : <>
            <label className="block space-y-2"><span>Local server address</span><input className={INPUT} value={settings.endpoint} disabled={!!busy || recording} spellCheck={false}
              onChange={(event) => { settings.update({ endpoint: event.target.value }); setModels([]); setVoices([]) }} /></label>
            <label className="block space-y-2"><span>Speech model</span><select className={INPUT} value={settings.modelId} disabled={!!busy || recording || !models.length} onChange={(event) => void changeModel(event.target.value)}>
              {!models.length && <option value="">Check engines to discover models</option>}
              {models.map((model) => <option key={model.id} value={model.id}>{displayModelName(model.id)} · {model.family}</option>)}
            </select></label>
            {voices.length > 0 && <label className="block space-y-2"><span>Saved voice</span><select className={INPUT} value={settings.voice} disabled={!!busy || recording} onChange={(event) => settings.update({ voice: event.target.value })}>
              <option value="">Model default</option>{voices.map((voice) => <option key={voice}>{voice}</option>)}
            </select></label>}
            <p className="text-gray-400">Run audio.cpp locally with a TTS model first. No model downloads start automatically.</p>
            <a className="inline-block min-h-10 py-2 text-gray-200 underline underline-offset-4" href="https://github.com/0xShug0/audio.cpp" target="_blank" rel="noreferrer">audio.cpp setup guide ↗</a>
          </>}
        </section>
        <section className={PANEL} aria-label="Speech script">
          <h2 className="t-section-title">Script & delivery</h2>
          <label className="block space-y-2"><span>Text to speak</span><textarea className={`${INPUT} min-h-40 resize-y`} value={text} maxLength={10000} disabled={!!busy || recording} onChange={(event) => setText(event.target.value)} /></label>
          {canDesign && <>
            <label className="block space-y-2"><span>Voice direction <span className="text-gray-400">· optional</span></span><input className={INPUT} value={settings.design} disabled={!!busy || recording} placeholder="Warm narrator, calm pace, gently curious" onChange={(event) => settings.update({ design: event.target.value })} /></label>
            <label className="block space-y-2"><span>Reference voice <span className="text-gray-400">· WAV, up to 5 MB</span></span><input type="file" accept="audio/wav,.wav" className={INPUT} disabled={!!busy || recording} onChange={(event) => setReference(event.target.files?.[0] ?? null)} /></label>
            {reference && <><label className="block space-y-2"><span>Reference transcript</span><input className={INPUT} value={referenceText} disabled={!!busy || recording} onChange={(event) => setReferenceText(event.target.value)} /></label>
              <Button variant="ghost" disabled={!!busy || recording} onClick={() => { setReference(null); setReferenceText('') }}>Clear reference voice</Button></>}
            <p className="text-gray-400">VoxCPM2 supports voice design and reference cloning. Use your own recording or a voice you have permission to use.</p>
          </>}
          <div className="flex flex-wrap gap-2">
            <Button icon={Volume2} variant="primary" disabled={conversationActive || !!busy || recording || !text.trim() || (settings.engine === 'audio.cpp' && !selected)} onClick={() => void generate()}>Generate speech</Button>
            <Button icon={recording ? Square : Mic} disabled={conversationActive || !!busy || (!recording && health?.stt !== true)} onClick={() => void toggleRecording()}>{recording ? 'Stop & transcribe' : 'Dictate script'}</Button>
            <Button icon={Square} variant="ghost" disabled={conversationActive} onClick={stop}>Stop</Button>
          </div>
          <p role="status" className="text-gray-400">{busy || notice}</p>
          {error && <p role="alert" className="rounded-xl border border-red-400/30 bg-red-400/10 p-3 text-red-300">{error}</p>}
          {audio && <div className="space-y-3"><audio ref={player} controls={!conversationActive} src={audio} className="w-full" aria-label="Generated speech" /><a className="inline-block min-h-10 py-2 underline underline-offset-4" download="drool-voice.wav" href={audio}>Save speech WAV</a></div>}
        </section>
      </div>
      <VoiceConversation engine={settings.engine} endpoint={settings.endpoint} model={selected} voice={settings.voice} design={settings.design} piperVoice={piperVoice} disabled={!!busy || recording} onActive={setConversationActive} />
      <section className={PANEL}>
        <h2 className="t-section-title">Voice conversations</h2>
        <p className="max-w-3xl text-gray-400">Chat already has microphone dictation and spoken replies in local mode. This studio prepares speech assets. Continuous conversation with interruption needs a separate listening and turn-taking runtime; it is not enabled by connecting a TTS model.</p>
        <div className="flex flex-wrap gap-x-5 gap-y-2"><a className="min-h-10 py-2 underline underline-offset-4" href="https://github.com/OpenBMB/VoxCPM" target="_blank" rel="noreferrer">VoxCPM2</a><a className="min-h-10 py-2 underline underline-offset-4" href="https://github.com/jamiepine/voicebox" target="_blank" rel="noreferrer">Voicebox</a><a className="min-h-10 py-2 underline underline-offset-4" href="https://github.com/QwenAudio/qwen-audio-agent" target="_blank" rel="noreferrer">Qwen Audio Agent</a></div>
      </section>
    </div>
  </main>
}

export default VoiceStudio
