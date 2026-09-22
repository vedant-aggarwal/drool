import { beforeEach, describe, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ backendCall: vi.fn(), invoke: vi.fn(), isTauri: vi.fn(() => true) }))
vi.mock('../backend', () => mocks)
vi.mock('@tauri-apps/api/core', () => ({ invoke: mocks.invoke }))
import { cursorLogin, cursorStatus, generateCursorImage, saveCursorImage } from '../cursor-images'
const image = { requestId: 'id', filename: 'cursor-id.png', path: 'C:\\Drool\\cursor-id.png', mime: 'image/png', width: 2, height: 2, dataUrl: 'data:image/png;base64,aGVsbG8=' }
beforeEach(() => { vi.clearAllMocks(); mocks.isTauri.mockReturnValue(true) })

describe('Cursor native image connection', () => {
  it('requires desktop and never submits empty or pre-cancelled work', async () => {
    mocks.isTauri.mockReturnValue(false)
    await expect(cursorStatus()).rejects.toThrow('desktop')
    mocks.isTauri.mockReturnValue(true)
    await expect(generateCursorImage('', '1:1')).rejects.toThrow('prompt')
    const controller = new AbortController(); controller.abort()
    await expect(generateCursorImage('A circle', '1:1', controller.signal)).rejects.toThrow('Cancelled')
    expect(mocks.backendCall).not.toHaveBeenCalled()
  })
  it('uses managed CLI login without accepting credentials', async () => {
    mocks.backendCall.mockResolvedValue({ installed: true, authenticated: true })
    await expect(cursorLogin()).resolves.toEqual({ installed: true, authenticated: true })
    expect(mocks.backendCall).toHaveBeenCalledWith('drool_cursor_login', { requestId: expect.any(String) })
  })
  it('returns verified native images without retrying generation', async () => {
    mocks.backendCall.mockResolvedValue(image)
    expect(await generateCursorImage('A circle', '16:9')).toEqual(image)
    expect(mocks.backendCall).toHaveBeenCalledExactlyOnceWith('drool_cursor_generate', { requestId: expect.any(String), prompt: 'A circle', aspectRatio: '16:9' })
    mocks.backendCall.mockRejectedValueOnce(new Error('Usage limit'))
    await expect(generateCursorImage('A circle', '1:1')).rejects.toThrow('Usage limit')
    expect(mocks.backendCall).toHaveBeenCalledTimes(2)
  })
  it('rejects text-only success, executable image formats, and missing dimensions', async () => {
    for (const value of [{ text: 'Done' }, { ...image, mime: 'image/svg+xml', dataUrl: 'data:image/svg+xml;base64,aGVsbG8=' }, { ...image, width: 0 }, { ...image, dataUrl: 'https://external/image.png' }]) {
      mocks.backendCall.mockResolvedValueOnce(value)
      await expect(generateCursorImage('A circle', '1:1')).rejects.toThrow('verified image')
    }
  })
  it('cancels the exact operation and does not display a late result', async () => {
    let complete!: (value: unknown) => void
    mocks.backendCall.mockImplementation((command: string) => command === 'drool_cursor_generate' ? new Promise(resolve => { complete = resolve }) : Promise.resolve())
    const controller = new AbortController()
    const pending = generateCursorImage('A circle', '1:1', controller.signal)
    const args = mocks.backendCall.mock.calls[0][1]
    controller.abort()
    expect(mocks.backendCall).toHaveBeenCalledWith('drool_cursor_cancel', { requestId: args.requestId })
    complete(image)
    await expect(pending).rejects.toThrow('Cancelled')
  })
  it('saves actual image bytes through the native Save As dialog', async () => {
    mocks.backendCall.mockResolvedValue(null)
    await saveCursorImage(image)
    expect(mocks.invoke).toHaveBeenCalledWith('save_binary_file_dialog', { bytes: [104, 101, 108, 108, 111], defaultName: image.filename, extension: 'png', extLabel: 'Image' })
  })
})
