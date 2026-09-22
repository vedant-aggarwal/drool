import { useEffect, useRef, useState } from 'react'
import { ExternalLink, Search } from 'lucide-react'
import { openExternal } from '../../api/backend'
import { getHfDetails, hfInstallBlock, hfMatchingBundles, hfVariantModel, hfLibraryTokenConfigured, HF_SUGGESTIONS, searchHfLibrary,
  type HfCategory, type HfDetails, type HfRepository, type HfVariant } from '../../api/huggingface-library'
import type { DiscoverModel, ModelBundle } from '../../api/model-bundles'
import type { HfGgufResolution } from '../../api/discover'
import { formatBytes, formatCount } from '../../lib/formatters'

interface Props {
  category: HfCategory
  search?: string
  searchSubmitToken?: number
  vramGb?: number | null
  bundles?: ModelBundle[]
  onInstallText?: (model: DiscoverModel, resolution: HfGgufResolution) => Promise<void>
  onInstallBundle?: (bundle: ModelBundle) => void
}

const control = 'min-h-10 px-3 rounded-lg border border-gray-200 dark:border-white/10 text-xs text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lu-accent disabled:opacity-50 transition-colors'

export function HuggingFaceLibrary({ category, search = '', searchSubmitToken = 0, vramGb, bundles = [], onInstallText, onInstallBundle }: Props) {
  const [query, setQuery] = useState(search)
  const [lane, setLane] = useState<HfCategory>(category)
  const [results, setResults] = useState<HfRepository[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [searched, setSearched] = useState(false)
  const [limit, setLimit] = useState(20)
  const [lastQuery, setLastQuery] = useState('')
  const [lastLane, setLastLane] = useState<HfCategory>(category)
  const [tokenConfigured, setTokenConfigured] = useState(false)
  const generation = useRef(0)

  useEffect(() => { void hfLibraryTokenConfigured().then(setTokenConfigured) }, [])

  async function runSearch(text = query, count = 20, selected = lane) {
    const request = ++generation.current
    setLoading(true); setError(''); setSearched(true)
    try {
      const hits = await searchHfLibrary(text, selected, count)
      if (request !== generation.current) return
      setResults(hits); setLimit(count); setLastQuery(text); setLastLane(selected)
    } catch (e) {
      if (request === generation.current) { setResults([]); setError(e instanceof Error ? e.message : 'Hugging Face is unavailable. Retry the search.') }
    } finally { if (request === generation.current) setLoading(false) }
  }

  useEffect(() => {
    generation.current++
    setLane(category); setResults([]); setSearched(false); setError(''); setLoading(false)
    // Invalidate the latest request, not the value from effect setup.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    return () => { generation.current++ }
  }, [category])
  useEffect(() => {
    if (searchSubmitToken > 0 && search.trim()) { setQuery(search); void runSearch(search, 20, category) }
    // Header submit is an explicit action; typing only filters the curated grid.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchSubmitToken])

  return <section className="space-y-3 p-4 rounded-xl border border-gray-200 dark:border-white/10" aria-label="Hugging Face library">
    <div className="space-y-1">
      <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Explore Hugging Face</h3>
      <p className="text-xs text-gray-500 leading-relaxed">Search beyond the curated library. Review exact files, sizes and runtime compatibility before downloading.</p>
      <p className="text-xs text-gray-500">{tokenConfigured ? 'Hugging Face token configured on this PC. Repository access and accepted terms are checked by Hugging Face.' : 'Public models work without a token. For gated or private models, add your read token in Settings → AI Backends → Hugging Face token.'}</p>
    </div>
    <form onSubmit={e => { e.preventDefault(); void runSearch() }} className="flex flex-wrap gap-2">
      <input className={`${control} flex-1 min-w-40 bg-transparent`} aria-label="Search Hugging Face" placeholder="Model name, creator or repository" value={query} onChange={e => setQuery(e.target.value)} />
      <select className={`${control} bg-white dark:bg-gray-900`} aria-label="Hugging Face category" value={lane} onChange={e => {
        const next = e.target.value as HfCategory
        generation.current++; setLane(next); setResults([]); setSearched(false); setLoading(false); setError('')
      }}>
        {(['text', 'image', 'video', 'audio', 'lora', 'all'] as HfCategory[]).map(item => <option key={item} value={item}>{item === 'lora' ? 'LoRAs' : item === 'all' ? 'All models' : item[0].toUpperCase() + item.slice(1)}</option>)}
      </select>
      <button className={`${control} inline-flex items-center gap-2`} disabled={loading}><Search size={14} />{loading ? 'Searching…' : query.trim() ? 'Search' : 'Browse popular'}</button>
    </form>
    <div className="flex flex-wrap gap-2" aria-label="Model suggestions">
      {HF_SUGGESTIONS[lane].map(pick => <button key={pick.label} className={control} title={`Suggested search · ${pick.source}`} onClick={() => { setQuery(pick.query); void runSearch(pick.query) }}>{pick.label}</button>)}
    </div>
    <p className="text-xs text-gray-500">Suggestions are starting points, not benchmark rankings. Media and LoRA compatibility depends on the base model and workflow.</p>
    <div role="status" aria-live="polite" className="text-xs text-gray-500">
      {loading ? 'Loading repository metadata…' : error ? '' : searched ? `${results.length} repositories found for ${lastQuery || 'popular models'}.` : 'Choose a suggestion or browse popular models.'}
    </div>
    {error && <p role="alert" className="text-xs text-red-600 dark:text-red-400">{error}</p>}
    {!loading && searched && !error && !results.length && <p className="text-xs text-gray-500">No matching repositories. Try fewer words or choose All models.</p>}
    {loading && results.length === 0 && <HuggingFaceResultsSkeleton />}
    <div className="space-y-2" aria-busy={loading}>
      {results.map(repo => <RepositoryCard key={`${lastLane}:${repo.id}`} repository={repo} vramGb={vramGb} bundles={bundles} onInstallText={onInstallText} onInstallBundle={onInstallBundle} />)}
    </div>
    {results.length === limit && limit < 100 && <button className={control} disabled={loading} onClick={() => void runSearch(lastQuery, limit + 20, lastLane)}>Show 20 more</button>}
    {limit >= 100 && <button className={control} onClick={() => openExternal(`https://huggingface.co/models?search=${encodeURIComponent(lastQuery)}`)}>Continue on Hugging Face</button>}
  </section>
}

function HuggingFaceResultsSkeleton() {
  return <div className="space-y-2" role="status" aria-busy="true" aria-live="polite" aria-label="Loading Hugging Face repositories">
    <span className="sr-only">Loading Hugging Face repositories</span>
    {[0, 1, 2].map(row => <div key={row} aria-hidden="true" className="rounded-lg p-3 space-y-3 bg-gray-50 dark:bg-white/[0.03] border border-gray-200 dark:border-white/[0.06]">
      <div className="flex flex-wrap items-center gap-2 animate-pulse">
        <div className="min-w-0 flex-1 space-y-2"><div className="h-3 w-3/5 rounded bg-gray-200 dark:bg-white/10" /><div className="h-3 w-2/5 rounded bg-gray-200 dark:bg-white/10" /></div>
        <div className="h-[var(--control-h-lg)] w-36 rounded-lg bg-gray-200 dark:bg-white/10" /><div className="h-[var(--control-h-lg)] w-10 rounded-lg bg-gray-200 dark:bg-white/10" />
      </div>
    </div>)}
  </div>
}

function RepositoryCard({ repository, vramGb, bundles, onInstallText, onInstallBundle }: Omit<Props, 'category'> & { repository: HfRepository; bundles: ModelBundle[] }) {
  const [details, setDetails] = useState<HfDetails | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [selectedKey, setSelectedKey] = useState('')
  const [fits, setFits] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const matches = hfMatchingBundles(repository.id, bundles)
  const variants = details?.variants.filter(v => !fits || (!!vramGb && v.bytes > 0 && v.bytes / 1_073_741_824 + 2 <= vramGb)) || []
  const selected = variants.find(v => v.key === selectedKey) || variants.find(v => v.quant === 'Q4_K_M') || variants[0]
  const block = details && selected ? hfInstallBlock(details.repository, selected, details.tokenConfigured) : null

  async function inspect() {
    if (details && expanded) { setExpanded(false); return }
    setBusy(true); setError('')
    try { setDetails(await getHfDetails(repository.id)); setExpanded(true) }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not load model files.') }
    finally { setBusy(false) }
  }
  async function install(variant: HfVariant) {
    if (!details || !onInstallText || hfInstallBlock(details.repository, variant, details.tokenConfigured)) return
    setBusy(true); setError(''); setNotice('')
    try {
      await onInstallText(hfVariantModel(details.repository, variant), {
        sharded: variant.files.length > 1, totalBytes: variant.bytes, quant: variant.quant,
        files: variant.files.map(file => ({
          url: `https://huggingface.co/${repository.id}/resolve/${details.repository.sha}/${file.path.split('/').map(encodeURIComponent).join('/')}`,
          filename: file.path.split('/').pop()!, sizeBytes: file.size || file.lfs?.size || 0,
          sha256: /^[a-f0-9]{64}$/i.test(file.lfs?.oid || '') ? file.lfs!.oid : undefined,
        })),
      })
      setNotice('Download request handled. Check the download queue or any installation notice above.')
    } catch (e) { setError(e instanceof Error ? e.message : 'Download could not start.') }
    finally { setBusy(false) }
  }

  return <article className="rounded-lg p-3 space-y-3 bg-gray-50 dark:bg-white/[0.03] border border-gray-200 dark:border-white/[0.06]">
    <div className="flex flex-wrap items-center gap-2">
      <div className="min-w-0 flex-1">
        <h4 className="text-xs font-medium text-gray-900 dark:text-white break-all">{repository.id}</h4>
        <p className="text-xs text-gray-500 tabular-nums">{repository.pipeline_tag || 'Task unspecified'} · {formatCount(repository.downloads || 0)} downloads{repository.gated ? ' · Gated access' : ''}</p>
      </div>
      <button className={control} disabled={busy} aria-expanded={expanded} onClick={() => void inspect()}>{busy ? 'Working…' : expanded ? 'Hide files' : 'Files & compatibility'}</button>
      <button className={control} aria-label={`Open ${repository.id} on Hugging Face`} onClick={() => openExternal(`https://huggingface.co/${repository.id}`)}><ExternalLink size={14} /></button>
    </div>
    {expanded && details && <div className="space-y-3">
      <p className="text-xs text-gray-500">Architecture: {details.repository.gguf?.architecture || 'Not declared'} · License: {details.repository.cardData?.license || 'See model card'}</p>
      {details.repository.cardData?.base_model && <p className="text-xs text-gray-500 break-all">Base model: {[details.repository.cardData.base_model].flat().join(', ')}</p>}
      {!!vramGb && <label className="flex items-center gap-2 min-h-10 text-xs text-gray-600 dark:text-gray-400"><input type="checkbox" checked={fits} onChange={e => setFits(e.target.checked)} />Fits my PC estimate · weights + 2 GiB ≤ {vramGb} GiB</label>}
      <p className="text-xs text-gray-500">Memory is an estimate. Context, resolution, runtime and companion models need additional space. GGUF can also contain full precision weights.</p>
      {variants.length ? <>
        <select aria-label={`File variant for ${repository.id}`} className={`${control} w-full bg-white dark:bg-gray-900`} value={selected?.key} onChange={e => setSelectedKey(e.target.value)}>
          {variants.map(variant => <option key={variant.key} value={variant.key}>{variant.key} · {formatBytes(variant.bytes)}{variant.files.length > 1 ? ` · ${variant.files.length} parts` : ''}{!variant.complete ? ' · incomplete' : ''}</option>)}
        </select>
        {selected && <p className="text-xs text-gray-500 tabular-nums">{selected.quant} · {formatCount(selected.bytes)} bytes · {selected.files.length} file(s)</p>}
        {block && <p className="text-xs text-gray-500">{block}</p>}
        {!block && selected && onInstallText && <button className={control} disabled={busy || details.treeTruncated} onClick={() => void install(selected)}>Download selected GGUF</button>}
        {!block && !onInstallText && <p className="text-xs text-gray-500">Switch to Models → Chat to install this text model.</p>}
      </> : <p className="text-xs text-gray-500">{fits ? 'No file variants meet this memory estimate.' : 'No GGUF or Safetensors weights in this repository listing.'}</p>}
      {details.treeTruncated && <p className="text-xs text-gray-500">This repository has a large file tree. Open Hugging Face for the complete listing; installation is disabled here.</p>}
      {matches.map(bundle => <div key={bundle.name} className="flex flex-wrap items-center gap-2 text-xs text-gray-600 dark:text-gray-400"><span>Curated workflow: {bundle.name} · {bundle.totalSizeGB} GB including dependencies</span>{onInstallBundle && <button className={control} onClick={() => onInstallBundle(bundle)}>Install complete bundle</button>}</div>)}
    </div>}
    {error && <p role="alert" className="text-xs text-red-600 dark:text-red-400">{error}</p>}
    {notice && <p role="status" className="text-xs text-gray-500">{notice}</p>}
  </article>
}
