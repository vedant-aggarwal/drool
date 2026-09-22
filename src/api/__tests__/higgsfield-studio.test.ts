import { beforeEach, describe, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ call: vi.fn(), state: { servers: [{ id:'higgs',args:['https://mcp.higgsfield.ai/mcp'] }], connectedServers:['higgs'], serverTools: { higgs:[{name:'models_list',inputSchema:{type:'object',properties:{type:{type:'string',enum:['image','video']}},required:['type']}}] } } }))
vi.mock('../mcp/external-client', () => ({ callConnectedMcpTool:mocks.call }))
vi.mock('../../stores/mcpStore', () => ({ useMCPStore:{getState:()=>mocks.state} }))
import { higgsTool, parseHiggsModels, parseHiggsOutputs } from '../higgsfield-studio'
beforeEach(()=>vi.clearAllMocks())
describe('Higgsfield structured provider boundary',()=>{
  it('requires a discovered tool and validates arguments before calling',async()=>{
    await expect(higgsTool('higgs','generate_image',{})).rejects.toThrow('does not advertise')
    await expect(higgsTool('higgs','models_list',{type:'invalid'})).rejects.toThrow()
    await expect(higgsTool('other','models_list',{type:'image'})).rejects.toThrow('official')
    expect(mocks.call).not.toHaveBeenCalled()
  })
  it('preserves structured output and does not resubmit errors',async()=>{
    mocks.call.mockResolvedValue({structuredContent:{items:[{id:'model'}]}})
    expect(await higgsTool('higgs','models_list',{type:'image'})).toEqual({items:[{id:'model'}]})
    mocks.call.mockResolvedValue({isError:true,content:[{type:'text',text:'Insufficient credits'}]})
    await expect(higgsTool('higgs','models_list',{type:'image'})).rejects.toThrow('Insufficient credits')
    expect(mocks.call).toHaveBeenCalledTimes(2)
  })
  it('accepts JSON text transport without mistaking free text for a result',async()=>{
    mocks.call.mockResolvedValue({content:[{type:'text',text:'{"items":[]}'}]})
    expect(await higgsTool('higgs','models_list',{type:'image'})).toEqual({items:[]})
    mocks.call.mockResolvedValue({content:[{type:'text',text:'Something went wrong'}]})
    await expect(higgsTool('higgs','models_list',{type:'image'})).rejects.toThrow('Something went wrong')
  })
  it('retains required-media constraints and server defaults',()=>{
    const models=parseHiggsModels({items:[{id:'a',parameters:[{name:'resolution',default:'1k'}],medias:[{required:'required'}]}]})
    expect(models[0].requiresMedia).toBe(true); expect(models[0].defaults).toEqual({resolution:'1k'})
  })
  it('correlates asynchronous jobs and refuses unsafe result URLs',()=>{
    expect(parseHiggsOutputs({jobs:[{job_id:'a',status:'completed',result_url:'https://cdn.example/a.jpg'}]},'image')[0]).toMatchObject({id:'a',url:'https://cdn.example/a.jpg'})
    expect(parseHiggsOutputs({results:[{id:'a',status:'completed',results:{rawUrl:'javascript:alert(1)'}}]},'image')[0].url).toBeUndefined()
    expect(parseHiggsOutputs({unlim_choice:{message:'Choose'}},'image')).toEqual([])
  })
})
