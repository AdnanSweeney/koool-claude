import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/auth-store'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Input } from '@/components/ui/input'
import { ThemeToggle } from '@/components/ThemeToggle'
import type { Pool, PoolStatus } from '@/types'

interface PoolWithCount extends Pool {
  member_count: number
}

const statusVariant: Record<PoolStatus, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  upcoming: 'default',
  locked: 'secondary',
  in_progress: 'destructive',
  completed: 'outline',
}

const statusLabel: Record<PoolStatus, string> = {
  upcoming: 'Upcoming',
  locked: 'Locked',
  in_progress: 'In Progress',
  completed: 'Completed',
}

export default function DashboardPage() {
  const { profile, session, signOut } = useAuthStore()
  const navigate = useNavigate()
  const [pools, setPools] = useState<PoolWithCount[]>([])
  const [loading, setLoading] = useState(true)
  const [inviteInput, setInviteInput] = useState('')

  useEffect(() => {
    if (!session?.user) return

    async function load() {
      const userId = session!.user.id

      // Only fetch pools the user is a member of
      const { data: memberRows } = await supabase
        .from('pool_members')
        .select('pool_id')
        .eq('user_id', userId)

      const poolIds = memberRows?.map((r) => r.pool_id) ?? []

      if (poolIds.length === 0) {
        setLoading(false)
        return
      }

      const { data: poolsData } = await supabase
        .from('pools')
        .select('*')
        .in('id', poolIds)
        .order('created_at', { ascending: false })

      if (poolsData && poolsData.length > 0) {
        const { data: members } = await supabase
          .from('pool_members')
          .select('pool_id')
          .in('pool_id', poolIds)

        const countMap = new Map<string, number>()
        members?.forEach((m) => {
          countMap.set(m.pool_id, (countMap.get(m.pool_id) ?? 0) + 1)
        })

        setPools(
          (poolsData as Pool[]).map((p) => ({
            ...p,
            member_count: countMap.get(p.id) ?? 0,
          })),
        )
      }

      setLoading(false)
    }

    load()
  }, [session])

  const handleJoinByCode = () => {
    const trimmed = inviteInput.trim()
    if (!trimmed) return
    // Accept either a full URL or a bare invite code
    const match = trimmed.match(/\/join\/([A-Za-z0-9]+)/)
    const code = match ? match[1] : trimmed
    navigate(`/join/${code}`)
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-3">
          <h1 className="text-xl font-bold tracking-tight">Koool</h1>
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">
              {profile?.display_name}
            </span>
            <ThemeToggle />
            <Button variant="ghost" size="sm" onClick={signOut}>
              Sign out
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-4xl space-y-8 px-4 py-8">
        <section>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold">Your Pools</h2>
            <Button asChild size="sm">
              <Link to="/pools/create">Create a Pool</Link>
            </Button>
          </div>

          <div className="mb-4 flex gap-2">
            <Input
              placeholder="Paste an invite link or code to join a pool"
              value={inviteInput}
              onChange={(e) => setInviteInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleJoinByCode()}
            />
            <Button variant="outline" onClick={handleJoinByCode}>
              Join
            </Button>
          </div>

          {loading ? (
            <div className="flex flex-col gap-4">
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-20 w-full" />
            </div>
          ) : pools.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center">
                <p className="text-muted-foreground">
                  You haven't joined any pools yet. Paste an invite link above or create your own.
                </p>
                <Button asChild className="mt-4" variant="outline">
                  <Link to="/pools/create">Create your first pool</Link>
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="flex flex-col gap-4">
              {pools.map((pool) => (
                <Link key={pool.id} to={`/pools/${pool.id}`}>
                  <Card className="transition-colors hover:bg-muted/50">
                    <CardContent className="flex items-center justify-between py-4">
                      <div>
                        <p className="font-medium">{pool.name}</p>
                        <p className="text-sm text-muted-foreground">
                          {pool.sport} &middot; {pool.member_count}{' '}
                          {pool.member_count === 1 ? 'member' : 'members'}
                          {pool.has_group_stage && ' \u00B7 Groups + Knockout'}
                        </p>
                      </div>
                      <Badge variant={statusVariant[pool.status as PoolStatus]}>
                        {statusLabel[pool.status as PoolStatus]}
                      </Badge>
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  )
}
