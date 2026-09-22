// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
vi.mock('../../../../api/local-enhance', () => ({ loadEnhanceModels: vi.fn() }))
import { loadEnhanceModels } from '../../../../api/local-enhance'
import { EnhanceModelPicker } from '../EnhanceModelPicker'
import { useCreateStore } from '../../../../stores/createStore'
beforeEach(() => { vi.clearAllMocks(); useCreateStore.setState({ enhanceModel: 'auto', isGenerating: false }) })
afterEach(cleanup)
describe('installed Enhance picker', () => {
  it('shows actual installed names, explains Auto, and saves an explicit choice', async () => {
    vi.mocked(loadEnhanceModels).mockResolvedValue(['4x-UltraSharp.pth', 'RealESRGAN.pth'])
    render(<EnhanceModelPicker />)
    expect((screen.getByRole('combobox') as HTMLSelectElement).disabled).toBe(true)
    await screen.findByRole('option', { name: 'RealESRGAN.pth' })
    expect(screen.getByRole('status').textContent).toBe('Auto will use 4x-UltraSharp.pth.')
    fireEvent.change(screen.getByRole('combobox', { name: 'Enhance model' }), { target: { value: 'RealESRGAN.pth' } })
    expect(useCreateStore.getState().enhanceModel).toBe('RealESRGAN.pth')
    expect(screen.getByRole('status').textContent).toContain('Will use RealESRGAN.pth')
  })
  it('distinguishes a working empty inventory from a failed connection and permits retry', async () => {
    vi.mocked(loadEnhanceModels).mockRejectedValueOnce(new Error('ComfyUI is offline.')).mockResolvedValueOnce([])
    render(<EnhanceModelPicker />)
    await screen.findByRole('alert')
    expect(screen.queryByText(/No AI upscaler is installed/)).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Refresh Enhance models' }))
    await waitFor(() => expect(screen.getByRole('status').textContent).toContain('No AI upscaler is installed'))
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'bicubic' } })
    expect(screen.getByRole('status').textContent).toContain('without an AI detail pass')
  })
})
