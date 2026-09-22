import { create } from 'zustand'

interface StoryApproval { id: string; tool: string; args: Record<string, unknown>; finish: (allow: boolean) => void }
interface State {
  requests: StoryApproval[]
  ask: (tool: string, args: Record<string, unknown>, signal?: AbortSignal) => Promise<boolean>
  answer: (id: string, allow: boolean) => void
}
export const useCodexStoryApprovalStore = create<State>((set, get) => ({
  requests: [],
  ask: (tool, args, signal) => new Promise<boolean>(resolve => {
    if (signal?.aborted) { resolve(false); return }
    const id = crypto.randomUUID()
    const finish = (allow: boolean) => { signal?.removeEventListener('abort', abort); resolve(allow) }
    const abort = () => get().answer(id, false)
    set(s => ({ requests: [...s.requests, { id, tool, args, finish }] }))
    signal?.addEventListener('abort', abort, { once: true })
  }),
  answer: (id, allow) => {
    const request = get().requests.find(r => r.id === id)
    set(s => ({ requests: s.requests.filter(r => r.id !== id) }))
    request?.finish(allow)
  },
}))
