import { useEffect, useState } from 'react'
import { downloadProviderMedia, saveProviderToGallery, type ProviderMedia } from '../../api/provider-gallery'
import { useUIStore } from '../../stores/uiStore'
import { openExternal } from '../../api/backend'

export function ProviderMediaResult({ media }: { media: ProviderMedia }) {
  const [busy, setBusy] = useState(false), [saved, setSaved] = useState(false), [error, setError] = useState('')
  const [preview, setPreview] = useState<{source:string; url:string; blob:Blob}>()
  const [previewError, setPreviewError] = useState('')
  useEffect(() => {
    setPreview(undefined); setPreviewError(''); setSaved(false)
    if (!media.src.startsWith('https://')) return
    const controller = new AbortController(); let objectUrl: string | undefined
    void downloadProviderMedia(media, controller.signal).then(blob => {
      if (controller.signal.aborted) return
      objectUrl = URL.createObjectURL(blob); setPreview({source:media.src,url:objectUrl,blob})
    }).catch(e => { if (!controller.signal.aborted) setPreviewError(e instanceof Error ? e.message : 'Could not load this preview. Open the original below.') })
    return () => { controller.abort(); if (objectUrl) URL.revokeObjectURL(objectUrl) }
  // Media identity controls the lifecycle; edited captions need no second download.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [media.src, media.type])
  const remote = media.src.startsWith('https://')
  const ready = preview?.source === media.src ? preview : undefined
  const src = remote ? ready?.url : media.src
  const button = 'min-h-10 rounded-lg border border-white/15 px-3 py-2 text-sm hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-blue-400 disabled:opacity-40'
  return <figure className="space-y-2 rounded-lg bg-black/15 p-3">
    {src && (media.type === 'image' ? <img src={src} alt={media.prompt || 'Generated image'} className="max-h-[32rem] w-full rounded-lg object-contain"/> : <video src={src} controls preload="metadata" className="max-h-[32rem] w-full rounded-lg"/>)}
    {remote && !ready && !previewError && <p role="status" className="text-sm text-gray-400">Loading secure {media.type} preview…</p>}
    {previewError && <p role="alert" className="text-sm text-red-300">{previewError} Use Open original to view or download the provider file.</p>}
    <figcaption className="flex flex-wrap gap-2"><button className={button} disabled={busy || saved || (remote && media.type === 'image' && !ready)} onClick={() => { setBusy(true); setError(''); void saveProviderToGallery(media, ready?.blob).then(() => setSaved(true)).catch(e => setError(String(e instanceof Error ? e.message : e))).finally(() => setBusy(false)) }}>{busy ? 'Saving…' : saved ? 'Saved in library' : 'Save to library'}</button>{saved && <button className={button} onClick={() => useUIStore.getState().setView('create')}>Open Create library</button>}{remote && <button className={button} onClick={() => void openExternal(media.src)}>Open original</button>}</figcaption>
    {media.type === 'video' && <p className="text-xs text-gray-400">Video library entries retain the provider link. Download the original before that link expires.</p>}
    {error && <p role="alert" className="text-sm text-red-300">{error}</p>}
  </figure>
}
