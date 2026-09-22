import { useEffect, useId, useRef, useState } from 'react'
import { getImageUrl } from '../../../api/comfyui'
import type { GalleryItem } from '../../../stores/createStore'
import { proxiedComfyBlobUrl } from './galleryUrl'
import { cn } from '../ui/cn'

type Layout = 'split' | 'side' | 'result'
interface Props {
  item: GalleryItem
  afterUrl: string
  onAfterError: () => void
  onAfterLoad: (width: number, height: number) => void
}

/** Mount with item.id as its key: each result owns its original and divider. */
export function ImageComparison({ item, afterUrl, onAfterError, onAfterLoad }: Props) {
  const original = item.comparisonSource!
  const sliderId = useId()
  const [layout, setLayout] = useState<Layout>('split')
  const [position, setPosition] = useState(50)
  const [beforeUrl, setBeforeUrl] = useState(() => getImageUrl(original.filename, '', 'input'))
  const [beforeFailed, setBeforeFailed] = useState(false)
  const triedProxy = useRef(false)
  const ownedBlob = useRef<string | null>(null)
  const alive = useRef(true)
  useEffect(() => {
    alive.current = true
    return () => { alive.current = false; if (ownedBlob.current) URL.revokeObjectURL(ownedBlob.current) }
  }, [])
  async function recoverOriginal() {
    if (triedProxy.current) { setBeforeFailed(true); return }
    triedProxy.current = true
    const blob = await proxiedComfyBlobUrl({ ...item, id: `${item.id}:original`, filename: original.filename, subfolder: '', comfyType: 'input', dataUrl: undefined, remoteUrl: undefined, localPath: undefined, jobId: undefined })
    if (!alive.current) { if (blob) URL.revokeObjectURL(blob); return }
    if (blob) { ownedBlob.current = blob; setBeforeUrl(blob) }
    else setBeforeFailed(true)
  }
  const activeLayout = beforeFailed ? 'result' : layout
  const ratio = Math.max(0.1, Math.min(10, item.width / Math.max(1, item.height)))
  const updateFromPointer = (e: React.PointerEvent<HTMLDivElement>) => {
    const bounds = e.currentTarget.getBoundingClientRect()
    if (bounds.width) setPosition(Math.round(Math.max(0, Math.min(100, (e.clientX - bounds.left) / bounds.width * 100))))
  }
  const imageStyle = 'absolute inset-0 h-full w-full object-contain select-none'
  const after = <img src={afterUrl} alt="Edited result" draggable={false} onError={onAfterError}
    onLoad={e => onAfterLoad(e.currentTarget.naturalWidth, e.currentTarget.naturalHeight)} className={imageStyle} />
  const before = <img src={beforeUrl} alt="Original image" draggable={false} onError={() => void recoverOriginal()} className={imageStyle} />
  const labelStyle = 'absolute bottom-2 rounded-md bg-black/75 px-2 py-1 text-xs text-white pointer-events-none'
  return (
    <section aria-label="Before and after comparison" className="w-full space-y-3">
      <div role="group" aria-label="Comparison layout" className="flex flex-wrap items-center justify-center gap-1">
        {([{ value: 'split', label: 'Compare' }, { value: 'side', label: 'Side by side' }, { value: 'result', label: 'Result' }] as const).map(option => (
          <button key={option.value} type="button" aria-pressed={activeLayout === option.value}
            disabled={beforeFailed && option.value !== 'result'} onClick={() => setLayout(option.value)}
            className={cn('min-h-10 rounded-lg px-3 text-xs transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-lu-accent disabled:opacity-40', activeLayout === option.value ? 'bg-white/10 text-white' : 'text-gray-400 hover:bg-white/[0.05] hover:text-gray-200')}>
            {option.label}
          </button>
        ))}
      </div>
      {beforeFailed && <p role="status" className="text-xs text-gray-400 text-center text-pretty">The original is no longer available from ComfyUI. Your edited result is still shown.</p>}
      <div className={cn('mx-auto', activeLayout === 'side' && 'grid grid-cols-2 gap-2')} style={{ width: activeLayout === 'side' ? '100%' : `min(100%, ${58 * ratio}vh)` }}>
        {activeLayout === 'side' ? (
          <>
            <div className="relative overflow-hidden rounded-xl bg-black/20 ring-1 ring-inset ring-white/10" style={{ aspectRatio: ratio }}>{before}<span className={`${labelStyle} left-2`}>Original</span></div>
            <div className="relative overflow-hidden rounded-xl bg-black/20 ring-1 ring-inset ring-white/10" style={{ aspectRatio: ratio }}>{after}<span className={`${labelStyle} right-2`}>Result</span></div>
          </>
        ) : (
          <div className={cn('relative overflow-hidden rounded-xl bg-black/20 ring-1 ring-inset ring-white/10', activeLayout === 'split' && 'cursor-col-resize touch-pan-y')}
            style={{ aspectRatio: ratio }}
            onPointerDown={e => { if (activeLayout !== 'split') return; e.currentTarget.setPointerCapture(e.pointerId); updateFromPointer(e) }}
            onPointerMove={e => { if (activeLayout === 'split' && e.currentTarget.hasPointerCapture(e.pointerId)) updateFromPointer(e) }}>
            {after}
            {activeLayout === 'split' && <>
              <div className="absolute inset-0 pointer-events-none" style={{ clipPath: `inset(0 ${100 - position}% 0 0)` }}>{before}</div>
              <div aria-hidden className="absolute inset-y-0 w-px bg-white pointer-events-none" style={{ left: `${position}%` }}>
                <span className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-black/80 px-2 py-3 text-sm text-white ring-1 ring-white/70">↔</span>
              </div>
              {position > 12 && <span className={`${labelStyle} left-2`}>Original</span>}
              {position < 88 && <span className={`${labelStyle} right-2`}>Result</span>}
            </>}
          </div>
        )}
      </div>
      {activeLayout === 'split' && <div className="flex items-center gap-3">
        <label htmlFor={sliderId} className="text-xs text-gray-400 shrink-0">Comparison divider</label>
        <input id={sliderId} type="range" min="0" max="100" step="1" value={position}
          aria-valuetext={`${position}% original, ${100 - position}% result`}
          onChange={e => setPosition(Number(e.target.value))}
          className="min-w-0 flex-1 h-11 accent-lu-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-lu-accent rounded" />
        <span className="text-xs tabular-nums text-gray-400 w-9 text-right">{position}%</span>
      </div>}
      <p className="text-xs text-gray-500 text-center tabular-nums">Original {original.width}×{original.height} · Result {item.width}×{item.height}{activeLayout === 'split' ? ' · Drag the image or use the slider' : ''}</p>
    </section>
  )
}
