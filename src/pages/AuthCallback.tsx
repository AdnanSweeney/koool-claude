import { useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '@/lib/supabase'

export default function AuthCallback() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        // Magic link encodes `next` in the URL; Google OAuth saves to localStorage
        const redirectTo =
          searchParams.get('next') ||
          localStorage.getItem('postAuthRedirect') ||
          '/dashboard'
        localStorage.removeItem('postAuthRedirect')
        navigate(redirectTo, { replace: true })
      }
    })
  }, [navigate, searchParams])

  return (
    <div className="flex min-h-screen items-center justify-center">
      <p className="text-muted-foreground">Signing you in...</p>
    </div>
  )
}
