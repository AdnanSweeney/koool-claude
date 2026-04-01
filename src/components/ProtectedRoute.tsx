import { Navigate, Outlet } from 'react-router-dom'
import { useAuthStore } from '@/stores/auth-store'
import DisplayNameModal from '@/components/DisplayNameModal'

export default function ProtectedRoute() {
  const { session, profile, loading } = useAuthStore()

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    )
  }

  if (!session) {
    return <Navigate to="/auth" replace />
  }

  return (
    <>
      {profile && profile.display_name === '' && <DisplayNameModal />}
      <Outlet />
    </>
  )
}
