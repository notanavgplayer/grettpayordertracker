import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import Login from '@/pages/Login'

const { signIn } = vi.hoisted(() => ({ signIn: vi.fn() }))

vi.mock('firebase/auth', () => ({
  signInWithEmailAndPassword: signIn,
}))

vi.mock('@/lib/firebase', () => ({ auth: {} }))
vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ user: null }) }))
vi.mock('@/context/ThemeContext', () => ({
  useTheme: () => ({ toggleTheme: vi.fn(), isDark: false }),
}))

function renderLogin() {
  return render(<MemoryRouter><Login /></MemoryRouter>)
}

describe('login workflow', () => {
  beforeEach(() => signIn.mockReset())

  it('announces missing credentials and connects the error to both fields', async () => {
    const user = userEvent.setup()
    renderLogin()

    await user.click(screen.getByRole('button', { name: 'Sign In' }))

    const alert = screen.getByRole('alert')
    expect(alert).toHaveTextContent('Please enter your email and password')
    expect(screen.getByLabelText('Email')).toHaveAttribute('aria-describedby', 'login-error')
    expect(screen.getByLabelText('Password')).toHaveAttribute('aria-describedby', 'login-error')
    expect(signIn).not.toHaveBeenCalled()
  })

  it('shows a safe message for invalid credentials', async () => {
    const user = userEvent.setup()
    const authError = new Error('provider detail that must not be displayed')
    authError.code = 'auth/invalid-credential'
    signIn.mockRejectedValueOnce(authError)
    renderLogin()

    await user.type(screen.getByLabelText('Email'), 'user@example.com')
    await user.type(screen.getByLabelText('Password'), 'incorrect')
    await user.click(screen.getByRole('button', { name: 'Sign In' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Invalid email or password')
  })
})
