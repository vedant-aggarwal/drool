import { backendCall, isTauri } from './backend'
import { isRecord } from '../types/json-guards'

export interface CursorStatus { installed: boolean; authenticated: boolean }
export interface CursorImage { requestId: string; filename: string; path: string; mime: string; width: number; height: number; dataUrl: string }
export type CursorAspectRatio = '1:1' | '4:3' | '3:4' | '16:9' | '9:16'

function desktop() { if (!isTauri()) throw new Error('Cursor image generation requires the Drool desktop app.') }
export async function cursorStatus(): Promise<CursorStatus> { desktop(); return backendCall('drool_cursor_status') }

async function operation<T>(command: string, args: Record<string, unknown>, signal?: AbortSignal): Promise<T> {
  desktop()
  if (signal?.aborted) throw new DOMException('Cancelled', 'AbortError')
  const requestId = crypto.randomUUID()
  const stop = () => { void backendCall('drool_cursor_cancel', { requestId }).catch(() => undefined) }
  signal?.addEventListener('abort', stop, { once: true })
  try {
    const result = await backendCall<T>(command, { ...args, requestId })
    if (signal?.aborted) throw new DOMException('Cancelled', 'AbortError')
    return result
  } finally { signal?.removeEventListener('abort', stop) }
}

export function cursorLogin(signal?: AbortSignal): Promise<CursorStatus> { return operation('drool_cursor_login', {}, signal) }

export async function generateCursorImage(prompt: string, aspectRatio: CursorAspectRatio, signal?: AbortSignal): Promise<CursorImage> {
  if (!prompt.trim() || prompt.length > 8000) throw new Error('Enter an image prompt under 8,000 characters.')
  const result: unknown = await operation('drool_cursor_generate', { prompt, aspectRatio }, signal)
  if (!isRecord(result) || typeof result.requestId !== 'string' || typeof result.filename !== 'string' || typeof result.path !== 'string' || typeof result.dataUrl !== 'string'
    || !['image/png', 'image/jpeg', 'image/webp'].includes(String(result.mime))
    || !result.dataUrl.startsWith(`data:${result.mime};base64,`) || !/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(result.dataUrl)
    || typeof result.width !== 'number' || typeof result.height !== 'number' || result.width < 1 || result.height < 1 || result.width > 8192 || result.height > 8192) {
    throw new Error('Cursor did not return a verified image. No result was displayed.')
  }
  return result as unknown as CursorImage
}

/** Native Save As avoids the WebView2 blob/download navigation trap. */
export async function saveCursorImage(image: CursorImage): Promise<void> {
  desktop()
  const { invoke } = await import('@tauri-apps/api/core')
  const bytes = Array.from(atob(image.dataUrl.split(',')[1]), char => char.charCodeAt(0))
  await invoke('save_binary_file_dialog', { bytes, defaultName: image.filename, extension: image.filename.split('.').at(-1), extLabel: 'Image' })
}
