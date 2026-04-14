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
import GroupTable from '@/components/GroupTable'
import BracketView from '@/components/BracketView'
import Leaderboard from '@/components/Leaderboard'
import MembersPicksSection from '@/components/MembersPicksSection'
import { AppHeader } from '@/components/AppHeader'
import { CountdownTimer } from '@/components/CountdownTimer'
import type { Pool, PoolStatus, Group as GroupType, KnockoutMatchup, BonusQuestion } from '@/types'

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

const statusVariant: Record<PoolStatus, 'default' | 'secondary' | 'outline'> = {
  upcoming: 'default',
  locked: 'secondary',
  in_progress: 'default',
  completed: 'outline',
}

const statusClassName: Record<PoolStatus, string> = {
  upcoming: '',
  locked: '',
  in_progress: 'bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30 hover:bg-amber-500/20',
  completed: '',
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
  const [bonusQuestions, setBonusQuestions] = useState<BonusQuestion[]>([])
  const [myAnsweredCount, setMyAnsweredCount] = useState(0)
  const [loading, setLoading] = useState(true)

  const isCreator = pool?.creator_id === session?.user?.id
  const myPickStatus = members.find((m) => m.user_id === session?.user?.id)?.pick_status
  const unpickedMembers = members.filter((m) => m.pick_status !== 'submitted')
  const unansweredBonus = bonusQuestions.length > 0 && myAnsweredCount < bonusQuestions.length
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

      // Fetch groups, matchups, members, bonus questions in parallel
      const [groupsRes, matchupsRes, membersRes, picksRes, bonusRes] = await Promise.all([
        typedPool.has_group_stage
          ? supabase.from('groups').select('*').eq('pool_id', id!)
          : Promise.resolve({ data: [] }),
        supabase.from('knockout_matchups').select('*').eq('pool_id', id!),
        supabase.from('pool_members').select('user_id, users(display_name)').eq('pool_id', id!),
        supabase.from('picks').select('user_id, submitted_at').eq('pool_id', id!),
        supabase.from('bonus_questions').select('*').eq('pool_id', id!),
      ])

      if (groupsRes.data) setGroups(groupsRes.data as GroupType[])
      if (matchupsRes.data) setMatchups(matchupsRes.data as KnockoutMatchup[])

      const questions = (bonusRes.data ?? []) as BonusQuestion[]
      setBonusQuestions(questions)

      if (questions.length > 0) {
        const questionIds = questions.map((q) => q.id)
        const { data: answersData } = await supabase
          .from('bonus_answers')
          .select('bonus_question_id')
          .in('bonus_question_id', questionIds)
          .eq('user_id', session!.user.id)
        setMyAnsweredCount(answersData?.length ?? 0)
      }

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


  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <AppHeader />
        <main className="mx-auto max-w-4xl space-y-6 px-6 md:px-12 py-8">
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-48 w-full" />
        </main>
      </div>
    )
  }

  if (!pool) return null

  return (
    <div className="min-h-screen bg-background">
      <AppHeader right={
        <Button variant="ghost" size="sm" onClick={() => navigate('/dashboard')}>
          &larr; Dashboard
        </Button>
      } />

      <main className="mx-auto max-w-4xl space-y-6 px-6 md:px-12 py-8">
        {/* Pool header */}
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold">{pool.name}</h1>
            <Badge
              variant={statusVariant[pool.status as PoolStatus]}
              className={statusClassName[pool.status as PoolStatus]}
            >
              {statusLabel[pool.status as PoolStatus]}
            </Badge>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-muted-foreground">
            <span>
              {pool.sport} &middot; {members.length}{' '}
              {members.length === 1 ? 'member' : 'members'}
              {pool.has_group_stage && ' \u00B7 Groups + Knockout'}
            </span>
            {pool.status === 'upcoming' && (
              <CountdownTimer targetDate={pool.start_datetime} />
            )}
          </div>
          {pool.description && (
            <p className="mt-2 text-sm text-muted-foreground">{pool.description}</p>
          )}
        </div>

        {/* Warning banners */}
        {pool.status === 'upcoming' && myPickStatus !== 'submitted' && (
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-sm text-amber-700 dark:text-amber-400">
            {myPickStatus === 'in_progress'
              ? "You have picks in progress — don't forget to submit before the pool locks."
              : "You haven't entered your picks yet. Enter them before the pool locks!"}
          </div>
        )}
        {unansweredBonus && (
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-sm text-amber-700 dark:text-amber-400">
            There {bonusQuestions.length - myAnsweredCount === 1 ? 'is' : 'are'}{' '}
            {bonusQuestions.length - myAnsweredCount} unanswered bonus{' '}
            {bonusQuestions.length - myAnsweredCount === 1 ? 'question' : 'questions'} — answer{' '}
            {bonusQuestions.length - myAnsweredCount === 1 ? 'it' : 'them'} on the picks page.
          </div>
        )}
        {isCreator && pool.status === 'upcoming' && unpickedMembers.length > 0 && (
          <div className="rounded-lg border border-border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
            {unpickedMembers.length}{' '}
            {unpickedMembers.length === 1 ? 'member has' : 'members have'} not submitted picks:{' '}
            {unpickedMembers.map((m) => m.display_name).join(', ')}
          </div>
        )}

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
                  ? groups.length * pool.advance_per_group + (pool.additional_advancing ?? 0)
                  : (pool.teams as string[]).length
              }
            />
          </section>
        )}

        {/* Leaderboard */}
        <Leaderboard pool={pool} groups={groups} />

        {/* Members' picks with score breakdown */}
        <MembersPicksSection pool={pool} groups={groups} matchups={matchups} />

        {/* Invite Section */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Invite Friends</CardTitle>
          </CardHeader>
          <CardContent>
            <Label>Share this link</Label>
            <div className="mt-1.5 flex gap-2">
              <Input value={joinLink} readOnly className="font-mono text-sm" />
              <Button variant="outline" onClick={copyInviteLink}>
                Copy
              </Button>
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
