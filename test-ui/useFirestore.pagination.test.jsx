import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { getDocsMock } = vi.hoisted(() => ({ getDocsMock: vi.fn() }))

vi.mock('@/lib/firebase', () => ({ db: {} }))
vi.mock('sonner', () => ({ toast: { error: vi.fn() } }))
vi.mock('firebase/firestore', () => ({
  collection: vi.fn((database, name) => ({ database, name })),
  query: vi.fn((...parts) => parts),
  orderBy: vi.fn((field, direction) => ({ field, direction })),
  limit: vi.fn((size) => ({ size })),
  startAfter: vi.fn((cursor) => ({ cursor })),
  getDocs: getDocsMock,
  doc: vi.fn(),
  addDoc: vi.fn(),
  updateDoc: vi.fn(),
  deleteDoc: vi.fn(),
  serverTimestamp: vi.fn(),
  onSnapshot: vi.fn(),
}))

import { usePaginatedCollection } from '@/hooks/useFirestore'

const record = (id, createdAt) => ({ id, data: () => ({ createdAt }) })
const snapshot = (docs) => ({ docs, size: docs.length })

describe('usePaginatedCollection', () => {
  beforeEach(() => getDocsMock.mockReset())

  it('loads cursor pages and removes overlapping records', async () => {
    getDocsMock
      .mockResolvedValueOnce(snapshot([record('a', 3), record('b', 2)]))
      .mockResolvedValueOnce(snapshot([record('b', 2), record('c', 1)]))

    const { result } = renderHook(() => usePaginatedCollection('activityLog', 'createdAt', 'desc', 2))

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.data.map((item) => item.id)).toEqual(['a', 'b'])
    expect(result.current.hasMore).toBe(true)

    await act(() => result.current.loadMore())

    expect(result.current.data.map((item) => item.id)).toEqual(['a', 'b', 'c'])
    expect(result.current.hasMore).toBe(true)
    expect(getDocsMock).toHaveBeenCalledTimes(2)
  })

  it('surfaces a safe error when the initial query fails', async () => {
    getDocsMock.mockRejectedValueOnce({ code: 'permission-denied', message: 'internal provider detail' })
    const { result } = renderHook(() => usePaginatedCollection('activityLog', 'createdAt', 'desc', 50))

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.error).toBe("You don't have permission to view this.")
    expect(result.current.error).not.toContain('internal provider detail')
  })
})
