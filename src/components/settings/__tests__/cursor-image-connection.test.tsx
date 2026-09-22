// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
const mocks = vi.hoisted(() => ({ cursorStatus: vi.fn(), cursorLogin: vi.fn(), generateCursorImage: vi.fn(), saveCursorImage: vi.fn(), isTauri: vi.fn(() => true) }))
vi.mock('../../../api/cursor-images', () => mocks)
vi.mock('../../../api/backend', () => ({ isTauri: mocks.isTauri }))
import { CursorImageConnection } from '../CursorImageConnection'
beforeEach(() => { vi.clearAllMocks(); mocks.isTauri.mockReturnValue(true); mocks.cursorStatus.mockResolvedValue({ installed: true, authenticated: true }) })
afterEach(cleanup)

describe('Cursor image card', () => {
  it('honestly disables browser-preview controls', () => {
    mocks.isTauri.mockReturnValue(false)
    render(<CursorImageConnection />)
    expect(screen.getByText(/Open the desktop app/)).toBeTruthy()
    expect((screen.getByRole('button', { name: 'Sign in with Cursor' }) as HTMLButtonElement).disabled).toBe(true)
  })
  it('checks account before enabling generation, then displays actual output', async () => {
    mocks.generateCursorImage.mockResolvedValue({ filename: 'cursor-test.jpg', dataUrl: 'data:image/jpeg;base64,aGVsbG8=', width: 512, height: 512 })
    render(<CursorImageConnection />)
    fireEvent.change(screen.getByLabelText('Describe your Cursor image'), { target: { value: 'A teal circle' } })
    expect((screen.getByRole('button', { name: 'Generate with Cursor' }) as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: 'Check Cursor connection' }))
    await screen.findByText('Cursor account connected')
    fireEvent.click(screen.getByRole('button', { name: 'Generate with Cursor' }))
    expect((await screen.findByRole('img')).getAttribute('src')).toBe('data:image/jpeg;base64,aGVsbG8=')
    expect(mocks.generateCursorImage).toHaveBeenCalledExactlyOnceWith('A teal circle', '1:1', expect.any(AbortSignal))
  })
  it('stop aborts the active request and failed generation never creates a preview', async () => {
    mocks.generateCursorImage.mockImplementation((_prompt, _ratio, signal: AbortSignal) => new Promise((_resolve, reject) => { signal.addEventListener('abort', () => reject(new Error('Cancelled'))) }))
    render(<CursorImageConnection />)
    fireEvent.click(screen.getByRole('button', { name: 'Check Cursor connection' }))
    await screen.findByText('Cursor account connected')
    fireEvent.change(screen.getByLabelText('Describe your Cursor image'), { target: { value: 'A teal circle' } })
    fireEvent.click(screen.getByRole('button', { name: 'Generate with Cursor' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Stop Cursor' }))
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Stop Cursor' })).toBeNull())
    expect(screen.queryByRole('img')).toBeNull()
    expect(screen.getByRole('status').textContent).toContain('Stopped')
  })
})
