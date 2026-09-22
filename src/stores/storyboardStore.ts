import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { safeJSONStorage } from '../lib/storage-quota'
import type { CharacterReference } from '../lib/character-references'
import type { GalleryItem } from './createStore'

export interface StoryCharacter { id: string; name: string; appearance: string; personality: string; lora: string; references?: CharacterReference[] }
export interface StoryPanel { id: string; title: string; prompt: string; caption: string; approved: boolean; image?: GalleryItem; referenceId?: string; referenceDenoise?: number }
export interface StoryProject { id: string; title: string; brief: string; style: string; model: string; characters: StoryCharacter[]; panels: StoryPanel[]; messages: { role: 'user' | 'assistant'; content: string }[]; updatedAt: number }
export function parseStoryboard(text: string): StoryPanel[] {
  const start = text.indexOf('['); const end = text.lastIndexOf(']')
  if (start < 0 || end <= start) throw new Error('The model did not return a panel list. Try again or add panels manually.')
  const data: unknown = JSON.parse(text.slice(start, end + 1))
  if (!Array.isArray(data) || data.length < 1 || data.length > 32) throw new Error('A storyboard must contain 1–32 panels.')
  return data.map((row: unknown, index) => {
    if (!row || typeof row !== 'object' || !('prompt' in row) || typeof row.prompt !== 'string' || !row.prompt.trim()) throw new Error(`Panel ${index + 1} has no image prompt.`)
    const field = (name: string) => name in row && typeof row[name as keyof typeof row] === 'string' ? String(row[name as keyof typeof row]).slice(0, 8000) : ''
    return { id: crypto.randomUUID(), title: field('title') || `Panel ${index + 1}`, prompt: field('prompt'), caption: field('caption'), approved: false }
  })
}
export function panelPrompt(project: StoryProject, panel: StoryPanel): string {
  return [project.style, ...project.characters.map(c => `${c.name}: ${c.appearance}`), panel.prompt, 'No captions or lettering in the image; captions are stored separately.'].filter(Boolean).join('\n')
}
interface StoryState {
  projects: StoryProject[]; activeId: string | null; characterLibrary: StoryCharacter[]
  saveCharacter: (character: StoryCharacter) => void
  removeSavedCharacter: (id: string) => void
  createProject: () => string
  setActive: (id: string) => void
  updateProject: (id: string, patch: Partial<Omit<StoryProject, 'id'>>) => void
  updatePanel: (projectId: string, panelId: string, patch: Partial<Omit<StoryPanel, 'id'>>) => void
}
export const useStoryboardStore = create<StoryState>()(persist((set) => ({
  projects: [], activeId: null, characterLibrary: [],
  saveCharacter: character => set(s => ({ characterLibrary: [...s.characterLibrary.filter(c => c.id !== character.id), structuredClone(character)] })),
  removeSavedCharacter: id => set(s => ({ characterLibrary: s.characterLibrary.filter(c => c.id !== id) })),
  createProject: () => { const id = crypto.randomUUID(); set(s => ({ activeId: id, projects: [...s.projects, { id, title: 'Untitled story', brief: '', style: 'Cinematic illustration', model: '', characters: [], panels: [], messages: [], updatedAt: Date.now() }] })); return id },
  setActive: activeId => set({ activeId }),
  updateProject: (id, patch) => set(s => ({ projects: s.projects.map(p => p.id === id ? { ...p, ...patch, id, panels: patch.panels ?? ((patch.style !== undefined && patch.style !== p.style) || patch.characters !== undefined ? p.panels.map(panel => ({ ...panel, approved: false })) : p.panels), updatedAt: Date.now() } : p) })),
  updatePanel: (projectId, panelId, patch) => set(s => ({ projects: s.projects.map(p => p.id === projectId ? { ...p, updatedAt: Date.now(), panels: p.panels.map(panel => panel.id === panelId ? { ...panel, ...patch, id: panelId, approved: (patch.prompt !== undefined && patch.prompt !== panel.prompt) || (patch.referenceId !== undefined && patch.referenceId !== panel.referenceId) || (patch.referenceDenoise !== undefined && patch.referenceDenoise !== panel.referenceDenoise) ? false : (patch.approved ?? panel.approved) } : panel) } : p) })),
}), { name: 'drool-storyboards-v1', storage: safeJSONStorage(), partialize: s => ({ activeId: s.activeId, characterLibrary: s.characterLibrary, projects: s.projects.map(p => ({ ...p, panels: p.panels.map(panel => ({ ...panel, image: panel.image ? { ...panel.image, dataUrl: undefined, remoteUrl: undefined } : undefined })) })) }) }))
