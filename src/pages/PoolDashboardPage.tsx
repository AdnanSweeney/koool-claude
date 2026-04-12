import { useEffect, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/auth-store'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Separator } from '@/components/ui/separator'
import GroupTable from '@/components/GroupTable'
import BracketView from '@/components/BracketView'
import type { Pool, PoolStatus, Group as GroupType, KnockoutMatchup } from '@/types'

interface MemberInfo {
  user_id: string
  display_name: string
  pick_status: 'submitted' | 'in_progress' | 'not_started'
}

const statusLabel: Record<PoolStatus, string> = {
  upcoming: 'Upcoming',
  locked: 'Locked',
  in_progress: 'In Progress',
  completed: 'Completed',
}

const statusVariant: Record<PoolStatus, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  upcoming: 'default',
  locked: 'secondary',
  in_progress: 'destructive',
  completed: 'outline',
}

const pickStatusLabel = {
  submitted: 'Submitted',
  in_progress: 'In Progress',
  not_started: 'Not Started',
} as const

const pickStatusVariant = {
  submitted: 'default',
  in_progress: 'secondary',
  not_started: 'outline',
} as const

export default function PoolDashboardPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const session = useAuthStore((s) => s.session)

  const [pool, setPool] = useState<Pool | null>(null)
  const [groups, setGroups] = useState<GroupType[]>([])
  const [matchups, setMatchups] = useState<KnockoutMatchup[]>([])
  const [members, setMembers] = useState<MemberInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [emailInput, setEmailInput] = useState('')
  const [sendingInvites, setSendingInvites] = useState(false)

  const isCreator = pool?.creator_id === session?.user?.id
  const joinLink = `${window.location.origin}/join/${pool?.invite_code}`

  useEffect(() => {
    if (!id) return

    async function load() {
      const { data: poolData, error: poolError } = await supabase
        .from('pools')
        .select('*')
        .eq('id', id)
        .single()

      if (poolError || !poolData) {
        toast.error('Pool not found')
        navigate('/dashboard')
        return
      }

      const typedPool = poolData as Pool
      setPool(typedPool)

      // Fetch groups, matchups, and members in parallel
      const [groupsRes, matchupsRes, membersRes, picksRes] = await Promise.all([
        typedPool.has_group_stage
          ? supabase.from('groups').select('*').eq('pool_id', id!)
          : Promise.resolve({ data: [] }),
        supabase.from('knockout_matchups').select('*').eq('pool_id', id!),
        supabase.from('pool_members').select('user_id, users(display_name)').eq('pool_id', id!),
        supabase.from('picks').select('user_id, submitted_at').eq('pool_id', id!),
      ])

      if (groupsRes.data) setGroups(groupsRes.data as GroupType[])
      if (matchupsRes.data) setMatchups(matchupsRes.data as KnockoutMatchup[])

      const r1Matchups = (matchupsRes.data ?? []).filter(
        (m: { round: number }) => m.round === 1,
      ).length

      const memberInfos: MemberInfo[] = (membersRes.data ?? []).map((m) => {
        const userPicks = (picksRes.data ?? []).filter(
          (p: { user_id: string }) => p.user_id === m.user_id,
        )
        const submittedPicks = userPicks.filter(
          (p: { submitted_at: string | null }) => p.submitted_at !== null,
        )

        let pickStatus: MemberInfo['pick_status'] = 'not_started'
        if (submittedPicks.length >= r1Matchups && r1Matchups > 0) {
          pickStatus = 'submitted'
        } else if (userPicks.length > 0) {
          pickStatus = 'in_progress'
        }

        const user = m.users as unknown as { display_name: string } | null
        return {
          user_id: m.user_id,
          display_name: user?.display_name || 'Unknown',
          pick_status: pickStatus,
        }
      })

      setMembers(memberInfos)
      setLoading(false)
    }

    load()
  }, [id, navigate])

  const copyInviteLink = async () => {
    try {
      await navigator.clipboard.writeText(joinLink)
      toast.success('Invite link copied!')
    } catch {
      toast.error('Failed to copy link')
    }
  }

  const sendEmailInvites = async () => {
    if (!pool || !session?.user) return
    const emails = emailInput.split(',').map((e) => e.trim()).filter((e) => e.length > 0)
    if (emails.length === 0) {
      toast.error('Please enter at least one email address')
      return
    }

    try {
      setSendingInvites(true)
      const { data, error } = await supabase.functions.invoke('send-invite', {
        body: {
          emails,
          poolId: pool.id,
          inviterName: session.user.user_metadata?.display_name ?? 'A friend',
          poolName: pool.name,
          inviteCode: pool.invite_code,
        },
      })

      if (error) throw error
      const result = data as { sent: number; errors: string[] }
      if (result.sent > 0) {
        toast.success(`Sent ${result.sent} invite${result.sent > 1 ? 's' : ''}!`)
        setEmailInput('')
      }
      if (result.errors?.length > 0) {
        toast.error(`Some invites failed: ${result.errors.join(', ')}`)
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to send invites')
    } finally {
      setSendingInvites(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <header className="border-b">
          <div className="mx-auto max-w-4xl px-4 py-3">
            <Skeleton className="h-6 w-40" />
          </div>
        </header>
        <main className="mx-auto max-w-4xl space-y-6 px-4 py-8">
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-48 w-full" />
        </main>
      </div>
    )
  }

  if (!pool) return null

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="mx-auto flex max-w-4xl items-center gap-3 px-4 py-3">
          <Button variant="ghost" size="sm" onClick={() => navigate('/dashboard')}>
            &larr; Dashboard
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-4xl space-y-6 px-4 py-8">
        {/* Pool header */}
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold">{pool.name}</h1>
            <Badge variant={statusVariant[pool.status as PoolStatus]}>
              {statusLabel[pool.status as PoolStatus]}
            </Badge>
          </div>
          <p className="mt-1 text-muted-foreground">
            {pool.sport} &middot; {members.length}{' '}
            {members.length === 1 ? 'member' : 'members'}
            {pool.has_group_stage && ' \u00B7 Groups + Knockout'}
          </p>
          {pool.description && (
            <p className="mt-2 text-sm text-muted-foreground">{pool.description}</p>
          )}
        </div>

        {/* Actions */}
        <div className="flex gap-3">
          <Button asChild>
            <Link to={`/pools/${pool.id}/picks`}>Enter My Picks</Link>
          </Button>
          {isCreator && (
            <Button asChild variant="outline">
              <Link to={`/pools/${pool.id}/manage`}>Manage Results</Link>
            </Button>
          )}
        </div>

        {/* Groups */}
        {pool.has_group_stage && groups.length > 0 && (
          <section>
            <h2 className="mb-3 text-lg font-semibold">Groups</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              {groups.map((g) => (
                <GroupTable key={g.id} group={g} />
              ))}
            </div>
          </section>
        )}

        {/* Bracket */}
        {matchups.length > 0 && (
          <section>
            <h2 className="mb-3 text-lg font-semibold">Knockout Bracket</h2>
            <BracketView
              matchups={matchups}
              teamCount={
                pool.has_group_stage && pool.advance_per_group
                  ? groups.length * pool.advance_per_group
                  : (pool.teams as string[]).length
              }
            />
          </section>
        )}

        {/* Invite Section */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Invite Friends</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label>Share this link</Label>
              <div className="flex gap-2">
                <Input value={joinLink} readOnly className="font-mono text-sm" />
                <Button variant="outline" onClick={copyInviteLink}>
                  Copy
                </Button>
              </div>
            </div>

            <Separator />

            <div className="space-y-1.5">
              <Label htmlFor="invite-emails">Send email invites</Label>
              <div className="flex gap-2">
                <Input
                  id="invite-emails"
                  placeholder="email1@example.com, email2@example.com"
                  value={emailInput}
                  onChange={(e) => setEmailInput(e.target.value)}
                />
                <Button
                  variant="outline"
                  onClick={sendEmailInvites}
                  disabled={sendingInvites}
                >
                  {sendingInvites ? 'Sending...' : 'Send Invites'}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Separate multiple emails with commas
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Member list */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Members</CardTitle>
          </CardHeader>
          <CardContent>
            {members.length === 0 ? (
              <p className="text-sm text-muted-foreground">No members yet.</p>
            ) : (
              <ul className="divide-y">
                {members.map((m) => (
                  <li key={m.user_id} className="flex items-center justify-between py-2">
                    <span className="text-sm font-medium">{m.display_name}</span>
                    <Badge variant={pickStatusVariant[m.pick_status]}>
                      {pickStatusLabel[m.pick_status]}
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* Creator manage section */}
        {isCreator && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Manage Pool</CardTitle>
            </CardHeader>
            <CardContent>
              <Button asChild variant="outline">
                <Link to={`/pools/${pool.id}/manage`}>Enter Results</Link>
              </Button>
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  )
}
