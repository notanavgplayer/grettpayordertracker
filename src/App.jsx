import { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { Toaster } from '@/components/ui/sonner'
import { AuthProvider } from '@/context/AuthContext'
import { ThemeProvider } from '@/context/ThemeContext'
import ProtectedRoute from '@/components/shared/ProtectedRoute'
import Layout from '@/components/layout/Layout'
import LoadState from '@/components/shared/LoadState'
import ErrorBoundary from '@/components/shared/ErrorBoundary'

import Login from '@/pages/Login'

const Home = lazy(() => import('@/pages/Home'))
const PayOrders = lazy(() => import('@/pages/PayOrders'))
const Tenders = lazy(() => import('@/pages/Tenders'))
const TenderDetail = lazy(() => import('@/pages/TenderDetail'))
const TenderReport = lazy(() => import('@/pages/TenderReport'))
const Reports = lazy(() => import('@/pages/Reports'))
const Calendar = lazy(() => import('@/pages/Calendar'))
const Expenses = lazy(() => import('@/pages/Expenses'))
const Documents = lazy(() => import('@/pages/Documents'))
const Contacts = lazy(() => import('@/pages/Contacts'))
const Notes = lazy(() => import('@/pages/Notes'))
const Todo = lazy(() => import('@/pages/Todo'))
const Activity = lazy(() => import('@/pages/Activity'))
const Search = lazy(() => import('@/pages/Search'))
const Settings = lazy(() => import('@/pages/Settings'))
const DataHealth = lazy(() => import('@/pages/DataHealth'))

function AppLayout({ children }) {
  const location = useLocation()
  return (
    <ProtectedRoute>
      <Layout>
        <ErrorBoundary resetKey={location.pathname}>
          <Suspense fallback={<LoadState title="Loading page" description="Preparing this section." />}>{children}</Suspense>
        </ErrorBoundary>
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
            <Route path="/tenders/:id/report" element={<AppLayout><TenderReport /></AppLayout>} />
            <Route path="/reports" element={<AppLayout><Reports /></AppLayout>} />
            <Route path="/calendar" element={<AppLayout><Calendar /></AppLayout>} />
            <Route path="/expenses" element={<AppLayout><Expenses /></AppLayout>} />
            <Route path="/documents" element={<AppLayout><Documents /></AppLayout>} />
            <Route path="/contacts" element={<AppLayout><Contacts /></AppLayout>} />
            <Route path="/notes" element={<AppLayout><Notes /></AppLayout>} />
            <Route path="/todo" element={<AppLayout><Todo /></AppLayout>} />
            <Route path="/activity" element={<AppLayout><Activity /></AppLayout>} />
            <Route path="/search" element={<AppLayout><Search /></AppLayout>} />
            <Route path="/settings" element={<AppLayout><Settings /></AppLayout>} />
            <Route path="/data-health" element={<AppLayout><DataHealth /></AppLayout>} />
            <Route path="*" element={<Navigate to="/home" replace />} />
          </Routes>
        </BrowserRouter>
        <Toaster richColors position="top-center" closeButton />
      </AuthProvider>
    </ThemeProvider>
  )
}
