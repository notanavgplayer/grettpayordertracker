import '@testing-library/jest-dom/vitest'
import { afterEach } from 'vitest'
import { cleanup } from '@testing-library/react'

afterEach(cleanup)

window.matchMedia ||= () => ({
  matches: false,
  addEventListener() {},
  removeEventListener() {},
})

class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}

window.ResizeObserver ||= ResizeObserverMock
globalThis.ResizeObserver ||= ResizeObserverMock

HTMLElement.prototype.hasPointerCapture ||= () => false
HTMLElement.prototype.setPointerCapture ||= () => {}
HTMLElement.prototype.releasePointerCapture ||= () => {}
HTMLElement.prototype.scrollIntoView ||= () => {}
