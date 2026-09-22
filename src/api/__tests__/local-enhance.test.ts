import { describe, it, expect } from 'vitest'
import { enhancementGraph } from '../local-enhance'
describe('local enhancement graphs', () => {
  it('preserves a source path and routes a learned upscaler into the final resize', () => {
    const graph = enhancementGraph('portrait.png', 2048, 3072, '4x-UltraSharp.pth')
    expect(graph['1']!.inputs!.image).toBe('portrait.png')
    expect(graph['3']!.inputs!.upscale_model).toEqual(['2', 0])
    expect(graph['4']!.inputs!.image).toEqual(['3', 0])
    expect(graph['5']!.class_type).toBe('SaveImage')
  })
  it('uses only core nodes for the explicitly labeled non-AI fallback', () => {
    const graph = enhancementGraph('source.png', 2048, 1024)
    expect(graph['4']!.inputs!.image).toEqual(['1', 0])
    expect(Object.values(graph).map(n => n.class_type)).toEqual(['LoadImage', 'ImageScale', 'SaveImage'])
  })
  it('rejects invalid dimensions before submission', () => {
    expect(() => enhancementGraph('source.png', NaN, 512)).toThrow()
    expect(() => enhancementGraph('source.png', 10000, 512)).toThrow()
  })
})
