import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Toaster } from 'sonner'
import { AuthProvider } from '@/context/AuthContext'
import { ThemeProvider } from '@/context/ThemeContext'
import ProtectedRoute from '@/components/shared/ProtectedRoute'
import Layout from '@/components/layout/Layout'

import Login from '@/pages/Login'
import Home from '@/pages/Home'
import PayOrders from '@/pages/PayOrders'
import Tenders from '@/pages/Tenders'
import TenderDetail from '@/pages/TenderDetail'
import Calendar from '@/pages/Calendar'
import Expenses from '@/pages/Expenses'
import Contacts from '@/pages/Contacts'
import Notes from '@/pages/Notes'
import Todo from '@/pages/Todo'
import Activity from '@/pages/Activity'
import Search from '@/pages/Search'
import Settings from '@/pages/Settings'

function AppLayout({ children }) {
  return (
    <ProtectedRoute>
      <Layout>{children}</Layout>
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
        <Toaster richColors position="top-right" />
      </AuthProvider>
    </ThemeProvider>
  )
}
