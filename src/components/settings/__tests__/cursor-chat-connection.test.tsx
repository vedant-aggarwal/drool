// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
vi.mock('../../../api/backend',()=>({isTauri:()=>true}))
vi.mock('../../../api/cursor-images',()=>({cursorStatus:vi.fn(async()=>({authenticated:true,installed:true}))}))
vi.mock('../../../api/cursor-chat',async importOriginal=>({...await importOriginal<typeof import('../../../api/cursor-chat')>(),cursorChatModels:vi.fn(async()=>[
  {id:'gpt-test-low',name:'Test Low'},{id:'gpt-test-high',name:'Test High'},
]),sendCursorChat:vi.fn(async()=>'Here is the scene.')}))
import { sendCursorChat } from '../../../api/cursor-chat'
import { CursorChatConnection } from '../CursorChatConnection'
beforeEach(()=>{localStorage.clear();vi.clearAllMocks()})
afterEach(cleanup)
it('loads advertised efforts and sends the selected model with saved custom instructions',async()=>{
  render(<CursorChatConnection/>);fireEvent.click(screen.getByRole('button',{name:'Load Cursor chat models'}))
  await waitFor(()=>expect(screen.getByText('Connected · 2 available model variants')).toBeTruthy())
  fireEvent.change(screen.getByLabelText('Cursor reasoning effort'),{target:{value:'gpt-test-high'}})
  fireEvent.change(screen.getByLabelText('Cursor default instructions'),{target:{value:'Speak as a kind director.'}})
  fireEvent.change(screen.getByLabelText('Message Cursor'),{target:{value:'Develop a scene.'}})
  fireEvent.click(screen.getByRole('button',{name:'Send to Cursor'}))
  await waitFor(()=>expect(screen.getByText('Here is the scene.')).toBeTruthy())
  expect(sendCursorChat).toHaveBeenCalledWith('gpt-test-high',[{role:'user',content:'Develop a scene.'}],'Speak as a kind director.',expect.any(AbortSignal))
  expect(JSON.parse(localStorage.getItem('drool-cursor-chat-defaults')!).persona).toBe('Speak as a kind director.')
})
