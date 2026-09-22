import { useEffect, useRef, useState } from 'react'
import { MessageSquare, Send, Square } from 'lucide-react'
import { cursorStatus } from '../../api/cursor-images'
import { cursorChatModels, groupCursorModels, sendCursorChat, type CursorChatMessage, type CursorChatModel } from '../../api/cursor-chat'
import { isTauri } from '../../api/backend'
import { isRecord } from '../../types/json-guards'

const button = 'min-h-10 rounded-lg border border-white/15 px-3 py-2 text-sm hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-violet-400 disabled:opacity-40 disabled:cursor-not-allowed transition-colors motion-reduce:transition-none'
const input = 'w-full min-h-10 rounded-lg border border-white/15 bg-black/20 p-2 text-sm focus-visible:outline-2 focus-visible:outline-violet-400'
const key = 'drool-cursor-chat-defaults'
const personas = {
  'Creative partner': 'Be a thoughtful creative collaborator. Develop ideas with concrete choices, discuss tradeoffs, and ask one focused question when needed.',
  'Storyboard director': 'Act as a storyboard director. Help develop story beats, character motivations, camera framing and continuity. Separate visual prompts from dialogue and captions.',
  'Roleplay companion': 'Roleplay the agreed fictional character with consistent personality and dialogue. Let the user control their own character and clarify the scene before beginning.',
  'Precise assistant': 'Be concise, accurate and practical. Distinguish evidence from assumptions and explain uncertainty clearly.',
}
function defaults() {
  try { const saved: unknown=JSON.parse(localStorage.getItem(key) ?? '{}'); if(isRecord(saved)) return { model:typeof saved.model==='string'?saved.model:'auto', persona:typeof saved.persona==='string'?saved.persona:personas['Creative partner'], preset:typeof saved.preset==='string'?saved.preset:'Creative partner' } } catch { /* defaults below */ }
  return {model:'auto',persona:personas['Creative partner'],preset:'Creative partner'}
}

export function CursorChatConnection() {
  const [prefs,setPrefs]=useState(defaults)
  const [models,setModels]=useState<CursorChatModel[]>([])
  const [messages,setMessages]=useState<CursorChatMessage[]>([])
  const [prompt,setPrompt]=useState('')
  const [busy,setBusy]=useState<'connect'|'chat'|null>(null)
  const [error,setError]=useState('')
  const [notice,setNotice]=useState('')
  const abort=useRef<AbortController|null>(null)
  const working=useRef(false)
  const alive=useRef(true)
  useEffect(()=>{alive.current=true;return()=>{alive.current=false;abort.current?.abort()}},[])
  useEffect(()=>{try{localStorage.setItem(key,JSON.stringify(prefs))}catch{/* app remains usable without persistence */}},[prefs])
  const groups=groupCursorModels(models)
  const group=groups.find(item=>item.options.some(option=>option.id===prefs.model))
  async function connect(){
    if(working.current)return; working.current=true;setBusy('connect');setError('')
    try {
      const status=await cursorStatus()
      if(!status.authenticated)throw new Error('Sign in with Cursor in the image connection below, then load chat models.')
      const catalog=await cursorChatModels()
      if(alive.current){setModels(catalog);setPrefs(p=>({...p,model:catalog.some(m=>m.id===p.model)?p.model:catalog[0].id}));setNotice(`Connected · ${catalog.length} available model variants`)}
    }catch(e){if(alive.current)setError(e instanceof Error?e.message:String(e))}finally{working.current=false;if(alive.current)setBusy(null)}
  }
  async function send(){
    if(working.current||!prompt.trim()||!group)return
    working.current=true;setBusy('chat');setError('');setNotice('')
    const controller=new AbortController();abort.current=controller
    const submitted=prompt.trim();const turn:CursorChatMessage={role:'user',content:submitted}
    try {
      const text=await sendCursorChat(prefs.model,[...messages.slice(-24),turn],prefs.persona,controller.signal)
      if(alive.current){setMessages(items=>[...items,turn,{role:'assistant',content:text}]);setPrompt('')}
    }catch(e){if(alive.current){if(controller.signal.aborted)setNotice('Cursor chat stopped.');else setError(e instanceof Error?e.message:String(e))}}
    finally{working.current=false;abort.current=null;if(alive.current)setBusy(null)}
  }
  return <section aria-labelledby="cursor-chat-title" className="space-y-4 rounded-xl border border-white/10 bg-white/[0.025] p-4 sm:p-5">
    <div><h2 id="cursor-chat-title" className="flex items-center gap-2 font-semibold"><MessageSquare size={18}/>Cursor chat</h2><p className="mt-1 text-sm text-gray-400">Use models available to your Cursor account. Effort choices map to the exact variants Cursor advertises.</p></div>
    <button className={button} disabled={!isTauri()||!!busy} onClick={()=>void connect()}>{busy==='connect'?'Loading Cursor models…':models.length?'Refresh Cursor chat models':'Load Cursor chat models'}</button>
    {!isTauri()&&<p className="text-sm text-gray-400">Open Drool desktop to use Cursor chat.</p>}
    {notice&&<p role="status" className="text-sm text-gray-300">{notice}</p>}{error&&<p role="alert" className="rounded-lg bg-red-400/10 p-3 text-sm text-red-200">{error}</p>}
    <div className="grid gap-3 sm:grid-cols-2"><label className="text-sm">Cursor chat model<select className={input+' mt-1'} value={group?.id??''} disabled={!models.length||!!busy} onChange={e=>{const selected=groups.find(item=>item.id===e.target.value);if(selected)setPrefs(p=>({...p,model:selected.options.find(o=>o.effort==='default')?.id??selected.options[0].id}))}}>{!models.length&&<option value="">Load models to choose</option>}{groups.map(item=><option value={item.id} key={item.id}>{item.name}</option>)}</select></label>
      <label className="text-sm">Cursor reasoning effort<select className={input+' mt-1'} value={prefs.model} disabled={!group||group.options.length<2||!!busy} onChange={e=>setPrefs(p=>({...p,model:e.target.value}))}>{group?group.options.map(option=><option value={option.id} key={option.id}>{option.effort==='default'?'Provider default':option.effort==='xhigh'?'Extra high':option.effort[0].toUpperCase()+option.effort.slice(1)}</option>):<option value={prefs.model}>Provider default</option>}</select></label></div>
    {group&&group.options.length===1&&<p className="text-xs text-gray-400">This model exposes one effort setting in your current Cursor catalog.</p>}
    <label className="block text-sm">Cursor persona<select className={input+' mt-1'} value={prefs.preset} disabled={!!busy} onChange={e=>setPrefs(p=>({...p,preset:e.target.value,persona:e.target.value==='Custom'?p.persona:personas[e.target.value as keyof typeof personas]}))}>{Object.keys(personas).map(name=><option key={name}>{name}</option>)}<option>Custom</option></select></label>
    <label className="block text-sm">Cursor default instructions<textarea className={input+' mt-1 min-h-24 resize-y'} maxLength={4000} value={prefs.persona} disabled={!!busy} onChange={e=>setPrefs(p=>({...p,preset:'Custom',persona:e.target.value}))}/></label>
    <p className="text-xs text-gray-400">Saved on this PC. Sent with each turn and the last 12 exchanges; Cursor’s provider instructions still apply. This chat has no file, shell or image tools.</p>
    {!!messages.length&&<div className="max-h-96 space-y-3 overflow-y-auto rounded-lg border border-white/10 p-3" role="log" aria-label="Cursor conversation">{messages.map((message,index)=><div key={index} className={message.role==='user'?'rounded-lg bg-violet-500/10 p-3':'p-3'}><span className="mb-1 block text-xs text-gray-400">{message.role==='user'?'You':'Cursor'}</span><p className="whitespace-pre-wrap break-words text-sm leading-relaxed">{message.content}</p></div>)}</div>}
    <form className="space-y-3" onSubmit={e=>{e.preventDefault();void send()}}><label className="block text-sm">Message Cursor<textarea className={input+' mt-1 min-h-24 resize-y'} maxLength={12000} value={prompt} disabled={!!busy} onChange={e=>setPrompt(e.target.value)} placeholder="Discuss an idea, develop a character, or ask a question…"/></label><div className="flex flex-wrap gap-2"><button className={button+' inline-flex items-center gap-2'} disabled={!!busy||!group||!prompt.trim()}><Send size={16}/>{busy==='chat'?'Cursor is replying…':'Send to Cursor'}</button>{busy==='chat'&&<button type="button" className={button} onClick={()=>abort.current?.abort()}><Square size={14} className="mr-1 inline"/>Stop chat</button>}{!!messages.length&&<button type="button" className={button} disabled={!!busy} onClick={()=>setMessages([])}>New Cursor conversation</button>}</div></form>
  </section>
}
