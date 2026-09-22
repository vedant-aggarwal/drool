import { useEffect, useId, useRef, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { loadEnhanceModels } from '../../../api/local-enhance'
import { useCreateStore } from '../../../stores/createStore'

export function EnhanceModelPicker() {
  const id = useId()
  const selected = useCreateStore(s => s.enhanceModel)
  const setSelected = useCreateStore(s => s.setEnhanceModel)
  const generating = useCreateStore(s => s.isGenerating)
  const [inventory, setInventory] = useState<{ models: string[]; error?: string } | null>(null)
  const [loading, setLoading] = useState(true)
  const generation = useRef(0)
  async function refresh() {
    const request = ++generation.current
    setLoading(true)
    try {
      const models = await loadEnhanceModels()
      if (request === generation.current) setInventory({ models })
    } catch (error) {
      if (request === generation.current) setInventory({ models: [], error: error instanceof Error ? error.message : String(error) })
    } finally {
      if (request === generation.current) setLoading(false)
    }
  }
  useEffect(() => {
    const requests = generation
    void refresh()
    return () => { requests.current++ }
  }, [])
  const models = inventory?.models ?? []
  const missing = selected !== 'auto' && selected !== 'bicubic' && !models.includes(selected)
  const detail = loading ? 'Checking installed ComfyUI upscalers…'
    : inventory?.error ?? (missing ? 'This selected model is unavailable. Choose another model or refresh after installing it.'
      : selected === 'bicubic' ? 'Resize only. Bicubic changes dimensions without an AI detail pass.'
        : selected === 'auto' ? models.length ? `Auto will use ${models[0]}.` : 'No AI upscaler is installed. Auto will use Bicubic resize.'
          : `Will use ${selected}, then resize to the chosen resolution.`)
  return (
    <div className="px-3.5 py-3 border-b border-white/[0.06] space-y-2">
      <div className="flex flex-wrap items-end gap-2">
        <label htmlFor={id} className="flex-1 min-w-0 space-y-1 text-xs text-gray-300">
          <span className="block font-medium">Enhance model</span>
          <select id={id} value={selected} onChange={e => setSelected(e.target.value)} disabled={loading || generating}
            aria-describedby={`${id}-detail`} className="w-full min-h-10 rounded-lg border border-white/10 bg-black/20 px-3 text-sm text-gray-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-lu-accent disabled:opacity-50">
            <option value="auto">Auto{!loading && models[0] ? ` · ${models[0]}` : ''}</option>
            <option value="bicubic">Bicubic resize · no AI model</option>
            {missing && <option value={selected} disabled>{selected}{loading ? '' : ' · unavailable'}</option>}
            {models.map(filename => <option key={filename} value={filename}>{filename}</option>)}
          </select>
        </label>
        <button type="button" disabled={loading || generating} onClick={() => void refresh()}
          className="min-h-10 min-w-10 rounded-lg inline-flex items-center justify-center gap-2 px-3 text-xs text-gray-300 hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-lu-accent disabled:opacity-50"
          aria-label="Refresh Enhance models"><RefreshCw size={14} /><span>Refresh</span></button>
      </div>
      <p id={`${id}-detail`} role={inventory?.error || missing && !loading ? 'alert' : 'status'} className="text-xs leading-relaxed text-gray-400 text-pretty">{detail}</p>
      {!loading && !inventory?.error && models.length === 0 && <p className="text-xs text-gray-500">Add compatible upscaler weights to ComfyUI’s models/upscale_models folder, then Refresh. Nothing downloads automatically.</p>}
    </div>
  )
}
