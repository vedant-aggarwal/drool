import { useEffect, useRef, useState } from 'react'
import { Plus, Send, Square, Download, Image as ImageIcon, Check, BookOpen, Users } from 'lucide-react'
import { useStoryboardStore, parseStoryboard, panelPrompt, type StoryPanel } from '../../stores/storyboardStore'
import { useModelStore } from '../../stores/modelStore'
import { useCreateStore } from '../../stores/createStore'
import { useCreate } from '../../hooks/useCreate'
import { getProviderForModel } from '../../api/providers'
import { displayModelName } from '../../api/providers/model-name'
import { classifyModel, getImageUrl, getLoraModels } from '../../api/comfyui'
import { runCodexChat } from '../../api/drool-providers'
import { isMacOS } from '../../api/backend'

const input = 'w-full rounded-lg border border-white/10 bg-black/15 p-3 text-sm text-gray-100 focus-visible:outline-2 focus-visible:outline-violet-400'
const button = 'min-h-10 rounded-lg border border-white/10 px-3 py-2 text-sm hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-violet-400 disabled:opacity-40 disabled:cursor-not-allowed transition-colors'
export function StoryStudio() {
  const { projects, activeId, createProject, setActive, updateProject, updatePanel } = useStoryboardStore()
  const project = projects.find(p => p.id === activeId)
  const models = useModelStore(s => s.models)
  const activeModel = useModelStore(s => s.activeModel)
  const imageModels = useCreateStore(s => s.imageModelList)
  const imageModel = useCreateStore(s => s.imageModel)
  const generating = useCreateStore(s => s.isGenerating)
  const progressMessage = useCreateStore(s => s.progressText)
  const { generate, cancel, fetchModels, checkConnection, modelLoadError, modelsLoaded } = useCreate()
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [renderNotice, setRenderNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const [draft, setDraft] = useState<StoryPanel[] | null>(null)
  const [rendering, setRendering] = useState<string | null>(null)
  const [loras, setLoras] = useState<string[]>([])
  const abort = useRef<AbortController | null>(null)
  const inFlight = useRef(false)
  useEffect(() => {
    if (!isMacOS()) void checkConnection()
    void fetchModels()
  }, [checkConnection, fetchModels])
  useEffect(() => { getLoraModels().then(setLoras).catch(() => {}); return () => { abort.current?.abort() } }, [])
  function save(patch: Parameters<typeof updateProject>[1]) { if (project) updateProject(project.id, patch) }
  async function ask(board = false) {
    if (!project || inFlight.current || (!board && !message.trim())) return
    inFlight.current = true; setBusy(true); setError(''); setDraft(null)
    const controller = new AbortController(); abort.current = controller
    const model = project.model || activeModel
    const request = board ? 'Create a storyboard with 4–8 panels. Return ONLY a JSON array of objects with title, prompt (detailed visual direction), caption. Keep character appearance consistent. No markdown.' : message.trim()
    const system = `You are a creative story collaborator. Discuss characters, plot, tone and composition. Project: ${project.title}\nBrief: ${project.brief}\nStyle: ${project.style}\nCharacters: ${JSON.stringify(project.characters)}. Keep captions separate from visual prompts.`
    let reply = ''
    try {
      if (!model) throw new Error('Choose a chat model or connect Codex first.')
      if (model === 'codex-account') {
        const result = await runCodexChat([system, ...project.messages.slice(-16).map(m => `${m.role}: ${m.content}`), request].join('\n\n'), { signal: controller.signal, storyboardTools: true, storyboardProjectId: project.id })
        reply = result.text
      } else {
        const { provider, modelId } = getProviderForModel(model)
        for await (const chunk of provider.chatStream(modelId, [{ role: 'system', content: system }, ...project.messages.slice(-16), { role: 'user', content: request }], { signal: controller.signal, temperature: 0.8, maxTokens: 4096 })) reply += chunk.content
      }
      if (controller.signal.aborted) return
      if (!reply.trim()) throw new Error('The model returned no text. Check its connection and try again.')
      if (board) setDraft(parseStoryboard(reply))
      else { updateProject(project.id, { messages: [...project.messages, { role: 'user', content: request }, { role: 'assistant', content: reply }] }); setMessage('') }
    } catch (e) { if (!controller.signal.aborted) setError(e instanceof Error ? e.message : String(e)) }
    finally { inFlight.current = false; setBusy(false); abort.current = null }
  }
  async function render(panel: StoryPanel) {
    if (!project || generating || rendering || !panel.approved) return
    setRendering(panel.id); setError(''); setRenderNotice('')
    const create = useCreateStore.getState()
    const before = new Set(create.gallery.map(item => item.id))
    const prompt = panelPrompt(project, panel)
    const loraSignature = JSON.stringify(project.characters.map(c => c.lora).filter(Boolean))
    create.setBackend('local'); create.setIntent('image'); create.setPrompt(prompt)
    create.clearLoras(); for (const character of project.characters.filter(c => c.lora)) { create.toggleLora(character.lora); create.setLoraStrengthFor(character.lora, 0.75) }
    try {
      await generate()
      const after = useCreateStore.getState()
      if (after.error) throw new Error(after.error)
      const image = after.gallery.find(item => !before.has(item.id) && item.type === 'image')
      if (image) {
        const current = useStoryboardStore.getState().projects.find(p => p.id === project.id)
        const currentPanel = current?.panels.find(p => p.id === panel.id)
        if (!current || !currentPanel?.approved || panelPrompt(current, currentPanel) !== prompt || JSON.stringify(current.characters.map(c => c.lora).filter(Boolean)) !== loraSignature) {
          setRenderNotice('The panel changed while rendering. This image was saved to the gallery only. Review the current panel and render it again.')
        } else updatePanel(project.id, panel.id, { image })
      }
    } catch (e) { setError(e instanceof Error ? e.message : String(e)) }
    finally { setRendering(null) }
  }
  function exportProject() {
    if (!project) return
    const blob = new Blob([JSON.stringify(project, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = `${project.title.replace(/[^a-z0-9 -]/gi, '').trim() || 'storyboard'}.json`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
  return <main className="flex-1 min-h-0 overflow-auto bg-surface-0 text-gray-100 p-4 md:p-6">
    <div className="mx-auto max-w-7xl space-y-5">
      <header className="flex flex-wrap gap-3 items-center justify-between"><div><h1 className="text-2xl font-semibold text-balance">Story studio</h1><p className="text-sm text-gray-400 mt-1">Discuss the idea. Review the panels. Bring each scene to life.</p></div><button className={button} onClick={() => { createProject(); setDraft(null); setError('') }} disabled={busy || generating}><Plus size={16} className="inline mr-2"/>New story</button></header>
      {!project ? <div className="rounded-2xl border border-white/10 p-12 text-center"><BookOpen className="mx-auto mb-4"/><h2 className="text-lg">A place for your next story</h2><p className="text-gray-400 my-3">Build a manga, illustrated story, character scene, or shot-by-shot storyboard.</p><button className={button} onClick={createProject}>Create your first story</button></div> : <>
      <div className="flex flex-wrap gap-3"><select aria-label="Story project" className={input + ' md:!w-64'} value={project.id} disabled={busy || generating} onChange={e => { setActive(e.target.value); setDraft(null) }}>{projects.map(p => <option key={p.id} value={p.id}>{p.title}</option>)}</select><button className={button} onClick={exportProject}><Download size={16} className="inline mr-2"/>Export project</button><span className="self-center text-xs text-gray-500">Saved on this PC · images stay in your local gallery</span></div>
      {error && <div role="alert" className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-red-200">{error}</div>}
      {renderNotice && <p role="status" className="text-sm text-gray-400">{renderNotice}</p>}
      <div className="grid gap-5 lg:grid-cols-[minmax(280px,360px)_1fr]">
        <aside className="space-y-4 rounded-2xl border border-white/10 p-4">
          <label className="block text-sm">Title<input className={input + ' mt-2'} value={project.title} onChange={e => save({ title: e.target.value })}/></label>
          <label className="block text-sm">Story brief<textarea className={input + ' mt-2 min-h-24'} value={project.brief} onChange={e => save({ brief: e.target.value })} placeholder="Who is this about? What happens? How should it feel?"/></label>
          <label className="block text-sm">Visual style<select className={input + ' mt-2'} value={project.style} onChange={e => save({ style: e.target.value })}>{['Cinematic illustration', 'Black and white manga', 'Watercolor storybook', 'Photorealistic film still', 'Graphic novel', 'Anime'].map(style => <option key={style}>{style}</option>)}</select></label>
          <label className="block text-sm">Story model<select className={input + ' mt-2'} value={project.model || activeModel || ''} onChange={e => save({ model: e.target.value })}><option value="">Choose a model</option>{models.filter(m => !m.type || m.type === 'text').map(m => <option key={m.name} value={m.name}>{displayModelName(m.name)}</option>)}<option value="codex-account">Codex account (online · connect first)</option></select></label>
          <div className="flex justify-between items-center"><h2 className="font-medium"><Users size={16} className="inline mr-2"/>Characters</h2><button aria-label="Add character" className={button} onClick={() => save({ characters: [...project.characters, { id: crypto.randomUUID(), name: 'New character', appearance: '', personality: '', lora: '' }] })}><Plus size={16}/></button></div>
          {project.characters.map(character => <div key={character.id} className="space-y-2 rounded-xl bg-white/5 p-3">{(['name', 'appearance', 'personality'] as const).map(field => <label className="block text-xs capitalize" key={field}>{field}<input className={input + ' mt-1'} value={character[field]} onChange={e => save({ characters: project.characters.map(c => c.id === character.id ? { ...c, [field]: e.target.value } : c) })}/></label>)}<label className="block text-xs">Installed LoRA<select className={input + ' mt-1'} value={character.lora} onChange={e => save({ characters: project.characters.map(c => c.id === character.id ? { ...c, lora: e.target.value } : c) })}><option value="">Appearance prompt only</option>{loras.map(lora => <option key={lora}>{lora}</option>)}</select></label><p className="text-xs text-gray-500">Choose a LoRA matching your image model. Appearance prompts alone cannot guarantee identity.</p></div>)}
        </aside>
        <section className="space-y-4 min-w-0">
          <div className="rounded-2xl border border-white/10 p-4"><h2 className="font-medium mb-3">Discuss your story</h2><div aria-live="polite" className="max-h-80 overflow-auto space-y-3">{project.messages.length ? project.messages.map((m,i) => <div key={i} className={'whitespace-pre-wrap text-sm rounded-xl p-3 ' + (m.role === 'user' ? 'bg-violet-500/10' : 'bg-white/5')}><span className="block text-xs text-gray-400 mb-1">{m.role === 'user' ? 'You' : 'Story collaborator'}</span>{m.content}</div>) : <p className="text-sm text-gray-500">Explore the plot, role-play a character, or refine the brief before making panels.</p>}</div><form className="flex gap-2 mt-3" onSubmit={e => { e.preventDefault(); void ask() }}><textarea aria-label="Message your story collaborator" className={input} value={message} onChange={e => setMessage(e.target.value)} placeholder="What if the main character…"/><button className={button} disabled={busy || !message.trim()} aria-label="Send story message"><Send size={18}/></button>{busy && <button type="button" aria-label="Stop story response" className={button} onClick={() => abort.current?.abort()}><Square size={16}/></button>}</form></div>
          <div className="flex flex-wrap gap-2 items-center"><button className={button + ' bg-violet-500/20'} disabled={busy || !project.brief.trim()} onClick={() => void ask(true)}>{busy ? 'Working…' : 'Draft storyboard'}</button><button className={button} onClick={() => save({ panels: [...project.panels, { id: crypto.randomUUID(), title: `Panel ${project.panels.length + 1}`, prompt: '', caption: '', approved: false }] })}><Plus size={16} className="inline mr-1"/>Add panel</button><select aria-label="Local image model" className={input + ' md:!w-72'} value={imageModel} onChange={e => useCreateStore.getState().setImageModel(e.target.value, classifyModel(e.target.value))}><option value="">Choose local image model</option>{imageModels.map(m => <option key={m.name} value={m.name}>{displayModelName(m.name)}</option>)}</select></div>
          {(modelLoadError || !modelsLoaded || !imageModels.length) && <div role="status" className="rounded-xl border border-white/10 p-3 text-sm text-gray-400">{modelLoadError || (!modelsLoaded ? 'Loading local image models…' : 'No local image models found. Install an image model in Models and start its local engine.')}<button className={button + ' ml-2'} onClick={() => void fetchModels()}>Refresh image models</button></div>}
          {draft && <div className="rounded-xl border border-violet-400/30 p-4 space-y-3"><h3 className="font-medium">Review proposed panels</h3>{draft.map((p,i) => <p key={p.id} className="text-sm"><strong>{i+1}. {p.title}</strong> — {p.prompt}<span className="block text-gray-400">Caption: {p.caption}</span></p>)}<button className={button} onClick={() => { save({ panels: [...project.panels, ...draft] }); setDraft(null) }}>Add {draft.length} panels to storyboard</button><button className={button + ' ml-2'} onClick={() => setDraft(null)}>Discard draft</button></div>}
          {generating && <div role="status" className="flex gap-3 items-center text-sm text-violet-300">{progressMessage || 'Rendering locally…'}<button className={button} onClick={() => void cancel()}>Stop render</button></div>}
          <div className="grid gap-4 md:grid-cols-2">{project.panels.map((panel,index) => <article key={panel.id} className="rounded-2xl border border-white/10 p-4 space-y-3">{panel.image ? <img className="w-full aspect-video object-contain rounded-lg outline outline-1 outline-white/10 bg-black/20" src={panel.image.dataUrl || getImageUrl(panel.image.filename,panel.image.subfolder,panel.image.comfyType)} alt={panel.title}/> : <div className="aspect-video grid place-content-center rounded-lg bg-white/5 text-gray-500"><ImageIcon className="mx-auto mb-2"/><span className="text-xs">Panel {index+1}</span></div>}<input aria-label={`Panel ${index+1} title`} className={input} value={panel.title} onChange={e => updatePanel(project.id,panel.id,{title:e.target.value})}/><textarea aria-label={`Panel ${index+1} image prompt`} className={input + ' min-h-28'} value={panel.prompt} onChange={e => updatePanel(project.id,panel.id,{prompt:e.target.value,approved:false})}/><textarea aria-label={`Panel ${index+1} caption`} className={input} placeholder="Caption (separate from image)" value={panel.caption} onChange={e => updatePanel(project.id,panel.id,{caption:e.target.value})}/><div className="flex flex-wrap gap-2"><button className={button + (panel.approved ? ' text-green-300' : '')} disabled={!panel.prompt.trim()} onClick={() => updatePanel(project.id,panel.id,{approved:!panel.approved})}><Check size={15} className="inline mr-1"/>{panel.approved ? 'Reviewed' : 'Approve panel'}</button><button className={button} disabled={!panel.approved || generating || !!rendering || !imageModels.length} onClick={() => void render(panel)}>{rendering === panel.id ? 'Rendering…' : panel.image ? 'Regenerate' : 'Render locally'}</button></div></article>)}</div>
        </section>
      </div></>}
    </div>
  </main>
}
