import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import SiteVisitSheet from '@/components/tenders/SiteVisitSheet'

const form = {
  visitDate: '2026-09-21',
  visitTime: '10:30',
  location: '',
  workCompleted: '',
  labourUsed: '',
  materialUsed: '',
  issues: '',
  nextDayPlan: '',
  status: 'In Progress',
  notes: '',
}

function renderSheet(overrides = {}) {
  const changes = vi.fn()
  const props = {
    open: true,
    onOpenChange: vi.fn(),
    editing: false,
    form,
    setField: (field) => (event) => changes(field, event?.target?.value ?? event),
    statuses: ['In Progress', 'Completed'],
    isAdmin: true,
    uploading: false,
    uploadProgress: 0,
    uploadError: '',
    onUpload: vi.fn(),
    photos: [],
    renderPhoto: (photo) => <div key={photo.id}>{photo.name}</div>,
    onSave: vi.fn(),
    ...overrides,
  }

  render(<SiteVisitSheet {...props} />)
  return { props, changes }
}

describe('SiteVisitSheet', () => {
  it('labels its fields and forwards edit, save, and cancel actions', async () => {
    const user = userEvent.setup()
    const { props, changes } = renderSheet()

    expect(screen.getByRole('dialog', { name: 'New Site Visit' })).toBeInTheDocument()
    expect(screen.getByLabelText(/Visit Date/)).toBeRequired()
    expect(screen.getByLabelText('Visit Time')).toHaveAttribute('type', 'time')
    expect(screen.getByLabelText('Status')).toBeInTheDocument()

    await user.type(screen.getByRole('textbox', { name: 'Location / Site Area' }), 'Block A')
    expect(changes).toHaveBeenCalledWith('location', 'B')

    await user.click(screen.getByRole('button', { name: 'Add Site Visit' }))
    expect(props.onSave).toHaveBeenCalledOnce()

    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(props.onOpenChange).toHaveBeenCalledWith(false)
  })

  it('accepts supported photos and exposes upload failures', async () => {
    const user = userEvent.setup()
    const onUpload = vi.fn()
    renderSheet({ onUpload, uploadError: 'The photo could not be uploaded.' })

    const input = screen.getByLabelText(/Upload Photos/)
    expect(input).toHaveAttribute('accept', 'image/jpeg,image/jpg,image/png,image/webp')
    expect(input).toHaveAttribute('multiple')
    expect(screen.getByRole('alert')).toHaveTextContent('The photo could not be uploaded.')

    const photo = new File(['photo'], 'site.webp', { type: 'image/webp' })
    await user.upload(input, photo)
    expect(onUpload).toHaveBeenCalledOnce()
    expect(onUpload.mock.calls[0][0]).toEqual([photo])
  })

  it('prevents saves and uploads while an upload is in progress', () => {
    renderSheet({ uploading: true, uploadProgress: 45 })

    expect(screen.getByText('Uploading 45%')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Add Site Visit' })).toBeDisabled()
    expect(screen.getByLabelText(/Uploading 45%/)).toBeDisabled()
  })
})
