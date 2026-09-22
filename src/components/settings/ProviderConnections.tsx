import { useEffect, useRef, useState } from 'react'
import { Cable, ExternalLink, Send, Square } from 'lucide-react'
import { codexConnect, codexDisconnect, codexLogin, runCodexChat, openRouterModels, openRouterGenerate, higgsfieldSubmit, higgsfieldStatus, HIGGSFIELD_MCP_URL } from '../../api/drool-providers'
import type { CodexConnection, CreativeReply, HiggsfieldJob } from '../../api/drool-providers'
import { isTauri, isWindows, openExternal } from '../../api/backend'
import { isRecord } from '../../types/json-guards'
import { useMCPStore } from '../../stores/mcpStore'
import { MCPServerSettings } from './MCPServerSettings'
import { displayModelName } from '../../api/providers/model-name'
import { HINWEIS_TEXT } from '../../lib/hinweis'
import { ICON_LG } from '../ui/icon-size'
import { CursorImageConnection } from './CursorImageConnection'
import { CursorChatConnection } from './CursorChatConnection'
import { HiggsfieldStudio } from './HiggsfieldStudio'
import { ProviderMediaResult } from './ProviderMediaResult'

const button = 'min-h-10 rounded-lg border border-white/15 px-3 py-2 text-sm hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-400 disabled:cursor-not-allowed disabled:opacity-40 transition-colors'
const input = 'w-full min-h-10 rounded-lg border border-white/15 bg-black/20 p-2 text-sm focus-visible:outline-2 focus-visible:outline-blue-400'
const card = 'space-y-4 rounded-xl border border-white/10 bg-white/[0.025] p-4 sm:p-5'

export function ProviderConnections() {
  const [connection, setConnection] = useState<CodexConnection | null>(null)
  const [model, setModel] = useState('')
  const [effort, setEffort] = useState('')
  const [persona, setPersona] = useState(() => localStorage.getItem('drool-codex-persona') ?? '')
  const [imageMode, setImageMode] = useState(false)
  const [prompt, setPrompt] = useState('')
  const [thread, setThread] = useState<string>()
  const [storyTools, setStoryTools] = useState(false)
  const [reply, setReply] = useState<CreativeReply>({ text: '', images: [] })
  const [history, setHistory] = useState<Array<{ prompt: string; reply: CreativeReply }>>([])
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const cancel = useRef<AbortController | null>(null)
  const [routerKey, setRouterKey] = useState('')
  const [routerImages, setRouterImages] = useState(false)
  const [routerModels, setRouterModels] = useState<Array<{ id: string; name: string }>>([])
  const [routerModel, setRouterModel] = useState('')
  const [routerPrompt, setRouterPrompt] = useState('')
  const [routerReply, setRouterReply] = useState<CreativeReply>({ text: '', images: [] })
  const [higgsKey, setHiggsKey] = useState('')
  const [higgsEndpoint, setHiggsEndpoint] = useState('bytedance/seedance-2.0/text-to-video')
  const [higgsPrompt, setHiggsPrompt] = useState('')
  const [higgsJob, setHiggsJob] = useState<HiggsfieldJob | null>(() => {
    try {
      const saved: unknown = JSON.parse(localStorage.getItem('drool-higgsfield-job') ?? 'null')
      return isRecord(saved) && typeof saved.requestId === 'string' && typeof saved.statusUrl === 'string' ? { requestId: saved.requestId, statusUrl: saved.statusUrl } : null
    } catch { return null }
  })
  const [higgsResult, setHiggsResult] = useState<Record<string, unknown> | null>(null)
  const servers = useMCPStore(s => s.servers)

  useEffect(() => () => { cancel.current?.abort() }, [])
  useEffect(() => { setEffort(localStorage.getItem(`drool-codex-effort:${model}`) ?? '') }, [model])
  useEffect(() => {
    if (!higgsJob || !higgsKey.trim()) return
    const controller = new AbortController()
    let timer: ReturnType<typeof setTimeout>
    let delay = 2_000
    let attempts = 0
    const poll = async () => {
      try {
        const result = await higgsfieldStatus(higgsKey, higgsJob.statusUrl, controller.signal)
        if (controller.signal.aborted) return
        setHiggsResult(result)
        if (['completed', 'failed', 'nsfw', 'canceled'].includes(String(result.status))) return
        if (++attempts >= 120) { setNotice('Generation is still running. Use Check generation to refresh it.'); return }
        delay = Math.min(10_000, delay * 1.5)
        timer = setTimeout(() => void poll(), delay)
      } catch { if (!controller.signal.aborted) setError('Could not refresh Higgsfield. Your request is saved; check your credential and press Check generation.') }
    }
    timer = setTimeout(() => void poll(), delay)
    return () => { controller.abort(); clearTimeout(timer) }
  }, [higgsJob, higgsKey])
  useEffect(() => {
    if (!isTauri()) return
    let disposed = false
    let stop: (() => void) | undefined
    void import('@tauri-apps/api/event').then(({ listen }) => listen<unknown>('drool-codex-event', event => {
      if (!isRecord(event.payload)) return
      if (event.payload.method === 'account/login/completed') {
        const p = event.payload.params
        if (isRecord(p) && p.success === true) {
          void codexConnect().then(c => { if (!disposed) { setConnection(c); setNotice('Codex account connected.'); setModel(c.models?.[0]?.model ?? '') } }).catch(() => { if (!disposed) setError('Login finished. Press Check connection to refresh.') })
        } else if (!disposed) setError('Codex sign-in was not completed. Try again.')
      }
      if (event.payload.method === 'disconnected' && !disposed) setConnection(null)
    })).then(unlisten => { if (disposed) unlisten(); else stop = unlisten }).catch(() => undefined)
    return () => { disposed = true; stop?.() }
  }, [])

  async function action(name: string, work: () => Promise<void>) {
    setBusy(name); setError(''); setNotice('')
    try { await work() } catch (e) { setError(e instanceof Error ? e.message : String(e)) } finally { setBusy('') }
  }
  const addHiggsMcp = () => {
    if (servers.some(s => s.id === 'drool-higgsfield')) return
    useMCPStore.getState().addServer({ id: 'drool-higgsfield', name: 'Higgsfield (OAuth)', command: isWindows() ? 'npx.cmd' : 'npx', args: ['-y', 'mcp-remote', HIGGSFIELD_MCP_URL], enabled: true })
    setNotice('Higgsfield was added below. Press its Connect button to authorize your account. The first connection downloads the mcp-remote bridge.')
  }

  return <div className="mx-auto max-w-4xl space-y-6 p-4 sm:p-6 text-gray-200">
    <header className="space-y-2">
      <h1 className="flex items-center gap-2 text-xl font-semibold text-balance"><Cable size={ICON_LG} /> Connections</h1>
      <p className="text-sm text-gray-400 text-pretty">Use your own accounts alongside local models. These optional providers process prompts online and use their own account limits or paid balance.</p>
    </header>
    <CursorChatConnection />
    <CursorImageConnection />
    {error && <div role="alert" className="rounded-lg border border-red-400/30 bg-red-400/10 p-3 text-sm text-red-200">{error}</div>}
    {notice && <div role="status" className="rounded-lg border border-blue-400/30 bg-blue-400/10 p-3 text-sm">{notice}</div>}

    <section className={card} aria-labelledby="codex-title">
      <div><h2 id="codex-title" className="font-semibold">Codex · your ChatGPT account</h2><p className="mt-1 text-sm text-gray-400">Discuss a story, refine prompts, or ask Codex to generate an image. Sign in once for Drool. The official Codex CLI manages your account; your existing Codex app settings are kept separate.</p></div>
      {!isTauri() && <p className={`text-sm ${HINWEIS_TEXT.ruhig}`}>Open Drool desktop to connect Codex. Browser preview cannot start the CLI.</p>}
      <div className="flex flex-wrap items-center gap-2">
        <button className={button} disabled={!!busy || !isTauri()} onClick={() => void action('connect', async () => { const c = await codexConnect(); setConnection(c); setModel(c.models?.[0]?.model ?? ''); setNotice(c.accountType ? `Connected${c.planType ? ` · ${c.planType}` : ''}` : 'Codex is available. Sign in to use your account.') })}>Check connection</button>
        <button className={button} disabled={!!busy || !isTauri()} onClick={() => void action('login', async () => { const login = await codexLogin(); await openExternal(login.authUrl); setNotice('Complete sign-in in your browser, then return here.') })}>Sign in with ChatGPT <ExternalLink size={12} className="inline" /></button>
        {connection && <button className={button} disabled={!!busy} onClick={() => void action('disconnect', async () => { await codexDisconnect(); setConnection(null); setThread(undefined) })}>Disconnect</button>}
      </div>
      {connection?.accountType && <>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Codex action"><button className={button} aria-pressed={!imageMode} disabled={!!busy} onClick={() => setImageMode(false)}>Chat</button><button className={button} aria-pressed={imageMode} disabled={!!busy} onClick={() => setImageMode(true)}>Generate an image</button></div>
        <label className="block text-sm">Reasoning effort<select className={input} value={effort} disabled={!!busy} onChange={e => { setEffort(e.target.value); localStorage.setItem(`drool-codex-effort:${model}`, e.target.value) }}><option value="">Model default</option>{connection.models.find(m => m.model === model)?.supportedReasoningEfforts?.map(e => <option key={e.reasoningEffort} value={e.reasoningEffort}>{e.reasoningEffort} · {e.description}</option>)}</select></label>
        <details><summary className="min-h-10 cursor-pointer py-2 text-sm">Persona and default instructions</summary><label className="block text-sm">Codex persona<textarea className={input + ' min-h-24'} value={persona} maxLength={16000} disabled={!!busy} onChange={e => { setPersona(e.target.value); localStorage.setItem('drool-codex-persona', e.target.value); setThread(undefined); setHistory([]) }} placeholder="You are my creative writing partner. Prefer concise answers and consistent characters…"/></label><p className="text-xs text-gray-400">Saved on this device. Changes start a new conversation.</p></details>
        <label className="flex min-h-10 items-center gap-2 text-sm"><input type="checkbox" checked={storyTools} disabled={!!busy} onChange={e => { setStoryTools(e.target.checked); setThread(undefined); setHistory([]); setReply({ text: '', images: [] }) }} />Allow Codex to use local storyboard tools</label>
        {storyTools && <p className="text-xs text-gray-400">Story reads and changes follow Workflow permissions. Actions needing approval appear in a review card. Shell and filesystem tools remain disabled.</p>}
        <label className="block text-sm">Model<select className={`${input} mt-1`} value={model} onChange={e => { setModel(e.target.value); setThread(undefined); setHistory([]); setReply({ text: '', images: [] }) }} disabled={!!busy}>{connection.models.map(m => <option key={m.id} value={m.model}>{m.displayName}</option>)}</select></label>
        <label className="block text-sm">Message<textarea className={`${input} mt-1 min-h-24 resize-y`} value={prompt} onChange={e => setPrompt(e.target.value)} placeholder="Develop a short manga story with me, then generate its opening panel…" /></label>
        <div className="flex flex-wrap gap-2">
          <button className={button} disabled={!!busy || !prompt.trim()} onClick={() => void action('codex', async () => {
            const controller = new AbortController(); cancel.current = controller; setReply({ text: '', images: [] })
            const request = imageMode ? `Generate an image using your native image generation tool. Visual description: ${JSON.stringify(prompt)}. Return the generated image. If the tool is unavailable, explain that clearly; do not substitute code or SVG.` : prompt
            const result = await runCodexChat(request, { model, effort, instructions: persona, threadId: thread, signal: controller.signal, storyboardTools: storyTools, onDelta: text => setReply(r => ({ ...r, text })) })
            if (imageMode && !result.images.length) setNotice('Codex returned no generated image. Its response below explains any availability limitation; nothing was saved.')
            setHistory(items => [...items, { prompt, reply: result }]); setReply({ text: '', images: [] }); setThread(result.threadId); setPrompt('')
          })}><Send size={14} className="mr-1 inline" />{busy === 'codex' ? 'Working…' : imageMode ? 'Generate with Codex' : 'Send'}</button>
          {busy === 'codex' && <button className={button} onClick={() => cancel.current?.abort()}><Square size={14} className="mr-1 inline" />Stop</button>}
          {thread && <button className={button} disabled={!!busy} onClick={() => { setThread(undefined); setHistory([]); setReply({ text: '', images: [] }) }}>New conversation</button>}
        </div>
        {history.map((entry, index) => <div key={index} className="space-y-2 rounded-lg bg-black/15 p-3"><p className="whitespace-pre-wrap text-sm font-medium">{entry.prompt}</p><Reply value={entry.reply} prompt={entry.prompt} model={model || 'Codex'} /></div>)}
        <Reply value={reply} />
      </>}
      <p className="text-xs text-gray-500">Codex uses online inference and your Codex usage allowance. Image generation depends on account and model support. Shell execution is disabled in this creative chat.</p>
    </section>

    <section className={card} aria-labelledby="router-title">
      <h2 id="router-title" className="font-semibold">OpenRouter · text and images</h2>
      <p className="text-sm text-gray-400">Browse the live provider catalog. This key stays in this panel’s memory and is cleared when you leave. For ongoing chat, the existing AI Backends settings also has an OpenRouter preset.</p>
      <label className="block text-sm">API key<input className={`${input} mt-1`} type="password" autoComplete="off" value={routerKey} onChange={e => setRouterKey(e.target.value)} placeholder="sk-or-…" /></label>
      <div className="flex flex-wrap gap-2">
        <label className="flex min-h-10 items-center gap-2 text-sm"><input type="checkbox" checked={routerImages} onChange={e => { setRouterImages(e.target.checked); setRouterModels([]); setRouterModel('') }} disabled={!!busy} />Image models</label>
        <button className={button} disabled={!!busy || !routerKey.trim()} onClick={() => void action('models', async () => { const list = await openRouterModels(routerKey, routerImages); setRouterModels(list); setRouterModel(list[0]?.id ?? ''); setNotice(`${list.length} models loaded.`) })}>{busy === 'models' ? 'Loading…' : 'Load models'}</button>
      </div>
      {!!routerModels.length && <label className="block text-sm">Model<select className={`${input} mt-1`} value={routerModel} onChange={e => setRouterModel(e.target.value)}>{routerModels.map(m => <option key={m.id} value={m.id}>{displayModelName(m.name)}</option>)}</select></label>}
      <label className="block text-sm">Prompt<textarea className={`${input} mt-1 min-h-20`} value={routerPrompt} onChange={e => setRouterPrompt(e.target.value)} /></label>
      <button className={button} disabled={!!busy || !routerModel || !routerPrompt.trim()} onClick={() => void action('router', async () => { const c = new AbortController(); cancel.current = c; setRouterReply(await openRouterGenerate(routerKey, routerModel, routerPrompt, routerImages, c.signal)) })}>{busy === 'router' ? 'Generating…' : 'Generate with OpenRouter'}</button>
      <Reply value={routerReply} />
    </section>

    <section className={card} aria-labelledby="higgs-title">
      <h2 id="higgs-title" className="font-semibold">Higgsfield · MCP or API</h2>
      <p className="text-sm text-gray-400">MCP connects your Higgsfield account through OAuth. Available allowances and credits are determined by your account and model. The API uses separate credentials and a separate prepaid balance.</p>
      <button className={button} disabled={servers.some(s => s.id === 'drool-higgsfield')} onClick={addHiggsMcp}>{servers.some(s => s.id === 'drool-higgsfield') ? 'MCP connection added' : 'Add Higgsfield MCP connection'}</button>
      <details className="space-y-3"><summary className="cursor-pointer py-2 text-sm">Use your Higgsfield API account</summary>
        <p className="text-xs text-gray-400">API credential stays in memory. Choose an endpoint and parameters from the <button className="underline" onClick={() => void openExternal('https://open.higgsfield.ai/quick-start')}>official catalog</button>. This form submits text-to-video with the displayed settings.</p>
        <label className="block text-sm">Key ID:key secret<input className={`${input} mt-1`} type="password" autoComplete="off" value={higgsKey} onChange={e => setHiggsKey(e.target.value)} /></label>
        <label className="block text-sm">Text-to-video endpoint<input className={`${input} mt-1`} value={higgsEndpoint} onChange={e => setHiggsEndpoint(e.target.value)} /></label>
        <label className="block text-sm">Video prompt<textarea className={`${input} mt-1 min-h-20`} value={higgsPrompt} onChange={e => setHiggsPrompt(e.target.value)} /></label>
        <p className="text-xs text-gray-400">5 seconds · 720p · 16:9 · generated audio. Billed by Higgsfield.</p>
        <div className="flex flex-wrap gap-2"><button className={button} disabled={!!busy || !higgsKey.includes(':') || !higgsPrompt.trim() || (!!higgsJob && !['completed', 'failed', 'nsfw', 'canceled'].includes(String(higgsResult?.status)))} onClick={() => void action('higgs', async () => {
          setHiggsResult(null)
          const job = await higgsfieldSubmit(higgsKey, higgsEndpoint, { prompt: higgsPrompt, resolution: '720p', duration: 5, aspect_ratio: '16:9', generate_audio: true })
          setHiggsJob(job)
          try { localStorage.setItem('drool-higgsfield-job', JSON.stringify(job)) } catch { setNotice('Keep this panel open: browser storage could not save the generation ID.') }
        })}>Submit video</button>
          <button className={button} disabled={!!busy || !higgsJob || !higgsKey.trim()} onClick={() => void action('status', async () => { if (higgsJob) setHiggsResult(await higgsfieldStatus(higgsKey, higgsJob.statusUrl)) })}>Check generation</button></div>
        {higgsJob && <p className="text-sm text-gray-300" role="status">Generation: {String(higgsResult?.status ?? 'waiting for status')}</p>}
        {higgsJob && <button className="min-h-10 text-xs text-gray-400 underline" disabled={!!busy} onClick={() => { setHiggsJob(null); setHiggsResult(null); localStorage.removeItem('drool-higgsfield-job'); setNotice('Saved tracking cleared. This does not cancel the generation in your Higgsfield account.') }}>Forget saved request</button>}
        {isRecord(higgsResult?.video) && typeof higgsResult.video.url === 'string' && higgsResult.video.url.startsWith('https://') && <button className={button} onClick={() => { if (isRecord(higgsResult.video)) void openExternal(String(higgsResult.video.url)) }}>Open generated video <ExternalLink size={12} className="inline" /></button>}
        {higgsResult?.status === 'failed' && <p role="alert" className="text-sm text-red-300">Higgsfield could not finish this generation. Check the request in your provider account.</p>}
        {higgsResult?.status === 'nsfw' && <p role="alert" className={`text-sm ${HINWEIS_TEXT.ruhig}`}>Higgsfield declined this request under its content policy.</p>}
      </details>
      <MCPServerSettings />
      <HiggsfieldStudio />
    </section>
  </div>
}

function Reply({ value, prompt = '', model = 'Provider' }: { value: CreativeReply; prompt?: string; model?: string }) {
  if (!value.text && !value.images.length) return null
  return <div className="space-y-3 border-t border-white/10 pt-4">
    {value.text && <div className="whitespace-pre-wrap text-sm leading-relaxed" aria-live="polite">{value.text}</div>}
    {value.images.map(src => <ProviderMediaResult key={src} media={{ src, type: 'image', prompt, model }} />)}
  </div>
}
