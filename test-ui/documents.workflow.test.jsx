import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import Documents from '@/pages/Documents'

const update = vi.fn()
const uploadTenderDocument = vi.fn()
const getTenderDocumentUrl = vi.fn()
let fixtureTenders = []
let isAdmin = true

vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ isAdmin }) }))
vi.mock('@/hooks/useFirestore', () => ({
  useCollection: () => ({ data: fixtureTenders, loading: false, error: null }),
  useFirestoreCRUD: () => ({ update }),
}))
vi.mock('@/lib/supabaseStorage', () => ({
  hasSupabaseStorageConfig: () => true,
  uploadTenderDocument: (...args) => uploadTenderDocument(...args),
  getTenderDocumentUrl: (...args) => getTenderDocumentUrl(...args),
}))

const renderDocuments = () => render(<MemoryRouter><Documents /></MemoryRouter>)
const storedDoc = { id: 'doc-1', title: 'Long BOQ filename and title for the roadworks contract', fileName: 'roadworks-boq.pdf', type: 'BOQ', category: 'BOQ', storagePath: 'test/boq.pdf', storageBucket: 'tender-documents', storageProvider: 'supabase', uploadedAt: '2026-09-01', notes: 'Keep existing notes' }
const externalDoc = { id: 'doc-2', title: 'Certificate link', type: 'Certificate', category: 'Certificate', url: 'https://example.test/certificate', uploadedAt: '' }

describe('Documents workflows on disposable records', () => {
  beforeEach(() => {
    fixtureTenders = [{ id: 'project-1', name: 'Test roadworks project with a long name', nit: 'TEST-NIT', documents: [storedDoc, externalDoc] }]
    isAdmin = true
    update.mockReset().mockResolvedValue(undefined)
    uploadTenderDocument.mockReset().mockResolvedValue({ path: 'test/new.pdf', bucket: 'tender-documents', url: 'https://temporary.test/signed' })
    getTenderDocumentUrl.mockReset().mockResolvedValue('https://temporary.test/signed')
  })

  it('filters records and distinguishes stored downloads from external links', async () => {
    const user = userEvent.setup()
    renderDocuments()
    const table = screen.getByRole('table')
    expect(within(table).getAllByRole('link', { name: /Test roadworks project/ })).toHaveLength(2)
    await waitFor(() => expect(within(table).getByRole('link', { name: 'Download document' })).toHaveAttribute('href', 'https://temporary.test/signed'))
    expect(within(table).getAllByRole('button', { name: 'Open document' })).toHaveLength(2)
    await user.type(screen.getByRole('searchbox', { name: 'Search documents' }), 'Certificate')
    expect(within(table).getAllByText('Certificate link')).toHaveLength(2)
    expect(within(table).queryByText('Long BOQ filename and title for the roadworks contract')).not.toBeInTheDocument()
    expect(within(table).queryByRole('link', { name: 'Download document' })).not.toBeInTheDocument()
    expect(within(table).getByText('External link')).toBeInTheDocument()
  })

  it('saves metadata without reuploading or persisting a signed URL', async () => {
    const user = userEvent.setup()
    renderDocuments()
    await waitFor(() => expect(screen.getByRole('link', { name: 'Download document' })).toBeInTheDocument())
    await user.click(screen.getAllByRole('button', { name: 'Edit document' })[0])
    const dialog = screen.getByRole('dialog', { name: 'Edit Document' })
    expect(within(dialog).getByText('Current stored file')).toBeInTheDocument()
    await user.type(within(dialog).getByRole('textbox', { name: 'Notes' }), ' updated')
    await user.click(within(dialog).getByRole('button', { name: 'Save Document' }))
    await waitFor(() => expect(update).toHaveBeenCalledOnce())
    expect(uploadTenderDocument).not.toHaveBeenCalled()
    const saved = update.mock.calls[0][1].documents[0]
    expect(saved.storagePath).toBe('test/boq.pdf')
    expect(saved.notes).toBe('Keep existing notes updated')
    expect(saved.url).toBe('')
    expect(saved.fileUrl).toBe('')
  })

  it('keeps the original reference when replacement upload fails and does not upload on selection or cancel', async () => {
    const user = userEvent.setup()
    renderDocuments()
    await user.click(screen.getAllByRole('button', { name: 'Edit document' })[0])
    const dialog = screen.getByRole('dialog', { name: 'Edit Document' })
    const file = new File(['test'], 'replacement.pdf', { type: 'application/pdf' })
    await user.upload(within(dialog).getByLabelText('Replace stored file'), file)
    expect(uploadTenderDocument).not.toHaveBeenCalled()
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    expect(screen.getByRole('alertdialog', { name: 'Discard document changes?' })).toBeInTheDocument()
    expect(update).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    uploadTenderDocument.mockRejectedValueOnce(new Error('Upload denied'))
    await user.click(within(dialog).getByRole('button', { name: 'Save Document' }))
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Upload denied')
    expect(update).not.toHaveBeenCalled()
    expect(within(dialog).queryByText('Current stored file')).not.toBeInTheDocument()
    expect(within(dialog).getByText(/original stays linked until save succeeds/)).toBeInTheDocument()
  })

  it('preserves entered metadata and the original stored reference when the record update fails', async () => {
    const user = userEvent.setup()
    update.mockRejectedValueOnce(new Error('offline'))
    renderDocuments()
    await user.click(screen.getAllByRole('button', { name: 'Edit document' })[0])
    const dialog = screen.getByRole('dialog', { name: 'Edit Document' })
    await user.type(within(dialog).getByRole('textbox', { name: 'Notes' }), ' - reviewed')
    await user.click(within(dialog).getByRole('button', { name: 'Save Document' }))
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('offline')
    expect(within(dialog).getByRole('textbox', { name: 'Notes' })).toHaveValue('Keep existing notes - reviewed')
    expect(uploadTenderDocument).not.toHaveBeenCalled()
    expect(fixtureTenders[0].documents[0].storagePath).toBe('test/boq.pdf')
  })

  it('reuses a staged replacement after a failed record save without persisting its signed URL', async () => {
    const user = userEvent.setup()
    update.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(undefined)
    renderDocuments()
    await user.click(screen.getAllByRole('button', { name: 'Edit document' })[0])
    const dialog = screen.getByRole('dialog', { name: 'Edit Document' })
    await user.upload(within(dialog).getByLabelText('Replace stored file'), new File(['test'], 'new.pdf', { type: 'application/pdf' }))
    await user.click(within(dialog).getByRole('button', { name: 'Save Document' }))
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('not attached yet')
    expect(fixtureTenders[0].documents[0].storagePath).toBe('test/boq.pdf')
    await user.click(within(dialog).getByRole('button', { name: 'Save Document' }))
    await waitFor(() => expect(update).toHaveBeenCalledTimes(2))
    expect(uploadTenderDocument).toHaveBeenCalledOnce()
    const saved = update.mock.calls[1][1].documents[0]
    expect(saved.storagePath).toBe('test/new.pdf')
    expect(saved.url).toBe('')
    expect(saved.fileUrl).toBe('')
  })

  it('validates external links and preserves their draft when switching source modes', async () => {
    const user = userEvent.setup()
    fixtureTenders[0].documents = []
    renderDocuments()
    await user.click(screen.getAllByRole('button', { name: 'Add Document' })[0])
    const dialog = screen.getByRole('dialog', { name: 'Add Document' })
    await user.click(within(dialog).getByRole('button', { name: 'External link' }))
    fireEvent.change(within(dialog).getByRole('textbox', { name: 'External URL *' }), { target: { value: 'javascript:bad' } })
    await user.click(within(dialog).getByRole('button', { name: 'Add Document' }))
    expect(within(dialog).getAllByRole('alert').map((node) => node.textContent).join(' ')).toContain('valid http or https URL')
    await user.click(within(dialog).getByRole('button', { name: 'Stored file' }))
    await user.click(within(dialog).getByRole('button', { name: 'External link' }))
    expect(within(dialog).getByRole('textbox', { name: 'External URL *' })).toHaveValue('javascript:bad')
    expect(update).not.toHaveBeenCalled()
  })

  it('hides edit and delete permissions for non-admins', () => {
    isAdmin = false
    renderDocuments()
    expect(screen.getAllByRole('button', { name: 'Edit document' })[0]).toBeDisabled()
    expect(screen.getAllByRole('button', { name: 'Delete document' })[0]).toBeDisabled()
  })
})
