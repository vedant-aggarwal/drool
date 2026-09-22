import { useEffect, useRef, useState } from 'react'
import { Download, ImagePlus, Square } from 'lucide-react'
import { cursorStatus, cursorLogin, generateCursorImage, saveCursorImage, type CursorImage, type CursorStatus, type CursorAspectRatio } from '../../api/cursor-images'
import { isTauri } from '../../api/backend'
import { ICON_SM } from '../ui/icon-size'
import { ProviderMediaResult } from './ProviderMediaResult'

const button = 'min-h-10 rounded-lg border border-white/15 px-3 py-2 text-sm hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-400 disabled:cursor-not-allowed disabled:opacity-40 transition-colors motion-reduce:transition-none'
const input = 'w-full min-h-10 rounded-lg border border-white/15 bg-black/20 p-2 text-sm focus-visible:outline-2 focus-visible:outline-blue-400'

export function CursorImageConnection() {
  const [status, setStatus] = useState<CursorStatus | null>(null)
  const [prompt, setPrompt] = useState('')
  const [ratio, setRatio] = useState<CursorAspectRatio>('1:1')
  const [image, setImage] = useState<CursorImage | null>(null)
  const [imagePrompt, setImagePrompt] = useState('')
  const [busy, setBusy] = useState<'check' | 'login' | 'generate' | 'save' | null>(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const abort = useRef<AbortController | null>(null)
  const working = useRef(false)
  const mounted = useRef(true)
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; abort.current?.abort() } }, [])
  async function run(kind: NonNullable<typeof busy>, work: (signal: AbortSignal) => Promise<void>) {
    if (working.current) return
    working.current = true
    const controller = new AbortController(); abort.current = controller
    setBusy(kind); setError(''); setNotice('')
    try { await work(controller.signal) }
    catch (e) { if (mounted.current) { if (controller.signal.aborted) setNotice('Stopped. Cursor may already have charged for work submitted before cancellation.'); else setError(e instanceof Error ? e.message : String(e)) } }
    finally { working.current = false; abort.current = null; if (mounted.current) setBusy(null) }
  }
  return <section aria-labelledby="cursor-image-title" className="space-y-4 rounded-xl border border-white/10 bg-white/[0.025] p-4 sm:p-5">
    <div className="space-y-1"><h2 id="cursor-image-title" className="font-semibold">Cursor images</h2><p className="text-sm text-gray-400">Generate with Cursor’s native image tool using your Cursor account. Cursor selects the image model; your account’s availability and usage limits apply.</p></div>
    {!isTauri() && <p className="text-sm text-gray-400">Open the desktop app to connect Cursor and generate images.</p>}
    <div className="flex flex-wrap items-center gap-2">
      <button className={button} disabled={!isTauri() || !!busy} onClick={() => void run('check', async () => { const next = await cursorStatus(); if (mounted.current) setStatus(next) })}>{busy === 'check' ? 'Checking Cursor…' : 'Check Cursor connection'}</button>
      <button className={button} disabled={!isTauri() || !!busy} onClick={() => void run('login', async signal => { const next = await cursorLogin(signal); if (mounted.current) { setStatus(next); setNotice(next.authenticated ? 'Cursor account connected.' : 'Sign-in did not complete. Check your connection and try again.') } })}>{busy === 'login' ? 'Complete sign-in in your browser…' : 'Sign in with Cursor'}</button>
      {status && <span className={'text-sm ' + (status.authenticated ? 'text-green-300' : 'text-gray-400')}>{status.authenticated ? 'Cursor account connected' : 'Cursor installed · sign-in required'}</span>}
    </div>
    <p className="text-xs text-gray-500">Requires the official Cursor Agent CLI. Sign-in uses Cursor’s browser flow and CLI-managed credentials.</p>
    {error && <p role="alert" className="rounded-lg border border-red-400/30 bg-red-400/10 p-3 text-sm text-red-200">{error}</p>}
    {notice && <p role="status" className="text-sm text-gray-300">{notice}</p>}
    <form className="space-y-3" onSubmit={e => { e.preventDefault(); void run('generate', async signal => { const next = await generateCursorImage(prompt, ratio, signal); if (mounted.current) { setImage(next); setImagePrompt(prompt); setNotice('Image generated and saved on this PC.') } }) }}>
      <label className="block text-sm">Describe your Cursor image<textarea className={input + ' mt-1 min-h-24 resize-y'} maxLength={8000} value={prompt} onChange={e => setPrompt(e.target.value)} placeholder="A cinematic portrait, a manga scene, or a product illustration…" disabled={!!busy}/></label>
      <div className="flex flex-wrap items-end gap-3"><label className="text-sm">Aspect ratio<select className={input + ' mt-1'} value={ratio} onChange={e => setRatio(e.target.value as CursorAspectRatio)} disabled={!!busy}>{(['1:1','4:3','3:4','16:9','9:16'] as const).map(value => <option key={value}>{value}</option>)}</select></label><button className={button + ' inline-flex items-center gap-2 bg-violet-500/15'} disabled={!isTauri() || !!busy || !status?.authenticated || !prompt.trim()}><ImagePlus size={ICON_SM}/>{busy === 'generate' ? 'Generating image…' : 'Generate with Cursor'}</button>{(busy === 'generate' || busy === 'login') && <button type="button" className={button + ' inline-flex items-center gap-2'} onClick={() => abort.current?.abort()}><Square size={ICON_SM}/>Stop Cursor</button>}</div>
    </form>
    {busy === 'generate' && <p role="status" aria-live="polite" className="text-sm text-violet-200">Cursor is generating and verifying the image. This can take a few minutes.</p>}
    {image && <figure className="space-y-3"><figcaption className="flex flex-wrap items-center justify-between gap-2 text-xs text-gray-400"><span>{image.width} × {image.height} · {image.filename}</span><button className={button + ' inline-flex items-center gap-2'} disabled={!!busy} onClick={() => void run('save', async () => { await saveCursorImage(image) })}><Download size={ICON_SM}/>Save image as…</button></figcaption></figure>}
    {image && <ProviderMediaResult key={image.requestId} media={{ src: image.dataUrl, type: 'image', prompt: imagePrompt, model: 'Cursor', localPath: image.path, width: image.width, height: image.height }} />}
  </section>
}
