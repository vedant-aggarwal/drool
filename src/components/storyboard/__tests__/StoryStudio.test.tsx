// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { StoryStudio } from '../StoryStudio'
import { useStoryboardStore } from '../../../stores/storyboardStore'

vi.mock('../../../stores/modelStore', () => ({
  useModelStore: (selector: (state: unknown) => unknown) => selector({
    activeModel: 'local-test::qwen-story', models: [{ name: 'local-test::qwen-story', type: 'text' }],
  }),
}))
const createState = vi.hoisted(() => ({
    imageModelList: [{ name: 'local-image::flux-story' }], imageModel: 'local-image::flux-story',
    isGenerating: false, progressText: '',
    gallery: [] as Array<{ id: string; type: string; filename: string; dataUrl: string }>, error: null,
    setBackend: vi.fn(), setIntent: vi.fn(), setPrompt: vi.fn(), clearLoras: vi.fn(), toggleLora: vi.fn(), setLoraStrengthFor: vi.fn(),
}))
vi.mock('../../../stores/createStore', () => ({
  useCreateStore: Object.assign((selector: (state: unknown) => unknown) => selector(createState), { getState: () => createState }),
}))
const engine = vi.hoisted(() => ({ generate: vi.fn(), cancel: vi.fn(), fetchModels: vi.fn(), checkConnection: vi.fn(), modelsLoaded: true, modelLoadError: null as string | null }))
vi.mock('../../../hooks/useCreate', () => ({ useCreate: () => engine }))
vi.mock('../../../api/backend', () => ({ isMacOS: () => false }))
vi.mock('../../../api/providers', () => ({ getProviderForModel: vi.fn() }))
vi.mock('../../../api/comfyui', () => ({ getLoraModels: async () => [], classifyModel: vi.fn(), getImageUrl: vi.fn() }))
vi.mock('../../../api/drool-providers', () => ({ runCodexChat: vi.fn() }))

beforeEach(() => {
  vi.clearAllMocks()
  engine.generate.mockReset()
  createState.gallery = []
  engine.modelLoadError = null
  localStorage.clear()
  useStoryboardStore.setState({ projects: [], activeId: null })
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
    useStoryboardStore.setState({ projects: [], activeId: null })
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
