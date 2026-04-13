import { useEffect } from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { Toaster } from '@/components/ui/sonner'
import { useAuthStore } from '@/stores/auth-store'
import ProtectedRoute from '@/components/ProtectedRoute'
import LandingPage from '@/pages/LandingPage'
import AuthPage from '@/pages/AuthPage'
import AuthCallback from '@/pages/AuthCallback'
import DashboardPage from '@/pages/DashboardPage'
import CreatePoolPage from '@/pages/CreatePoolPage'
import PoolDashboardPage from '@/pages/PoolDashboardPage'
import PicksPage from '@/pages/PicksPage'
import ManageResultsPage from '@/pages/ManageResultsPage'
import MemberBracketPage from '@/pages/MemberBracketPage'
import JoinPoolPage from '@/pages/JoinPoolPage'

export default function App() {
  const initialize = useAuthStore((s) => s.initialize)

  useEffect(() => {
    const unsubscribe = initialize()
    return unsubscribe
  }, [initialize])

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/auth" element={<AuthPage />} />
        <Route path="/auth/callback" element={<AuthCallback />} />
        <Route path="/join/:inviteCode" element={<JoinPoolPage />} />
        <Route element={<ProtectedRoute />}>
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/pools/create" element={<CreatePoolPage />} />
          <Route path="/pools/:id" element={<PoolDashboardPage />} />
          <Route path="/pools/:id/picks" element={<PicksPage />} />
          <Route path="/pools/:id/manage" element={<ManageResultsPage />} />
          <Route path="/pools/:id/bracket/:userId" element={<MemberBracketPage />} />
        </Route>
      </Routes>
      <Toaster />
    </BrowserRouter>
  )
}
