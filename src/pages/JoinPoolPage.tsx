import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/auth-store'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Separator } from '@/components/ui/separator'
import type { Pool } from '@/types'

export default function JoinPoolPage() {
  const { inviteCode } = useParams<{ inviteCode: string }>()
  const navigate = useNavigate()
  const { session, loading: authLoading, signInWithGoogle, signInWithMagicLink, verifyOtp } = useAuthStore()

  const [pool, setPool] = useState<Pool | null>(null)
  const [loading, setLoading] = useState(true)
  const [joining, setJoining] = useState(false)
  const [notFound, setNotFound] = useState(false)

  const [magicLinkEmail, setMagicLinkEmail] = useState('')
  const [magicLinkSent, setMagicLinkSent] = useState(false)
  const [otpCode, setOtpCode] = useState('')
  const [otpLoading, setOtpLoading] = useState(false)

  useEffect(() => {
    if (!inviteCode || authLoading) return

    async function loadPool() {
      const { data: poolData } = await supabase
        .from('pools')
        .select('*')
        .eq('invite_code', inviteCode)
        .maybeSingle()

      if (!poolData) {
        setNotFound(true)
        setLoading(false)
        return
      }

      setPool(poolData as Pool)

      if (session?.user) {
        const { data: existing } = await supabase
          .from('pool_members')
          .select('pool_id')
          .eq('pool_id', (poolData as Pool).id)
          .eq('user_id', session.user.id)
          .maybeSingle()

        if (existing) {
          navigate(`/pools/${(poolData as Pool).id}`, { replace: true })
          return
        }
      }

      setLoading(false)
    }

    loadPool()
  }, [inviteCode, session?.user, authLoading, navigate])

  const handleJoin = async () => {
    if (!pool || !session?.user) return
    try {
      setJoining(true)
      const { error } = await supabase
        .from('pool_members')
        .insert({ pool_id: pool.id, user_id: session.user.id })
      if (error) throw error
      toast.success(`Joined "${pool.name}"!`)
      navigate(`/pools/${pool.id}`, { replace: true })
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to join pool')
    } finally {
      setJoining(false)
    }
  }

  const handleGoogleSignIn = async () => {
    try {
      await signInWithGoogle(window.location.pathname)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to sign in')
    }
  }

  const handleMagicLink = async () => {
    if (!magicLinkEmail.trim()) return
    try {
      await signInWithMagicLink(magicLinkEmail.trim(), window.location.pathname)
      setMagicLinkSent(true)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to send magic link')
    }
  }

  const handleVerifyOtp = async () => {
    if (!otpCode.trim() || !magicLinkEmail.trim()) return
    try {
      setOtpLoading(true)
      await verifyOtp(magicLinkEmail.trim(), otpCode.trim())
      // Auth state change will re-trigger the useEffect and show the join button
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Invalid code — please try again')
    } finally {
      setOtpLoading(false)
    }
  }

  if (authLoading || loading) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4">
        <Card className="w-full max-w-sm">
          <CardContent className="py-8">
            <Skeleton className="mx-auto h-6 w-48" />
            <Skeleton className="mx-auto mt-4 h-4 w-32" />
          </CardContent>
        </Card>
      </div>
    )
  }

  if (notFound) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4">
        <Card className="w-full max-w-sm text-center">
          <CardHeader>
            <CardTitle>Pool Not Found</CardTitle>
            <CardDescription>This invite link is invalid or has expired.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="outline" onClick={() => navigate('/')}>Go Home</Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (!session) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4">
        <Card className="w-full max-w-sm">
          <CardHeader className="text-center">
            <CardTitle>Join "{pool?.name}"</CardTitle>
            <CardDescription>
              Sign in to join this {pool?.sport} pool.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Button variant="outline" className="w-full" onClick={handleGoogleSignIn}>
              <svg className="mr-2 size-4" viewBox="0 0 24 24">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
              </svg>
              Sign in with Google
            </Button>

            <div className="flex items-center gap-3">
              <Separator className="flex-1" />
              <span className="text-xs text-muted-foreground uppercase">or</span>
              <Separator className="flex-1" />
            </div>

            {magicLinkSent ? (
              <div className="space-y-3">
                <p className="text-center text-sm font-medium">Check your email!</p>
                <p className="text-center text-xs text-muted-foreground">
                  Click the link in the email, or enter the code below.
                </p>
                <div className="flex gap-2">
                  <Input
                    placeholder="6-digit code"
                    value={otpCode}
                    onChange={(e) => setOtpCode(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleVerifyOtp()}
                    maxLength={6}
                  />
                  <Button variant="outline" onClick={handleVerifyOtp} disabled={otpLoading}>
                    {otpLoading ? 'Verifying…' : 'Verify'}
                  </Button>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full"
                  onClick={() => { setMagicLinkSent(false); setOtpCode('') }}
                >
                  Try a different email
                </Button>
              </div>
            ) : (
              <div className="space-y-2">
                <Input
                  type="email"
                  placeholder="you@example.com"
                  value={magicLinkEmail}
                  onChange={(e) => setMagicLinkEmail(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleMagicLink()}
                />
                <Button className="w-full" onClick={handleMagicLink}>
                  Send magic link
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <Card className="w-full max-w-sm text-center">
        <CardHeader>
          <CardTitle>Join "{pool?.name}"</CardTitle>
          <CardDescription>{pool?.sport}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {pool?.description && (
            <p className="text-sm text-muted-foreground">{pool.description}</p>
          )}
          <Button className="w-full" onClick={handleJoin} disabled={joining}>
            {joining ? 'Joining...' : 'Join Pool'}
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
