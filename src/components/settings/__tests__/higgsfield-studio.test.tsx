// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ call:vi.fn() }))
vi.mock('../../../stores/mcpStore',()=>({useMCPStore:()=>['higgs']}))
vi.mock('../../../api/higgsfield-studio',async importOriginal=>({...(await importOriginal<typeof import('../../../api/higgsfield-studio')>()),connectedHiggsfield:()=> 'higgs',higgsTool:mocks.call}))
vi.mock('../ProviderMediaResult',()=>({ProviderMediaResult:({media}:{media:{src:string;prompt:string}})=><img src={media.src} alt={media.prompt}/>}))
import { HiggsfieldStudio } from '../HiggsfieldStudio'
beforeEach(()=>{vi.clearAllMocks();mocks.call.mockImplementation(async (_server:string,tool:string)=>{
 if(tool==='models_list')return {items:[{id:'image-model',name:'Image model',aspect_ratios:['1:1'],parameters:[{name:'resolution',default:'1k'}]}]}
 if(tool==='generate_image')return {results:[{id:'job',status:'completed',type:'image',results:{rawUrl:'https://cdn.example/image.png'}}]}
 return {}
})})
afterEach(cleanup)
it('uses live model defaults and only generates on the explicit generation action',async()=>{
 render(<HiggsfieldStudio/>);fireEvent.click(screen.getByRole('button',{name:'Load available models'}))
 await screen.findByRole('option',{name:'Image model'})
 expect(mocks.call).toHaveBeenCalledTimes(1)
 fireEvent.change(screen.getByLabelText('Higgsfield prompt'),{target:{value:'A blue bird'}})
 fireEvent.click(screen.getByRole('button',{name:'Generate image'}))
 expect((await screen.findByRole('img')).getAttribute('src')).toBe('https://cdn.example/image.png')
 expect(mocks.call).toHaveBeenCalledWith('higgs','generate_image',{params:{model:'image-model',prompt:'A blue bird',aspect_ratio:'1:1',resolution:'1k',count:1}},expect.any(AbortSignal))
})
it('waits for an explicit allowance choice without submitting a second generation',async()=>{
 render(<HiggsfieldStudio/>);fireEvent.click(screen.getByRole('button',{name:'Load available models'}));await screen.findByRole('option',{name:'Image model'})
 mocks.call.mockResolvedValueOnce({unlim_choice:{message:'Choose your allowance'}})
 fireEvent.change(screen.getByLabelText('Higgsfield prompt'),{target:{value:'A blue bird'}});fireEvent.click(screen.getByRole('button',{name:'Generate image'}))
 await screen.findByText('Choose your allowance')
 expect(mocks.call).toHaveBeenCalledTimes(2);expect(screen.queryByRole('img')).toBeNull()
 fireEvent.click(screen.getByRole('button',{name:'Use credits'}));await screen.findByRole('img')
 expect(mocks.call).toHaveBeenLastCalledWith('higgs','generate_image',{params:expect.objectContaining({use_unlim:false})},expect.any(AbortSignal))
})
