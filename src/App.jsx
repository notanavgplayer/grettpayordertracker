import { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Toaster } from '@/components/ui/sonner'
import { Loader2 } from 'lucide-react'
import { AuthProvider } from '@/context/AuthContext'
import { ThemeProvider } from '@/context/ThemeContext'
import ProtectedRoute from '@/components/shared/ProtectedRoute'
import Layout from '@/components/layout/Layout'

import Login from '@/pages/Login'

const Home = lazy(() => import('@/pages/Home'))
const PayOrders = lazy(() => import('@/pages/PayOrders'))
const Tenders = lazy(() => import('@/pages/Tenders'))
const TenderDetail = lazy(() => import('@/pages/TenderDetail'))
const Calendar = lazy(() => import('@/pages/Calendar'))
const Expenses = lazy(() => import('@/pages/Expenses'))
const Contacts = lazy(() => import('@/pages/Contacts'))
const Notes = lazy(() => import('@/pages/Notes'))
const Todo = lazy(() => import('@/pages/Todo'))
const Activity = lazy(() => import('@/pages/Activity'))
const Search = lazy(() => import('@/pages/Search'))
const Settings = lazy(() => import('@/pages/Settings'))

function PageLoading() {
  return (
    <div className="flex h-full min-h-[60vh] items-center justify-center">
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
    </div>
  )
}

function AppLayout({ children }) {
  return (
    <ProtectedRoute>
      <Layout>
        <Suspense fallback={<PageLoading />}>{children}</Suspense>
      </Layout>
    </ProtectedRoute>
  )
}

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Login />} />
            <Route path="/home" element={<AppLayout><Home /></AppLayout>} />
            <Route path="/pay-orders" element={<AppLayout><PayOrders /></AppLayout>} />
            <Route path="/dashboard" element={<Navigate to="/pay-orders" replace />} />
            <Route path="/tenders" element={<AppLayout><Tenders /></AppLayout>} />
            <Route path="/tenders/:id" element={<AppLayout><TenderDetail /></AppLayout>} />
            <Route path="/calendar" element={<AppLayout><Calendar /></AppLayout>} />
            <Route path="/expenses" element={<AppLayout><Expenses /></AppLayout>} />
            <Route path="/contacts" element={<AppLayout><Contacts /></AppLayout>} />
            <Route path="/notes" element={<AppLayout><Notes /></AppLayout>} />
            <Route path="/todo" element={<AppLayout><Todo /></AppLayout>} />
            <Route path="/activity" element={<AppLayout><Activity /></AppLayout>} />
            <Route path="/search" element={<AppLayout><Search /></AppLayout>} />
            <Route path="/settings" element={<AppLayout><Settings /></AppLayout>} />
            <Route path="*" element={<Navigate to="/home" replace />} />
          </Routes>
        </BrowserRouter>
        <Toaster richColors position="top-right" closeButton />
      </AuthProvider>
    </ThemeProvider>
  )
}
