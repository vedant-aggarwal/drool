import { beforeEach, describe, expect, it, vi } from 'vitest'
vi.mock('../backend',()=>({backendCall:vi.fn(),isTauri:vi.fn(()=>true)}))
import { backendCall, isTauri } from '../backend'
import { cursorChatModels, groupCursorModels, sendCursorChat } from '../cursor-chat'
beforeEach(()=>{vi.clearAllMocks();vi.mocked(isTauri).mockReturnValue(true)})
describe('Cursor model/effort mapping',()=>{
  it('groups only advertised effort variants and retains fast/thinking variants',()=>{
    const result=groupCursorModels([
      {id:'gpt-test-high',name:'GPT Test High'},{id:'gpt-test-low',name:'GPT Test Low'},
      {id:'gpt-test-high-fast',name:'GPT Test High Fast'},{id:'gpt-test',name:'GPT Test'},
      {id:'claude-test-high-thinking',name:'Claude Test High Thinking'},
    ])
    expect(result[0]).toEqual({id:'gpt-test',name:'GPT Test',options:[{id:'gpt-test',effort:'default'},{id:'gpt-test-low',effort:'low'},{id:'gpt-test-high',effort:'high'}]})
    expect(result[1].id).toBe('gpt-test-fast');expect(result[2].id).toBe('claude-test-thinking')
    expect(result.flatMap(g=>g.options).some(o=>o.effort==='max')).toBe(false)
  })
  it('preserves a similar phrase inside the actual model name',()=>{
    expect(groupCursorModels([{id:'vendor-high-quality-high',name:'Quality High'}])[0].id).toBe('vendor-high-quality')
  })
  it('rejects malformed catalogs and desktop-only calls in browser',async()=>{
    vi.mocked(backendCall).mockResolvedValue([{id:4}]);await expect(cursorChatModels()).rejects.toThrow('invalid model catalog')
    vi.mocked(isTauri).mockReturnValue(false);await expect(cursorChatModels()).rejects.toThrow('desktop')
  })
})
describe('Cursor conversation bridge',()=>{
  it('sends selected variant, persona and explicit history',async()=>{
    vi.mocked(backendCall).mockResolvedValue({text:'Hello'})
    expect(await sendCursorChat('gpt-test-high',[{role:'user',content:'Hi'}],'Be a director')).toBe('Hello')
    expect(backendCall).toHaveBeenCalledWith('drool_cursor_chat',expect.objectContaining({model:'gpt-test-high',persona:'Be a director',messages:[{role:'user',content:'Hi'}]}))
  })
  it('does not submit a pre-cancelled call',async()=>{
    const abort=new AbortController();abort.abort()
    await expect(sendCursorChat('auto',[{role:'user',content:'Hi'}],'',abort.signal)).rejects.toThrow('Stopped')
    expect(backendCall).not.toHaveBeenCalled()
  })
  it('rejects empty success payloads',async()=>{
    vi.mocked(backendCall).mockResolvedValue({text:''})
    await expect(sendCursorChat('auto',[{role:'user',content:'Hi'}],'')).rejects.toThrow('no completed reply')
  })
})
