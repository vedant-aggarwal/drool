import { beforeEach, describe, expect, it, vi } from 'vitest'
import { executeCodexStoryTool } from '../codex-story-tools'
import { useCodexStoryApprovalStore } from '../../stores/codexStoryApprovalStore'
import { usePermissionStore } from '../../stores/permissionStore'
const mocks = vi.hoisted(() => ({ execute: vi.fn(), getAll: vi.fn() }))
vi.mock('../mcp', () => ({ toolRegistry: mocks }))

beforeEach(() => {
  vi.clearAllMocks()
  usePermissionStore.getState().resetToDefaults()
  for (const request of useCodexStoryApprovalStore.getState().requests) useCodexStoryApprovalStore.getState().answer(request.id, false)
  mocks.execute.mockResolvedValue('{"id":"new-story"}')
})
const options = { conversationId: 'codex-thread' }

describe('Codex dynamic story permissions', () => {
  it('does not dispatch unknown tools or another project even when permissions are auto', async () => {
    usePermissionStore.getState().setGlobalPermission('workflow', 'auto')
    expect((await executeCodexStoryTool('shell_execute', { command: 'arbitrary' }, options)).success).toBe(false)
    expect((await executeCodexStoryTool('storyboard_read', { projectId: 'other' }, { ...options, projectId: 'current' })).success).toBe(false)
    expect(mocks.execute).not.toHaveBeenCalled()
  })
  it('waits for a visible approval and only executes after Allow once', async () => {
    const pending = executeCodexStoryTool('storyboard_create', { title: 'New story' }, options)
    expect(mocks.execute).not.toHaveBeenCalled()
    const request = useCodexStoryApprovalStore.getState().requests[0]
    expect(request.args.title).toBe('New story')
    useCodexStoryApprovalStore.getState().answer(request.id, true)
    expect((await pending).success).toBe(true)
    expect(mocks.execute).toHaveBeenCalledOnce()
  })
  it('denial, blocked permission, and cancellation never execute a tool', async () => {
    const pending = executeCodexStoryTool('storyboard_create', { title: 'No' }, options)
    useCodexStoryApprovalStore.getState().answer(useCodexStoryApprovalStore.getState().requests[0].id, false)
    expect((await pending).success).toBe(false)
    usePermissionStore.getState().setGlobalPermission('workflow', 'blocked')
    expect((await executeCodexStoryTool('storyboard_create', { title: 'No' }, options)).success).toBe(false)
    usePermissionStore.getState().resetToDefaults()
    const controller = new AbortController()
    const cancelled = executeCodexStoryTool('storyboard_create', { title: 'No' }, { ...options, signal: controller.signal })
    controller.abort()
    expect((await cancelled).success).toBe(false)
    expect(useCodexStoryApprovalStore.getState().requests).toHaveLength(0)
    expect(mocks.execute).not.toHaveBeenCalled()
  })
  it('respects image blocking even when workflow actions are automatic', async () => {
    usePermissionStore.getState().setGlobalPermission('workflow', 'auto')
    usePermissionStore.getState().setGlobalPermission('image', 'blocked')
    expect((await executeCodexStoryTool('storyboard_render_panel', { projectId: 'p', panelId: 's' }, options)).success).toBe(false)
    expect(mocks.execute).not.toHaveBeenCalled()
  })
  it('rechecks a permission revoked while the review card was open', async () => {
    const pending = executeCodexStoryTool('storyboard_create', { title: 'No' }, options)
    usePermissionStore.getState().setGlobalPermission('workflow', 'blocked')
    useCodexStoryApprovalStore.getState().answer(useCodexStoryApprovalStore.getState().requests[0].id, true)
    expect((await pending).success).toBe(false)
    expect(mocks.execute).not.toHaveBeenCalled()
  })
})
