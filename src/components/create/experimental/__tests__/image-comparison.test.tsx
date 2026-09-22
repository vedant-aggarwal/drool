// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
vi.mock('../../../../api/comfyui', () => ({ getImageUrl: (name: string) => `/input/${name}` }))
vi.mock('../galleryUrl', () => ({ proxiedComfyBlobUrl: vi.fn(async () => null) }))
import { ImageComparison } from '../ImageComparison'
import type { GalleryItem } from '../../../../stores/createStore'
const item = { id: 'edit-1', width: 2048, height: 1365, comparisonSource: { filename: 'original.png', width: 96, height: 64 } } as GalleryItem
afterEach(cleanup)
describe('before/after comparison', () => {
  it('uses the stored original, exposes a named slider, and switches between comparison and result', () => {
    render(<ImageComparison item={item} afterUrl="/edited.png" onAfterError={vi.fn()} onAfterLoad={vi.fn()} />)
    expect(screen.getByAltText('Original image').getAttribute('src')).toBe('/input/original.png')
    expect(screen.getByAltText('Edited result').getAttribute('src')).toBe('/edited.png')
    const slider = screen.getByRole('slider', { name: 'Comparison divider' })
    fireEvent.change(slider, { target: { value: '25' } })
    expect(slider.getAttribute('aria-valuetext')).toBe('25% original, 75% result')
    fireEvent.click(screen.getByRole('button', { name: 'Side by side' }))
    expect(screen.queryByRole('slider')).toBeNull()
    expect(screen.getByAltText('Original image')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Result' }))
    expect(screen.queryByAltText('Original image')).toBeNull()
    expect(screen.getByAltText('Edited result')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Compare' }))
    expect((screen.getByRole('slider') as HTMLInputElement).value).toBe('25')
  })
  it('keeps the edited result available when the original file was removed', async () => {
    render(<ImageComparison item={item} afterUrl="/edited.png" onAfterError={vi.fn()} onAfterLoad={vi.fn()} />)
    fireEvent.error(screen.getByAltText('Original image'))
    await waitFor(() => expect(screen.getByRole('status').textContent).toContain('original is no longer available'))
    expect(screen.getByAltText('Edited result')).toBeTruthy()
    expect((screen.getByRole('button', { name: 'Compare' }) as HTMLButtonElement).disabled).toBe(true)
  })
})
