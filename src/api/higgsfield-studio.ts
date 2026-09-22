import { callConnectedMcpTool } from './mcp/external-client'
import { useMCPStore } from '../stores/mcpStore'
import { validateToolArgs } from './agents/args-validator'
import { isRecord } from '../types/json-guards'
import type { ToolArgs } from './mcp/types'
import { HIGGSFIELD_MCP_URL } from './drool-providers'

export function connectedHiggsfield(): string | undefined {
  const state = useMCPStore.getState()
  return state.servers.find(server => server.args?.includes(HIGGSFIELD_MCP_URL) && state.connectedServers.includes(server.id))?.id
}

/** Uses only a tool actually advertised by the connected official server. */
export async function higgsTool(serverId: string, name: string, args: ToolArgs, signal?: AbortSignal): Promise<Record<string, unknown>> {
  const state = useMCPStore.getState()
  if (!state.servers.some(s => s.id === serverId && s.args?.includes(HIGGSFIELD_MCP_URL)) || !state.connectedServers.includes(serverId)) throw new Error('Connect the official Higgsfield MCP server first.')
  const definition = state.serverTools[serverId]?.find(t => t.name === name || t.name.endsWith(`_${name}`))
  if (!definition) throw new Error(`This connection does not advertise ${name}. Reconnect Higgsfield to refresh its tools.`)
  const checked = validateToolArgs(args, definition.inputSchema)
  if (!checked.valid) throw new Error(checked.errors.join('; '))
  const raw = await callConnectedMcpTool(serverId, definition.name, args, signal)
  if (!isRecord(raw)) throw new Error('Higgsfield returned an unreadable result.')
  const blocks = Array.isArray(raw.content) ? raw.content : []
  const text = blocks.filter(isRecord).map(c => typeof c.text === 'string' ? c.text : '').filter(Boolean).join('\n')
  if (raw.isError) throw new Error(text || 'Higgsfield could not complete this request.')
  let data: unknown = raw.structuredContent
  if (!isRecord(data)) { try { data = JSON.parse(text) } catch { throw new Error(text || 'Higgsfield returned no structured result.') } }
  if (!isRecord(data)) throw new Error('Higgsfield returned no structured result.')
  if (data.error) throw new Error(typeof data.error === 'string' ? data.error : JSON.stringify(data.error))
  return data
}

export interface HiggsModel { id: string; name: string; description: string; ratios: string[]; defaults: Record<string, unknown>; parameters: Array<Record<string, unknown>>; requiresMedia: boolean }
export function parseHiggsModels(data: Record<string, unknown>): HiggsModel[] {
  return (Array.isArray(data.items) ? data.items : []).filter(isRecord).filter(m => typeof m.id === 'string').map(m => {
    const parameters = (Array.isArray(m.parameters) ? m.parameters : []).filter(isRecord)
    const defaults = Object.fromEntries(parameters.filter(p => typeof p.name === 'string' && p.default !== undefined).map(p => [String(p.name), p.default]))
    return { id: String(m.id), name: String(m.name ?? m.id), description: String(m.description ?? ''), ratios: (Array.isArray(m.aspect_ratios) ? m.aspect_ratios : []).filter((r): r is string => typeof r === 'string'), defaults, parameters, requiresMedia: (Array.isArray(m.medias) ? m.medias : []).filter(isRecord).some(m => m.required === 'required' || m.required === true) }
  })
}

export interface HiggsOutput { id: string; status: string; type: 'image' | 'video'; url?: string; error?: string }
export function parseHiggsOutputs(data: Record<string, unknown>, fallback: 'image' | 'video'): HiggsOutput[] {
  const rows = Array.isArray(data.results) ? data.results : Array.isArray(data.jobs) ? data.jobs : []
  return rows.filter(isRecord).map((row, index) => {
    const result = isRecord(row.results) ? row.results : {}
    const url = row.result_url ?? result.rawUrl ?? result.url
    return { id: String(row.job_id ?? row.id ?? index), status: String(row.status ?? 'queued'), type: row.type === 'video' ? 'video' : row.type === 'image' ? 'image' : fallback, url: typeof url === 'string' && url.startsWith('https://') ? url : undefined, error: typeof row.error === 'string' ? row.error : undefined }
  })
}
