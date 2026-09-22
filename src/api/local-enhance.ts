import { abandonPrompt, checkComfyConnection, extractComfyOutputFiles, getHistory, submitWorkflow } from './comfyui'
import { getAllNodeInfo, type NodeMetadata } from './comfyui-nodes'
import { readComboOptions } from './comfyui-enum'
import { useCreateStore } from '../stores/createStore'
import type { ComfyApiGraph } from '../types/comfy-graph'

export function installedEnhanceModels(nodes: Record<string, NodeMetadata>): string[] {
  if (!nodes.ImageUpscaleWithModel) return []
  const specification = nodes.UpscaleModelLoader?.input?.required?.model_name
  return [...new Set((readComboOptions(specification) ?? []).filter(name => name.length > 0))]
}

export async function loadEnhanceModels(): Promise<string[]> {
  if (!await checkComfyConnection()) throw new Error('ComfyUI is offline. Start it in Settings → AI Backends, then refresh.')
  return installedEnhanceModels(await getAllNodeInfo(true))
}

export function resolveEnhanceModel(selection: string, installed: string[]): string | undefined {
  if (selection === 'bicubic') return undefined
  if (selection === 'auto') return installed[0]
  if (!installed.includes(selection)) throw new Error(`The selected upscaler “${selection}” is no longer available. Refresh Enhance models and choose an installed model, Auto, or Bicubic resize.`)
  return selection
}

export function enhancementGraph(filename: string, width: number, height: number, model?: string): ComfyApiGraph {
  if (!filename || !Number.isFinite(width) || !Number.isFinite(height) || width < 1 || height < 1 || Math.max(width, height) > 8192) throw new Error('Choose an image and a resolution up to 8K.')
  const graph: ComfyApiGraph = { '1': { class_type: 'LoadImage', inputs: { image: filename } } }
  let image: [string, number] = ['1', 0]
  if (model) {
    graph['2'] = { class_type: 'UpscaleModelLoader', inputs: { model_name: model } }
    graph['3'] = { class_type: 'ImageUpscaleWithModel', inputs: { upscale_model: ['2', 0], image } }
    image = ['3', 0]
  }
  graph['4'] = { class_type: 'ImageScale', inputs: { image, upscale_method: 'bicubic', width, height, crop: 'disabled' } }
  graph['5'] = { class_type: 'SaveImage', inputs: { images: ['4', 0], filename_prefix: 'Drool/enhanced' } }
  return graph
}

export async function enhanceLocally(signal: AbortSignal): Promise<void> {
  const state = useCreateStore.getState()
  if (state.isGenerating) return
  if (!state.source) { state.setError('Add the image you want to enhance.'); return }
  const source = state.source
  state.setError(null)
  state.setIsGenerating(true)
  state.setProgress(0, 'Checking local enhancement…')
  let promptId: string | null = null
  let completed = false
  try {
    if (!await checkComfyConnection()) throw new Error('Start ComfyUI in Settings → AI Backends to enhance locally.')
    const nodes = await getAllNodeInfo(true)
    const model = resolveEnhanceModel(state.enhanceModel, installedEnhanceModels(nodes))
    const longest = { '2k': 2048, '4k': 4096, '8k': 8192 }[state.targetResolution]
    const ratio = longest / Math.max(source.width, source.height)
    const width = Math.max(1, Math.round(source.width * ratio))
    const height = Math.max(1, Math.round(source.height * ratio))
    const workflow = enhancementGraph(source.filename, width, height, model)
    for (const node of Object.values(workflow)) if (!nodes[node.class_type]) throw new Error(`ComfyUI is missing ${node.class_type}. Update its core nodes first.`)
    if (signal.aborted) return
    state.setProgress(5, model ? `Enhancing locally with ${model}` : 'Resizing locally with bicubic (no AI detail enhancement)')
    promptId = await submitWorkflow(workflow)
    state.setCurrentPromptId(promptId)
    const deadline = Date.now() + 20 * 60_000
    while (!signal.aborted && Date.now() < deadline) {
      const history = await getHistory(promptId)
      if (history?.status?.status_str === 'error') throw new Error(history.status.messages?.find(([kind]) => kind === 'execution_error')?.[1]?.exception_message || 'Local enhancement failed. Check ComfyUI logs.')
      if (history?.status?.completed || history?.status?.status_str === 'success') {
        const files = Object.values(history.outputs ?? {}).flatMap(extractComfyOutputFiles)
        if (!files.length) throw new Error('Enhancement completed without an output image.')
        for (const file of files) state.addToGallery({
          id: crypto.randomUUID(), type: 'image', filename: file.filename, subfolder: file.subfolder ?? '', comfyType: file.type,
          prompt: model ? `Local enhancement: ${model}` : 'Local bicubic resize', negativePrompt: '', model: model ?? 'Bicubic resize', modelType: 'unknown',
          seed: 0, steps: 0, cfgScale: 0, sampler: '', scheduler: '', width, height, batchSize: 1, createdAt: Date.now(), intent: 'upscale',
          comparisonSource: { filename: source.filename, width: source.width, height: source.height },
        })
        completed = true
        return
      }
      await new Promise<void>((resolve) => { const timer = setTimeout(done, 1000); function done() { clearTimeout(timer); signal.removeEventListener('abort', done); resolve() } signal.addEventListener('abort', done, { once: true }) })
    }
    if (!signal.aborted) throw new Error('Enhancement timed out. The queued job has been cancelled.')
  } catch (error) {
    if (!signal.aborted) state.setError(error instanceof Error ? error.message : String(error))
  } finally {
    if (promptId && !completed) await abandonPrompt(promptId).catch(() => {})
    state.setIsGenerating(false)
    state.setCurrentPromptId(null)
    state.setProgress(0)
  }
}
