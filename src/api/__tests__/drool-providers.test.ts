import { beforeEach, describe, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({
  backendCall: vi.fn(), localFetch: vi.fn(), ensureProxyAllowsHost: vi.fn(),
  listener: undefined as undefined | ((event: { payload: unknown }) => void), unlisten: vi.fn(),
  storyTool: vi.fn(),
}))
vi.mock('../backend', () => ({ ...mocks, isTauri: () => true }))
vi.mock('@tauri-apps/api/event', () => ({ listen: vi.fn(async (_name: string, listener: (event: { payload: unknown }) => void) => { mocks.listener = listener; return mocks.unlisten }) }))
vi.mock('../codex-story-tools', () => ({ codexStoryToolDefinitions: async () => [], executeCodexStoryTool: mocks.storyTool }))
import { higgsfieldStatus, higgsfieldSubmit, imageDataUrl, openRouterGenerate, runCodexChat, validateHiggsfieldStatusUrl } from '../drool-providers'

beforeEach(() => { vi.clearAllMocks(); mocks.listener = undefined })
const emit = (method: string, params: unknown) => mocks.listener?.({ payload: { method, params } })

describe('Drool provider boundaries', () => {
  it('never sends a Higgsfield credential to a supplied foreign status URL', async () => {
    await expect(higgsfieldStatus('test:secret', 'https://attacker.example/requests/id/status')).rejects.toThrow('Invalid Higgsfield')
    expect(mocks.localFetch).not.toHaveBeenCalled()
    expect(() => validateHiggsfieldStatusUrl('https://api.higgsfield.ai@attacker.example/requests/id/status')).toThrow()
    expect(() => validateHiggsfieldStatusUrl('https://api.higgsfield.ai/requests/id/status?redirect=elsewhere')).toThrow()
  })
  it('preserves the provider-issued request and status URL', async () => {
    mocks.localFetch.mockResolvedValue(new Response(JSON.stringify({ request_id: 'job-1', status_url: 'https://api.higgsfield.ai/requests/job-1/status' })))
    await expect(higgsfieldSubmit('test:secret', 'bytedance/seedance-2.0/text-to-video', { prompt: 'A mountain' })).resolves.toEqual({ requestId: 'job-1', statusUrl: 'https://api.higgsfield.ai/requests/job-1/status' })
    expect(mocks.localFetch).toHaveBeenCalledTimes(1) // no automatic resubmission of billed work
  })
  it('rejects URL injection in model endpoints before network traffic', async () => {
    await expect(higgsfieldSubmit('test:secret', '//other.example/model', {})).rejects.toThrow('model endpoint')
    expect(mocks.localFetch).not.toHaveBeenCalled()
  })
  it('accepts raster image bytes and refuses HTML or SVG provider output', () => {
    expect(imageDataUrl('aGVsbG8=', 'image/png')).toBe('data:image/png;base64,aGVsbG8=')
    expect(imageDataUrl('aGVsbG8=', 'image/svg+xml')).toBeNull()
    expect(imageDataUrl('<script>')).toBeNull()
  })
  it('uses the dedicated OpenRouter image API and rejects empty results', async () => {
    mocks.localFetch.mockResolvedValue(new Response(JSON.stringify({ data: [] })))
    await expect(openRouterGenerate('test', 'model', 'prompt', true)).rejects.toThrow('No supported image')
    expect(mocks.localFetch.mock.calls[0][0]).toBe('https://openrouter.ai/api/v1/images')
  })
  it('does not echo provider error bodies which can contain credentials', async () => {
    mocks.localFetch.mockResolvedValue(new Response('secret echoed by server', { status: 401 }))
    await expect(openRouterGenerate('secret', 'model', 'prompt')).rejects.toThrow('HTTP 401')
    await expect(openRouterGenerate('secret', 'model', 'prompt')).rejects.not.toThrow('secret')
  })
})

describe('Codex app-server streaming', () => {
  it('handles events before the start response without mixing another conversation', async () => {
    mocks.backendCall.mockImplementation(async () => {
      emit('item/agentMessage/delta', { threadId: 'other', turnId: 'turn', delta: 'PRIVATE OTHER THREAD' })
      emit('item/agentMessage/delta', { threadId: 'thread', turnId: 'turn', delta: 'A new story.' })
      emit('item/completed', { threadId: 'thread', turnId: 'turn', item: { type: 'imageGeneration', result: 'aGVsbG8=' } })
      emit('turn/completed', { threadId: 'thread', turn: { id: 'turn', status: 'completed' } })
      return { threadId: 'thread', turnId: 'turn' }
    })
    await expect(runCodexChat('Write a story', {model:'creative',effort:'high',instructions:'Be concise'})).resolves.toEqual({ threadId: 'thread', text: 'A new story.', images: ['data:image/png;base64,aGVsbG8='] })
    expect(mocks.backendCall).toHaveBeenCalledWith('drool_codex_send', expect.objectContaining({model:'creative',effort:'high',instructions:'Be concise'}))
    expect(mocks.unlisten).toHaveBeenCalledOnce()
  })
  it('reports failed turns rather than treating the command response as completion', async () => {
    mocks.backendCall.mockImplementation(async () => {
      emit('turn/completed', { threadId: 'thread', turn: { id: 'turn', status: 'failed', error: { message: 'Usage limit reached' } } })
      return { threadId: 'thread', turnId: 'turn' }
    })
    await expect(runCodexChat('Write a story')).rejects.toThrow('Usage limit reached')
    expect(mocks.unlisten).toHaveBeenCalledOnce()
  })
  it('does not submit already cancelled prompts', async () => {
    const controller = new AbortController(); controller.abort()
    await expect(runCodexChat('Write', { signal: controller.signal })).rejects.toThrow('Cancelled')
    expect(mocks.backendCall).not.toHaveBeenCalled()
  })
  it('routes a dynamic tool once, returns its outcome to the server, and waits for completion', async () => {
    mocks.storyTool.mockResolvedValue({ success: true, output: '{"title":"Story"}' })
    mocks.backendCall.mockImplementation(async (command: string) => {
      if (command === 'drool_codex_send') {
        const request = { payload: { method: 'item/tool/call', requestId: 'request', params: { threadId: 'thread', turnId: 'turn', tool: 'storyboard_read', arguments: { projectId: 'project' } } } }
        mocks.listener?.(request); mocks.listener?.(request)
        return { threadId: 'thread', turnId: 'turn' }
      }
      if (command === 'drool_codex_tool_result') {
        emit('item/agentMessage/delta', { threadId: 'thread', turnId: 'turn', delta: 'Read your story.' })
        emit('turn/completed', { threadId: 'thread', turn: { id: 'turn', status: 'completed' } })
      }
      return {}
    })
    const reply = await runCodexChat('Read', { storyboardTools: true, storyboardProjectId: 'project' })
    expect(reply.text).toBe('Read your story.')
    expect(mocks.storyTool).toHaveBeenCalledOnce()
    expect(mocks.backendCall).toHaveBeenCalledWith('drool_codex_tool_result', expect.objectContaining({ requestId: 'request', threadId: 'thread', success: true }))
  })
})
