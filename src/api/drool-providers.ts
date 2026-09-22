import { backendCall, ensureProxyAllowsHost, isTauri, localFetch } from './backend'
import { isRecord } from '../types/json-guards'

export interface CodexModel { id: string; model: string; displayName: string }
export interface CodexConnection { accountType: string | null; planType: string | null; models: CodexModel[] }
export interface CreativeReply { text: string; images: string[]; threadId?: string }
export const HIGGSFIELD_MCP_URL = 'https://mcp.higgsfield.ai/mcp'

export function codexConnect(): Promise<CodexConnection> {
  if (!isTauri()) return Promise.reject(new Error('Codex account connection is available in the desktop app.'))
  return backendCall('drool_codex_connect')
}

export const codexLogin = () => backendCall<{ authUrl: string; loginId: string }>('drool_codex_login')
export const codexDisconnect = () => backendCall('drool_codex_disconnect')

/** Only image data is accepted from providers; never render arbitrary schemes. */
export function imageDataUrl(data: unknown, mime: unknown = 'image/png'): string | null {
  if (typeof data !== 'string' || !/^[A-Za-z0-9+/=\r\n]+$/.test(data)) return null
  if (mime !== 'image/png' && mime !== 'image/jpeg' && mime !== 'image/webp') return null
  return `data:${mime};base64,${data}`
}

export async function runCodexChat(prompt: string, options: { model?: string; threadId?: string; signal?: AbortSignal; onDelta?: (text: string) => void; storyboardTools?: boolean; storyboardProjectId?: string } = {}): Promise<CreativeReply> {
  if (!isTauri()) throw new Error('Open the desktop app to use your Codex account.')
  if (options.signal?.aborted) throw new DOMException('Cancelled', 'AbortError')
  const { listen } = await import('@tauri-apps/api/event')
  let threadId = options.threadId
  let turnId: string | undefined
  let started = false
  let text = ''
  const images: string[] = []
  const pending: unknown[] = []
  const toolsAbort = new AbortController()
  const handledToolRequests = new Set<string>()
  let done!: (value: CreativeReply) => void
  let fail!: (reason: Error) => void
  const completion = new Promise<CreativeReply>((resolve, reject) => { done = resolve; fail = reject })
  // Attach a handler immediately: a native disconnect can precede invoke's return.
  void completion.catch(() => undefined)
  const consume = (event: unknown) => {
    if (!started) { pending.push(event); return }
    if (!isRecord(event)) return
    if (event.method === 'disconnected') { fail(new Error('Codex disconnected. Reconnect to continue.')); return }
    const p = event.params
    if (!isRecord(p) || p.threadId !== threadId) return
    if (typeof p.turnId === 'string' && p.turnId !== turnId) return
    if (event.method === 'item/tool/call' && typeof event.requestId === 'string' && !handledToolRequests.has(event.requestId)) {
      handledToolRequests.add(event.requestId)
      const requestId = event.requestId
      void (async () => {
        const result = options.storyboardTools
          ? await (await import('./codex-story-tools')).executeCodexStoryTool(p.tool, p.arguments, { conversationId: threadId!, projectId: options.storyboardProjectId, signal: toolsAbort.signal })
          : { success: false, output: 'Storyboard tools are disabled for this conversation.' }
        await backendCall('drool_codex_tool_result', { requestId, threadId, success: result.success, output: result.output.length > 180_000 ? result.output.slice(0, 180_000) + '\n[Output truncated; query individual panels.]' : result.output })
      })().catch(error => { if (!toolsAbort.signal.aborted) fail(error instanceof Error ? error : new Error('Story action failed.')) })
    }
    if (event.method === 'item/agentMessage/delta' && typeof p.delta === 'string') {
      text += p.delta
      options.onDelta?.(text)
    }
    if (event.method === 'item/completed' && isRecord(p.item)) {
      if (p.item.type === 'imageGeneration') {
        const image = imageDataUrl(p.item.result)
        if (image) images.push(image)
      }
      if (p.item.type === 'agentMessage' && typeof p.item.text === 'string' && !text) text = p.item.text
    }
    if (event.method === 'turn/completed' && isRecord(p.turn) && p.turn.id === turnId) {
      if (p.turn.status === 'completed') done({ text, images, threadId })
      else fail(new Error(isRecord(p.turn.error) && typeof p.turn.error.message === 'string' ? p.turn.error.message : `Codex turn ${String(p.turn.status)}.`))
    }
  }
  const unlisten = await listen<unknown>('drool-codex-event', event => consume(event.payload))
  const interrupt = () => {
    toolsAbort.abort()
    if (threadId && turnId) void backendCall('drool_codex_interrupt', { threadId, turnId }).catch(() => undefined)
    fail(new DOMException('Cancelled', 'AbortError'))
  }
  const timer = setTimeout(() => { interrupt(); fail(new Error('Codex response timed out.')) }, 10 * 60_000)
  options.signal?.addEventListener('abort', interrupt, { once: true })
  try {
    const storyTools = options.storyboardTools ? await (await import('./codex-story-tools')).codexStoryToolDefinitions() : null
    if (options.signal?.aborted) throw new DOMException('Cancelled', 'AbortError')
    const run = await backendCall<{ threadId: string; turnId: string }>('drool_codex_send', { prompt, model: options.model ?? null, threadId: threadId ?? null, storyTools })
    threadId = run.threadId
    turnId = run.turnId
    started = true
    if (options.signal?.aborted) interrupt()
    for (const event of pending) consume(event)
    return await completion
  } finally {
    toolsAbort.abort()
    clearTimeout(timer)
    options.signal?.removeEventListener('abort', interrupt)
    unlisten()
  }
}

async function providerJson(url: string, key: string, body?: unknown, signal?: AbortSignal) {
  if (!key.trim()) throw new Error('Enter your provider credential first.')
  await ensureProxyAllowsHost(url)
  const response = await localFetch(url, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { Authorization: key, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body), signal, timeoutMs: 300_000,
  })
  if (!response.ok) throw new Error(`Provider returned HTTP ${response.status}. Check your account, balance and model settings.`)
  const value: unknown = await response.json()
  if (!isRecord(value)) throw new Error('The provider returned an invalid response.')
  if (value.error) throw new Error('The provider rejected this request. Check your model access and account balance.')
  return value
}

export async function openRouterModels(apiKey: string, images = false): Promise<Array<{ id: string; name: string }>> {
  const data = await providerJson(`https://openrouter.ai/api/v1/${images ? 'images/models' : 'models'}`, `Bearer ${apiKey}`)
  if (!Array.isArray(data.data)) throw new Error('The provider did not return a model catalog.')
  return data.data.filter(isRecord).filter(row => typeof row.id === 'string').map(row => ({ id: String(row.id), name: typeof row.name === 'string' ? row.name : String(row.id) }))
}

export async function openRouterGenerate(apiKey: string, model: string, prompt: string, images = false, signal?: AbortSignal): Promise<CreativeReply> {
  const result = await providerJson(`https://openrouter.ai/api/v1/${images ? 'images' : 'chat/completions'}`, `Bearer ${apiKey}`, images ? { model, prompt, n: 1 } : { model, messages: [{ role: 'user', content: prompt }] }, signal)
  if (images) {
    const urls = Array.isArray(result.data) ? result.data.filter(isRecord).map(row => imageDataUrl(row.b64_json, row.media_type ?? 'image/png')).filter((s): s is string => !!s) : []
    if (!urls.length) throw new Error('No supported image was returned by OpenRouter.')
    return { text: '', images: urls }
  }
  const first = Array.isArray(result.choices) ? result.choices[0] : null
  const content = isRecord(first) && isRecord(first.message) ? first.message.content : null
  if (typeof content !== 'string') throw new Error('No text response was returned by OpenRouter.')
  return { text: content, images: [] }
}

export interface HiggsfieldJob { requestId: string; statusUrl: string }

export function validateHiggsfieldStatusUrl(raw: string): string {
  const url = new URL(raw)
  if (url.origin !== 'https://api.higgsfield.ai' || url.username || url.password || url.search || url.hash || !/^\/requests\/[a-zA-Z0-9_-]+\/status$/.test(url.pathname)) throw new Error('Invalid Higgsfield status URL.')
  return url.href
}

export async function higgsfieldSubmit(key: string, endpoint: string, input: Record<string, unknown>, signal?: AbortSignal): Promise<HiggsfieldJob> {
  if (!/^[a-z0-9][a-z0-9._-]*(\/[a-z0-9][a-z0-9._-]*)+$/.test(endpoint)) throw new Error('Enter a model endpoint from the official Higgsfield API catalog, without its host.')
  const result = await providerJson(`https://api.higgsfield.ai/${endpoint}`, `Key ${key}`, input, signal)
  if (typeof result.request_id !== 'string' || typeof result.status_url !== 'string') throw new Error('Higgsfield did not return a request ID and status URL.')
  return { requestId: result.request_id, statusUrl: validateHiggsfieldStatusUrl(result.status_url) }
}

export async function higgsfieldStatus(key: string, statusUrl: string, signal?: AbortSignal): Promise<Record<string, unknown>> {
  return providerJson(validateHiggsfieldStatusUrl(statusUrl), `Key ${key}`, undefined, signal)
}
