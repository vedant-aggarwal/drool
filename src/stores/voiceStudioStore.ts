import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { safeJSONStorage } from '../lib/storage-quota'

interface VoiceStudioSettings {
  engine: 'piper' | 'audio.cpp'
  endpoint: string
  modelId: string
  voice: string
  design: string
}
export const useVoiceStudioStore = create<VoiceStudioSettings & {
  update: (settings: Partial<VoiceStudioSettings>) => void
}>()(persist((set) => ({
  engine: 'piper', endpoint: 'http://127.0.0.1:8080', modelId: '', voice: '', design: '',
  update: (settings) => set(settings),
}), { name: 'drool-voice-studio', storage: safeJSONStorage() }))
