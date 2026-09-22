import { beforeEach, describe, expect, it, vi } from 'vitest'
vi.mock('../backend', () => ({ fetchExternal: vi.fn(), backendCall: vi.fn().mockResolvedValue({ present: false }) }))
import { backendCall, fetchExternal } from '../backend'
import { getHfDetails, hfInstallBlock, hfLibraryTokenConfigured, hfMatchingBundles, hfSearchUrl, hfVariantModel, hfVariants, searchHfLibrary, validRepoId, type HfFile, type HfRepository } from '../huggingface-library'
const repo: HfRepository = { id: 'Qwen/Qwen3-8B-GGUF', sha: 'a'.repeat(40), pipeline_tag: 'text-generation', gguf: { architecture: 'qwen3' }, gated: false }
const file = (path: string, size = 100): HfFile => ({ type: 'file', path, size })
beforeEach(() => { vi.mocked(fetchExternal).mockReset(); vi.mocked(backendCall).mockReset().mockResolvedValue({ present: false }) })

describe('Hugging Face discovery', () => {
  it('reads token presence without retrieving the credential', async () => {
    vi.mocked(backendCall).mockResolvedValue({ present: true })
    expect(await hfLibraryTokenConfigured()).toBe(true)
    expect(backendCall).toHaveBeenCalledWith('hf_token_present', { args: {} })
    vi.mocked(backendCall).mockRejectedValue(new Error('unavailable'))
    expect(await hfLibraryTokenConfigured()).toBe(false)
  })
  it('uses the GGUF filter without changing the user query', () => {
    const url = new URL(hfSearchUrl('Qwen3-8B', 'text'))
    expect(url.searchParams.get('search')).toBe('Qwen3-8B')
    expect(url.searchParams.get('filter')).toBe('gguf')
    expect(url.searchParams.get('pipeline_tag')).toBe('text-generation')
  })
  it('can browse popular LoRAs without requiring typed text', () => {
    const url = new URL(hfSearchUrl('', 'lora'))
    expect(url.searchParams.get('search')).toBe('')
    expect(url.searchParams.get('filter')).toBe('lora')
    expect(url.searchParams.get('sort')).toBe('downloads')
  })
  it('includes image-to-video results and deduplicates across video tasks', async () => {
    vi.mocked(fetchExternal).mockResolvedValue(JSON.stringify([{ id: 'Wan-AI/Wan2.2-TI2V-5B', downloads: 100 }]))
    expect(await searchHfLibrary('Wan2.2', 'video')).toHaveLength(1)
    const tasks = vi.mocked(fetchExternal).mock.calls.map(([url]) => new URL(url).searchParams.get('pipeline_tag'))
    expect(tasks).toContain('image-to-video')
    expect(tasks).toContain('text-to-video')
  })
  it('propagates network failures instead of reporting no matches', async () => {
    vi.mocked(fetchExternal).mockRejectedValue(new Error('HTTP 429'))
    const outcome = await searchHfLibrary('qwen', 'text').then(() => 'unexpected success', error => error.message)
    expect(outcome).toBe('HTTP 429')
  })
  it('rejects error objects and filters invalid repository paths', async () => {
    vi.mocked(fetchExternal).mockResolvedValueOnce('{"error":"limited"}')
    await expect(searchHfLibrary('', 'all')).rejects.toThrow('unexpected')
    vi.mocked(fetchExternal).mockResolvedValueOnce(JSON.stringify([{ id: 'Qwen/Qwen3' }, { id: '../secret' }]))
    expect(await searchHfLibrary('', 'all')).toEqual([{ id: 'Qwen/Qwen3' }])
    expect(validRepoId('https://evil.test/x')).toBe(false)
  })
  it('pins the tree and download to the repository commit', async () => {
    vi.mocked(fetchExternal).mockResolvedValueOnce(JSON.stringify(repo)).mockResolvedValueOnce(JSON.stringify([file('Qwen3.Q4_K_M.gguf')]))
    const details = await getHfDetails(repo.id)
    expect(vi.mocked(fetchExternal).mock.calls[1][0]).toContain(`/tree/${repo.sha}?`)
    expect(hfVariantModel(repo, details.variants[0]).downloadUrl).toContain(`/resolve/${repo.sha}/`)
  })
  it('refuses a changed repository identity', async () => {
    vi.mocked(fetchExternal).mockResolvedValueOnce(JSON.stringify({ ...repo, id: 'other/repo' }))
    await expect(getHfDetails(repo.id)).rejects.toThrow('identity')
  })
})

describe('exact variant safety', () => {
  it('distinguishes quants, auxiliary files and full precision', () => {
    const variants = hfVariants([file('model-Q4_K_M.gguf'), file('model-BF16.gguf'), file('mmproj-F16.gguf'), file('README.md')])
    expect(variants).toHaveLength(3)
    expect(variants.map(v => v.quant)).toEqual(['Q4_K_M', 'BF16', 'F16'])
    expect(variants[2].auxiliary).toBe(true)
  })
  it('groups and orders all shards and calculates actual bytes', () => {
    const [variant] = hfVariants([file('q4/model-Q4_K_M-00002-of-00002.gguf', 25), file('q4/model-Q4_K_M-00001-of-00002.gguf', 50)])
    expect(variant.complete).toBe(true)
    expect(variant.bytes).toBe(75)
    expect(variant.files[0].path).toContain('00001')
  })
  it('blocks missing or inconsistent shards', () => {
    const [missing] = hfVariants([file('model-Q4_K_M-00002-of-00002.gguf')])
    expect(missing.complete).toBe(false)
    expect(hfInstallBlock(repo, missing)).toContain('Incomplete')
    const [wrongTotal] = hfVariants([file('model-Q4_K_M-00001-of-00002.gguf'), file('model-Q4_K_M-00002-of-00003.gguf')])
    expect(wrongTotal.complete).toBe(false)
  })
  it('does not offer executable, unsafe-path or arbitrary checkpoint files as GGUF', () => {
    expect(hfVariants([file('../bad.gguf'), file('a\\bad.gguf'), file('unsafe:name.gguf'), file('model.py')])).toEqual([])
    expect(hfInstallBlock(repo, hfVariants([file('image.safetensors')])[0])).toContain('workflow')
  })
  it('does not infer compatibility from GGUF extension or a model name', () => {
    const [variant] = hfVariants([file('Qwen3-Q4_K_M.gguf')])
    expect(hfInstallBlock({ ...repo, gguf: { architecture: 'new-unsupported' } }, variant)).toContain('architecture')
    expect(hfInstallBlock({ ...repo, pipeline_tag: 'text-to-video' }, variant)).toContain('not a verified text')
    expect(hfInstallBlock(repo, variant)).toBeNull()
  })
  it('blocks gated models, missing sizes and multimodal companions', () => {
    const [variant] = hfVariants([file('model.gguf')])
    expect(hfInstallBlock({ ...repo, gated: 'manual' }, variant)).toContain('terms')
    expect(hfInstallBlock({ ...repo, gated: 'manual' }, variant, true)).toBeNull()
    expect(hfInstallBlock(repo, { ...variant, bytes: 0 })).toContain('sizes')
    expect(hfInstallBlock({ ...repo, tags: ['vision'] }, variant)).toContain('projector')
  })
  it('matches curated media dependencies by exact repository identity', () => {
    const bundle = { name: 'bundle', url: 'https://huggingface.co/owner/model', files: [] } as never
    expect(hfMatchingBundles('owner/model', [bundle])).toHaveLength(1)
    expect(hfMatchingBundles('owner/model2', [bundle])).toHaveLength(0)
  })
})
