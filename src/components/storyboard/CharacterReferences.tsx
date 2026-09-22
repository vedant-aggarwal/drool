import { useEffect, useRef, useState } from 'react'
import { Download, Plus, Trash2 } from 'lucide-react'
import { loadCharacterReference, saveCharacterReference, type CharacterReference } from '../../lib/character-references'

const button = 'min-h-10 rounded-lg border border-white/10 px-3 py-2 text-xs hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-violet-400 disabled:opacity-40 disabled:cursor-not-allowed'
function ReferenceCard({ reference, onRename, onRemove }: { reference: CharacterReference; onRename: (name: string) => void; onRemove: () => void }) {
  const [url, setUrl] = useState('')
  const [error, setError] = useState('')
  useEffect(() => {
    let disposed = false; let objectUrl = ''
    void loadCharacterReference(reference.id).then(blob => {
      if (!disposed) { objectUrl = URL.createObjectURL(blob); setUrl(objectUrl) }
    }).catch(e => { if (!disposed) setError(e instanceof Error ? e.message : 'Cannot load reference.') })
    return () => { disposed = true; if (objectUrl) URL.revokeObjectURL(objectUrl) }
  }, [reference.id])
  return <div className="rounded-xl border border-white/10 p-2 space-y-2">
    {url ? <img src={url} alt={reference.name} className="w-full aspect-square rounded-md object-contain bg-black/20 outline outline-1 outline-white/10"/> : <p className="text-xs text-gray-400 p-3" role={error ? 'alert' : 'status'}>{error || 'Loading reference…'}</p>}
    <input aria-label={`Reference name: ${reference.name}`} value={reference.name} onChange={e => onRename(e.target.value)} className="w-full min-h-10 rounded-lg bg-black/20 p-2 text-xs focus-visible:outline-2 focus-visible:outline-violet-400"/>
    <div className="flex items-center justify-between gap-1">
      <a className={button + (!url ? ' pointer-events-none opacity-40' : '')} href={url || undefined} download={`${reference.name || 'reference'}.${reference.mime === 'image/jpeg' ? 'jpg' : reference.mime === 'image/webp' ? 'webp' : 'png'}`} aria-label={`Download original ${reference.name}`}><Download size={15}/></a>
      <button className={button} aria-label={`Remove reference ${reference.name}`} onClick={onRemove}><Trash2 size={15}/></button>
    </div>
  </div>
}
export function CharacterReferences({ name, references, onChange }: { name: string; references: CharacterReference[]; onChange: (update: (refs: CharacterReference[]) => CharacterReference[]) => void }) {
  const picker = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function add(files: File[]) {
    if (!files.length || busy) return
    setBusy(true); setError('')
    try {
      if (references.length + files.length > 12) throw new Error('Keep up to 12 reference images per character. Remove one before adding more.')
      for (const file of files) {
        const saved = await saveCharacterReference(file)
        onChange(current => [...current, saved])
      }
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not save reference.') }
    finally { setBusy(false); if (picker.current) picker.current.value = '' }
  }
  return <div className="space-y-2 pt-2">
    <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="text-sm">Reference images <span className="text-xs text-gray-500 tabular-nums">{references.length}/12</span></h3><button type="button" className={button} disabled={busy || references.length >= 12} onClick={() => picker.current?.click()}><Plus size={14} className="inline mr-1"/>{busy ? 'Saving…' : 'Add images'}</button></div>
    <input ref={picker} type="file" accept="image/png,image/jpeg,image/webp" multiple className="sr-only" aria-label={`Add reference images for ${name}`} onChange={e => void add(Array.from(e.target.files ?? []))}/>
    {error && <p role="alert" className="text-xs text-red-300">{error}</p>}
    {!references.length && <p className="text-xs text-gray-400">Add a face, outfit, pose, or character sheet. Original files are copied into local storage.</p>}
    <div className="grid grid-cols-2 gap-2">{references.map(reference => <ReferenceCard key={reference.id} reference={reference} onRename={name => onChange(current => current.map(r => r.id === reference.id ? { ...r, name } : r))} onRemove={() => onChange(current => current.filter(r => r.id !== reference.id))}/>)}</div>
    {!!references.length && <p className="text-xs text-gray-500">Choose a reference on a panel to use it. Removing it here does not change your original file or other stories.</p>}
  </div>
}
