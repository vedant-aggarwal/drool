// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ProviderConnections } from '../ProviderConnections'
const mocks = vi.hoisted(() => ({ addServer: vi.fn() }))
vi.mock('../../../api/backend', () => ({ isTauri: () => false, isWindows: () => true, openExternal: vi.fn() }))
vi.mock('../../../api/drool-providers', () => ({ HIGGSFIELD_MCP_URL: 'https://mcp.higgsfield.ai/mcp' }))
vi.mock('../MCPServerSettings', () => ({ MCPServerSettings: () => <div>MCP controls</div> }))
vi.mock('../HiggsfieldStudio', () => ({ HiggsfieldStudio: () => <div>Higgsfield studio</div> }))
vi.mock('../../../stores/mcpStore', () => {
  const hook = Object.assign((selector: (s: { servers: [] }) => unknown) => selector({ servers: [] }), { getState: () => ({ addServer: mocks.addServer }) })
  return { useMCPStore: hook }
})
afterEach(() => { cleanup(); localStorage.clear(); vi.clearAllMocks() })

describe('Connections setup', () => {
  it('marks native Codex unavailable in browser preview and disables sign-in', () => {
    render(<ProviderConnections />)
    expect(screen.getByText(/Browser preview cannot start the CLI/)).toBeTruthy()
    expect((screen.getByRole('button', { name: /Sign in with ChatGPT/ }) as HTMLButtonElement).disabled).toBe(true)
  })
  it('adds the official remote endpoint as an OAuth bridge, without claiming it connected', () => {
    render(<ProviderConnections />)
    fireEvent.click(screen.getByRole('button', { name: 'Add Higgsfield MCP connection' }))
    expect(mocks.addServer).toHaveBeenCalledWith(expect.objectContaining({ command: 'npx.cmd', args: ['-y', 'mcp-remote', 'https://mcp.higgsfield.ai/mcp'] }))
    expect(screen.getByRole('status').textContent).toContain('Press its Connect button')
  })
  it('does not persist API credentials when typed', () => {
    render(<ProviderConnections />)
    fireEvent.change(screen.getByLabelText('API key'), { target: { value: 'test-secret' } })
    fireEvent.change(screen.getByLabelText('Key ID:key secret'), { target: { value: 'test:secret' } })
    expect(JSON.stringify(localStorage)).not.toContain('test-secret')
    expect(JSON.stringify(localStorage)).not.toContain('test:secret')
  })
})
