import { useEffect, useRef, useState } from 'react'
import { displayModelName } from '../../api/providers/model-name'
import { useMCPStore } from '../../stores/mcpStore'
import { connectedHiggsfield, higgsTool, parseHiggsModels, parseHiggsOutputs, type HiggsModel, type HiggsOutput } from '../../api/higgsfield-studio'
import { isRecord } from '../../types/json-guards'
import { ProviderMediaResult } from './ProviderMediaResult'

const button = 'min-h-10 rounded-lg border border-white/15 px-3 py-2 text-sm hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-blue-400 disabled:opacity-40'
const input = 'w-full min-h-10 rounded-lg border border-white/15 bg-black/20 p-2 text-sm focus-visible:outline-2 focus-visible:outline-blue-400'

export function HiggsfieldStudio() {
  useMCPStore(s => s.connectedServers)
  const server = connectedHiggsfield()
  const [type, setType] = useState<'image' | 'video'>('image'), [models, setModels] = useState<HiggsModel[]>([]), [modelId, setModelId] = useState('')
  const [prompt, setPrompt] = useState(''), [ratio, setRatio] = useState(''), [parameters, setParameters] = useState('{}')
  const [busy, setBusy] = useState(''), [error, setError] = useState(''), [notice, setNotice] = useState(''), [cursor, setCursor] = useState<string>()
  const [outputs, setOutputs] = useState<HiggsOutput[]>([]), [resultPrompt, setResultPrompt] = useState(''), [resultModel, setResultModel] = useState('')
  const [choice, setChoice] = useState<{message: string; params: Record<string, unknown>; type: 'image' | 'video'}>()
  const abort = useRef<AbortController | null>(null), running = useRef(false)
  const model = models.find(m => m.id === modelId)
  useEffect(() => () => abort.current?.abort(), [])
  async function action(kind: string, work: (signal: AbortSignal) => Promise<void>) {
    if (running.current || !server) return
    running.current = true; const controller = new AbortController(); abort.current = controller; setBusy(kind); setError(''); setNotice('')
    try { await work(controller.signal) } catch (e) { if (controller.signal.aborted) setNotice('Stopped waiting. Submitted jobs may still run in your Higgsfield account.'); else setError(e instanceof Error ? e.message : String(e)) } finally { running.current = false; setBusy(''); abort.current = null }
  }
  function selectModel(next: HiggsModel) { setModelId(next.id); setRatio(next.ratios[0] ?? ''); setParameters(JSON.stringify(next.defaults, null, 2)); setChoice(undefined) }
  async function load(signal: AbortSignal, more = false) {
    const result = await higgsTool(server!, 'models_list', { type, input: 'text', limit: 50, ...(more && cursor ? { after: cursor } : {}) }, signal)
    const found = parseHiggsModels(result).filter(m => !m.requiresMedia)
    setModels(old => more ? [...old, ...found.filter(m => !old.some(o => o.id === m.id))] : found)
    setCursor(typeof result.next_page_token === 'string' ? result.next_page_token : undefined)
    if (!more && found[0]) selectModel(found[0])
    setNotice(found.length ? 'Live models loaded from your Higgsfield account.' : 'No text-only models returned. Models requiring uploaded reference media are not supported by this form.')
  }
  function params() {
    const parsed: unknown = JSON.parse(parameters)
    if (!isRecord(parsed)) throw new Error('Model parameters must be a JSON object.')
    if ('medias' in parsed || 'reference_image_paths' in parsed) throw new Error('This form does not upload references. Remove media parameters.')
    for (const field of model?.parameters ?? []) {
      const value = parsed[String(field.name)]
      if (['model','prompt','aspect_ratio'].includes(String(field.name))) continue
      if (field.required === 'required' && value === undefined) throw new Error(`Add the required ${String(field.name)} parameter.`)
      if (value !== undefined && Array.isArray(field.options) && !field.options.includes(value)) throw new Error(`Unsupported ${String(field.name)} value.`)
      if (typeof value === 'number' && ((typeof field.min === 'number' && value < field.min) || (typeof field.max === 'number' && value > field.max))) throw new Error(`${String(field.name)} is outside the model's range.`)
    }
    return { ...parsed, model: modelId, prompt, ...(ratio ? { aspect_ratio: ratio } : {}), count: 1 }
  }
  async function refresh(signal: AbortSignal, jobs: HiggsOutput[], kind = type) {
    const pending = jobs.filter(job => !job.url && !['failed','canceled','cancelled','completed','succeeded'].includes(job.status.toLowerCase()))
    if (!pending.length) return jobs
    const result = await higgsTool(server!, 'jobs_wait', { jobs: pending.map((job, index) => ({ index, job_id: job.id })), timeout_seconds: 15 }, signal)
    const updates = parseHiggsOutputs(result, kind)
    const next = jobs.map(job => updates.find(update => update.id === job.id) ?? job)
    setOutputs(next); return next
  }
  async function generate(signal: AbortSignal, request: Record<string, unknown>, kind = type) {
    const result = await higgsTool(server!, `generate_${kind}`, { params: request }, signal)
    if (isRecord(result.unlim_choice)) { setChoice({ message: String(result.unlim_choice.message ?? 'Choose how to use your Higgsfield allowance.'), params: request, type: kind }); return }
    setChoice(undefined); setResultPrompt(String(request.prompt ?? '')); setResultModel(String(request.model ?? 'Higgsfield'))
    let jobs = parseHiggsOutputs(result, kind); setOutputs(jobs)
    if (!jobs.length) throw new Error('Higgsfield returned no generation or image. No result was added to your library.')
    for (let attempt = 0; attempt < 40 && !signal.aborted && jobs.some(job => !job.url && !['failed','canceled','cancelled','completed','succeeded'].includes(job.status.toLowerCase())); attempt++) {
      jobs = await refresh(signal, jobs, kind)
      await new Promise<void>(resolve => { const done = () => { clearTimeout(timer); signal.removeEventListener('abort', done); resolve() }; const timer = setTimeout(done, 1500); signal.addEventListener('abort', done, { once: true }) })
    }
    if (!signal.aborted) setNotice(jobs.some(job => job.url) ? 'Generation ready. Save the result to your library below.' : 'Check status below or open Higgsfield to inspect the saved job.')
  }
  return <div className="space-y-4 border-t border-white/10 pt-4">
    <div><h3 className="font-medium">Create with Higgsfield</h3><p className="mt-1 text-sm text-gray-400">Choose a live text-to-image or text-to-video model. Generation uses the allowance or credits shown by your account.</p></div>
    {!server && <p role="status" className="text-sm text-gray-400">Connect Higgsfield below, then load its models here.</p>}
    <div className="flex flex-wrap gap-2"><label className="text-sm">Output<select className={input} value={type} disabled={!!busy} onChange={e => { setType(e.target.value as 'image'|'video'); setModels([]); setModelId(''); setCursor(undefined); setChoice(undefined) }}><option value="image">Image</option><option value="video">Video</option></select></label><button className={button} disabled={!server || !!busy} onClick={() => void action('models', s => load(s))}>{busy === 'models' ? 'Loading models…' : 'Load available models'}</button>{cursor && <button className={button} disabled={!!busy} onClick={() => void action('models', s => load(s, true))}>More models</button>}</div>
    {!!models.length && <><label className="block text-sm">Higgsfield model<select className={input} value={modelId} disabled={!!busy} onChange={e => { const next = models.find(m => m.id === e.target.value); if (next) selectModel(next) }}>{models.map(m => <option key={m.id} value={m.id}>{displayModelName(m.name)}</option>)}</select></label><p className="text-xs text-gray-400">{model?.description}</p><label className="block text-sm">Higgsfield prompt<textarea className={input + ' min-h-24'} value={prompt} onChange={e => setPrompt(e.target.value)} disabled={!!busy}/></label>{!!model?.ratios.length && <label className="block text-sm">Aspect ratio<select className={input} value={ratio} onChange={e => setRatio(e.target.value)} disabled={!!busy}>{model.ratios.map(r => <option key={r}>{r}</option>)}</select></label>}<details><summary className="min-h-10 cursor-pointer py-2 text-sm">Model parameters</summary><p className="mb-2 text-xs text-gray-400">Defaults come from the live model catalog. {model?.parameters.map(p => `${String(p.name)}${p.required === 'required' ? ' (required)' : ''}${Array.isArray(p.options) ? `: ${p.options.join(', ')}` : ''}`).join(' · ')}</p><textarea aria-label="Higgsfield model parameters" className={input + ' min-h-28 font-mono'} value={parameters} onChange={e => setParameters(e.target.value)} disabled={!!busy}/></details><div className="flex flex-wrap gap-2"><button className={button} disabled={!!busy || !prompt.trim() || !server} onClick={() => void action('estimate', async signal => { const result = await higgsTool(server!, `estimate_${type}_cost`, { params: params() }, signal); setNotice(JSON.stringify(result)) })}>Estimate cost</button><button className={button} disabled={!!busy || !prompt.trim() || !server || !!choice} onClick={() => void action('generate', signal => generate(signal, params()))}>{busy === 'generate' ? 'Generating…' : `Generate ${type}`}</button></div></>}
    {choice && <div className="space-y-2 rounded-lg border border-blue-400/25 p-3"><p className="text-sm">{choice.message}</p><div className="flex flex-wrap gap-2">{[true,false].map(unlimited => <button key={String(unlimited)} className={button} disabled={!!busy} onClick={() => void action('generate', s => generate(s, { ...choice.params, use_unlim: unlimited }, choice.type))}>{unlimited ? 'Use available unlimited allowance' : 'Use credits'}</button>)}</div></div>}
    {busy && <button className={button} onClick={() => abort.current?.abort()}>Stop waiting</button>}
    {error && <p role="alert" className="text-sm text-red-300">{error}</p>}{notice && <p role="status" className="break-words text-sm text-gray-300">{notice}</p>}
    {outputs.map(job => <div key={job.id} className="space-y-2"><p className="text-sm">{job.type} · {job.status}{job.error ? ` · ${job.error}` : ''}</p>{job.url && <ProviderMediaResult key={job.url} media={{src:job.url,type:job.type,prompt:resultPrompt,model:resultModel}}/>}</div>)}
    {!!outputs.length && <button className={button} disabled={!!busy || !server} onClick={() => void action('status', async signal => { await refresh(signal, outputs) })}>Check generation status</button>}
  </div>
}
