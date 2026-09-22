// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
vi.mock('../../../api/backend', () => ({ openExternal: vi.fn(), fetchExternal: vi.fn(), backendCall: vi.fn().mockResolvedValue({ present: false }) }))
vi.mock('../../../api/huggingface-library', async importOriginal => ({ ...await importOriginal<typeof import('../../../api/huggingface-library')>(), searchHfLibrary: vi.fn(), getHfDetails: vi.fn() }))
import { searchHfLibrary, getHfDetails, hfVariants } from '../../../api/huggingface-library'
import { HuggingFaceLibrary } from '../HuggingFaceLibrary'
beforeEach(() => { vi.mocked(searchHfLibrary).mockReset(); vi.mocked(getHfDetails).mockReset() })
afterEach(cleanup)

describe('Hugging Face library controls', () => {
  it('reserves repository rows while the initial search is pending', async () => {
    let resolve!: (value: { id: string }[]) => void
    vi.mocked(searchHfLibrary).mockReturnValue(new Promise(r => { resolve = r }))
    render(<HuggingFaceLibrary category="text" />)
    fireEvent.click(screen.getByRole('button', { name: 'Browse popular' }))
    expect(screen.getByRole('status', { name: 'Loading Hugging Face repositories' }).getAttribute('aria-busy')).toBe('true')
    expect(screen.queryByText(/No matching repositories/)).toBeNull()
    resolve([{ id: 'owner/model' }])
    expect(await screen.findByText('owner/model')).toBeTruthy()
    expect(screen.queryByRole('status', { name: 'Loading Hugging Face repositories' })).toBeNull()
  })
  it('shows suggestions before a search and browses without requiring input', async () => {
    vi.mocked(searchHfLibrary).mockResolvedValue([])
    render(<HuggingFaceLibrary category="lora" />)
    expect(screen.getByRole('button', { name: 'FLUX LoRAs' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Browse popular' }))
    await waitFor(() => expect(searchHfLibrary).toHaveBeenCalledWith('', 'lora', 20))
    expect(await screen.findByText(/No matching repositories/)).toBeTruthy()
  })
  it('shows a failed search as an error instead of a false empty result', async () => {
    vi.mocked(searchHfLibrary).mockRejectedValue(new Error('HTTP 429'))
    render(<HuggingFaceLibrary category="text" />)
    fireEvent.click(screen.getByRole('button', { name: 'Browse popular' }))
    expect((await screen.findByRole('alert')).textContent).toContain('429')
    expect(screen.queryByText(/No matching repositories/)).toBeNull()
  })
  it('ignores an old result after switching categories', async () => {
    let resolve!: (value: { id: string }[]) => void
    vi.mocked(searchHfLibrary).mockReturnValue(new Promise(r => { resolve = r }))
    render(<HuggingFaceLibrary category="text" />)
    fireEvent.click(screen.getByRole('button', { name: 'Browse popular' }))
    fireEvent.change(screen.getByLabelText('Hugging Face category'), { target: { value: 'image' } })
    resolve([{ id: 'old/result' }])
    await waitFor(() => expect(screen.queryByText('old/result')).toBeNull())
  })
  it('passes the exact reviewed file and checksum to the installer', async () => {
    const repo = { id: 'owner/model', sha: 'a'.repeat(40), pipeline_tag: 'text-generation', gguf: { architecture: 'qwen3' } }
    vi.mocked(searchHfLibrary).mockResolvedValue([repo])
    vi.mocked(getHfDetails).mockResolvedValue({ repository: repo, treeTruncated: false, variants: hfVariants([{ type: 'file', path: 'special/model-Q5_K_M.gguf', size: 123456, lfs: { oid: 'b'.repeat(64) } }]) })
    const install = vi.fn().mockResolvedValue(undefined)
    render(<HuggingFaceLibrary category="text" onInstallText={install} />)
    fireEvent.click(screen.getByRole('button', { name: 'Browse popular' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Files & compatibility' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Download selected GGUF' }))
    await waitFor(() => expect(install).toHaveBeenCalledOnce())
    expect(install.mock.calls[0][1].files[0]).toEqual({ url: `https://huggingface.co/owner/model/resolve/${repo.sha}/special/model-Q5_K_M.gguf`, filename: 'model-Q5_K_M.gguf', sizeBytes: 123456, sha256: 'b'.repeat(64) })
  })
  it('allows a gated repository only after the backend reports a configured token', async () => {
    const repo = { id: 'owner/gated', sha: 'a'.repeat(40), gated: 'manual', pipeline_tag: 'text-generation', gguf: { architecture: 'llama' } }
    const detail = { repository: repo, treeTruncated: false, variants: hfVariants([{ type: 'file', path: 'model-Q4_K_M.gguf', size: 1000 }]) }
    vi.mocked(searchHfLibrary).mockResolvedValue([repo])
    vi.mocked(getHfDetails).mockResolvedValueOnce({ ...detail, tokenConfigured: false }).mockResolvedValueOnce({ ...detail, tokenConfigured: true })
    render(<HuggingFaceLibrary category="text" onInstallText={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Browse popular' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Files & compatibility' }))
    expect(await screen.findByText(/Accept the model terms/)).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Download selected GGUF' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Hide files' }))
    fireEvent.click(screen.getByRole('button', { name: 'Files & compatibility' }))
    expect(await screen.findByRole('button', { name: 'Download selected GGUF' })).toBeTruthy()
  })
})
