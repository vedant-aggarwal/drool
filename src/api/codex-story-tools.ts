import { usePermissionStore } from '../stores/permissionStore'
import { useCodexStoryApprovalStore } from '../stores/codexStoryApprovalStore'
import { useStoryboardStore } from '../stores/storyboardStore'
import { STORYBOARD_TOOL_NAMES } from './mcp/storyboard-tools'
import { isRecord } from '../types/json-guards'

export async function codexStoryToolDefinitions() {
  const { toolRegistry } = await import('./mcp')
  return toolRegistry.getAll().filter(t => STORYBOARD_TOOL_NAMES.includes(t.name)).map(t => ({ type: 'function', name: t.name, description: t.description, inputSchema: t.inputSchema }))
}

/** Only the fixed built-in story allowlist is reachable from this connection. */
export async function executeCodexStoryTool(tool: unknown, rawArgs: unknown, options: { signal?: AbortSignal; projectId?: string; conversationId: string }): Promise<{ success: boolean; output: string }> {
  try {
    if (typeof tool !== 'string' || !STORYBOARD_TOOL_NAMES.includes(tool)) throw new Error('This tool is not available through the Drool story connection.')
    if (!isRecord(rawArgs)) throw new Error('Story tool arguments must be an object.')
    if (options.signal?.aborted) throw new Error('Cancelled.')
    if (options.projectId && tool === 'storyboard_create') throw new Error('This conversation is scoped to its existing story project.')
    if (options.projectId && tool !== 'storyboard_list' && rawArgs.projectId !== options.projectId) throw new Error('This conversation can only access its selected story project.')
    const permissions = usePermissionStore.getState()
    const workflow = permissions.getEffectivePermissionForTool(tool, 'workflow', options.conversationId)
    const image = tool === 'storyboard_render_panel' ? permissions.getEffectivePermissionForTool('image_generate', 'image', options.conversationId) : 'auto'
    if (workflow === 'blocked' || image === 'blocked') throw new Error('This story action is blocked in permissions.')
    if (workflow === 'confirm' || image === 'confirm') {
      const approved = await useCodexStoryApprovalStore.getState().ask(tool, rawArgs, options.signal)
      if (!approved || options.signal?.aborted) throw new Error('The user declined or cancelled this action.')
    }
    if (options.signal?.aborted) throw new Error('Cancelled.')
    const currentPermissions = usePermissionStore.getState()
    if (currentPermissions.getEffectivePermissionForTool(tool, 'workflow', options.conversationId) === 'blocked' || (tool === 'storyboard_render_panel' && currentPermissions.getEffectivePermissionForTool('image_generate', 'image', options.conversationId) === 'blocked')) throw new Error('This action was blocked while awaiting approval.')
    if (options.projectId && tool === 'storyboard_list') {
      const p = useStoryboardStore.getState().projects.find(row => row.id === options.projectId)
      return { success: true, output: JSON.stringify(p ? [{ id: p.id, title: p.title, panelCount: p.panels.length, characterCount: p.characters.length }] : []) }
    }
    const { toolRegistry } = await import('./mcp')
    const output = await toolRegistry.execute(tool, rawArgs, 0, { token: options.conversationId, chatId: null, conversationId: options.conversationId, workspace: null, artifactMode: false, readOnlyShellTurn: false, mode: null, artifacts: [], abortSignal: options.signal }, options.signal)
    return { success: !output.startsWith('Error:'), output }
  } catch (error) { return { success: false, output: error instanceof Error ? error.message : 'Story action failed.' } }
}
