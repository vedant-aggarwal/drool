import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ToolRegistry } from '../tool-registry'
import { registerStoryboardTools } from '../storyboard-tools'
import { useStoryboardStore } from '../../../stores/storyboardStore'
import { DEFAULT_PERMISSIONS } from '../types'
import { allowedInReadOnlyTurn } from '../../../lib/mutating-tools'
import type { AgentRunContext } from '../../agent-context'

const mocks = vi.hoisted(() => ({
  image: vi.fn(), addToGallery: vi.fn(), cancel: vi.fn(), bytes: vi.fn(), permission: vi.fn(), reference: vi.fn(), upload: vi.fn(),
}))
vi.mock('../../../stores/createStore', () => ({ useCreateStore: { getState: () => ({ imageModel: 'model.safetensors', width: 512, height: 512, steps: 20, cfgScale: 7, sampler: 'euler', scheduler: 'normal', seed: 42, negativePrompt: '', addToGallery: mocks.addToGallery }) } }))
vi.mock('../../../stores/permissionStore', () => ({ usePermissionStore: { getState: () => ({ getEffectivePermissionForTool: mocks.permission }) } }))
vi.mock('../../comfyui', () => ({ classifyModel: () => 'sd15', getImageUrl: (filename: string) => `http://127.0.0.1:8188/view?filename=${filename}`, fetchComfyImageBase64: mocks.bytes, uploadImage: mocks.upload }))
vi.mock('../../../lib/character-references', async importOriginal => ({ ...await importOriginal<typeof import('../../../lib/character-references')>(), loadCharacterReference: mocks.reference }))
vi.mock('../../vram-handoff', () => ({ requestGenerationCancel: mocks.cancel }))

let registry: ToolRegistry
beforeEach(() => {
  vi.clearAllMocks()
  useStoryboardStore.setState({ projects: [], activeId: null })
  mocks.permission.mockReturnValue('confirm')
  mocks.reference.mockResolvedValue(new Blob(['bytes'], { type: 'image/png' }))
  mocks.upload.mockResolvedValue('saved-ref.png')
  mocks.bytes.mockResolvedValue('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwC')
  mocks.image.mockResolvedValue('Image generated: scene.png (prompt: "scene")\nhttp://127.0.0.1:8188/view?filename=scene.png&subfolder=stories&type=output')
  registry = new ToolRegistry()
  registry.registerBuiltin({ name: 'image_generate', description: '', inputSchema: { type: 'object', properties: {}, required: [] }, category: 'image', source: 'builtin' }, mocks.image)
  registerStoryboardTools(registry)
})

async function create() {
  const p = JSON.parse(await registry.execute('storyboard_create', { title: 'Moon trip', style: 'Manga' }))
  const panel = JSON.parse(await registry.execute('storyboard_panel', { projectId: p.id, title: 'Arrival', prompt: 'A landing craft on the moon', caption: 'We arrived.' }))
  return { projectId: p.id as string, panelId: panel.id as string }
}
const current = () => useStoryboardStore.getState().projects[0]

describe('storyboard agent tools', () => {
  it('creates and edits actual story state and returns IDs for subsequent calls', async () => {
    const ids = await create()
    const c = JSON.parse(await registry.execute('storyboard_character', { projectId: ids.projectId, name: 'Mira', appearance: 'Silver coat', personality: 'Curious' }))
    await registry.execute('storyboard_character', { projectId: ids.projectId, characterId: c.id, personality: 'Fearless' })
    const read = JSON.parse(await registry.execute('storyboard_read', { projectId: ids.projectId }))
    expect(read.characters[0].personality).toBe('Fearless')
    expect(read.panels[0].caption).toBe('We arrived.')
    expect(read.panels[0].approved).toBe(false)
  })
  it('rejects unknown, oversized, malformed and missing fields without partial writes', async () => {
    expect(await registry.execute('storyboard_create', { title: 'A', panels: [] })).toContain('Unknown argument')
    expect(await registry.execute('storyboard_create', { title: 42 })).toContain('must be string')
    expect(await registry.execute('storyboard_create', { title: 'a'.repeat(201) })).toContain('200')
    expect(await registry.execute('storyboard_create', {})).toContain('Missing')
    expect(useStoryboardStore.getState().projects).toHaveLength(0)
  })
  it('requires boolean approval, resets it for visual changes, and preserves it for captions', async () => {
    const ids = await create()
    expect(await registry.execute('storyboard_approve_panel', { ...ids, approved: 'true' })).toContain('must be boolean')
    await registry.execute('storyboard_approve_panel', { ...ids, approved: true })
    await registry.execute('storyboard_panel', { ...ids, caption: 'New caption' })
    expect(current().panels[0].approved).toBe(true)
    await registry.execute('storyboard_panel', { ...ids, prompt: 'Another scene' })
    expect(current().panels[0].approved).toBe(false)
    await registry.execute('storyboard_approve_panel', { ...ids, approved: true })
    await registry.execute('storyboard_character', { projectId: ids.projectId, name: 'New person' })
    expect(current().panels[0].approved).toBe(false)
  })
  it('keeps default workflow confirmation and blocks mutation in a read-only run', async () => {
    expect(registry.getPermissionLevel('storyboard_create', DEFAULT_PERMISSIONS)).toBe('confirm')
    expect(allowedInReadOnlyTurn('storyboard_create')).toBe(false)
    expect(allowedInReadOnlyTurn('storyboard_read')).toBe(true)
    const run: AgentRunContext = { token: 'readonly', chatId: null, conversationId: null, workspace: null, artifactMode: false, readOnlyShellTurn: true, mode: 'plan', artifacts: [] }
    expect(await registry.execute('storyboard_create', { title: 'Forbidden' }, 1, run)).toContain('read-only')
    expect(useStoryboardStore.getState().projects).toHaveLength(0)
  })
  it('refuses unapproved generation and respects blocked image permissions', async () => {
    const ids = await create()
    expect(await registry.execute('storyboard_render_panel', ids)).toContain('approve')
    await registry.execute('storyboard_approve_panel', { ...ids, approved: true })
    mocks.permission.mockReturnValue('blocked')
    expect(await registry.execute('storyboard_render_panel', ids)).toContain('blocked')
    expect(mocks.image).not.toHaveBeenCalled()
  })
  it('attaches only verified output to the requested panel and adds it to gallery', async () => {
    const ids = await create()
    await registry.execute('storyboard_approve_panel', { ...ids, approved: true })
    const result = JSON.parse(await registry.execute('storyboard_render_panel', ids))
    expect(result.status).toBe('rendered')
    expect(current().panels[0].image?.filename).toBe('scene.png')
    expect(current().panels[0].image?.subfolder).toBe('stories')
    expect(mocks.addToGallery).toHaveBeenCalledOnce()
    expect(mocks.image.mock.calls[0][0].prompt).toContain('No captions or lettering')
  })
  it('never claims rendered when the engine reports no output, bad bytes, or a foreign URL', async () => {
    const ids = await create()
    await registry.execute('storyboard_approve_panel', { ...ids, approved: true })
    for (const response of ['Image generation completed but no output produced.', 'Image generated: scene.png\nhttps://attacker.example/view?filename=scene.png']) {
      mocks.image.mockResolvedValueOnce(response)
      expect(await registry.execute('storyboard_render_panel', ids)).toMatch(/^Error:/)
    }
    mocks.bytes.mockResolvedValueOnce('not image bytes')
    expect(await registry.execute('storyboard_render_panel', ids)).toContain('could not be verified')
    expect(mocks.addToGallery).not.toHaveBeenCalled()
    expect(current().panels[0].image).toBeUndefined()
  })
  it('does not attach a finished old revision when the panel changes during generation', async () => {
    const ids = await create()
    await registry.execute('storyboard_approve_panel', { ...ids, approved: true })
    mocks.image.mockImplementationOnce(async () => {
      useStoryboardStore.getState().updatePanel(ids.projectId, ids.panelId, { prompt: 'Changed meanwhile', approved: false })
      return 'Image generated: scene.png\nhttp://127.0.0.1:8188/view?filename=scene.png&type=output'
    })
    const result = JSON.parse(await registry.execute('storyboard_render_panel', ids))
    expect(result.status).toBe('saved_to_gallery_only')
    expect(current().panels[0].image).toBeUndefined()
    expect(mocks.addToGallery).toHaveBeenCalledOnce()
  })
  it('never retries a failed mutating render', async () => {
    const ids = await create()
    await registry.execute('storyboard_approve_panel', { ...ids, approved: true })
    mocks.image.mockRejectedValueOnce(new Error('fetch failed'))
    expect(await registry.execute('storyboard_render_panel', ids)).toContain('fetch failed')
    expect(mocks.image).toHaveBeenCalledOnce()
  })
})


describe('storyboard reference tools', () => {
  async function withReference() {
    const ids = await create()
    useStoryboardStore.getState().updateProject(ids.projectId, { characters: [{ id: 'ari', name: 'Ari', appearance: '', personality: '', lora: '', references: [{ id: 'ref', name: 'Portrait', mime: 'image/png', size: 5 }] }] })
    return ids
  }
  it('preserves reference metadata during character and caption edits and requires reference review', async () => {
    const ids = await withReference()
    await registry.execute('storyboard_panel', { ...ids, referenceId: 'ref', referenceDenoise: 0.35 })
    expect(current().panels[0]).toMatchObject({ referenceId: 'ref', referenceDenoise: 0.35, approved: false })
    await registry.execute('storyboard_character', { projectId: ids.projectId, characterId: 'ari', personality: 'Curious' })
    expect(current().characters[0].references?.[0].id).toBe('ref')
    await registry.execute('storyboard_approve_panel', { ...ids, approved: true })
    await registry.execute('storyboard_panel', { ...ids, caption: 'Ari arrives.' })
    expect(current().panels[0]).toMatchObject({ referenceId: 'ref', referenceDenoise: 0.35, approved: true })
    await registry.execute('storyboard_panel', { ...ids, referenceDenoise: 0.5 })
    expect(current().panels[0].approved).toBe(false)
    expect(await registry.execute('storyboard_panel', { ...ids, referenceId: 'unknown' })).toContain('Reference not found')
    expect(await registry.execute('storyboard_panel', { ...ids, referenceDenoise: 1 })).toContain('between 0.05 and 0.85')
  })
  it('passes a saved reference to the local image generation tool and never embeds the image in model context', async () => {
    const ids = await withReference()
    await registry.execute('storyboard_panel', { ...ids, referenceId: 'ref', referenceDenoise: 0.35 })
    await registry.execute('storyboard_approve_panel', { ...ids, approved: true })
    const output = JSON.parse(await registry.execute('storyboard_render_panel', ids))
    expect(output.status).toBe('rendered')
    expect(mocks.reference).toHaveBeenCalledWith('ref')
    expect(mocks.upload).toHaveBeenCalledOnce()
    expect(mocks.image.mock.calls[0][0]).toMatchObject({ inputImage: expect.stringContaining('saved-ref.png'), denoise: 0.35 })
    const context = await registry.execute('storyboard_read', { projectId: ids.projectId })
    expect(context).toContain('Portrait')
    expect(context).not.toContain('data:image')
  })
})
