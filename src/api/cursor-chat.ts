import { backendCall, isTauri } from './backend'
import { isRecord } from '../types/json-guards'

export interface CursorChatModel { id: string; name: string }
export interface CursorChatMessage { role: 'user' | 'assistant'; content: string }
export interface CursorModelGroup { id: string; name: string; options: Array<{ id: string; effort: string }> }

/** Effort choices are exact advertised CLI variants, never invented overrides. */
export function groupCursorModels(models: CursorChatModel[]): CursorModelGroup[] {
  const groups = new Map<string, CursorModelGroup>()
  for (const model of models) {
    const match = /-(extra-high|xhigh|max|high|medium|low|minimal|none)(?=(-fast|-thinking)?$)/.exec(model.id)
    const groupId = match ? model.id.slice(0, match.index) + model.id.slice(match.index + match[0].length) : model.id
    const effort = match ? match[1].replace('extra-high', 'xhigh') : 'default'
    const name = model.name.replace(/\b(Extra High|Minimal|None|Low|Medium|High|Max)\b/g, '').replace(/\s+/g, ' ').trim()
    const group = groups.get(groupId) ?? { id: groupId, name: name || model.name, options: [] }
    if (!group.options.some(item => item.id === model.id)) group.options.push({ id: model.id, effort })
    groups.set(groupId, group)
  }
  const order = ['default','none','minimal','low','medium','high','xhigh','max']
  return [...groups.values()].map(group => ({ ...group, options: group.options.sort((a,b) => order.indexOf(a.effort)-order.indexOf(b.effort)) }))
}

export async function cursorChatModels(): Promise<CursorChatModel[]> {
  if (!isTauri()) throw new Error('Cursor chat requires Drool desktop.')
  const result: unknown = await backendCall('drool_cursor_models')
  if (!Array.isArray(result) || !result.length || result.some(item => !isRecord(item) || typeof item.id !== 'string' || typeof item.name !== 'string')) throw new Error('Cursor returned an invalid model catalog.')
  return result as CursorChatModel[]
}

export async function sendCursorChat(model: string, messages: CursorChatMessage[], persona: string, signal?: AbortSignal): Promise<string> {
  if (!isTauri()) throw new Error('Cursor chat requires Drool desktop.')
  if (signal?.aborted) throw new DOMException('Stopped','AbortError')
  const bytes = (value: string) => new TextEncoder().encode(value).length
  if (bytes(persona) > 8000) throw new Error('Your default instructions are too long. Shorten them before sending.')
  if (messages.some(message => bytes(message.content) > 16000)) throw new Error('A message is too long. Shorten it or start a new conversation.')
  if (messages.reduce((size,message) => size + bytes(message.content), bytes(persona)) > 24000) throw new Error('This conversation is too long. Start a new Cursor conversation.')
  const requestId = crypto.randomUUID()
  const stop = () => { void backendCall('drool_cursor_cancel',{requestId}).catch(() => undefined) }
  signal?.addEventListener('abort',stop,{once:true})
  try {
    const result: unknown = await backendCall('drool_cursor_chat',{requestId,model,messages,persona})
    if (signal?.aborted) throw new DOMException('Stopped','AbortError')
    if (!isRecord(result) || typeof result.text !== 'string' || !result.text.trim()) throw new Error('Cursor returned no completed reply.')
    return result.text
  } finally { signal?.removeEventListener('abort',stop) }
}
