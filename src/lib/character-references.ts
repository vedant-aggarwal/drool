export interface CharacterReference { id: string; name: string; mime: string; size: number }
const DB = 'drool-character-references'
async function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') { reject(new Error('Local image storage is unavailable. Restart Drool and try again.')); return }
    const request = indexedDB.open(DB, 1)
    request.onupgradeneeded = () => request.result.createObjectStore('originals')
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(new Error('Could not open local reference storage.'))
  })
}
/** Keep the original bytes in IndexedDB, never in prompts or localStorage. */
export async function saveCharacterReference(file: File): Promise<CharacterReference> {
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) throw new Error('Choose a PNG, JPEG or WebP image.')
  if (!file.size || file.size > 20 * 1024 * 1024) throw new Error('Each reference must be between 1 byte and 20 MB.')
  const id = crypto.randomUUID()
  const db = await database()
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('originals', 'readwrite')
      tx.objectStore('originals').put(file, id)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(new Error('Could not save this reference. Check free disk space.'))
      tx.onabort = () => reject(new Error('Reference storage was interrupted. Try again.'))
    })
  } finally { db.close() }
  return { id, name: file.name.replace(/\.[^.]+$/, ''), mime: file.type, size: file.size }
}
export async function loadCharacterReference(id: string): Promise<Blob> {
  const db = await database()
  try {
    return await new Promise<Blob>((resolve, reject) => {
      const tx = db.transaction('originals', 'readonly')
      const request = tx.objectStore('originals').get(id)
      let value: unknown
      request.onsuccess = () => { value = request.result }
      tx.oncomplete = () => value instanceof Blob ? resolve(value) : reject(new Error('This reference is missing on this PC. Add the original image again.'))
      tx.onerror = () => reject(new Error('Could not read the saved reference.'))
      tx.onabort = () => reject(new Error('Reading the reference was interrupted.'))
    })
  } finally { db.close() }
}
export function projectReferences(project: { characters: Array<{ name: string; references?: CharacterReference[] }> }) {
  const references = project.characters.flatMap(character => (character.references ?? []).map(reference => ({ ...reference, characterName: character.name })))
  return [...new Map(references.map(reference => [reference.id, reference])).values()]
}
export function panelReferenceSignature(panel: { referenceId?: string; referenceDenoise?: number }) { return `${panel.referenceId ?? ''}:${panel.referenceDenoise ?? 0.45}` }
export function supportsCharacterReference(modelType: string): boolean { return ['sdxl', 'sd15'].includes(modelType) }
