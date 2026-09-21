import { describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ConfirmDelete from '@/components/shared/ConfirmDelete'

describe('ConfirmDelete', () => {
  it('keeps the dialog open, reports failures, and permits a retry', async () => {
    const user = userEvent.setup()
    const onOpenChange = vi.fn()
    const onConfirm = vi.fn()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce(undefined)

    render(<ConfirmDelete open onOpenChange={onOpenChange} onConfirm={onConfirm} title="Delete record" />)
    await user.click(screen.getByRole('button', { name: 'Delete' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Delete failed. Please try again.')
    expect(onOpenChange).not.toHaveBeenCalledWith(false)

    await user.click(screen.getByRole('button', { name: 'Delete' }))
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false))
  })

  it('disables dismissal while deletion is pending', async () => {
    const user = userEvent.setup()
    let resolveDelete
    const onConfirm = vi.fn(() => new Promise((resolve) => { resolveDelete = resolve }))
    render(<ConfirmDelete open onOpenChange={vi.fn()} onConfirm={onConfirm} />)

    await user.click(screen.getByRole('button', { name: 'Delete' }))
    expect(screen.getByRole('button', { name: 'Deleting…' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled()
    resolveDelete()
  })
})
