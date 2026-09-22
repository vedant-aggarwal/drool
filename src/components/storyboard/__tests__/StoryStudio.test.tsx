// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { StoryStudio } from '../StoryStudio'
import { useStoryboardStore } from '../../../stores/storyboardStore'

vi.mock('../../../stores/modelStore', () => ({
  useModelStore: (selector: (state: unknown) => unknown) => selector({
    activeModel: 'local-test::qwen-story', models: [{ name: 'local-test::qwen-story', type: 'text' }],
  }),
}))
const createState = vi.hoisted(() => ({
    imageModelType: 'sdxl',
    imageModelList: [{ name: 'local-image::flux-story' }], imageModel: 'local-image::flux-story',
    isGenerating: false, progressText: '',
    gallery: [] as Array<{ id: string; type: string; filename: string; dataUrl: string }>, error: null,
    setSource: vi.fn(), setMask: vi.fn(), setI2iImage: vi.fn(), setDenoise: vi.fn(), setBackend: vi.fn(), setIntent: vi.fn(), setPrompt: vi.fn(), clearLoras: vi.fn(), toggleLora: vi.fn(), setLoraStrengthFor: vi.fn(),
}))
vi.mock('../../../stores/createStore', () => ({
  useCreateStore: Object.assign((selector: (state: unknown) => unknown) => selector(createState), { getState: () => createState }),
}))
const engine = vi.hoisted(() => ({ generate: vi.fn(), cancel: vi.fn(), fetchModels: vi.fn(), checkConnection: vi.fn(), modelsLoaded: true, modelLoadError: null as string | null }))
vi.mock('../../../hooks/useCreate', () => ({ useCreate: () => engine }))
vi.mock('../../../api/backend', () => ({ isMacOS: () => false }))
vi.mock('../../../api/providers', () => ({ getProviderForModel: vi.fn() }))
vi.mock('../../../api/comfyui', () => ({ getLoraModels: async () => [], classifyModel: () => createState.imageModelType, getImageUrl: vi.fn(), uploadImage: refs.upload }))
const refs = vi.hoisted(() => ({ save: vi.fn(), load: vi.fn(), upload: vi.fn() }))
vi.mock('../../../lib/character-references', async importOriginal => ({ ...await importOriginal<typeof import('../../../lib/character-references')>(), saveCharacterReference: refs.save, loadCharacterReference: refs.load }))
vi.mock('../../../stores/workflowStore', () => ({ useWorkflowStore: { getState: () => ({ getWorkflowForModel: () => null }) } }))
vi.mock('../../../api/drool-providers', () => ({ runCodexChat: vi.fn() }))

beforeEach(() => {
  vi.clearAllMocks()
  engine.generate.mockReset()
  createState.gallery = []
  createState.imageModelType = 'sdxl'
  refs.load.mockResolvedValue(new Blob(['original'], { type: 'image/png' }))
  refs.upload.mockResolvedValue('character-reference.png')
  URL.createObjectURL = vi.fn(() => 'blob:reference')
  URL.revokeObjectURL = vi.fn()
  engine.modelLoadError = null
  localStorage.clear()
  useStoryboardStore.setState({ projects: [], activeId: null, characterLibrary: [] })
})
afterEach(() => { cleanup(); localStorage.clear() })

async function createPanel() {
  await act(async () => { render(<StoryStudio />) })
  fireEvent.click(screen.getByRole('button', { name: 'Create your first story' }))
  fireEvent.click(screen.getByRole('button', { name: 'Add panel' }))
  fireEvent.change(screen.getByLabelText('Panel 1 image prompt'), { target: { value: 'A traveler enters a moonlit station.' } })
}

describe('Story studio editing', () => {
  it.each(['prompt', 'style', 'lora', 'approval'])('keeps an in-flight image in the gallery when %s changes', async (change) => {
    let finish!: () => void
    engine.generate.mockImplementation(() => new Promise<void>(resolve => { finish = resolve }))
    await createPanel()
    if (change === 'lora') await act(async () => {
      const store = useStoryboardStore.getState()
      store.updateProject(store.projects[0].id, { characters: [{ id: 'c1', name: 'Traveler', appearance: 'Blue coat', personality: '', lora: '' }] })
    })
    fireEvent.click(screen.getByRole('button', { name: 'Approve panel' }))
    fireEvent.click(screen.getByRole('button', { name: 'Render locally' }))
    expect(engine.generate).toHaveBeenCalledTimes(1)
    const project = useStoryboardStore.getState().projects[0]
    await act(async () => {
      const store = useStoryboardStore.getState()
      if (change === 'prompt') store.updatePanel(project.id, project.panels[0].id, { prompt: 'A different station.' })
      if (change === 'style') store.updateProject(project.id, { style: 'Anime' })
      if (change === 'lora') store.updateProject(project.id, { characters: project.characters.map(c => ({ ...c, lora: 'new-character.safetensors' })) })
      // Reapprove edited instructions to prove the captured render revision is checked too.
      store.updatePanel(project.id, project.panels[0].id, { approved: change !== 'approval' })
      createState.gallery.push({ id: 'rendered-image', type: 'image', filename: 'panel.png', dataUrl: 'data:image/png;base64,dGVzdA==' })
      finish()
    })
    expect(useStoryboardStore.getState().projects[0].panels[0].image).toBeUndefined()
    expect(createState.gallery).toHaveLength(1)
    expect(screen.getByRole('status').textContent).toContain('saved to the gallery only')
  })

  it('attaches the completed image when only the separate caption changes', async () => {
    let finish!: () => void
    engine.generate.mockImplementation(() => new Promise<void>(resolve => { finish = resolve }))
    await createPanel()
    fireEvent.click(screen.getByRole('button', { name: 'Approve panel' }))
    fireEvent.click(screen.getByRole('button', { name: 'Render locally' }))
    fireEvent.change(screen.getByLabelText('Panel 1 caption'), { target: { value: 'A new caption.' } })
    await act(async () => {
      createState.gallery.push({ id: 'rendered-image', type: 'image', filename: 'panel.png', dataUrl: 'data:image/png;base64,dGVzdA==' })
      finish()
    })
    expect(useStoryboardStore.getState().projects[0].panels[0].image?.id).toBe('rendered-image')
    expect(screen.getByRole('img', { name: 'Panel 1' })).toBeTruthy()
    expect(screen.queryByText(/saved to the gallery only/)).toBeNull()
  })

  it('loads the image engine on entry and offers recovery after a failed catalog request', async () => {
    engine.modelLoadError = 'Local engine is offline'
    await createPanel()
    expect(engine.checkConnection).toHaveBeenCalledTimes(1)
    expect(engine.fetchModels).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('status').textContent).toContain('Local engine is offline')
    fireEvent.click(screen.getByRole('button', { name: 'Refresh image models' }))
    expect(engine.fetchModels).toHaveBeenCalledTimes(2)
  })
  it('restores the edited project and panel from local persistence after remount', async () => {
    await createPanel()
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'The last train' } })
    fireEvent.change(screen.getByLabelText('Story brief'), { target: { value: 'A traveler must choose whether to board.' } })
    fireEvent.change(screen.getByLabelText('Panel 1 title'), { target: { value: 'Arrival' } })
    fireEvent.change(screen.getByLabelText('Panel 1 caption'), { target: { value: 'One train remained.' } })
    fireEvent.click(screen.getByRole('button', { name: 'Approve panel' }))

    const saved = localStorage.getItem('drool-storyboards-v1')
    expect(saved).toBeTruthy()
    cleanup()
    useStoryboardStore.setState({ projects: [], activeId: null, characterLibrary: [] })
    localStorage.setItem('drool-storyboards-v1', saved!)
    await act(async () => { await useStoryboardStore.persist.rehydrate() })
    await act(async () => { render(<StoryStudio />) })

    expect((screen.getByLabelText('Title') as HTMLInputElement).value).toBe('The last train')
    expect((screen.getByLabelText('Story brief') as HTMLTextAreaElement).value).toBe('A traveler must choose whether to board.')
    expect((screen.getByLabelText('Panel 1 title') as HTMLInputElement).value).toBe('Arrival')
    expect((screen.getByLabelText('Panel 1 image prompt') as HTMLTextAreaElement).value).toBe('A traveler enters a moonlit station.')
    expect((screen.getByLabelText('Panel 1 caption') as HTMLTextAreaElement).value).toBe('One train remained.')
    expect(screen.getByRole('button', { name: 'Reviewed' })).toBeTruthy()
    expect((screen.getByRole('button', { name: 'Render locally' }) as HTMLButtonElement).disabled).toBe(false)
  })

  it('requires review again after visual prompt changes and persists that invalidation', async () => {
    await createPanel()
    fireEvent.click(screen.getByRole('button', { name: 'Approve panel' }))
    expect((screen.getByRole('button', { name: 'Render locally' }) as HTMLButtonElement).disabled).toBe(false)
    fireEvent.change(screen.getByLabelText('Panel 1 image prompt'), { target: { value: 'The station is now underwater.' } })
    expect(screen.getByRole('button', { name: 'Approve panel' })).toBeTruthy()
    expect((screen.getByRole('button', { name: 'Render locally' }) as HTMLButtonElement).disabled).toBe(true)
    const saved = JSON.parse(localStorage.getItem('drool-storyboards-v1')!)
    expect(saved.state.projects[0].panels[0]).toMatchObject({ approved: false, prompt: 'The station is now underwater.' })
  })

  it('keeps captions separate from visual approval and hides provider prefixes in model labels', async () => {
    await createPanel()
    fireEvent.click(screen.getByRole('button', { name: 'Approve panel' }))
    fireEvent.change(screen.getByLabelText('Panel 1 caption'), { target: { value: 'A new caption.' } })
    expect(screen.getByRole('button', { name: 'Reviewed' })).toBeTruthy()
    expect(screen.getByRole('option', { name: 'qwen-story' }).getAttribute('value')).toBe('local-test::qwen-story')
    expect(screen.getByRole('option', { name: 'flux-story' }).getAttribute('value')).toBe('local-image::flux-story')
    expect(screen.queryByText('local-test::qwen-story')).toBeNull()
  })
})


describe('Character references', () => {
  const reference = { id: 'ref-1', name: 'Blue coat', mime: 'image/png', size: 8 }
  async function addCharacter() {
    await createPanel()
    const store = useStoryboardStore.getState()
    const p = store.projects[0]
    await act(async () => store.updateProject(p.id, { characters: [{ id: 'char-1', name: 'Ari', appearance: 'Blue coat', personality: '', lora: '', references: [reference] }] }))
  }
  it('saves reference metadata to a reusable library, survives rehydration, and adds it to another story', async () => {
    await addCharacter()
    fireEvent.click(screen.getByRole('button', { name: 'Save to library' }))
    const saved = localStorage.getItem('drool-storyboards-v1')!
    expect(saved).toContain('Blue coat')
    expect(saved).not.toContain('blob:reference')
    expect(saved).not.toContain('data:image')
    cleanup()
    useStoryboardStore.setState({ projects: [], activeId: null, characterLibrary: [] })
    localStorage.setItem('drool-storyboards-v1', saved)
    await act(async () => useStoryboardStore.persist.rehydrate())
    await act(async () => { render(<StoryStudio/>) })
    fireEvent.click(screen.getByRole('button', { name: 'New story' }))
    fireEvent.change(screen.getByLabelText('Saved character library'), { target: { value: 'char-1' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add to story' }))
    const second = useStoryboardStore.getState().projects[1]
    expect(second.characters[0].references).toEqual([reference])
    expect(second.characters[0].id).not.toBe('char-1')
    fireEvent.click(screen.getByRole('button', { name: 'Remove reference Blue coat' }))
    expect(useStoryboardStore.getState().projects[1].characters[0].references).toEqual([])
    expect(useStoryboardStore.getState().projects[0].characters[0].references).toEqual([reference])
    expect(useStoryboardStore.getState().characterLibrary[0].references).toEqual([reference])
  })
  it('loads the actual saved original and submits it to the local image-to-image path only after review', async () => {
    await addCharacter()
    fireEvent.change(screen.getByLabelText('Panel 1 character reference'), { target: { value: 'ref-1' } })
    fireEvent.click(screen.getByRole('button', { name: 'Approve panel' }))
    fireEvent.click(screen.getByRole('button', { name: 'Render locally' }))
    await waitFor(() => expect(engine.generate).toHaveBeenCalledOnce())
    expect(refs.load).toHaveBeenCalledWith('ref-1')
    expect(refs.upload).toHaveBeenCalledOnce()
    expect(refs.upload.mock.calls[0][0]).toBeInstanceOf(File)
    expect(createState.setBackend).toHaveBeenCalledWith('local')
    expect(createState.setIntent).toHaveBeenLastCalledWith('edit')
    expect(createState.setI2iImage).toHaveBeenCalledWith('character-reference.png')
    expect(createState.setDenoise).toHaveBeenCalledWith(0.45)
    expect(createState.setMask).toHaveBeenCalledWith(null)
    fireEvent.change(screen.getByLabelText('Panel 1 reference change strength'), { target: { value: '0.65' } })
    expect(useStoryboardStore.getState().projects[0].panels[0].approved).toBe(false)
  })
  it('blocks unsupported models instead of silently ignoring a selected reference', async () => {
    createState.imageModelType = 'flux'
    await addCharacter()
    fireEvent.change(screen.getByLabelText('Panel 1 character reference'), { target: { value: 'ref-1' } })
    fireEvent.click(screen.getByRole('button', { name: 'Approve panel' }))
    expect((screen.getByRole('button', { name: 'Render locally' }) as HTMLButtonElement).disabled).toBe(true)
    expect(screen.getByText(/This model does not support character references here/)).toBeTruthy()
    expect(refs.upload).not.toHaveBeenCalled()
  })
  it('reports a failed original write without adding an unusable reference', async () => {
    await addCharacter()
    refs.save.mockRejectedValueOnce(new Error('Could not save this reference. Check free disk space.'))
    fireEvent.change(screen.getByLabelText('Add reference images for Ari'), { target: { files: [new File(['bytes'], 'photo.png', { type: 'image/png' })] } })
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('Check free disk space'))
    expect(useStoryboardStore.getState().projects[0].characters[0].references).toHaveLength(1)
  })
})
