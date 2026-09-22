import { beforeEach, expect, it, vi } from 'vitest'
const mocks=vi.hoisted(()=>({invoke:vi.fn(),add:vi.fn()}))
vi.mock('@tauri-apps/api/core',()=>({invoke:mocks.invoke}))
vi.mock('../backend',()=>({isTauri:()=>true,ensureProxyAllowsHost:vi.fn(),localFetch:vi.fn()}))
vi.mock('../../stores/createStore',()=>({useCreateStore:{getState:()=>({addToGallery:mocks.add})}}))
import { downloadProviderMedia, providerMediaMime, saveProviderToGallery } from '../provider-gallery'
beforeEach(()=>vi.clearAllMocks())
it('persists verified image bytes before adding a durable library item',async()=>{
 mocks.invoke.mockResolvedValue({path:'C:/outputs/verified.jpg',filename:'verified.jpg',width:20,height:10})
 const item=await saveProviderToGallery({src:'data:image/jpeg;base64,aGVsbG8=',type:'image',prompt:'test',model:'Codex'})
 expect(mocks.invoke).toHaveBeenCalledWith('drool_save_provider_image',{dataUrl:'data:image/jpeg;base64,aGVsbG8='})
 expect(item).toMatchObject({localPath:'C:/outputs/verified.jpg',width:20,height:10,model:'Codex'}); expect(mocks.add).toHaveBeenCalledWith(item)
})
it('does not add unverified images or unsupported URLs',async()=>{
 mocks.invoke.mockRejectedValue(new Error('Invalid image'))
 await expect(saveProviderToGallery({src:'data:image/png;base64,aGVsbG8=',type:'image',prompt:'',model:'Codex'})).rejects.toThrow('Invalid image')
 await expect(saveProviderToGallery({src:'file:///private',type:'image',prompt:'',model:'Codex'})).rejects.toThrow('unsupported')
 expect(mocks.add).not.toHaveBeenCalled()
})
it('reuses native Cursor images without duplicating their file',async()=>{
 const item=await saveProviderToGallery({src:'data:image/png;base64,aGVsbG8=',localPath:'C:/outputs/cursor.png',width:512,height:512,type:'image',prompt:'',model:'Cursor'})
 expect(item.localPath).toBe('C:/outputs/cursor.png');expect(mocks.invoke).not.toHaveBeenCalled()
})
it('uses capped binary IPC and preserves raster bytes rather than decoding them as text',async()=>{
 const bytes=[137,80,78,71,13,10,26,10,0,255,128]
 mocks.invoke.mockResolvedValue(bytes)
 const blob=await downloadProviderMedia({src:'https://cdn.example/result',type:'image',prompt:'',model:'Higgsfield'})
 expect(mocks.invoke).toHaveBeenCalledWith('fetch_external_bytes',{url:'https://cdn.example/result',maxBytes:24_000_000})
 expect(blob.type).toBe('image/png');expect([...new Uint8Array(await blob.arrayBuffer())]).toEqual(bytes)
})
it('rejects HTML/SVG responses, URL credentials and already-cancelled downloads',async()=>{
 mocks.invoke.mockResolvedValue([...new TextEncoder().encode('<svg/>')])
 await expect(downloadProviderMedia({src:'https://cdn.example/x',type:'image',prompt:'',model:'Higgsfield'})).rejects.toThrow('unsupported media bytes')
 mocks.invoke.mockClear()
 await expect(downloadProviderMedia({src:'https://secret@cdn.example/x',type:'image',prompt:'',model:'Higgsfield'})).rejects.toThrow('unsupported media URL')
 const controller=new AbortController();controller.abort()
 await expect(downloadProviderMedia({src:'https://cdn.example/x',type:'image',prompt:'',model:'Higgsfield'},controller.signal)).rejects.toThrow('Cancelled')
 expect(mocks.invoke).not.toHaveBeenCalled()
})
it('recognizes video signatures and leaves video library entries as remote links',async()=>{
 expect(providerMediaMime(new Uint8Array([0,0,0,24,102,116,121,112,105,115,111,109]),'video')).toBe('video/mp4')
 const item=await saveProviderToGallery({src:'https://cdn.example/result.mp4',type:'video',prompt:'video',model:'Higgsfield'})
 expect(item.remoteUrl).toBe('https://cdn.example/result.mp4');expect(item.localPath).toBeUndefined();expect(mocks.invoke).not.toHaveBeenCalled()
})
it('reuses the preview bytes for image saving without a second remote request',async()=>{
 mocks.invoke.mockResolvedValue({path:'C:/outputs/verified.png',filename:'verified.png',width:20,height:10})
 const blob=new Blob([new Uint8Array([137,80,78,71,13,10,26,10])],{type:'image/png'})
 await saveProviderToGallery({src:'https://cdn.example/result',type:'image',prompt:'test',model:'Higgsfield'},blob)
 expect(mocks.invoke).toHaveBeenCalledExactlyOnceWith('drool_save_provider_image',{dataUrl:'data:image/png;base64,iVBORw0KGgo='})
})
