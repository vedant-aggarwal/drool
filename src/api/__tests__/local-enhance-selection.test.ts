import { beforeEach, describe, expect, it, vi } from 'vitest'
vi.mock('../comfyui', () => ({
  checkComfyConnection: vi.fn(async () => true),
  submitWorkflow: vi.fn(async () => 'owned-job'),
  getHistory: vi.fn(async () => ({ status: { completed: true }, outputs: { '5': { images: [{ filename: 'result.png', type: 'output' }] } } })),
  extractComfyOutputFiles: (output: { images?: unknown[] }) => output.images ?? [],
  abandonPrompt: vi.fn(),
}))
vi.mock('../comfyui-nodes', () => ({ getAllNodeInfo: vi.fn() }))
import { getAllNodeInfo, type NodeMetadata } from '../comfyui-nodes'
import { getHistory, submitWorkflow } from '../comfyui'
import { enhanceLocally, installedEnhanceModels, resolveEnhanceModel } from '../local-enhance'
import { useCreateStore } from '../../stores/createStore'

const nodes: Record<string, NodeMetadata> = Object.fromEntries(['LoadImage', 'ImageScale', 'SaveImage', 'ImageUpscaleWithModel'].map(name => [name, { input: { required: {} }, output: [] }]))
nodes.UpscaleModelLoader = { input: { required: { model_name: [['first.pth', 'chosen.pth'], {}] } }, output: [] }
beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(getAllNodeInfo).mockResolvedValue(nodes)
  useCreateStore.setState({ source: { filename: 'original.png', url: 'blob:private-preview', width: 96, height: 64 }, enhanceModel: 'auto', targetResolution: '2k', isGenerating: false, error: null, gallery: [] })
})
describe('Enhance model selection and source provenance', () => {
  it('lists only the installed loader enum when the execution node exists', () => {
    expect(installedEnhanceModels(nodes)).toEqual(['first.pth', 'chosen.pth'])
    expect(installedEnhanceModels({ UpscaleModelLoader: nodes.UpscaleModelLoader! })).toEqual([])
    expect(resolveEnhanceModel('auto', [])).toBeUndefined()
    expect(resolveEnhanceModel('bicubic', ['first.pth'])).toBeUndefined()
  })
  it('reads the current ComfyUI COMBO schema as well as legacy enums', () => {
    expect(installedEnhanceModels({ ...nodes, UpscaleModelLoader: { input: { required: { model_name: ['COMBO', { options: ['4x-UltraSharp.safetensors', '4x-UltraSharpV2.safetensors'] }] } }, output: [] } })).toEqual(['4x-UltraSharp.safetensors', '4x-UltraSharpV2.safetensors'])
  })
  it('submits the explicit second model and stores its original even if the upload changes during execution', async () => {
    useCreateStore.setState({ enhanceModel: 'chosen.pth' })
    vi.mocked(getHistory).mockImplementationOnce(async () => {
      useCreateStore.getState().setSource({ filename: 'different.png', url: 'blob:new', width: 300, height: 400 })
      return { status: { completed: true, status_str: 'success', messages: [] }, outputs: { '5': { images: [{ filename: 'result.png', type: 'output', subfolder: '' }] } } }
    })
    await enhanceLocally(new AbortController().signal)
    const graph = vi.mocked(submitWorkflow).mock.calls[0]![0]
    expect(graph['2']!.inputs!.model_name).toBe('chosen.pth')
    const result = useCreateStore.getState().gallery[0]!
    expect(result.model).toBe('chosen.pth')
    expect(result.comparisonSource).toEqual({ filename: 'original.png', width: 96, height: 64 })
    expect(JSON.stringify(result.comparisonSource)).not.toContain('blob:')
    expect(useCreateStore.getState().source?.filename).toBe('different.png')
  })
  it('never silently substitutes a removed explicit model', async () => {
    useCreateStore.setState({ enhanceModel: 'removed.pth' })
    await enhanceLocally(new AbortController().signal)
    expect(submitWorkflow).not.toHaveBeenCalled()
    expect(useCreateStore.getState().error).toContain('no longer available')
    expect(useCreateStore.getState().isGenerating).toBe(false)
  })
  it('honors an explicit non-AI resize even with installed AI models', async () => {
    useCreateStore.setState({ enhanceModel: 'bicubic' })
    await enhanceLocally(new AbortController().signal)
    const graph = vi.mocked(submitWorkflow).mock.calls[0]![0]
    expect(Object.values(graph).map(node => node.class_type)).not.toContain('UpscaleModelLoader')
    expect(useCreateStore.getState().gallery[0]!.model).toBe('Bicubic resize')
  })
})
