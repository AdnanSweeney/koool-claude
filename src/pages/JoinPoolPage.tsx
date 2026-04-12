import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/auth-store'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import type { Pool } from '@/types'

export default function JoinPoolPage() {
  const { inviteCode } = useParams<{ inviteCode: string }>()
  const navigate = useNavigate()
  const { session, loading: authLoading, signInWithGoogle, signInWithMagicLink } = useAuthStore()

  const [pool, setPool] = useState<Pool | null>(null)
  const [loading, setLoading] = useState(true)
  const [joining, setJoining] = useState(false)
  const [notFound, setNotFound] = useState(false)
  const [magicLinkEmail, setMagicLinkEmail] = useState('')
  const [magicLinkSent, setMagicLinkSent] = useState(false)

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
    try { await signInWithGoogle() } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to sign in')
    }
  }

  const handleMagicLink = async () => {
    if (!magicLinkEmail.trim()) return
    try {
      await signInWithMagicLink(magicLinkEmail.trim())
      setMagicLinkSent(true)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to send magic link')
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
              Sign in with Google
            </Button>
            <div className="text-center text-xs text-muted-foreground">or</div>
            {magicLinkSent ? (
              <p className="text-center text-sm text-muted-foreground">
                Check your email for a magic link!
              </p>
            ) : (
              <div className="flex gap-2">
                <input
                  type="email"
                  placeholder="you@example.com"
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  value={magicLinkEmail}
                  onChange={(e) => setMagicLinkEmail(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleMagicLink()}
                />
                <Button variant="outline" size="sm" onClick={handleMagicLink}>Send</Button>
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
