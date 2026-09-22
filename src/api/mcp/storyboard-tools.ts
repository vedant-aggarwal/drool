import type { ToolRegistry } from './tool-registry'
import type { JSONSchemaProp, MCPToolDefinition, ToolArgs } from './types'
import { isReadOnlyShellTurn } from '../agent-context'
import type { AgentRunContext } from '../agent-context'
import { isRecord } from '../../types/json-guards'
import { useStoryboardStore, panelPrompt } from '../../stores/storyboardStore'
import { loadCharacterReference, projectReferences, panelReferenceSignature, supportsCharacterReference } from '../../lib/character-references'
import { isMacOS } from '../backend'
import type { StoryProject, StoryPanel, StoryCharacter } from '../../stores/storyboardStore'

const str = (description: string): JSONSchemaProp => ({ type: 'string', description })
const projectId = str('Project ID returned by storyboard_list or storyboard_create.')
const panelId = str('Panel ID returned by storyboard_read or storyboard_panel.')
const definitions: MCPToolDefinition[] = [
  { name: 'storyboard_list', description: 'List local stories with panel and character counts.', inputSchema: { type: 'object', properties: {}, required: [], additionalProperties: false }, category: 'workflow', source: 'builtin' },
  { name: 'storyboard_read', description: 'Read story, characters, references, panels and approvals. No image bytes.', inputSchema: { type: 'object', properties: { projectId }, required: ['projectId'], additionalProperties: false }, category: 'workflow', source: 'builtin' },
  { name: 'storyboard_create', description: 'Create a local story; returns its ID. No inference.', inputSchema: { type: 'object', properties: { title: str('Story title, at most 200 characters.'), brief: str('Story brief.'), style: str('Visual style.'), model: str('Optional chat model identifier.') }, required: ['title'], additionalProperties: false }, category: 'workflow', source: 'builtin' },
  { name: 'storyboard_update', description: 'Edit a story. Style changes revoke approvals and detach images; gallery originals remain.', inputSchema: { type: 'object', properties: { projectId, title: str('Story title.'), brief: str('Story brief.'), style: str('Visual style.'), model: str('Chat model identifier.') }, required: ['projectId'], additionalProperties: false }, category: 'workflow', source: 'builtin' },
  { name: 'storyboard_panel', description: 'Add/edit a panel; new panels need title and prompt. Visual/reference changes revoke approval. Captions are separate. Limit 32.', inputSchema: { type: 'object', properties: { projectId, panelId, title: str('Panel title.'), prompt: str('Detailed image prompt, at most 8000 characters.'), caption: str('Separate caption; may be empty.'), referenceId: str('Saved reference ID; empty clears.'), referenceDenoise: { type: 'number', description: 'Change strength 0.05–0.85; lower preserves more.' } }, required: ['projectId'], additionalProperties: false }, category: 'workflow', source: 'builtin' },
  { name: 'storyboard_character', description: 'Add/edit a character; new ones need a name. Appearance/LoRA changes revoke panel approvals. Use installed LoRA filenames.', inputSchema: { type: 'object', properties: { projectId, characterId: str('Existing character ID, or omit to add.'), name: str('Character name.'), appearance: str('Consistent visual description.'), personality: str('Personality and roleplay guidance.'), lora: str('Optional installed LoRA filename. Empty clears it.') }, required: ['projectId'], additionalProperties: false }, category: 'workflow', source: 'builtin' },
  { name: 'storyboard_approve_panel', description: 'Approve/revoke a reviewed panel revision. Does not render.', inputSchema: { type: 'object', properties: { projectId, panelId, approved: { type: 'boolean', description: 'True to approve this revision, false to revoke.' } }, required: ['projectId', 'panelId', 'approved'], additionalProperties: false }, category: 'workflow', source: 'builtin' },
  { name: 'storyboard_render_panel', description: 'Render one approved panel locally with character guidance. Uses Create settings and an installed image model; verifies output before saving. Never calls cloud.', inputSchema: { type: 'object', properties: { projectId, panelId, model: str('Optional installed local image model filename; defaults to the Create selection.') }, required: ['projectId', 'panelId'], additionalProperties: false }, category: 'workflow', source: 'builtin' },
]
export const STORYBOARD_TOOL_NAMES = definitions.map(d => d.name)
const reads = new Set(['storyboard_list', 'storyboard_read'])
const activeRenders = new Set<string>()

function validate(args: ToolArgs, definition: MCPToolDefinition) {
  if (!isRecord(args)) throw new Error('Tool arguments must be an object.')
  for (const key of Object.keys(args)) if (!Object.hasOwn(definition.inputSchema.properties, key)) throw new Error(`Unknown argument: ${key}`)
  for (const key of definition.inputSchema.required) if (!Object.hasOwn(args, key)) throw new Error(`Missing argument: ${key}`)
  for (const [key, value] of Object.entries(args)) {
    const type = definition.inputSchema.properties[key]?.type
    if (typeof value !== type) throw new Error(`${key} must be ${String(type)}.`)
  }
}
function text(args: ToolArgs, key: string, max = 8000, required = false): string | undefined {
  if (!Object.hasOwn(args, key)) {
    if (required) throw new Error(`${key} is required.`)
    return undefined
  }
  const value = args[key]
  if (typeof value !== 'string' || value.length > max || (required && !value.trim())) throw new Error(`${key} must be ${required ? 'nonempty ' : ''}text of at most ${max} characters.`)
  return value.trim()
}
function project(args: ToolArgs): StoryProject {
  const id = text(args, 'projectId', 200, true)
  const found = useStoryboardStore.getState().projects.find(p => p.id === id)
  if (!found) throw new Error('Story project not found. Use storyboard_list first.')
  return found
}
function panel(p: StoryProject, args: ToolArgs): StoryPanel {
  const id = text(args, 'panelId', 200, true)
  const found = p.panels.find(row => row.id === id)
  if (!found) throw new Error('Panel not found in this project.')
  return found
}
function invalidate(panels: StoryPanel[]): StoryPanel[] { return panels.map(p => ({ ...p, approved: false, image: undefined })) }
function panelView(p: StoryPanel) { return { ...p, image: p.image ? { id: p.image.id, filename: p.image.filename, subfolder: p.image.subfolder, model: p.image.model } : undefined } }
function projectView(p: StoryProject) { return { ...p, panels: p.panels.map(panelView) } }

async function execute(name: string, args: ToolArgs, registry: ToolRegistry, run?: AgentRunContext, signal?: AbortSignal): Promise<unknown> {
  const store = useStoryboardStore.getState()
  if (name === 'storyboard_list') return store.projects.map(p => ({ id: p.id, title: p.title, panelCount: p.panels.length, characterCount: p.characters.length, updatedAt: p.updatedAt }))
  if (name === 'storyboard_read') return projectView(project(args))
  if (name === 'storyboard_create' || name === 'storyboard_update') {
    const patch = {
      title: text(args, 'title', 200, name === 'storyboard_create'), brief: text(args, 'brief'),
      style: text(args, 'style', 2000), model: text(args, 'model', 500),
    }
    const fields = Object.fromEntries(Object.entries(patch).filter(([, value]) => value !== undefined))
    if (!Object.keys(fields).length) throw new Error('Provide at least one project field to change.')
    if (patch.title !== undefined && !patch.title) throw new Error('Title must not be empty.')
    const p = name === 'storyboard_update' ? project(args) : null
    const id = p?.id ?? store.createProject()
    store.updateProject(id, { ...fields, ...(p && patch.style !== undefined && patch.style !== p.style ? { panels: invalidate(p.panels) } : {}) })
    return projectView(useStoryboardStore.getState().projects.find(row => row.id === id)!)
  }
  const p = project(args)
  if (name === 'storyboard_panel') {
    const existing = Object.hasOwn(args, 'panelId') ? panel(p, args) : undefined
    if (!existing && p.panels.length >= 32) throw new Error('A storyboard supports at most 32 panels.')
    const title = text(args, 'title', 200, !existing), prompt = text(args, 'prompt', 8000, !existing), caption = text(args, 'caption', 4000)
    const referenceId = text(args, 'referenceId', 200)
    const referenceDenoise = args.referenceDenoise
    if (referenceId && !projectReferences(p).some(r => r.id === referenceId)) throw new Error('Reference not found among this story character’s saved images.')
    if (referenceDenoise !== undefined && (typeof referenceDenoise !== 'number' || !Number.isFinite(referenceDenoise) || referenceDenoise < 0.05 || referenceDenoise > 0.85)) throw new Error('referenceDenoise must be between 0.05 and 0.85.')
    if (title === undefined && prompt === undefined && caption === undefined && referenceId === undefined && referenceDenoise === undefined) throw new Error('Provide at least one panel field.')
    if (prompt !== undefined && !prompt) throw new Error('Panel prompt must not be empty.')
    const next: StoryPanel = { ...existing, id: existing?.id ?? crypto.randomUUID(), title: title ?? existing?.title ?? '', prompt: prompt ?? existing?.prompt ?? '', caption: caption ?? existing?.caption ?? '', approved: existing?.approved ?? false, image: existing?.image }
    if (referenceId !== undefined) next.referenceId = referenceId
    if (referenceDenoise !== undefined) next.referenceDenoise = referenceDenoise as number
    if (existing && ((prompt !== undefined && prompt !== existing.prompt) || panelReferenceSignature(next) !== panelReferenceSignature(existing))) { next.approved = false; next.image = undefined }
    store.updateProject(p.id, { panels: existing ? p.panels.map(row => row.id === existing.id ? next : row) : [...p.panels, next] })
    return panelView(next)
  }
  if (name === 'storyboard_character') {
    const id = text(args, 'characterId', 200)
    const existing = id ? p.characters.find(c => c.id === id) : undefined
    if (Object.hasOwn(args, 'characterId') && !existing) throw new Error('Character not found in this project.')
    if (!existing && p.characters.length >= 32) throw new Error('A story supports at most 32 characters.')
    const name = text(args, 'name', 200, !existing), appearance = text(args, 'appearance'), personality = text(args, 'personality'), lora = text(args, 'lora', 1000)
    if ([name, appearance, personality, lora].every(v => v === undefined)) throw new Error('Provide at least one character field.')
    if (name !== undefined && !name) throw new Error('Character name must not be empty.')
    const next: StoryCharacter = { ...existing, id: existing?.id ?? crypto.randomUUID(), name: name ?? existing?.name ?? '', appearance: appearance ?? existing?.appearance ?? '', personality: personality ?? existing?.personality ?? '', lora: lora ?? existing?.lora ?? '' }
    const visualChange = !existing || next.name !== existing.name || next.appearance !== existing.appearance || next.lora !== existing.lora
    store.updateProject(p.id, { characters: existing ? p.characters.map(c => c.id === existing.id ? next : c) : [...p.characters, next], ...(visualChange ? { panels: invalidate(p.panels) } : {}) })
    return next
  }
  const selected = panel(p, args)
  if (name === 'storyboard_approve_panel') {
    if (!selected.prompt.trim()) throw new Error('A panel needs an image prompt before approval.')
    store.updatePanel(p.id, selected.id, { approved: args.approved === true })
    return { panelId: selected.id, approved: args.approved }
  }
  if (name !== 'storyboard_render_panel') throw new Error('Unknown storyboard tool.')
  return renderPanel(registry, p, selected, args, run, signal)
}

async function renderPanel(registry: ToolRegistry, p: StoryProject, selected: StoryPanel, args: ToolArgs, run?: AgentRunContext, signal?: AbortSignal) {
  if (!selected.approved) throw new Error('Review and approve this panel before rendering.')
  const key = `${p.id}:${selected.id}`
  if (activeRenders.has(key)) throw new Error('This panel is already rendering.')
  const { usePermissionStore } = await import('../../stores/permissionStore')
  if (usePermissionStore.getState().getEffectivePermissionForTool('image_generate', 'image', run?.conversationId ?? undefined) === 'blocked') throw new Error('Image generation is blocked in permissions.')
  const { useCreateStore } = await import('../../stores/createStore')
  const { classifyModel, getImageUrl, fetchComfyImageBase64, uploadImage } = await import('../comfyui')
  const { requestGenerationCancel } = await import('../vram-handoff')
  const create = useCreateStore.getState()
  const model = text(args, 'model', 1000) || create.imageModel
  if (!model) throw new Error('Select an installed local image model in Create first.')
  const prompt = panelPrompt(p, selected)
  const referenceSignature = panelReferenceSignature(selected)
  const loras = p.characters.map(c => c.lora).filter(Boolean)
  const seed = create.seed >= 0 ? create.seed : crypto.getRandomValues(new Uint32Array(1))[0]
  const settings = { width: create.width, height: create.height, steps: create.steps, cfg: create.cfgScale, sampler: create.sampler, scheduler: create.scheduler, seed, ...(loras.length ? { lora: loras, loraStrength: 0.75 } : {}) }
  const owner: AgentRunContext = run ?? { token: key, chatId: null, conversationId: key, workspace: null, artifactMode: false, readOnlyShellTurn: false, mode: null, artifacts: [], abortSignal: signal }
  const abort = () => requestGenerationCancel(owner.conversationId)
  if (activeRenders.has(key)) throw new Error('This panel is already rendering.')
  const beforeSubmit = useStoryboardStore.getState().projects.find(row => row.id === p.id)
  const beforePanel = beforeSubmit?.panels.find(row => row.id === selected.id)
  if (!beforeSubmit || !beforePanel?.approved || panelPrompt(beforeSubmit, beforePanel) !== prompt || panelReferenceSignature(beforePanel) !== referenceSignature || JSON.stringify(beforeSubmit.characters.map(c => c.lora).filter(Boolean)) !== JSON.stringify(loras)) throw new Error('The panel changed before rendering. Review it again.')
  activeRenders.add(key)
  signal?.addEventListener('abort', abort, { once: true })
  try {
    if (signal?.aborted) throw new Error('Render cancelled before submission.')
    let referenceInput: { inputImage: string; denoise: number } | undefined
    if (selected.referenceId) {
      if (isMacOS() || !supportsCharacterReference(classifyModel(model))) throw new Error('Character references require a local SDXL or SD 1.5 checkpoint.')
      const reference = projectReferences(p).find(r => r.id === selected.referenceId)
      if (!reference) throw new Error('The selected character reference is missing. Choose another in Story studio and approve again.')
      const blob = await loadCharacterReference(reference.id)
      const filename = await uploadImage(new File([blob], `character-${reference.id}.${reference.mime === 'image/jpeg' ? 'jpg' : reference.mime === 'image/webp' ? 'webp' : 'png'}`, { type: reference.mime }))
      const latest = useStoryboardStore.getState().projects.find(row => row.id === p.id)
      const latestPanel = latest?.panels.find(row => row.id === selected.id)
      if (!latest || !latestPanel?.approved || panelPrompt(latest, latestPanel) !== prompt || panelReferenceSignature(latestPanel) !== referenceSignature || !projectReferences(latest).some(r => r.id === reference.id)) throw new Error('The panel changed while preparing its reference. Review again.')
      referenceInput = { inputImage: getImageUrl(filename, '', 'input'), denoise: selected.referenceDenoise ?? 0.45 }
    }
    if (signal?.aborted) throw new Error('Render cancelled before submission.')
    const result = await registry.execute('image_generate', { prompt, model, negativePrompt: create.negativePrompt, settings, ...referenceInput }, 0, owner, signal)
    if (signal?.aborted) throw new Error('Render cancelled.')
    if (!result.startsWith('Image generated: ')) throw new Error(result.slice(0, 2000) || 'Image generation produced no output.')
    const rawUrl = result.trim().split('\n').at(-1) ?? ''
    const output = new URL(rawUrl)
    const expected = new URL(getImageUrl('probe.png'))
    if (output.origin !== expected.origin || output.pathname !== expected.pathname || output.username || output.password) throw new Error('The image engine returned an unsupported output location; no panel image was saved.')
    const filename = output.searchParams.get('filename') ?? ''
    const subfolder = output.searchParams.get('subfolder') ?? ''
    const comfyType = output.searchParams.get('type') ?? 'output'
    if (!/\.(png|jpe?g|webp)$/i.test(filename) || /[\\/]/.test(filename) || comfyType !== 'output') throw new Error('No supported output image was returned.')
    const bytes = await fetchComfyImageBase64(rawUrl)
    const mime = bytes.startsWith('iVBORw0KGgo') ? 'image/png' : bytes.startsWith('/9j/') ? 'image/jpeg' : bytes.startsWith('UklGR') ? 'image/webp' : null
    if (!mime || bytes.length < 32) throw new Error('Generated image bytes could not be verified; no panel image was saved.')
    if (signal?.aborted) throw new Error('Render cancelled.')
    const image = { id: crypto.randomUUID(), type: 'image' as const, filename, subfolder, comfyType, prompt, negativePrompt: create.negativePrompt, model, modelType: classifyModel(model), seed, steps: create.steps, cfgScale: create.cfgScale, sampler: create.sampler, scheduler: create.scheduler, width: create.width, height: create.height, batchSize: 1, createdAt: Date.now(), dataUrl: `data:${mime};base64,${bytes}` }
    useCreateStore.getState().addToGallery(image)
    const current = useStoryboardStore.getState().projects.find(row => row.id === p.id)
    const currentPanel = current?.panels.find(row => row.id === selected.id)
    if (!current || !currentPanel || !currentPanel.approved || panelPrompt(current, currentPanel) !== prompt || panelReferenceSignature(currentPanel) !== referenceSignature || (selected.referenceId && !projectReferences(current).some(r => r.id === selected.referenceId)) || JSON.stringify(current.characters.map(c => c.lora).filter(Boolean)) !== JSON.stringify(loras)) {
      return { status: 'saved_to_gallery_only', imageId: image.id, filename, reason: 'The panel changed while rendering. The previous revision was not attached to it.' }
    }
    useStoryboardStore.getState().updatePanel(p.id, selected.id, { image })
    return { status: 'rendered', projectId: p.id, panelId: selected.id, imageId: image.id, filename }
  } finally {
    signal?.removeEventListener('abort', abort)
    activeRenders.delete(key)
  }
}

export function registerStoryboardTools(registry: ToolRegistry) {
  for (const definition of definitions) registry.registerBuiltin(definition, async (args, run, signal) => {
    validate(args, definition)
    if (!reads.has(definition.name) && isReadOnlyShellTurn(run)) throw new Error('Story changes and rendering are disabled in a read-only turn.')
    if (signal?.aborted) throw new Error('Cancelled before the storyboard operation.')
    return JSON.stringify(await execute(definition.name, args, registry, run, signal))
  })
}
