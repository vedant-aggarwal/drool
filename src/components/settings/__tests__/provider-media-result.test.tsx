// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
const mocks=vi.hoisted(()=>({download:vi.fn(),save:vi.fn(),open:vi.fn(),create:vi.fn(()=> 'blob:verified'),revoke:vi.fn()}))
vi.mock('../../../api/provider-gallery',()=>({downloadProviderMedia:mocks.download,saveProviderToGallery:mocks.save}))
vi.mock('../../../api/backend',()=>({openExternal:mocks.open}))
import { ProviderMediaResult } from '../ProviderMediaResult'
const media={src:'https://cdn.example/image',type:'image' as const,prompt:'A bird',model:'Higgsfield'}
beforeEach(()=>{vi.clearAllMocks();URL.createObjectURL=mocks.create;URL.revokeObjectURL=mocks.revoke;mocks.download.mockResolvedValue(new Blob(['image'],{type:'image/png'}));mocks.save.mockResolvedValue({})})
afterEach(cleanup)
it('renders only a local blob preview, reuses its bytes for save, and revokes it on unmount',async()=>{
 const view=render(<ProviderMediaResult media={media}/>);expect(screen.queryByRole('img')).toBeNull()
 const img=await screen.findByRole('img');expect(img.getAttribute('src')).toBe('blob:verified')
 fireEvent.click(screen.getByRole('button',{name:'Save to library'}));await screen.findByRole('button',{name:'Saved in library'})
 expect(mocks.save).toHaveBeenCalledWith(media,expect.any(Blob))
 view.unmount();expect(mocks.revoke).toHaveBeenCalledWith('blob:verified')
})
it('does not allocate an object URL when a download finishes after unmount',async()=>{
 let finish!:(blob:Blob)=>void;mocks.download.mockImplementation(()=>new Promise<Blob>(resolve=>{finish=resolve}))
 const view=render(<ProviderMediaResult media={media}/>);view.unmount();finish(new Blob(['late']))
 await waitFor(()=>expect(mocks.download.mock.calls[0][1].aborted).toBe(true));expect(mocks.create).not.toHaveBeenCalled()
})
it('keeps the original link available when a remote preview fails validation',async()=>{
 mocks.download.mockRejectedValue(new Error('Media exceeds the preview size limit'))
 render(<ProviderMediaResult media={media}/>);expect((await screen.findByRole('alert')).textContent).toContain('size limit')
 expect(screen.queryByRole('img')).toBeNull();expect((screen.getByRole('button',{name:'Save to library'}) as HTMLButtonElement).disabled).toBe(true)
 fireEvent.click(screen.getByRole('button',{name:'Open original'}));expect(mocks.open).toHaveBeenCalledWith(media.src)
})
